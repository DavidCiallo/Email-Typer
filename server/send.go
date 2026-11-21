package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// ---------- Resend sending ----------

const resendAPIURL = "https://api.resend.com/emails"

// resendEndpoint 默认就是官方地址；只有当 RESEND_API_URL 被显式设置时才改。
// 留着这个开关是为了能在本地用假 Resend 跑通转发链路（去重、附件、限额
// 这些只有在真实发送成功时才会计数，没有开关根本测不到）。
func resendEndpoint() string {
	if v := envStr("RESEND_API_URL", ""); v != "" {
		return v
	}
	return resendAPIURL
}

type sendEmailParams struct {
	From, To, Subject, HTML string
	Text                    string // plain-text alternative, used when HTML is empty
	ReplyTo                 string
	Headers                 map[string]string
	Attachments             []map[string]string // filename/content(base64)
}

func resolveSendAPIKey(from string) string {
	apiKey := settingGet("resend_api_key")
	keyMap := settingGet("resend_api_keys")
	if keyMap != "" {
		fromDomain := ""
		if at := strings.Index(from, "@"); at != -1 {
			fromDomain = strings.ToLower(from[at+1:])
		}
		for _, pair := range strings.Split(keyMap, ",") {
			kv := strings.SplitN(pair, ":", 2)
			if len(kv) != 2 {
				continue
			}
			if kv[0] != "" && kv[1] != "" && strings.ToLower(strings.TrimSpace(kv[0])) == fromDomain {
				return strings.TrimSpace(kv[1])
			}
		}
	}
	return apiKey
}

func sendEmail(p sendEmailParams) bool {
	apiKey := resolveSendAPIKey(p.From)
	if apiKey == "" {
		log.Printf("[Send] RESEND_API_KEY is not configured for domain in: %s", p.From)
		return false
	}
	if p.HTML == "" && p.Text == "" {
		log.Printf("[Send] refusing to send %q to %s with no body", p.Subject, p.To)
		return false
	}
	payload := map[string]any{"from": p.From, "to": p.To, "subject": p.Subject, "html": p.HTML}
	if p.HTML == "" && p.Text != "" {
		// Resend needs one of html/text; sending plain text as html collapses
		// every newline, which renders as an empty body
		delete(payload, "html")
		payload["text"] = p.Text
	}
	if p.ReplyTo != "" {
		payload["reply_to"] = p.ReplyTo
	}
	if len(p.Headers) > 0 {
		payload["headers"] = p.Headers
	}
	if len(p.Attachments) > 0 {
		payload["attachments"] = p.Attachments
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", resendEndpoint(), bytes.NewReader(body))
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Send] Failed to send email: %v", err)
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		buf := new(bytes.Buffer)
		buf.ReadFrom(resp.Body)
		log.Printf("[Send] Resend API error: %d %s", resp.StatusCode, buf.String())
		return false
	}
	return true
}

func buildVerificationEmail(verifyURL string) (string, string) {
	subject := "Verify your email address"
	html := `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <h2 style="color: #1a1a1a; margin-bottom: 16px;">Verify Your Email</h2>
            <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
                Thank you for registering. Please click the button below to verify your email address.
            </p>
            <a href="` + verifyURL + `"
               style="display: inline-block; background-color: #0066FF; color: #fff; text-decoration: none;
                      padding: 12px 32px; border-radius: 8px; font-weight: 600;">
                Verify Email
            </a>
            <p style="color: #999; font-size: 13px; margin-top: 32px;">
                If you did not create an account, you can safely ignore this email.
                This link expires in 3 days.
            </p>
        </div>
    `
	return subject, html
}

// ---------- send log (port of SendLogService) ----------

const sendLogCols = `id, from_addr, to_addr, subject, html, status, channel, error, attachments, strategy_id, email_id, create_time, update_time, delete_time`

func sendLogFindByID(id string) *SendLogRow {
	row := db.QueryRow(`SELECT `+sendLogCols+` FROM sendlogs WHERE id = ?`, id)
	s, err := scanSendLog(row)
	if err != nil {
		return nil
	}
	return s
}

