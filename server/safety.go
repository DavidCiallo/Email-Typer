package main

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
)

// Rules are evaluated at ingest and, when they change, re-evaluated over the
// whole store in a single-flight background pass.

func matchPattern(value, pattern string) bool {
	if pattern == "" {
		return false
	}
	if pattern == "*" {
		return true
	}
	re := patternToRegex(pattern, false)
	if re != nil {
		return re.MatchString(value)
	}
	return strings.Contains(strings.ToLower(value), strings.ToLower(pattern))
}

func matchGlob(value, pattern string) bool {
	if pattern == "" {
		return true
	}
	if pattern == "*" {
		return true
	}
	// A pattern with no wildcard is the keyword the form promises ("也可填具体
	// 关键词"); anchoring it would make "One Time" miss "One Time Password".
	if !strings.Contains(pattern, "*") {
		return strings.Contains(strings.ToLower(value), strings.ToLower(pattern))
	}
	re := patternToRegex(pattern, true)
	if re != nil {
		return re.MatchString(value)
	}
	return strings.Contains(strings.ToLower(value), strings.ToLower(pattern))
}

// patternToRegex mirrors the TS escaping: [.+^${}()|[\]\\] escaped, * → .*,
// case-insensitive; anchored for strategy globs, unanchored for safety rules.
func patternToRegex(pattern string, anchored bool) *regexp.Regexp {
	var sb strings.Builder
	for _, c := range pattern {
		switch c {
		case '.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\':
			sb.WriteByte('\\')
			sb.WriteRune(c)
		case '*':
			sb.WriteString(".*")
		default:
			sb.WriteRune(c)
		}
	}
	expr := sb.String()
	if anchored {
		expr = "^" + expr + "$"
	}
	re, err := regexp.Compile("(?i)" + expr)
	if err != nil {
		return nil
	}
	return re
}

type safetyVerdict struct {
	blocked   bool
	blockedBy string
	rule      string
}

func safetyLoadRules() []SafetyRow {
	rows := []SafetyRow{}
	// 顺序即判定顺序：priority 小的先判，同优先级按创建时间（先建的先判）。
	// 排序放在这里而不是缓存构建时，保证 safetyList 接口看到的顺序也是判定顺序。
	r, err := db.Query(`SELECT ` + safetyCols + ` FROM safety WHERE delete_time IS NULL ORDER BY priority ASC, create_time ASC, id ASC`)
	if err != nil {
		return rows
	}
	defer r.Close()
	for r.Next() {
		s, err := scanSafety(r)
		if err == nil {
			rows = append(rows, *s)
		}
	}
	return rows
}

// ===== 原实现（改造前，保留备查 2026-11-17）=====
// 每封邮件都 db.Query 全表取规则，每次匹配都 regexp.Compile 一遍。
// // safetyEvaluateRules: whitelist > blacklist > sensitive_word.
// func safetyEvaluateRules(rules []SafetyRow, from, to, subject, html, text string) safetyVerdict {
// 	subjectLower := strings.ToLower(subject)
// 	hasSensitive := false
// 	for _, e := range rules {
// 		if e.Type == "sensitive_word" {
// 			hasSensitive = true
// 			break
// 		}
// 	}
// 	var bodyLower string
// 	if hasSensitive {
// 		bodyLower = strings.ToLower(html + text)
// 	}
// 	whitelisted := false
// 	blacklistRule := ""
// 	sensitiveRule := ""
// 	for _, e := range rules {
// 		if e.Type == "whitelist" && matchPattern(from, e.Value) {
// 			whitelisted = true
// 		}
// 		if blacklistRule == "" && e.Type == "blacklist" && (matchPattern(from, e.Value) || matchPattern(to, e.Value)) {
// 			blacklistRule = e.Value
// 		}
// 		if sensitiveRule == "" && e.Type == "sensitive_word" {
// 			keyword := strings.ToLower(e.Value)
// 			if strings.Contains(subjectLower, keyword) || strings.Contains(bodyLower, keyword) {
// 				sensitiveRule = e.Value
// 			}
// 		}
// 	}
// 	if whitelisted {
// 		return safetyVerdict{}
// 	}
// 	if blacklistRule != "" {
// 		return safetyVerdict{true, "blacklist", blacklistRule}
// 	}
// 	if sensitiveRule != "" {
// 		return safetyVerdict{true, "sensitive_word", sensitiveRule}
// 	}
// 	return safetyVerdict{}
// }
//
// func safetyEvaluate(from, to, subject, html, text string) safetyVerdict {
// 	return safetyEvaluateRules(safetyLoadRules(), from, to, subject, html, text)
// }
// ===== 改造后 =====
// 规则集在内存里缓存，正则只在构建缓存时编译一次。
// 失效靠「代数（generation）」而不是时间：任何写操作都让代数 +1，下次判定时
// 发现代数对不上就重建。这样既不会出现「改了规则不生效」，也不需要重启。

