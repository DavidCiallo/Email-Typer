package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync/atomic"
)

// 转发安全熔断（D10）+ 规则集指纹信任（补 2）。
//
// 核心思路：把「一封邮件命中多少条策略」当成安全信号，而不是单纯的数量限制。
// 正常邮件命中 1~2 条；一封邮件同时命中十几条，本身就是「有人批量加了规则」的迹象。
//
//	1 ~  warnAt   正常，全部执行
//	warnAt+1 ~ lockAt  警告，全部执行，黄色横幅 + 解锁弹窗
//	> lockAt      熔断，只执行前 lockAt 条，全局暂停转发，必须管理员人工解锁
const (
	forwardWarnDefault = 5
	forwardLockDefault = 10
)

// forwardLockFlag 把锁状态缓存在内存里：每封邮件都要判断一次，不能查库。
// 真值仍以 security_events 为准，重启时由 securityInit 重新装载。
var forwardLockFlag atomic.Bool

func forwardWarnAt() int {
	n := settingInt("forward_warn_at", forwardWarnDefault)
	if n < 1 {
		return forwardWarnDefault
	}
	return n
}

// forwardLockAt 同时是「熔断阈值」和「熔断后仍执行的条数」：超过 10 条就只放行
// 前 10 条，剩下的跳过。这样即使被恶意放量，单封邮件的外发规模也有上界。
func forwardLockAt() int {
	n := settingInt("forward_lock_at", forwardLockDefault)
	if n < 1 {
		return forwardLockDefault
	}
	return n
}

func forwardLocked() bool { return forwardLockFlag.Load() }

// securityInit 在启动时把锁状态从库里装回内存，保证重启后锁定依然有效。
func securityInit() {
	forwardLockFlag.Store(securityCountOpenLocks() > 0)
	if forwardLocked() {
		log.Printf("[Security] Forward is LOCKED: pending security review")
	}
}

func securityCountOpenLocks() int {
	var n int
	// 库读不出来时按「已锁定」处理：安全优先，宁可暂停转发也不放大外发
	if err := db.QueryRow(`SELECT COUNT(*) FROM security_events
		WHERE kind = 'forward_lock' AND status = 'open'`).Scan(&n); err != nil {
		log.Printf("[Security] read lock state failed: %v (treat as locked)", err)
		return 1
	}
	return n
}

// ---------- 规则集指纹（补 2）----------