// resolveResendKey only trusts domains explicitly mapped in resend_api_keys.
func resolveResendKey(from string) string {
	keyMap := settingGet("resend_api_keys")
	fromDomain := ""
	if at := strings.Index(from, "@"); at != -1 {
		fromDomain = strings.ToLower(from[at+1:])
	}
	if keyMap == "" || fromDomain == "" {
		return ""
	}
	for _, pair := range strings.Split(keyMap, ",") {
		kv := strings.SplitN(pair, ":", 2)
		if len(kv) != 2 {
			continue
		}
		if kv[0] != "" && kv[1] != "" && strings.ToLower(strings.TrimSpace(kv[0])) == fromDomain {
			return strings.TrimSpace(kv[1])
		}
	}
	return ""
}

func sendLogCreate(from, to, subject, html, channel string, attachments any) *SendLogRow {
	id := nanoID(6)
	now := nowMillis()
	_, err := db.Exec(`INSERT INTO sendlogs (id, from_addr, to_addr, subject, html, status, channel, error, attachments, create_time)
		VALUES (?,?,?,?,?,'pending',?,'',?,?)`,
		id, from, to, subject, html, channel, nullOrNil(attachments), now)
	if err != nil {
		return nil
	}
	return sendLogFindByID(id)
}

func sendLogSetStatus(id, status, errMsg string) bool {
	res, err := db.Exec(`UPDATE sendlogs SET status = ?, error = ?, update_time = ? WHERE id = ?`, status, errMsg, nowMillis(), id)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n > 0
}

// ---------- strategy matching + forwarding ----------

var bareAddrRe = regexp.MustCompile(`[\w.+-]+@[\w.-]+`)

func bareAddress(value string) string {
	m := bareAddrRe.FindString(value)
	return m
}

// strategyLoadAll 按创建顺序返回所有启用的策略。
// 这里补上的 ORDER BY 不是「谁生效」的选择器——所有命中的策略都会执行——
// 而是让执行顺序、日志顺序、以及超限时的截断对象都是确定的。
func strategyLoadAll() []StrategyRow {
	rows := []StrategyRow{}
	// 原: r, err := db.Query(`SELECT ` + strategyCols + ` FROM strategies WHERE delete_time IS NULL AND enabled = 1`)
	r, err := db.Query(`SELECT ` + strategyCols + ` FROM strategies
		WHERE delete_time IS NULL AND enabled = 1
		ORDER BY create_time ASC, id ASC`)
	if err != nil {
		return rows
	}
	defer r.Close()
	for r.Next() {
		s, err := scanStrategy(r)
		if err == nil {
			rows = append(rows, *s)
		}
	}
	return rows
}

func grantLiveMap() map[string]bool {
	live := map[string]bool{}
	now := nowMillis()
	r, err := db.Query(`SELECT ` + grantCols + ` FROM mailboxgrants WHERE delete_time IS NULL`)
	if err != nil {
		return live
	}
	defer r.Close()
	for r.Next() {
		g, err := scanGrant(r)
		if err == nil {
			live[g.ID] = now >= g.StartTime && now <= g.EndTime
		}
	}
	return live
}

// ===== 原实现（改造前，保留备查 2026-11-17）=====
// 命中第一条就 return，其余命中的策略被静默丢弃，而「第一条」又没有 ORDER BY，
// 所以行为既不可预测也不可解释。
// func strategyMatch(from, to, subject string) *StrategyRow {
// 	live := grantLiveMap()
// 	all := strategyLoadAll()
// 	for i := range all {
// 		s := &all[i]
// 		if s.Scope == "temp" && !live[s.GrantID] {
// 			continue
// 		}
// 		if s.FromPattern != "" && !matchGlob(from, s.FromPattern) {
// 			continue
// 		}
// 		if s.ToPattern != "" && !matchGlob(to, s.ToPattern) {
// 			continue
// 		}
// 		if s.SubjectPattern != "" && !matchGlob(subject, s.SubjectPattern) {
// 			continue
// 		}
// 		return s
// 	}
// 	return nil
// }
// ===== 改造后 =====
// strategyMatchAll 返回所有命中的策略。策略是规则不是模式：一条规则命中就该
// 执行，不能因为另一条规则也命中就被丢弃。
func strategyMatchAll(from, to, subject string) []StrategyRow {
	live := grantLiveMap()
	all := strategyLoadAll()
	out := make([]StrategyRow, 0, len(all))
	for i := range all {
		s := &all[i]
		if s.Scope == "temp" && !live[s.GrantID] {
			continue
		}
		if s.FromPattern != "" && !matchGlob(from, s.FromPattern) {
			continue
		}
		if s.ToPattern != "" && !matchGlob(to, s.ToPattern) {
			continue
		}
		if s.SubjectPattern != "" && !matchGlob(subject, s.SubjectPattern) {
			continue
		}
		out = append(out, *s)
	}
	return out
}