// compiledRule 是一条规则编译后的形态。
// 二期起判定不再看 type，而是看 action + match_field + match_mode；type 只作为
// 界面的分组标签与历史原因保留，判定时不再有任何特权。
type compiledRule struct {
	ID     string
	Type   string // 仅用于回写 blocked_by，保持历史标签可读
	Action string // allow | block
	Field  string // from | to | subject | content | any
	Mode   string // glob | keyword | regex | exact
	Scope  string // "" = 全局；否则只对该邮箱生效
	Value  string
	re      *regexp.Regexp // glob / regex 时预编译
	keyword string         // 小写，用于 keyword 与 glob 兜底
	literal bool           // 没有正则，走子串匹配
}

type safetyRuleSet struct {
	gen       uint64
	rules     []compiledRule
	needsBody bool // 有规则要看正文，重算时才有必要读 eml
}

var (
	safetySetMu sync.RWMutex
	safetySet   *safetyRuleSet
	safetyGen   atomic.Uint64
)

// safetyInvalidate 让缓存失效。必须在写库成功之后调用。
func safetyInvalidate() { safetyGen.Add(1) }

func compileSafetyRules(rows []SafetyRow) *safetyRuleSet {
	set := &safetyRuleSet{rules: make([]compiledRule, 0, len(rows))}
	for _, r := range rows {
		if r.Enabled == 0 {
			continue
		}
		action, field, mode := r.Action, r.MatchField, r.MatchMode
		if action == "" || field == "" || mode == "" {
			// 迁移没跑到的数据（例如手工改库）退回按 type 推导，别让它变成幽灵规则
			dAction, dField, dMode, _ := safetyDefaults(r.Type)
			if action == "" {
				action = dAction
			}
			if field == "" {
				field = dField
			}
			if mode == "" {
				mode = dMode
			}
		}
		if r.Value == "" {
			continue
		}
		if field == "content" || field == "any" {
			set.needsBody = true
		}
		cr := compiledRule{
			ID: r.ID, Type: r.Type, Action: action, Field: field, Mode: mode,
			Scope: strings.TrimSpace(r.Scope), Value: r.Value,
			keyword: strings.ToLower(r.Value), literal: true,
		}
		switch mode {
		case "regex":
			if re, err := regexp.Compile("(?i)" + r.Value); err == nil {
				cr.re = re
				cr.literal = false
			} else {
				// 写坏的正则不能当成「匹配一切」，直接跳过这条规则
				log.Printf("[Safety] rule %s has invalid regexp %q: %v", r.ID, r.Value, err)
				continue
			}
		case "keyword", "exact":
			// 纯子串 / 全等，不需要正则
		default: // glob
			if r.Value == "*" {
				cr.keyword = ""
			} else if re := patternToRegex(r.Value, false); re != nil {
				cr.re = re
				cr.literal = false
			}
		}
		set.rules = append(set.rules, cr)
	}
	return set
}

// safetyRules 返回当前代数对应的规则集；代数变了就重建一次。
func safetyRules() *safetyRuleSet {
	gen := safetyGen.Load()
	safetySetMu.RLock()
	cached := safetySet
	safetySetMu.RUnlock()
	if cached != nil && cached.gen == gen {
		return cached
	}
	set := compileSafetyRules(safetyLoadRules())
	set.gen = gen
	safetySetMu.Lock()
	safetySet = set
	safetySetMu.Unlock()
	return set
}

// matchText 是单字段判定。value 保留原大小写（正则用），valueLower 用于子串 / 全等。
func (c *compiledRule) matchText(value, valueLower string) bool {
	switch c.Mode {
	case "keyword":
		return strings.Contains(valueLower, c.keyword)
	case "exact":
		return strings.TrimSpace(valueLower) == c.keyword
	case "regex":
		return c.re != nil && c.re.MatchString(value)
	default: // glob
		if c.Value == "*" {
			return true
		}
		if !c.literal && c.re != nil {
			return c.re.MatchString(value)
		}
		return strings.Contains(valueLower, c.keyword)
	}
}

