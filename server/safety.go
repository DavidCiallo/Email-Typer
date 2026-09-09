package main

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
)

// Port of server/modules/safety — evaluate at ingest, re-evaluate the whole
// store in a single-flight background pass when rules change.

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
	r, err := db.Query(`SELECT id, type, value, note, create_time, update_time, delete_time FROM safety WHERE delete_time IS NULL`)
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

// safetyEvaluateRules: whitelist > blacklist > sensitive_word.
func safetyEvaluateRules(rules []SafetyRow, from, to, subject, html, text string) safetyVerdict {
	subjectLower := strings.ToLower(subject)
	hasSensitive := false
	for _, e := range rules {
		if e.Type == "sensitive_word" {
			hasSensitive = true
			break
		}
	}
	var bodyLower string
	if hasSensitive {
		bodyLower = strings.ToLower(html + text)
	}

	whitelisted := false
	blacklistRule := ""
	sensitiveRule := ""
	for _, e := range rules {
		if e.Type == "whitelist" && matchPattern(from, e.Value) {
			whitelisted = true
		}
		if blacklistRule == "" && e.Type == "blacklist" && (matchPattern(from, e.Value) || matchPattern(to, e.Value)) {
			blacklistRule = e.Value
		}
		if sensitiveRule == "" && e.Type == "sensitive_word" {
			keyword := strings.ToLower(e.Value)
			if strings.Contains(subjectLower, keyword) || strings.Contains(bodyLower, keyword) {
				sensitiveRule = e.Value
			}
		}
	}
	if whitelisted {
		return safetyVerdict{}
	}
	if blacklistRule != "" {
		return safetyVerdict{true, "blacklist", blacklistRule}
	}
	if sensitiveRule != "" {
		return safetyVerdict{true, "sensitive_word", sensitiveRule}
	}
	return safetyVerdict{}
}

func safetyEvaluate(from, to, subject, html, text string) safetyVerdict {
	return safetyEvaluateRules(safetyLoadRules(), from, to, subject, html, text)
}

var (
	reapplyMu      sync.Mutex
	reapplyRunning bool
	reapplyAgain   bool
)

// safetyScheduleReapply queues one retroactive pass (coalesced, off-request).
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

func safetyReapplyInner() {
	rules := safetyLoadRules()
	hasSensitive := false
	for _, e := range rules {
		if e.Type == "sensitive_word" {
			hasSensitive = true
			break
		}
	}
	bodies := map[string][2]string{}
	if hasSensitive {
		rows, err := db.Query(`SELECT id, eid, from_addr, to_addr, subject, html, text, time, account_id, message_id, source, mailbox_id, eml, codes, has_code, has_links, attachments, blocked, blocked_by, block_rule, create_time, update_time, delete_time FROM emails`)
		if err == nil {
			for rows.Next() {
				e, err := scanEmail(rows)
				if err == nil {
					bodies[e.ID] = readBody(e)
				}
			}
			rows.Close()
		}
	}

	type patch struct {
		blocked int
		by      string
		rule    string
	}
	patches := map[string]patch{}
	rows, err := db.Query(`SELECT id, eid, from_addr, to_addr, subject, html, text, time, account_id, message_id, source, mailbox_id, eml, codes, has_code, has_links, attachments, blocked, blocked_by, block_rule, create_time, update_time, delete_time FROM emails`)
	if err != nil {
		return
	}
	for rows.Next() {
		e, err := scanEmail(rows)
		if err != nil {
			continue
		}
		body := bodies[e.ID]
		verdict := safetyEvaluateRules(rules, e.From, e.To, e.Subject, body[0], body[1])
		blocked := 0
		if verdict.blocked {
			blocked = 1
		}
		if blocked == e.Blocked && verdict.blockedBy == e.BlockedBy && verdict.rule == e.BlockRule {
			continue
		}
		patches[e.ID] = patch{blocked, verdict.blockedBy, verdict.rule}
	}
	rows.Close()

	tx, err := db.Begin()
	if err != nil {
		return
	}
	now := nowMillis()
	for id, p := range patches {
		if _, err := tx.Exec(`UPDATE emails SET blocked = ?, blocked_by = ?, block_rule = ?, update_time = ? WHERE id = ?`,
			p.blocked, p.by, p.rule, now, id); err != nil {
			tx.Rollback()
			log.Printf("[Safety] reapply update failed: %v", err)
			return
		}
	}
	tx.Commit()
	if len(patches) > 0 {
		fmt.Printf("[Safety] reapply: updated %d emails\n", len(patches))
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
		list = append(list, map[string]any{"id": s.ID, "type": s.Type, "value": s.Value, "note": s.Note})
	}
	return map[string]any{"list": list}, nil
}

func safetySave(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Entry struct {
			ID   string `json:"id"`
			Type string `json:"type"`
			Value string `json:"value"`
			Note  string `json:"note"`
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
	for _, r := range safetyLoadRules() {
		if r.Type != typ {
			continue
		}
		if r.ID == req.Entry.ID {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(r.Value), value) {
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
		res, err := db.Exec(`UPDATE safety SET type = ?, value = ?, note = ?, update_time = ? WHERE id = ? AND delete_time IS NULL`,
			typ, value, req.Entry.Note, now, req.Entry.ID)
		if err != nil {
			return nil, throwErr("Save failed")
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, throwErr("Safety entry not found")
		}
	} else {
		id := nanoID(6)
		if _, err := db.Exec(`INSERT INTO safety (id, type, value, note, create_time) VALUES (?,?,?,?,?)`,
			id, typ, value, req.Entry.Note, now); err != nil {
			return nil, throwErr("Save failed")
		}
	}
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
	safetyScheduleReapply()
	return map[string]any{}, nil
}