// rulesetFingerprint 对「会影响行为的策略字段」取指纹。只改 name / note 不改变
// 指纹——它们不影响执行结果。
func rulesetFingerprint() string {
	rows, err := db.Query(`SELECT id, action, from_pattern, to_pattern, subject_pattern,
		forward_to, webhook_url, archive_after_hours, enabled
		FROM strategies WHERE delete_time IS NULL ORDER BY id`)
	if err != nil {
		return ""
	}
	defer rows.Close()
	h := sha256.New()
	for rows.Next() {
		var id, action, fromP, toP, subjP, forwardTo, webhookURL string
		var archiveHours, enabled int
		if rows.Scan(&id, &action, &fromP, &toP, &subjP, &forwardTo, &webhookURL, &archiveHours, &enabled) != nil {
			return ""
		}
		fmt.Fprintf(h, "%s|%s|%s|%s|%s|%s|%s|%d|%d\n",
			id, action, fromP, toP, subjP, forwardTo, webhookURL, archiveHours, enabled)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// securityTrustedFingerprint 返回最近一次「信任」时的规则集指纹。
func securityTrustedFingerprint() string {
	var detail string
	if err := db.QueryRow(`SELECT detail FROM security_events
		WHERE kind = 'ruleset_trust' ORDER BY create_time DESC, id DESC LIMIT 1`).Scan(&detail); err != nil {
		return ""
	}
	var d struct {
		Fingerprint string `json:"fingerprint"`
	}
	if json.Unmarshal([]byte(detail), &d) != nil {
		return ""
	}
	return d.Fingerprint
}

// ---------- 分级判定 ----------

// securityEvaluate 返回本次应该触发的档位："lock" / "warn" / ""。
//
// 指纹信任是这里的关键：如果用户已经审查并信任过当前这套规则，且规则一个字都
// 没改，那么同样的命中就只报警告而不锁定——否则「12 条合法规则」会让每封邮件
// 都触发一次熔断，系统直接不可用。
func securityEvaluate(hitCount int) string {
	if hitCount <= 0 {
		return ""
	}
	if hitCount > forwardLockAt() {
		if fp := rulesetFingerprint(); fp != "" && fp == securityTrustedFingerprint() {
			return "warn"
		}
		return "lock"
	}
	if hitCount > forwardWarnAt() {
		return "warn"
	}
	return ""
}

// ---------- 事件写入 ----------

func securityEventInset(kind, severity, emailID string, hitCount, sendCount int, detail map[string]any, status, ackedBy string) string {
	if detail == nil {
		detail = map[string]any{}
	}
	raw, _ := json.Marshal(detail)
	id := nanoID(8)
	ackedAt := int64(0)
	if ackedBy != "" {
		ackedAt = nowMillis()
	}
	_, err := db.Exec(`INSERT INTO security_events
		(id, kind, severity, email_id, hit_count, send_count, detail, status, acked_by, acked_at, create_time)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		id, kind, severity, emailID, hitCount, sendCount, string(raw), status, ackedBy, ackedAt, nowMillis())
	if err != nil {
		log.Printf("[Security] write event failed (%s): %v", kind, err)
		return ""
	}
	return id
}

// securityStrategySnapshot 记录触发时刻命中的策略，供解锁界面逐条审查。
// 存快照而不是只存 id：策略之后被删除或改动时，审计记录仍然说得清当时是什么。
func securityStrategySnapshot(rules []StrategyRow) []map[string]any {
	out := make([]map[string]any, 0, len(rules))
	for i := range rules {
		s := &rules[i]
		out = append(out, map[string]any{
			"id": s.ID, "name": s.Name, "action": s.Action,
			"from_pattern": s.FromPattern, "to_pattern": s.ToPattern,
			"subject_pattern": s.SubjectPattern, "forward_to": s.ForwardTo,
			"webhook_url": s.WebhookURL, "account_id": s.AccountID,
			"create_time": s.CreateTime,
		})
	}
	return out
}

// securityWarn 警告档：全部执行，但必须让人知道。返回事件 id 供回填外发次数。
func securityWarn(email *EmailRow, hitCount int, rules []StrategyRow) string {
	id := securityEventInset("forward_burst", "warn", email.ID, hitCount, 0, map[string]any{
		"subject": email.Subject, "from": email.From, "to": email.To,
		"strategies": securityStrategySnapshot(rules),
	}, "acked", "")
	broadcastWsMessage(map[string]any{
		"name": "security:warning",
		"data": map[string]any{
			"email_id":   email.ID,
			"subject":    email.Subject,
			"from":       email.From,
			"hit_count":  hitCount,
			"strategies": securityStrategySnapshot(rules),
			"message":    fmt.Sprintf("一封邮件同时命中 %d 条策略，请检查是否有人添加了规则", hitCount),
		},
	})
	log.Printf("[Security] WARN: %s hit %d strategies", email.ID, hitCount)
	return id
}

// securityLock 熔断档：立即落库并置内存标志，让后续邮件立刻停下。
// 返回事件 id，供外发结束后回填实际外发条数。
func securityLock(email *EmailRow, hitCount int, rules []StrategyRow) string {
	id := securityEventInset("forward_lock", "lock", email.ID, hitCount, 0, map[string]any{
		"subject": email.Subject, "from": email.From, "to": email.To,
		"strategies": securityStrategySnapshot(rules),
	}, "open", "")
	forwardLockFlag.Store(true)
	broadcastWsMessage(map[string]any{
		"name": "security:locked",
		"data": map[string]any{
			"email_id":  email.ID,
			"subject":   email.Subject,
			"hit_count": hitCount,
			"message":   "转发已自动暂停，请执行安全检查后手动解除",
		},
	})
	log.Printf("[Security] LOCK: %s hit %d strategies, forwarding paused", email.ID, hitCount)
	return id
}

func securityUpdateSendCount(eventID string, sendCount int) {
	if eventID == "" {
		return
	}
	if _, err := db.Exec(`UPDATE security_events SET send_count = ? WHERE id = ?`, sendCount, eventID); err != nil {
		log.Printf("[Security] update send_count failed: %v", err)
	}
}

// ---------- 高风险线索（2.8.8）----------

func domainOfAddress(addr string) string {
	if at := strings.LastIndex(addr, "@"); at != -1 {
		return strings.ToLower(strings.TrimSpace(addr[at+1:]))
	}
	return ""
}

// securityBuildReviews 把快照里的策略补上「可疑点」标注。线索按读取时计算，
// 因为「创建于 24 小时内」这类判断随时间变化。
func securityBuildReviews(snapshot []map[string]any, currentAccountID string) []map[string]any {
	if len(snapshot) == 0 {
		return []map[string]any{}
	}
	// 同一小时创建了多条策略 → 批量添加特征
	batchByHour := map[int64]int{}
	for _, s := range snapshot {
		ts := asInt(s["create_time"])
		batchByHour[ts/3600000]++
	}
	// 曾经的收件目标域名，用来判断「这个目标域名是否从没出现过」
	knownDomains := map[string]bool{}
	if rows, err := db.Query(`SELECT DISTINCT to_addr FROM sendlogs WHERE to_addr != ''`); err == nil {
		for rows.Next() {
			var a string
			if rows.Scan(&a) == nil {
				knownDomains[domainOfAddress(a)] = true
			}
		}
		rows.Close()
	}
	systemDomains := map[string]bool{}
	for _, d := range splitCSV(settingGet("allowed_from_domains")) {
		systemDomains[strings.ToLower(d)] = true
	}
	for _, d := range splitCSV(settingGet("allowed_domains")) {
		systemDomains[strings.ToLower(d)] = true
	}

	now := nowMillis()
	out := make([]map[string]any, 0, len(snapshot))
	for _, s := range snapshot {
		hints := []string{}
		risk := ""
		addHint := func(text, level string) {
			hints = append(hints, text)
			if level == "high" {
				risk = "high"
			} else if risk == "" {
				risk = "medium"
			}
		}
		created := asInt(s["create_time"])
		if created > 0 && now-created <= 24*3600*1000 {
			addHint("创建于 24 小时内", "high")
		}
		if currentAccountID != "" && asStr(s["account_id"]) != currentAccountID {
			addHint("不是当前账号创建", "high")
		}
		if n := batchByHour[created/3600000]; n >= 5 {
			addHint(fmt.Sprintf("同一小时内创建了 %d 条策略", n), "high")
		}
		wide := true
		for _, k := range []string{"from_pattern", "to_pattern", "subject_pattern"} {
			v := strings.TrimSpace(asStr(s[k]))
			if v != "" && v != "*" {
				wide = false
				break
			}
		}
		if wide {
			addHint("匹配范围为全部邮件", "medium")
		}
		if target := domainOfAddress(asStr(s["forward_to"])); target != "" {
			if !knownDomains[target] {
				addHint("目标域名此前从未收到过邮件", "medium")
			}
			if !systemDomains[target] {
				addHint("目标域名不属于本系统", "medium")
			}
		}
		item := map[string]any{}
		for k, v := range s {
			item[k] = v
		}
		item["hints"] = hints
		item["risk"] = risk
		out = append(out, item)
	}
	return out
}

// ---------- handlers ----------

func securityEventsHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Kind     string `json:"kind"`
		Severity string `json:"severity"`
		Limit    int    `json:"limit"`
		Offset   int    `json:"offset"`
	}
	c.Decode(&req)
	limit := req.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	where := []string{"1 = 1"}
	args := []any{}
	if k := strings.TrimSpace(req.Kind); k != "" {
		where = append(where, "kind = ?")
		args = append(args, k)
	}
	if s := strings.TrimSpace(req.Severity); s != "" {
		where = append(where, "severity = ?")
		args = append(args, s)
	}
	cond := strings.Join(where, " AND ")
	var total int
	if err := db.QueryRow(`SELECT COUNT(*) FROM security_events WHERE `+cond, args...).Scan(&total); err != nil {
		return nil, throwErr("读取安全事件失败")
	}
	// 账号名必须先查好：db 只开了一个连接（MaxOpenConns(1)），只要还有 rows 没关，
	// 后面再发任何查询都会等连接等到死锁。所以这里放在主查询之前。
	accountNames := map[string]string{}
	if arows, err := db.Query(`SELECT id, name FROM accounts`); err == nil {
		for arows.Next() {
			var aid, name string
			if arows.Scan(&aid, &name) == nil {
				accountNames[aid] = name
			}
		}
		arows.Close()
	}
	rows, err := db.Query(`SELECT id, kind, severity, email_id, hit_count, send_count, detail, status,
		acked_by, acked_at, create_time FROM security_events WHERE `+cond+`
		ORDER BY create_time DESC, id DESC LIMIT ? OFFSET ?`, append(args, limit, req.Offset)...)
	if err != nil {
		return nil, throwErr("读取安全事件失败")
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, kind, severity, emailID, detail, status, ackedBy string
		var hitCount, sendCount int
		var ackedAt, createTime int64
		if rows.Scan(&id, &kind, &severity, &emailID, &hitCount, &sendCount, &detail, &status,
			&ackedBy, &ackedAt, &createTime) != nil {
			continue
		}
		item := map[string]any{
			"id": id, "kind": kind, "severity": severity, "email_id": emailID,
			"hit_count": hitCount, "send_count": sendCount, "status": status,
			"acked_by": ackedBy, "acked_at": ackedAt, "create_time": createTime,
			"detail":   json.RawMessage(detail),
		}
		if name, ok := accountNames[ackedBy]; ok {
			item["acked_by_name"] = name
		}
		list = append(list, item)
	}
	return map[string]any{"list": list, "total": total}, nil
}

func securityLockStatusHandler(c *Ctx) (any, error) {
	account := authedUser(c.Auth)
	if account == nil {
		return nil, throwErr("Unauthorized")
	}
	out := map[string]any{
		"locked":   forwardLocked(),
		"is_admin": account.IsAdmin,
		"warn_at":  forwardWarnAt(),
		"lock_at":  forwardLockAt(),
	}
	if account.IsAdmin == 0 || !forwardLocked() {
		return out, nil
	}
	var id, detail, emailID string
	var hitCount int
	var createTime int64
	if err := db.QueryRow(`SELECT id, detail, email_id, hit_count, create_time FROM security_events
		WHERE kind = 'forward_lock' AND status = 'open'
		ORDER BY create_time DESC, id DESC LIMIT 1`).Scan(&id, &detail, &emailID, &hitCount, &createTime); err != nil {
		return out, nil
	}
	var d struct {
		Subject    string           `json:"subject"`
		From       string           `json:"from"`
		To         string           `json:"to"`
		Strategies []map[string]any `json:"strategies"`
	}
	json.Unmarshal([]byte(detail), &d)
	out["event"] = map[string]any{
		"id": id, "email_id": emailID, "hit_count": hitCount,
		"create_time": createTime, "subject": d.Subject, "from": d.From, "to": d.To,
	}
	out["reviews"] = securityBuildReviews(d.Strategies, account.ID)
	out["fingerprint"] = rulesetFingerprint()
	return out, nil
}

// securityUnlockHandler 四步人工解锁的最后一步：勾选确认 + 管理员密码。
func securityUnlockHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Password     string `json:"password"`
		Confirmed    bool   `json:"confirmed"`
		TrustRuleset *bool  `json:"trust_ruleset"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	account := authedUser(c.Auth)
	if account == nil {
		return nil, throwErr("Authorization failed")
	}
	if !req.Confirmed {
		return nil, throwErr("请先勾选「我已检查上述策略」")
	}
	if strings.TrimSpace(req.Password) == "" {
		return nil, throwErr("请输入管理员密码")
	}
	// 二次认证：密码错误一律拒绝，不区分「密码错」和「无权限」
	if hashGenerate(req.Password) != account.Password {
		return nil, throwErr("密码错误，限制未解除")
	}
	now := nowMillis()
	if _, err := db.Exec(`UPDATE security_events SET status = 'acked', acked_by = ?, acked_at = ?
		WHERE kind = 'forward_lock' AND status = 'open'`, account.ID, now); err != nil {
		return nil, throwErr("解除限制失败，请重试")
	}
	forwardLockFlag.Store(false)
	securityEventInset("forward_unlock", "lock", "", 0, 0, map[string]any{
		"by": account.Email,
	}, "acked", account.ID)

	fp := rulesetFingerprint()
	trust := true
	if req.TrustRuleset != nil {
		trust = *req.TrustRuleset
	}
	if trust && fp != "" {
		securityEventInset("ruleset_trust", "trust", "", 0, 0, map[string]any{
			"fingerprint": fp,
		}, "acked", account.ID)
	}
	broadcastWsMessage(map[string]any{
		"name": "security:unlocked",
		"data": map[string]any{"by": account.Email, "message": "转发限制已解除"},
	})
	log.Printf("[Security] UNLOCK by %s (trust ruleset: %v)", account.Email, trust)
	return map[string]any{"locked": false, "fingerprint": fp, "trusted": trust}, nil
}