// matches 按规则声明的字段范围判定。
func (c *compiledRule) matches(from, fromL, to, toL, subject, subjectL, body, bodyL string) bool {
	switch c.Field {
	case "from":
		return c.matchText(from, fromL)
	case "to":
		return c.matchText(to, toL)
	case "subject":
		return c.matchText(subject, subjectL)
	case "content":
		return c.matchText(subject, subjectL) || c.matchText(body, bodyL)
	default: // any
		return c.matchText(from, fromL) || c.matchText(to, toL) ||
			c.matchText(subject, subjectL) || c.matchText(body, bodyL)
	}
}

// safetyScopeFor 决定这封邮件按哪个邮箱的规则集判定。
// 推送与 imap 来源的邮件在解析前就带上了 X-CFRS-Mailbox；maildir 来源没有，
// 这里用收件地址反查一次——只用于判定，不写回 emails.mailbox_id，
// 避免顺带改变「maildir 邮件归哪个邮箱」的既有行为。
func safetyScopeFor(mailboxID, to string) string {
	if strings.TrimSpace(mailboxID) != "" {
		return mailboxID
	}
	if box := mailboxFindByAddress(to); box != nil {
		return box.ID
	}
	return ""
}

// safetyEvaluateSet 按 priority 从高到低（数字小的先）逐条判定，命中即短路。
// 放行规则和阻止规则是同一张表里的同一类东西，谁先命中谁说了算——这就是
// 「白名单压过黑名单」这件事在新模型里的表达方式，而不是硬编码的优先级。
// mailboxID 非空时，只判定「全局规则 + 该邮箱的规则」。
func safetyEvaluateSet(set *safetyRuleSet, from, to, subject, html, text, mailboxID string) safetyVerdict {
	fromL := strings.ToLower(from)
	toL := strings.ToLower(to)
	subjectL := strings.ToLower(subject)
	var body, bodyL string
	if set.needsBody {
		body = html + text
		bodyL = strings.ToLower(body)
	}
	for i := range set.rules {
		c := &set.rules[i]
		if c.Scope != "" && c.Scope != mailboxID {
			continue
		}
		if !c.matches(from, fromL, to, toL, subject, subjectL, body, bodyL) {
			continue
		}
		if c.Action == "allow" {
			return safetyVerdict{}
		}
		return safetyVerdict{true, c.Type, c.Value}
	}
	return safetyVerdict{}
}

func safetyEvaluate(from, to, subject, html, text, mailboxID string) safetyVerdict {
	return safetyEvaluateSet(safetyRules(), from, to, subject, html, text, mailboxID)
}

var (
	reapplyMu      sync.Mutex
	reapplyRunning bool
	reapplyAgain   bool
)

// safetyScheduleReapply queues a retroactive pass (coalesced, off-request).
func safetyScheduleReapply() {
	reapplyMu.Lock()
	if reapplyRunning {
		reapplyAgain = true
		reapplyMu.Unlock()
		return
	}
	reapplyRunning = true
	reapplyMu.Unlock()

	go func() {
		for {
			safetyReapplyInner()
			reapplyMu.Lock()
			if reapplyAgain {
				reapplyAgain = false
				reapplyMu.Unlock()
				continue
			}
			reapplyRunning = false
			reapplyMu.Unlock()
			return
		}
	}()
}

// safetyReapplyBatch 是一批处理的邮件条数。全量重算走分批 + 每批独立事务，
// 避免几十万封邮件时一次性把内存和写锁全占住。
const safetyReapplyBatch = 500