func sendableDomains() []string {
	out := []string{}
	for _, pair := range strings.Split(settingGet("resend_api_keys"), ",") {
		d := strings.ToLower(strings.TrimSpace(strings.SplitN(pair, ":", 2)[0]))
		if d != "" {
			out = append(out, d)
		}
	}
	return out
}

func containsStr(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// ===== 原实现（改造前，保留备查 2026-11-17）=====
// 发信域名跟着「转发目标」走，同一封邮件转发到不同域时会算出不同的发件人；
// 找不到可发信域名时还会静默降级到 example.com，导致 Resend 403 而无人知晓。
// func resolveForwardFrom(originalFrom, forwardTo string) string {
// 	rawEmail := originalFrom
// 	if m := bareAddrRe.FindString(originalFrom); m != "" {
// 		rawEmail = m
// 	}
// 	fromDomain := ""
// 	if at := strings.Index(rawEmail, "@"); at != -1 {
// 		fromDomain = strings.ToLower(rawEmail[at+1:])
// 	}
// 	allowedRaw := settingGet("allowed_from_domains")
// 	var allowedFrom []string
// 	for _, d := range strings.Split(allowedRaw, ",") {
// 		d = strings.ToLower(strings.TrimSpace(d))
// 		if d != "" {
// 			allowedFrom = append(allowedFrom, d)
// 		}
// 	}
// 	sendable := sendableDomains()
// 	if containsStr(sendable, fromDomain) {
// 		return rawEmail
// 	}
// 	localPart := rawEmail
// 	if at := strings.Index(rawEmail, "@"); at != -1 {
// 		localPart = rawEmail[:at]
// 	}
// 	if localPart == "" {
// 		localPart = "unknown"
// 	}
// 	safeDomain := regexp.MustCompile(`[^a-zA-Z0-9]`).ReplaceAllString(fromDomain, "_")
// 	if safeDomain == "" {
// 		safeDomain = "unknown"
// 	}
// 	convertedLocal := localPart + "__" + safeDomain
// 	toDomain := ""
// 	if at := strings.Index(forwardTo, "@"); at != -1 {
// 		toDomain = strings.ToLower(forwardTo[at+1:])
// 	}
// 	if containsStr(sendable, toDomain) {
// 		return convertedLocal + "@" + toDomain
// 	}
// 	if len(sendable) > 0 {
// 		return convertedLocal + "@" + sendable[0]
// 	}
// 	fallback := "example.com"
// 	if len(allowedFrom) > 0 {
// 		fallback = allowedFrom[0]
// 	}
// 	return convertedLocal + "@" + fallback
// }
// ===== 改造后 =====
// resolveForwardFrom 只由「原始发件人」决定转发发件地址，与转发目标无关。
// 原因：From 表示「这封信是谁发的」，不该因为「发给谁」而改变；同一封邮件
// 转发给多个域时，收件人看到的发件人必须一致。
// 发信域名取 forward_from_domain，留空则用第一个可发信域名；两者都没有时
// 返回错误，不再静默降级到 example.com。
func resolveForwardFrom(originalFrom string) (string, error) {
	rawEmail := originalFrom
	if m := bareAddrRe.FindString(originalFrom); m != "" {
		rawEmail = m
	}
	if rawEmail == "" {
		return "", fmt.Errorf("原邮件没有可用的发件人地址，无法改写转发发件人")
	}
	fromDomain := ""
	if at := strings.Index(rawEmail, "@"); at != -1 {
		fromDomain = strings.ToLower(rawEmail[at+1:])
	}
	sendable := sendableDomains()
	// 原始域本来就是自己验证过的域，原样保留
	if containsStr(sendable, fromDomain) {
		return rawEmail, nil
	}
	localPart := rawEmail
	if at := strings.Index(rawEmail, "@"); at != -1 {
		localPart = rawEmail[:at]
	}
	if localPart == "" {
		localPart = "unknown"
	}
	safeDomain := regexp.MustCompile(`[^a-zA-Z0-9]`).ReplaceAllString(fromDomain, "_")
	if safeDomain == "" {
		safeDomain = "unknown"
	}
	target := strings.ToLower(strings.TrimSpace(settingGet("forward_from_domain")))
	if target == "" {
		if len(sendable) == 0 {
			return "", fmt.Errorf("未配置可发信域名：请在「系统设置 → 邮件发送 → Resend API Keys」中添加")
		}
		target = sendable[0]
	}
	return localPart + "__" + safeDomain + "@" + target, nil
}

func escapeHTMLString(v string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return r.Replace(v)
}

func forwardPreambleHTML(from, to string) string {
	return `<div style="margin:0 0 12px;font:12px/1.6 sans-serif;color:#999;">原发件人：` + escapeHTMLString(from) +
		`<br>原收件人：` + escapeHTMLString(to) + `</div><hr style="border:none;border-top:1px solid #eee;margin:0 0 12px;">`
}

func forwardPreamblePlain(from, to string) string {
	return "原发件人：" + from + "\n原收件人：" + to + "\n\n"
}

// strategyResult 记录一条策略对一封邮件的执行结果。成功也要留痕：一封信触发
// 多次外发时，用户要能看清「哪条策略、去了哪个地址、成没成」。
type strategyResult struct {
	StrategyID string
	Action     string
	Status     string // sent | partial | skipped | failed
	Reason     string
	ToAddr     string
	// FromAddr 是这次转发实际使用的发件人（改写后的转发域地址）。
	// 发送记录里必须记这个，记原始发件人会让人以为「我们替 alice@example.com 发了信」。
	FromAddr string
	// NoLog 表示这条结果属于「本来就该这样」的情况（邮箱开关关闭、熔断期间暂停），
	// 不值得在「发送历史」里留下一行；邮件本身的汇总状态仍会记录。
	NoLog bool
}

// defaultMaxForwardPerMail 是单封邮件的外发**尝试**次数上限。
// 取 10 而不是更小的值，是为了不和熔断阈值（默认 10）打架：警告档（6~10 条）
// 的语义是「全部执行」，如果这里的上限比阈值小，警告档就会被成本上限截断，
// 表现为「命中 8 条却只转了 5 条」，看起来像 bug。
const defaultMaxForwardPerMail = 10

// maxForwardPerMail 是单封邮件的外发次数上限，默认 10，可在设置里调到 1~20。
// 它的作用是熔断误配与滥用，不是性能优化。
func maxForwardPerMail() int {
	n := settingInt("forward_max_per_mail", defaultMaxForwardPerMail)
	if n < 1 {
		return defaultMaxForwardPerMail
	}
	if n > 20 {
		return 20
	}
	return n
}

// normalizeTargetAddress 归一化转发地址，用于「同一目标只发一次」的判断。
func normalizeTargetAddress(v string) string {
	if a := bareAddress(v); a != "" {
		return strings.ToLower(a)
	}
	return strings.ToLower(strings.TrimSpace(v))
}

// normalizeTargetURL 归一化回调地址：协议与域名大小写不敏感，路径和查询保持原样。
func normalizeTargetURL(v string) string {
	v = strings.TrimSpace(v)
	u, err := url.Parse(v)
	if err != nil || u.Host == "" {
		return v
	}
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	return u.String()
}

// claimStrategyRun 抢占「某封邮件 × 某条策略」的执行权。唯一索引保证同一组合
// 只能成功一次，所以重复投递、重启后重扫都不会重复外发。
func claimStrategyRun(emailID string, s *StrategyRow) bool {
	res, err := db.Exec(`INSERT OR IGNORE INTO strategy_runs
		(id, email_id, strategy_id, action, status, reason, create_time)
		VALUES (?,?,?,?,?,?,?)`,
		nanoID(8), emailID, s.ID, s.Action, "running", "", nowMillis())
	if err != nil {
		// 台账写不进去时宁可放行也不要静默丢信，问题交给日志暴露
		log.Printf("[Strategy] claim run failed for %s/%s: %v", emailID, s.ID, err)
		return true
	}
	n, _ := res.RowsAffected()
	return n > 0
}

func finishStrategyRun(emailID, strategyID, status, reason string) {
	if _, err := db.Exec(`UPDATE strategy_runs SET status = ?, reason = ?, update_time = ?
		WHERE email_id = ? AND strategy_id = ?`, status, reason, nowMillis(), emailID, strategyID); err != nil {
		log.Printf("[Strategy] finish run failed for %s/%s: %v", emailID, strategyID, err)
	}
}

// ===== 原实现（改造前，保留备查 2026-11-17）=====
// 只执行第一条命中的策略，失败只写一行日志，用户完全看不到。
// // strategyMatchAndForward runs on a goroutine after a clean ingest.
// func strategyApply(email *EmailRow, body [2]string) error {
// 	strategy := strategyMatch(email.From, email.To, email.Subject)
// 	if strategy == nil {
// 		return nil
// 	}
// 	if strategy.Action == "archive" {
// 		// archiving is a decision about this mail alone, so it does not depend on
// 		// the mailbox's forward switch the way send/webhook do
// 		return strategyScheduleArchive(email, strategy)
// 	}
// 	if !emailShouldForward(email) {
// 		return nil
// 	}
// 	if strategy.Action == "webhook" {
// 		return strategyCallWebhook(email, strategy)
// 	}
// 	if strategy.ForwardTo == "" {
// 		return nil
// 	}
// 	from := resolveForwardFrom(email.From, strategy.ForwardTo)
// 	replyTo := bareAddress(email.From)
// 	html := body[0]
// 	text := body[1]
// 	subject := "Fwd: " + email.Subject
// 	if html == "" && text == "" {
// 		return fmt.Errorf("nothing to forward: %s has no body", email.ID)
// 	}
// 	// A mail with no HTML part keeps its plain text in the text field; putting it
// 	// in HTML would lose every line break.
// 	bodyHTML := ""
// 	bodyText := ""
// 	if html != "" {
// 		bodyHTML = forwardPreambleHTML(email.From, email.To) + html
// 	} else {
// 		bodyText = forwardPreamblePlain(email.From, email.To) + text
// 	}
// 	ok := sendEmail(sendEmailParams{
// 		From: from, To: strategy.ForwardTo, Subject: subject, HTML: bodyHTML, Text: bodyText,
// 		ReplyTo: replyTo,
// 		Headers: map[string]string{"X-CFRS-Forwarded": "1"},
// 	})
// 	if !ok {
// 		return fmt.Errorf("forward send failed")
// 	}
// 	log.Printf("[Strategy] Forwarded email from %s to %s", from, strategy.ForwardTo)
// 	return nil
// }
// ===== 改造后 =====
// strategyApplyAll 执行所有命中的策略，每个动作一条结果。调用方据此写发送记录。
//
// 六道护栏：
//  1. 按「动作 + 目标」去重：两条策略指向同一去向只发一次
//  2. 单封邮件外发次数上限：超出的跳过并记录原因
//  3. 防环：带 X-CFRS-Forwarded 的来信在 ingest 阶段已按 blocked 处理，不会走到这里；
//     另在保存策略时拒绝把 forward_to 指向本系统邮箱
//  4. 失败隔离：每条策略独立 recover，一条崩溃不影响其余
//  5. 多条归档策略命中时取最早的归档时间
//  6. 台账：同一封邮件 × 同一条策略只执行一次
func strategyApplyAll(email *EmailRow, body [2]string) []strategyResult {
	rules := strategyMatchAll(email.From, email.To, email.Subject)
	if len(rules) == 0 {
		return nil
	}

	allowOutbound := emailShouldForward(email)
	from, fromErr := resolveForwardFrom(email.From)
	// 附件方案按邮件算一次，所有策略共用（否则同一份附件会被读盘 + base64 N 次）
	attachPlan := buildAttachmentPlan(email)

	// 安全分级按「命中的策略条数」判定，不是实际外发次数：
	// 10 条策略都指向同一个地址时 hit_count=10、send_count=1，但「有人加了 10 条
	// 规则」这件事本身才是要报警的信号，按 send_count 判会漏掉。
	hitCount := len(rules)
	level := securityEvaluate(hitCount)
	alreadyLocked := forwardLocked()
	triggering := level == "lock" && !alreadyLocked
	var eventID string
	if level == "lock" {
		if alreadyLocked {
			// 熔断期间继续投递：只留痕，不重复弹窗
			eventID = securityEventInset("forward_burst", "warn", email.ID, hitCount, 0, map[string]any{
				"subject": email.Subject, "from": email.From, "to": email.To,
				"strategies": securityStrategySnapshot(rules), "locked": true,
			}, "acked", "")
		} else {
			eventID = securityLock(email, hitCount, rules)
		}
	} else if level == "warn" {
		eventID = securityWarn(email, hitCount, rules)
	}

	maxSend := maxForwardPerMail()
	// 外发配额：正常/警告按单封上限；触发熔断的这一封仍放行前 lockAt 条，
	// 避免「危险邮件一封都留不下」；已处于锁定状态则完全不外发。
	quota := maxSend
	lockSkipReason := ""
	if alreadyLocked {
		quota = 0
		lockSkipReason = "转发已暂停：请先在「安全检查」中确认策略并解除限制"
	} else if triggering {
		// 触发熔断的这一封按文档只放行前 lock_at 条（不受单封上限约束），
		// 避免「危险邮件一封都留不下」；此后的邮件则完全不外发。
		quota = forwardLockAt()
	}
	quotaReason := fmt.Sprintf("超出单封邮件外发上限（%d 次）", quota)
	if triggering {
		quotaReason = fmt.Sprintf("命中 %d 条策略超过熔断阈值，仅执行前 %d 条", hitCount, quota)
	}

	attempts := 0
	seen := map[string]string{} // 去重键 → 首次负责的策略 ID
	results := make([]strategyResult, 0, len(rules))
	minArchiveAt := int64(0)

	for i := range rules {
		s := &rules[i]
		r := strategyResult{StrategyID: s.ID, Action: s.Action}

		// 归档不产生对外流量，不受邮箱转发开关与上限约束
		if s.Action == "archive" {
			if !claimStrategyRun(email.ID, s) {
				r.Status = "skipped"
				r.Reason = "该策略已处理过此邮件"
				results = append(results, r)
				continue
			}
			at := strategyArchiveAt(email, s)
			if at <= 0 {
				r.Status = "skipped"
				r.Reason = "归档延迟必须大于 0 小时"
			} else {
				if minArchiveAt == 0 || at < minArchiveAt {
					minArchiveAt = at
				}
				r.Status = "sent"
			}
			finishStrategyRun(email.ID, s.ID, r.Status, r.Reason)
			results = append(results, r)
			continue
		}

		if !allowOutbound {
			r.Status = "skipped"
			r.Reason = "该邮箱未开启「参与策略转发」"
			// 开关关掉是用户的正常配置，不是异常，不进发送历史
			r.NoLog = true
			results = append(results, r)
			continue
		}

		var key, target string
		if s.Action == "webhook" {
			target = strings.TrimSpace(s.WebhookURL)
			if target == "" {
				r.Status = "skipped"
				r.Reason = "策略未填写回调地址"
				results = append(results, r)
				continue
			}
			key = "webhook:" + normalizeTargetURL(target)
		} else {
			if strings.TrimSpace(s.ForwardTo) == "" {
				r.Status = "skipped"
				r.Reason = "策略未填写转发地址"
				results = append(results, r)
				continue
			}
			target = s.ForwardTo
			key = "send:" + normalizeTargetAddress(target)
		}
		r.ToAddr = target

		if firstID, dup := seen[key]; dup {
			r.Status = "skipped"
			r.Reason = "与策略 " + firstID + " 的目标重复，已合并为一次"
			results = append(results, r)
			continue
		}
		if quota == 0 {
			r.Status = "skipped"
			r.Reason = lockSkipReason
			r.NoLog = true
			results = append(results, r)
			continue
		}
		if attempts >= quota {
			r.Status = "skipped"
			r.Reason = quotaReason
			results = append(results, r)
			continue
		}
		if !claimStrategyRun(email.ID, s) {
			r.Status = "skipped"
			r.Reason = "该策略已处理过此邮件"
			results = append(results, r)
			continue
		}

		r.Status, r.Reason = runStrategyOnce(email, s, body, from, fromErr, attachPlan)
		if fromErr == nil && strings.TrimSpace(from) != "" {
			r.FromAddr = from
		}
		// 计数按「尝试」而不是「成功」：发送失败同样消耗了这次配额，
		// 否则「全部失败」的 burst 会一路跑到最后一条，上限形同虚设。
		seen[key] = s.ID
		attempts++
		finishStrategyRun(email.ID, s.ID, r.Status, r.Reason)
		results = append(results, r)
	}

	// 熔断/警告事件落库时还不知道实际外发了几次，这里回填
	securityUpdateSendCount(eventID, attempts)

	// 多条归档策略命中时写最早的那个：归档是软删除，早一点更保守，用户还能恢复
	if minArchiveAt > 0 {
		if _, err := db.Exec(`UPDATE emails SET archive_at = ?, update_time = ? WHERE id = ?`,
			minArchiveAt, nowMillis(), email.ID); err != nil {
			log.Printf("[Strategy] schedule archive failed for %s: %v", email.ID, err)
		}
	}
	return results
}

// runStrategyOnce 执行单条策略。panic 被收在这里，保证一条策略崩溃不会带走
// 同一封邮件上其余策略的执行。
func runStrategyOnce(email *EmailRow, s *StrategyRow, body [2]string, from string, fromErr error, plan *attachmentPlan) (status, reason string) {
	status, reason = "failed", ""
	defer func() {
		if rec := recover(); rec != nil {
			status = "failed"
			reason = fmt.Sprintf("执行策略时发生异常：%v", rec)
		}
	}()
	if s.Action == "webhook" {
		if err := strategyCallWebhook(email, s); err != nil {
			return "failed", err.Error()
		}
		return "sent", ""
	}
	if fromErr != nil {
		return "failed", fromErr.Error()
	}
	return forwardOnce(email, s, body, from, plan)
}

// forwardOnce 发送一次转发。发件人由调用方统一算好传进来，同一封邮件的多次
// 转发共用同一个 From。
func forwardOnce(email *EmailRow, s *StrategyRow, body [2]string, from string, plan *attachmentPlan) (string, string) {
	html := body[0]
	text := body[1]
	if html == "" && text == "" {
		return "failed", fmt.Sprintf("原邮件没有正文，无法转发（%s）", email.ID)
	}
	noticeHTML, noticeText := "", ""
	if plan != nil {
		noticeHTML, noticeText = plan.notice, plan.noticeTx
	}
	bodyHTML := ""
	bodyText := ""
	// 只有纯文本的邮件必须继续走 text，塞进 html 会丢光换行
	if html != "" {
		bodyHTML = forwardPreambleHTML(email.From, email.To) + noticeHTML + html
	} else {
		bodyText = forwardPreamblePlain(email.From, email.To) + noticeText + text
	}
	var atts []map[string]string
	if plan != nil {
		atts = plan.included
	}
	ok := sendEmail(sendEmailParams{
		From: from, To: s.ForwardTo, Subject: "Fwd: " + email.Subject,
		HTML: bodyHTML, Text: bodyText,
		ReplyTo:        bareAddress(email.From),
		Headers:        map[string]string{"X-CFRS-Forwarded": "1"},
		Attachments:    atts,
	})
	if !ok {
		return "failed", "Resend 拒绝了这次发送：请检查发信域名是否已验证、API Key 是否覆盖该域名，详见服务日志"
	}
	log.Printf("[Strategy] Forwarded %q from %s to %s (strategy %s, %d attachments)", email.Subject, from, s.ForwardTo, s.ID, len(atts))
	if plan != nil && len(plan.omitted) > 0 {
		names := make([]string, 0, len(plan.omitted))
		for _, o := range plan.omitted {
			names = append(names, fmt.Sprintf("%s（%s）", o.Filename, fmtSize(o.Size)))
		}
		mode := "已改为下载链接"
		if publicBaseURL() == "" {
			mode = "未配置外链下载地址"
		}
		return "partial", fmt.Sprintf("正文已送达，%d 个附件超出转发上限未随信送达（%s）：%s",
			len(plan.omitted), mode, strings.Join(names, "、"))
	}
	return "sent", ""
}

// emailForwardAgain 是「重新转发」：把当时没送达的附件挑几个补发一次。
// 不给选择就重发全文没有意义（正文通常已经送达），所以必须显式勾选附件。
func emailForwardAgain(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		SendLogID   string `json:"sendlog_id"`
		Attachments []int  `json:"attachments"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	if len(req.Attachments) == 0 {
		return nil, throwErr("请至少选择一个附件")
	}
	origin := sendLogFindByID(req.SendLogID)
	if origin == nil {
		return nil, throwErr("发送记录不存在")
	}
	if origin.EmailID == "" {
		return nil, throwErr("这条记录没有关联原始邮件，无法重新转发")
	}
	email := emailFindByID(origin.EmailID)
	if email == nil {
		return nil, throwErr("原始邮件已删除，无法重新转发")
	}
	plan, err := buildPickedAttachmentPlan(email, req.Attachments)
	if err != nil {
		return nil, throwErr(err.Error())
	}
	// 记录里的 From 可能是改造前的历史数据（存的原始发件人），统一重新解析一遍
	fromBase := strings.TrimSpace(origin.From)
	if fromBase == "" {
		fromBase = email.From
	}
	from, fromErr := resolveForwardFrom(fromBase)
	if fromErr != nil {
		return nil, throwErr(fromErr.Error())
	}
	body := readBody(email)
	bodyHTML := ""
	bodyText := ""
	if body[0] != "" {
		bodyHTML = forwardPreambleHTML(email.From, email.To) + body[0]
	} else if body[1] != "" {
		bodyText = forwardPreamblePlain(email.From, email.To) + body[1]
	} else {
		return nil, throwErr("原邮件没有正文，无法转发")
	}

	to := origin.To
	subject := "Fwd: " + email.Subject
	logRow := sendLogCreate(from, to, subject, bodyHTML, "forward", nil)
	ok := sendEmail(sendEmailParams{
		From: from, To: to, Subject: subject,
		HTML: bodyHTML, Text: bodyText,
		ReplyTo:     bareAddress(email.From),
		Headers:     map[string]string{"X-CFRS-Forwarded": "1", "X-CFRS-ReForward": "1"},
		Attachments: plan.included,
	})
	status, msg := "sent", ""
	if !ok {
		status = "failed"
		msg = "Resend 拒绝了这次发送：请检查发信域名与 API Key，详见服务日志"
	}
	if logRow != nil {
		db.Exec(`UPDATE sendlogs SET status = ?, error = ?, email_id = ?, attachments = ?, update_time = ? WHERE id = ?`,
			status, msg, email.ID, jsonRaw(plan.includedMeta()), nowMillis(), logRow.ID)
	}
	if !ok {
		return nil, throwErr(msg)
	}
	log.Printf("[Strategy] re-forward %s attachments of %s to %s", itoa64(int64(len(plan.included))), email.ID, to)
	return map[string]any{"status": status, "sent": len(plan.included), "to": to}, nil
}

// webhookTimeout and webhookRetries keep a slow or dead receiver from pinning// the ingest goroutine; two retries ride out a transient connection failure.
const (
	webhookTimeout = 5 * time.Second
	webhookRetries = 2
)

// strategyCallWebhook GETs the strategy URL, reporting the matched mail in the
// query string, and returns an error only once every attempt has failed.
func strategyCallWebhook(email *EmailRow, strategy *StrategyRow) error {
	raw := strings.TrimSpace(strategy.WebhookURL)
	if raw == "" {
		return nil
	}
	target, err := url.Parse(raw)
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") {
		return fmt.Errorf("invalid webhook url %q", raw)
	}
	q := target.Query()
	q.Set("from", email.From)
	q.Set("to", email.To)
	q.Set("subject", email.Subject)
	q.Set("time", time.UnixMilli(email.Time).Format(time.RFC3339))
	q.Set("id", email.ID)
	target.RawQuery = q.Encode()

	client := &http.Client{Timeout: webhookTimeout}
	var lastErr error
	for attempt := 0; attempt <= webhookRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * time.Second)
		}
		req, err := http.NewRequest(http.MethodGet, target.String(), nil)
		if err != nil {
			return fmt.Errorf("build webhook request: %w", err)
		}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			log.Printf("[Strategy] Webhook %s returned %d for %s", target.Host, resp.StatusCode, email.Subject)
			return nil
		}
		lastErr = fmt.Errorf("http %d", resp.StatusCode)
	}
	return fmt.Errorf("webhook %s failed: %w", target.Host, lastErr)
}