func safetyReapplyInner() {
	// 用缓存里已编译好的规则集，避免重新查表 + 逐条编译
	set := safetyRules()
	needBody := set.needsBody
	lastRowid := int64(0)
	updated := 0
	for {
		// 先只取 rowid + id：连接池只有 1 个连接，边遍历边发新查询会死锁，
		// 必须把这一批读完、关掉 rows，再查别的。
		type key struct {
			rowid int64
			id    string
		}
		batch := []key{}
		rows, err := db.Query(`SELECT rowid, id FROM emails WHERE rowid > ? ORDER BY rowid LIMIT ?`, lastRowid, safetyReapplyBatch)
		if err != nil {
			log.Printf("[Safety] reapply scan failed: %v", err)
			return
		}
		for rows.Next() {
			var k key
			if rows.Scan(&k.rowid, &k.id) == nil {
				batch = append(batch, k)
			}
		}
		rows.Close()
		if len(batch) == 0 {
			break
		}
		lastRowid = batch[len(batch)-1].rowid

		placeholders := make([]string, len(batch))
		args := make([]any, len(batch))
		for i, k := range batch {
			placeholders[i] = "?"
			args[i] = k.id
		}
		mails := map[string]*EmailRow{}
		rows, err = db.Query(`SELECT `+emailCols+` FROM emails WHERE id IN (`+strings.Join(placeholders, ",")+`)`, args...)
		if err != nil {
			log.Printf("[Safety] reapply load failed: %v", err)
			return
		}
		for rows.Next() {
			if e, err := scanEmail(rows); err == nil {
				mails[e.ID] = e
			}
		}
		rows.Close()

		type patch struct {
			id      string
			blocked int
			by      string
			rule    string
		}
		patches := []patch{}
		for _, k := range batch {
			e := mails[k.id]
			if e == nil {
				continue
			}
			body := [2]string{"", ""}
			if needBody {
				body = readBody(e)
			}
			verdict := safetyEvaluateSet(set, e.From, e.To, e.Subject, body[0], body[1], safetyScopeFor(e.MailboxID, e.To))
			blocked := 0
			if verdict.blocked {
				blocked = 1
			}
			if blocked == e.Blocked && verdict.blockedBy == e.BlockedBy && verdict.rule == e.BlockRule {
				continue
			}
			patches = append(patches, patch{e.ID, blocked, verdict.blockedBy, verdict.rule})
		}
		if len(patches) == 0 {
			continue
		}

		tx, err := db.Begin()
		if err != nil {
			return
		}
		now := nowMillis()
		for _, p := range patches {
			if _, err := tx.Exec(`UPDATE emails SET blocked = ?, blocked_by = ?, block_rule = ?, update_time = ? WHERE id = ?`,
				p.blocked, p.by, p.rule, now, p.id); err != nil {
				tx.Rollback()
				log.Printf("[Safety] reapply update failed: %v", err)
				return
			}
		}
		tx.Commit()
		updated += len(patches)
	}
	// 记一个「上次全量重算的时间」，出问题时能确认规则到底有没有跑过
	metaSet("safety_last_reapply", itoa64(nowMillis()))
	if updated > 0 {
		fmt.Printf("[Safety] reapply: updated %d emails\n", updated)
	}
}

// ---------- safety handlers ----------

func safetyList(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Type string `json:"type"`
	}
	c.Decode(&req)
	rules := safetyLoadRules()
	list := []map[string]any{}
	for _, s := range rules {
		if req.Type != "" && s.Type != req.Type {
			continue
		}
		list = append(list, safetyDTO(s))
	}
	return map[string]any{"list": list}, nil
}

// safetyDTO 把一行规则摊平成前端要用的形状（含二期新增的四个维度）。
func safetyDTO(s SafetyRow) map[string]any {
	action, field, mode, prio := s.Action, s.MatchField, s.MatchMode, s.Priority
	if action == "" || field == "" || mode == "" {
		dAction, dField, dMode, dPrio := safetyDefaults(s.Type)
		if action == "" {
			action = dAction
		}
		if field == "" {
			field = dField
		}
		if mode == "" {
			mode = dMode
		}
		if prio == 0 || prio == 100 {
			prio = dPrio
		}
	}
	return map[string]any{
		"id": s.ID, "type": s.Type, "value": s.Value, "note": s.Note,
		"action": action, "match_field": field, "match_mode": mode,
		"priority": prio, "enabled": s.Enabled == 1, "scope": s.Scope,
	}
}

var safetyFields = map[string]bool{"from": true, "to": true, "subject": true, "content": true, "any": true}
var safetyModes = map[string]bool{"glob": true, "keyword": true, "regex": true, "exact": true}
var safetyActions = map[string]bool{"allow": true, "block": true}

func safetySave(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Entry struct {
			ID         string `json:"id"`
			Type       string `json:"type"`
			Value      string `json:"value"`
			Note       string `json:"note"`
			Action     string `json:"action"`
			MatchField string `json:"match_field"`
			MatchMode  string `json:"match_mode"`
			Priority   *int64 `json:"priority"`
			Enabled    *bool  `json:"enabled"`
			Scope      string `json:"scope"`
		} `json:"entry"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	value := strings.TrimSpace(req.Entry.Value)
	typ := req.Entry.Type
	if value == "" {
		return nil, throwErr("规则内容不能为空")
	}
	if typ == "" {
		typ = "blacklist"
	}
	if typ != "whitelist" && typ != "blacklist" && typ != "sensitive_word" {
		return nil, throwErr("未知的规则类型")
	}
	// 没显式给四个维度就按 type 推导——老的三个 Tab 表单因此继续可用
	action, field, mode, prio := safetyDefaults(typ)
	if req.Entry.Action != "" {
		if !safetyActions[req.Entry.Action] {
			return nil, throwErr("未知的动作：" + req.Entry.Action)
		}
		action = req.Entry.Action
	}
	if req.Entry.MatchField != "" {
		if !safetyFields[req.Entry.MatchField] {
			return nil, throwErr("未知的匹配字段：" + req.Entry.MatchField)
		}
		field = req.Entry.MatchField
	}
	if req.Entry.MatchMode != "" {
		if !safetyModes[req.Entry.MatchMode] {
			return nil, throwErr("未知的匹配方式：" + req.Entry.MatchMode)
		}
		mode = req.Entry.MatchMode
	}
	if mode == "regex" {
		// 写坏的正则会让这条规则在引擎里被跳过，等于「加了规则但不生效」，
		// 所以在保存时就拒绝，而不是等它悄悄失效
		if _, err := regexp.Compile("(?i)" + value); err != nil {
			return nil, throwErr("正则表达式无效：" + err.Error())
		}
	}
	if req.Entry.Priority != nil {
		prio = *req.Entry.Priority
	}
	enabled := int64(1)
	if req.Entry.Enabled != nil && !*req.Entry.Enabled {
		enabled = 0
	}
	// scope 只接受空前缀（全局）或真实存在的邮箱 id，避免写出永远不生效的规则
	scope := strings.TrimSpace(req.Entry.Scope)
	if scope != "" && mailboxFindByID(scope) == nil {
		return nil, throwErr("作用范围指定的邮箱不存在")
	}
	for _, r := range safetyLoadRules() {
		if r.ID == req.Entry.ID {
			continue
		}
		// 同值但作用字段 / 方式不同是两条合理规则（例如「关键词只在主题里拦」）
		if strings.EqualFold(strings.TrimSpace(r.Value), value) && r.MatchField == field && r.MatchMode == mode {
			label := "规则"
			switch typ {
			case "sensitive_word":
				label = "敏感词"
			case "blacklist":
				label = "黑名单"
			case "whitelist":
				label = "白名单"
			}
			return nil, throwErr(fmt.Sprintf("%s已存在: %s", label, r.Value))
		}
	}
	now := nowMillis()
	if req.Entry.ID != "" {
		res, err := db.Exec(`UPDATE safety SET type = ?, action = ?, match_field = ?, match_mode = ?,
			priority = ?, enabled = ?, scope = ?, value = ?, note = ?, update_time = ? WHERE id = ? AND delete_time IS NULL`,
			typ, action, field, mode, prio, enabled, scope, value, req.Entry.Note, now, req.Entry.ID)
		if err != nil {
			return nil, throwErr("Save failed")
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, throwErr("Safety entry not found")
		}
	} else {
		id := nanoID(6)
		if _, err := db.Exec(`INSERT INTO safety (id, type, action, match_field, match_mode, priority, enabled, scope, value, note, create_time)
			VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
			id, typ, action, field, mode, prio, enabled, scope, value, req.Entry.Note, now); err != nil {
			return nil, throwErr("Save failed")
		}
	}
	// 写库成功立刻让缓存失效，再排重算——顺序不能反
	safetyInvalidate()
	safetyScheduleReapply()
	return map[string]any{}, nil
}

func safetyDelete(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		ID string `json:"id"`
	}
	c.Decode(&req)
	res, err := db.Exec(`UPDATE safety SET delete_time = ?, update_time = ? WHERE id = ? AND delete_time IS NULL`, nowMillis(), nowMillis(), req.ID)
	if err != nil {
		return nil, throwErr("Delete failed")
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, throwErr("Safety entry not found")
	}
	safetyInvalidate()
	safetyScheduleReapply()
	return map[string]any{}, nil
}
