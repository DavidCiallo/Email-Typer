package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

func millisToTime(ms int64) time.Time { return time.UnixMilli(ms) }

func base64DecodeStripped(s string) ([]byte, bool) {
	clean := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '+' || c == '/' || c == '=' {
			clean = append(clean, c)
		}
	}
	out := make([]byte, base64.StdEncoding.DecodedLen(len(clean)))
	n, err := base64.StdEncoding.Decode(out, clean)
	if err != nil {
		if n2, err2 := base64.RawStdEncoding.Decode(out, clean); err2 == nil {
			return out[:n2], true
		}
		return out[:n], err == nil
	}
	return out[:n], true
}

func urlQueryEscape(s string) string { return url.QueryEscape(s) }

// Port of server/modules/email/email.controller.ts

type tauthSession struct {
	grant     *GrantRow
	address   string
	mailboxID string
}

func grantFindByID(id string) *GrantRow {
	row := db.QueryRow(`SELECT id, mailbox_id, address, token_hash, start_time, end_time, note, create_time, update_time, delete_time FROM mailboxgrants WHERE id = ?`, id)
	g, err := scanGrant(row)
	if err != nil {
		return nil
	}
	return g
}

func resolveTauth(token string) *tauthSession {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil
	}
	var hash string
	err := db.QueryRow(`SELECT token_hash FROM mailboxgrants WHERE token_hash = ? AND delete_time IS NULL`, hashGenerate(token)).Scan(&hash)
	if err != nil {
		return nil
	}
	row := db.QueryRow(`SELECT id, mailbox_id, address, token_hash, start_time, end_time, note, create_time, update_time, delete_time FROM mailboxgrants WHERE token_hash = ? AND delete_time IS NULL`, hash)
	g, err := scanGrant(row)
	if err != nil {
		return nil
	}
	now := nowMillis()
	if now < g.StartTime || now > g.EndTime {
		return nil
	}
	return &tauthSession{grant: g, address: g.Address, mailboxID: g.MailboxID}
}

// resolveScope: a valid tauth narrows the session to one mailbox + window.
func resolveScope(c *Ctx) (*tauthSession, bool, error) {
	tauth := resolveTauth(c.Headers["x-tauth"])
	user := identityFromToken(c.Auth) != ""
	if tauth == nil && !user {
		return nil, false, throwErr("Unauthorized")
	}
	return tauth, user, nil
}

func inTauthScope(tauth *tauthSession, from, to string, time int64) bool {
	windowStart := tauth.grant.StartTime
	addr := strings.ToLower(tauth.address)
	toHit := strings.Contains(strings.ToLower(to), addr)
	fromHit := strings.Contains(strings.ToLower(from), addr)
	return time >= windowStart && (toHit || fromHit)
}

// ---------- list ----------

func emailList(c *Ctx) (any, error) {
	tauth, user, err := resolveScope(c)
	if err != nil {
		return nil, err
	}
	var req struct {
		Archived   *bool  `json:"archived"`
		AccountID  string `json:"account_id"`
		To         string `json:"to"`
		Q          string `json:"q"`
		Blocked    *bool  `json:"blocked"`
		Source     string `json:"source"`
		MailboxID  string `json:"mailbox_id"`
		HasCode    *bool  `json:"has_code"`
		HasLinks   *bool  `json:"has_links"`
		HasAttach  *bool  `json:"has_attachments"`
		Limit      *int64 `json:"limit"`
		Offset     int64  `json:"offset"`
	}
	c.Decode(&req)

	archived := user && req.Archived != nil && *req.Archived
	conds := []string{}
	args := []any{}
	if archived {
		conds = append(conds, `delete_time IS NOT NULL`)
	} else {
		conds = append(conds, `delete_time IS NULL`)
	}
	if tauth != nil {
		conds = append(conds, "instr(lower(to_addr), ?) > 0")
		args = append(args, strings.ToLower(tauth.address))
		conds = append(conds, "time >= ?")
		args = append(args, tauth.grant.StartTime)
	}
	if tauth == nil && req.AccountID != "" {
		conds = append(conds, `account_id = ?`)
		args = append(args, req.AccountID)
	}
	if req.To != "" {
		conds = append(conds, `instr(lower(to_addr), ?) > 0`)
		args = append(args, strings.ToLower(req.To))
	}
	if q := strings.TrimSpace(req.Q); q != "" {
		conds = append(conds, `(instr(lower(from_addr), ?) > 0 OR instr(lower(to_addr), ?) > 0 OR instr(lower(subject), ?) > 0)`)
		lq := strings.ToLower(q)
		args = append(args, lq, lq, lq)
	}
	if req.Blocked != nil {
		if *req.Blocked {
			conds = append(conds, `blocked = 1`)
		} else {
			conds = append(conds, `(blocked IS NULL OR blocked != 1)`)
		}
	}
	if req.Source != "" {
		conds = append(conds, `source = ?`)
		args = append(args, req.Source)
	}
	if req.MailboxID != "" {
		conds = append(conds, `mailbox_id = ?`)
		args = append(args, req.MailboxID)
	}
	if req.HasCode != nil && *req.HasCode {
		conds = append(conds, `has_code = 1`)
	}
	if req.HasLinks != nil && *req.HasLinks {
		conds = append(conds, `has_links = 1`)
	}
	if req.HasAttach != nil && *req.HasAttach {
		conds = append(conds, `attachments IS NOT NULL`)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	var total int64
	db.QueryRow(`SELECT COUNT(*) FROM emails`+where, args...).Scan(&total)

	query := `SELECT ` + emailCols + ` FROM emails` + where + ` ORDER BY time DESC, rowid DESC`
	if req.Limit != nil {
		query += fmt.Sprintf(" LIMIT %d OFFSET %d", *req.Limit, req.Offset)
	} else if req.Offset > 0 {
		query += fmt.Sprintf(" LIMIT -1 OFFSET %d", req.Offset)
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, throwErr("Query failed")
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		e, err := scanEmail(rows)
		if err != nil {
			continue
		}
		hasAtt, attCount := attachmentStats(e.Attachments)
		list = append(list, map[string]any{
			"id": e.ID, "eid": e.EID, "from": e.From, "to": e.To, "subject": e.Subject,
			"codes": e.Codes, "time": e.Time, "account_id": e.AccountID,
			"blocked": e.Blocked, "blocked_by": e.BlockedBy, "block_rule": e.BlockRule,
			"message_id": e.MessageID, "source": orDefault(e.Source, "maildir"),
			"mailbox_id": e.MailboxID, "has_attachments": hasAtt, "attachment_count": attCount,
		})
	}

	accountSet := []string{}
	seen := map[string]bool{}
	arows, err := db.Query(`SELECT DISTINCT account_id FROM emails WHERE delete_time IS NULL AND account_id != ''`)
	if err == nil {
		for arows.Next() {
			var a string
			if arows.Scan(&a) == nil && a != "" && !seen[a] {
				seen[a] = true
				accountSet = append(accountSet, a)
			}
		}
		arows.Close()
	}
	sortStrings(accountSet)
	return map[string]any{"list": list, "total": total, "accounts": accountSet}, nil
}

func attachmentStats(raw json.RawMessage) (bool, int) {
	if len(raw) == 0 || string(raw) == "null" {
		return false, 0
	}
	var atts []struct {
		Skipped bool `json:"skipped"`
	}
	if json.Unmarshal(raw, &atts) != nil {
		return false, 0
	}
	count := 0
	for _, a := range atts {
		if !a.Skipped {
			count++
		}
	}
	return count > 0, count
}

// ---------- detail ----------

func emailDetail(c *Ctx) (any, error) {
	tauth, _, err := resolveScope(c)
	if err != nil {
		return nil, err
	}
	var req struct {
		ID string `json:"id"`
	}
	c.Decode(&req)
	data := emailFindByID(req.ID)
	if data == nil {
		return nil, throwErr("Email not found")
	}
	if tauth != nil && !inTauthScope(tauth, data.From, data.To, data.Time) {
		return nil, throwErr("Email not found")
	}
	body := readBody(data)
	return map[string]any{
		"id": data.ID, "eid": data.EID, "from": data.From, "to": data.To, "subject": data.Subject,
		"html": body[0], "text": body[1], "time": data.Time, "account_id": data.AccountID,
		"message_id": data.MessageID, "source": data.Source, "mailbox_id": data.MailboxID,
		"eml": data.Eml, "codes": data.Codes, "has_code": data.HasCode, "has_links": data.HasLinks,
		"attachments": jsonOrNullRaw(data.Attachments), "blocked": data.Blocked,
		"blocked_by": data.BlockedBy, "block_rule": data.BlockRule,
		"create_time": data.CreateTime, "update_time": data.UpdateTime, "delete_time": data.DeleteTime,
	}, nil
}

func jsonOrNullRaw(raw json.RawMessage) any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return raw
}

// ---------- send ----------

func emailSend(c *Ctx) (any, error) {
	tauth, _, err := resolveScope(c)
	if err != nil {
		return nil, err
	}
	var req struct {
		Email struct {
			From        string `json:"from"`
			To          string `json:"to"`
			Subject     string `json:"subject"`
			HTML        string `json:"html"`
			Attachments []struct {
				Filename string `json:"filename"`
				Content  string `json:"content"`
			} `json:"attachments"`
		} `json:"email"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	from := req.Email.From
	if tauth != nil && from != tauth.address {
		return nil, throwErr("A temporary session can only send from the granted mailbox")
	}
	allowedFrom := settingGet("allowed_from_domains")
	if allowedFrom != "" {
		domains := splitCSV(strings.ToLower(allowedFrom))
		fromDomain := ""
		if at := strings.Index(from, "@"); at != -1 {
			fromDomain = strings.ToLower(from[at+1:])
		}
		if fromDomain == "" || !containsStr(domains, fromDomain) {
			return nil, throwErr("发件域名不允许，仅支持: " + allowedFrom)
		}
	}

	type att struct {
		filename string
		content  string
	}
	attachments := []att{}
	for _, a := range req.Email.Attachments {
		if a.Filename == "" || a.Content == "" {
			continue
		}
		fn := a.Filename
		if len(fn) > 200 {
			fn = fn[:200]
		}
		content := stripAllWhitespace(a.Content)
		attachments = append(attachments, att{fn, content})
	}
	totalBase64 := 0
	for _, a := range attachments {
		totalBase64 += len(a.content)
	}
	if totalBase64 > 40*1024*1024 {
		return nil, throwErr("附件总大小超限")
	}

	channel := "external"
	if resolveResendKey(from) != "" {
		channel = "resend"
	}
	attMetas := []map[string]any{}
	for _, a := range attachments {
		attMetas = append(attMetas, map[string]any{
			"filename": a.filename, "content": a.content,
			// Math.round(content.length * 3 / 4) parity
			"size": (len(a.content)*3 + 2) / 4,
		})
	}
	log := sendLogCreate(from, req.Email.To, req.Email.Subject, req.Email.HTML, channel, nullOrNil(attJSON(attMetas)))
	if log == nil {
		return nil, throwErr("Failed to create send log")
	}

	if channel == "resend" {
		resendAtts := []map[string]string{}
		for _, a := range attachments {
			resendAtts = append(resendAtts, map[string]string{"filename": a.filename, "content": a.content})
		}
		ok := sendEmail(sendEmailParams{From: from, To: req.Email.To, Subject: req.Email.Subject, HTML: req.Email.HTML, Attachments: resendAtts})
		if ok {
			sendLogSetStatus(log.ID, "sent", "")
		} else {
			sendLogSetStatus(log.ID, "failed", "Resend send failed")
			return nil, throwErr("Failed to send email")
		}
		return map[string]any{"status": "sent"}, nil
	}
	return map[string]any{"status": "pending"}, nil
}

func attJSON(metas []map[string]any) json.RawMessage {
	b, _ := json.Marshal(metas)
	return b
}

func stripAllWhitespace(s string) string {
	var sb strings.Builder
	for _, r := range s {
		switch r {
		case ' ', '\t', '\n', '\r', '\v', '\f':
			continue
		}
		sb.WriteRune(r)
	}
	return sb.String()
}

// ---------- send log list / update ----------

func authedForSendLog(auth string) bool {
	if auth == "" {
		return false
	}
	if identityFromToken(auth) != "" {
		return true
	}
	masterKey := settingGet("email_receive_api_key")
	return masterKey != "" && timingSafeEq(auth, masterKey)
}

func sendLogList(c *Ctx) (any, error) {
	tauth, _, err := resolveScope(c)
	if err != nil {
		return nil, err
	}
	machine := tauth == nil && authedForSendLog(c.Auth)
	user := identityFromToken(c.Auth) != ""
	if !user && !machine && tauth == nil {
		return nil, throwErr("Unauthorized")
	}
	var req struct {
		Status         string `json:"status"`
		Limit          *int64 `json:"limit"`
		Offset         int64  `json:"offset"`
		IncludeContent bool   `json:"include_content"`
	}
	c.Decode(&req)

	conds := []string{}
	args := []any{}
	if tauth != nil {
		conds = append(conds, "instr(lower(from_addr), ?) > 0")
		args = append(args, strings.ToLower(tauth.address))
		conds = append(conds, "create_time >= ?")
		args = append(args, tauth.grant.StartTime)
	}
	if req.Status != "" {
		conds = append(conds, `status = ?`)
		args = append(args, req.Status)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}
	var total int64
	db.QueryRow(`SELECT COUNT(*) FROM sendlogs`+where, args...).Scan(&total)
	query := `SELECT ` + sendLogCols + ` FROM sendlogs` + where + ` ORDER BY rowid DESC`
	if req.Limit != nil {
		query += fmt.Sprintf(" LIMIT %d OFFSET %d", *req.Limit, req.Offset)
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, throwErr("Query failed")
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		s, err := scanSendLog(rows)
		if err != nil {
			continue
		}
		atts := any(nil)
		if req.IncludeContent {
			atts = jsonOrNullRaw(s.Attachments)
		} else {
			atts = trimAttachments(s.Attachments)
		}
		list = append(list, map[string]any{
			"id": s.ID, "from": s.From, "to": s.To, "subject": s.Subject, "html": s.HTML,
			"status": s.Status, "channel": s.Channel, "error": s.Error,
			"attachments": atts, "create_time": s.CreateTime, "update_time": s.UpdateTime, "delete_time": s.DeleteTime,
		})
	}
	return map[string]any{"list": list, "total": total}, nil
}

func trimAttachments(raw json.RawMessage) any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var atts []struct {
		Filename string `json:"filename"`
		Size     int    `json:"size"`
	}
	if json.Unmarshal(raw, &atts) != nil {
		return nil
	}
	out := []map[string]any{}
	for _, a := range atts {
		out = append(out, map[string]any{"filename": a.Filename, "size": a.Size})
	}
	return out
}

func sendLogUpdate(c *Ctx) (any, error) {
	tauth, _, err := resolveScope(c)
	if err != nil {
		return nil, err
	}
	machine := tauth == nil && authedForSendLog(c.Auth)
	user := identityFromToken(c.Auth) != ""
	if !user && !machine && tauth == nil {
		return nil, throwErr("Unauthorized")
	}
	var req struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	c.Decode(&req)
	if req.Status != "pending" && req.Status != "sent" && req.Status != "failed" {
		return nil, throwErr("Invalid status")
	}
	if tauth != nil {
		s := sendLogFindByID(req.ID)
		if s == nil || !inTauthScope(tauth, s.From, s.To, s.CreateTime) {
			return nil, throwErr("Send log not found")
		}
	}
	if !sendLogSetStatus(req.ID, req.Status, "") {
		return nil, throwErr("Send log not found")
	}
	return map[string]any{}, nil
}

// ---------- receive (legacy endpoint) ----------

func emailReceive(c *Ctx) (any, error) {
	apiKey := c.Auth
	expectedKey := settingGet("email_receive_api_key")
	if expectedKey == "" || !timingSafeEq(apiKey, expectedKey) {
		return nil, throwErr("Unauthorized")
	}
	raw := asStr(c.Body["raw"])
	if raw == "" {
		raw = c.RawBody
	}
	email := receiveEmail(raw)
	if email == nil {
		var parsedID string
		if parsed := parseRawEmail([]byte(raw)); parsed != nil && parsed.MessageID != "" {
			if existing := emailFindByMessageID(parsed.MessageID); existing != nil {
				parsedID = existing.ID
			}
		}
		if parsedID == "" {
			return nil, throwErr("Failed to parse email")
		}
		return map[string]any{"id": parsedID}, nil
	}
	return map[string]any{"id": email.ID}, nil
}

// ---------- push (bridge API) ----------

var (
	pushMu    sync.Mutex
	pushHits  = map[string][]int64{}
)

func allowPush(key string) bool {
	limit := asInt(settingGet("push_rate_limit_per_min"))
	if limit <= 0 {
		limit = 120
	}
	if key == "" {
		return true
	}
	pushMu.Lock()
	defer pushMu.Unlock()
	now := nowMillis()
	hits := []int64{}
	for _, t := range pushHits[key] {
		if now-t < 60_000 {
			hits = append(hits, t)
		}
	}
	if int64(len(hits)) >= limit {
		pushHits[key] = hits
		return false
	}
	hits = append(hits, now)
	pushHits[key] = hits
	return true
}

func summarizePush(email *EmailRow, duplicate bool, to string) map[string]any {
	var atts []struct {
		Skipped  bool   `json:"skipped"`
		Filename string `json:"filename"`
	}
	if len(email.Attachments) > 0 && string(email.Attachments) != "null" {
		json.Unmarshal(email.Attachments, &atts)
	}
	stored, skipped := 0, 0
	skippedFiles := []string{}
	for _, a := range atts {
		if a.Skipped {
			skipped++
			skippedFiles = append(skippedFiles, a.Filename)
		} else {
			stored++
		}
	}
	return map[string]any{
		"id": email.ID, "to": to, "message_id": email.MessageID, "duplicate": duplicate,
		"attachments": map[string]any{"stored": stored, "skipped": skipped, "skipped_files": skippedFiles},
	}
}

func pushResultIdempotent(stored *EmailRow, to, requestedMessageID string) (any, error) {
	if stored != nil {
		return summarizePush(stored, false, to), nil
	}
	var existing *EmailRow
	if requestedMessageID != "" {
		existing = emailFindByMessageID(requestedMessageID)
	}
	if existing == nil {
		return nil, throwErr("Failed to ingest pushed email")
	}
	return summarizePush(existing, true, to), nil
}

func emailPush(c *Ctx) (any, error) {
	headers := c.Headers
	contentType := strings.ToLower(headers["content-type"])
	apiKey := headers["x-api-key"]
	if apiKey == "" {
		apiKey = c.Auth
	}
	masterKey := settingGet("email_receive_api_key")
	if masterKey == "" || !timingSafeEq(apiKey, masterKey) {
		return nil, throwErr("Unauthorized")
	}
	if !allowPush(apiKey) {
		return nil, throwErr("推送频率超限（每分钟上限），请稍后再试")
	}

	mailTime := asInt(c.Body["time"])
	if mailTime <= 0 {
		return nil, throwErr("Missing or invalid `time` — pushes must state the mail's time (ms since epoch)")
	}
	mailDate := millisToTime(mailTime)

	to := strings.TrimSpace(asStr(c.Body["to"]))

	resolveOpts := func() ingestOptions {
		mailboxID := ""
		if to != "" {
			if box := mailboxFindByAddress(to); box != nil {
				mailboxID = box.ID
			}
		}
		return ingestOptions{source: "api", mailboxID: mailboxID, folder: "_api_recv"}
	}

	rawField, hasRawField := bodyString(c.Body, "raw")
	rawB64Field, hasRawB64 := bodyString(c.Body, "raw_base64")
	if strings.Contains(contentType, "message/rfc822") || hasRawField || hasRawB64 {
		var rawBuf []byte
		switch {
		case hasRawB64:
			rawBuf, _ = base64DecodeStripped(rawB64Field)
		case hasRawField:
			rawBuf = []byte(rawField)
		default:
			rawBuf = []byte(c.RawBody)
		}
		if len(rawBuf) == 0 {
			return nil, throwErr("Empty raw email")
		}
		rawBuf = withDateHeader(rawBuf, mailDate)
		parsedInline := parseRawEmail(rawBuf)
		if to == "" && parsedInline != nil {
			if m := bareAddrRe.FindString(parsedInline.To); m != "" {
				to = m
			}
		}
		if to == "" {
			return nil, throwErr("Missing `to` address (or a To header in the raw mail)")
		}
		inlineMessageID := asStr(c.Body["message_id"])
		if inlineMessageID == "" && parsedInline != nil {
			inlineMessageID = parsedInline.MessageID
		}
		stored := ingestRaw(rawBuf, resolveOpts())
		return pushResultIdempotent(stored, to, inlineMessageID)
	}

	if to == "" {
		return nil, throwErr("Missing `to` address")
	}

	subject := asStr(c.Body["subject"])
	html := asStr(c.Body["html"])
	text := asStr(c.Body["text"])
	if subject == "" && html == "" && text == "" {
		return nil, throwErr("Subject or body is required")
	}
	from := asStr(c.Body["from"])
	if from == "" {
		domain := "cfrs.local"
		if at := strings.Index(to, "@"); at != -1 {
			domain = to[at+1:]
		}
		from = "push@" + domain
	}
	var attachments []ComposeAttachment
	if rawAtts, ok := c.Body["attachments"].([]any); ok {
		if len(rawAtts) > 50 {
			rawAtts = rawAtts[:50]
		}
		for i, ra := range rawAtts {
			m, ok := ra.(map[string]any)
			if !ok {
				continue
			}
			filename := asStr(m["filename"])
			if filename == "" {
				filename = fmt.Sprintf("attachment_%d", i+1)
			}
			if len(filename) > 200 {
				filename = filename[:200]
			}
			content, _ := base64DecodeStripped(asStr(m["base64"]))
			if len(content) == 0 {
				continue
			}
			attachments = append(attachments, ComposeAttachment{Filename: filename, ContentType: asStr(m["contentType"]), Content: content})
		}
	}

	raw := composeRawEmail(ComposeOptions{
		From: from, To: to, Subject: subject, HTML: html, Text: text,
		Attachments: attachments, MessageID: asStr(c.Body["message_id"]), Date: mailDate,
	})
	stored := ingestRaw([]byte(raw), resolveOpts())
	return pushResultIdempotent(stored, to, asStr(c.Body["message_id"]))
}

func bodyString(body map[string]any, key string) (string, bool) {
	if v, ok := body[key]; ok {
		if s, ok := v.(string); ok {
			return s, true
		}
	}
	return "", false
}

// ---------- attachment download ----------

func emailAttachment(c *Ctx) (any, error) {
	tauth, _, err := resolveScope(c)
	if err != nil {
		return nil, err
	}
	var req struct {
		ID    string `json:"id"`
		Index int64  `json:"index"`
	}
	c.Decode(&req)
	data := emailFindByID(req.ID)
	if data == nil {
		return nil, throwErr("Email not found")
	}
	if tauth != nil && !inTauthScope(tauth, data.From, data.To, data.Time) {
		return nil, throwErr("Email not found")
	}
	var atts []struct {
		Filename    string `json:"filename"`
		ContentType string `json:"contentType"`
		Size        int    `json:"size"`
		Path        string `json:"path"`
		Skipped     bool   `json:"skipped"`
	}
	if len(data.Attachments) > 0 && string(data.Attachments) != "null" {
		json.Unmarshal(data.Attachments, &atts)
	}
	if req.Index < 0 || int(req.Index) >= len(atts) {
		return nil, throwErr("Attachment not found")
	}
	meta := atts[req.Index]
	if meta.Skipped || meta.Path == "" {
		return nil, throwErr("Attachment was not stored (size limit exceeded)")
	}
	filePath := filepath.Join(dataDir, "attachments", data.EID, meta.Path)
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil, throwErr("Attachment file missing")
	}
	filename := meta.Filename
	fallback := strings.Map(func(r rune) rune {
		if r > 0x7e || r < 0x20 {
			return '_'
		}
		if r == '"' {
			return '\''
		}
		return r
	}, filename)
	encoded := urlQueryEscape(filename)
	return rawResponse(func(w http.ResponseWriter) {
		ct := meta.ContentType
		if ct == "" {
			ct = "application/octet-stream"
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Content-Length", itoa64(int64(meta.Size)))
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"; filename*=UTF-8''%s", fallback, encoded))
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(content)
	}), nil
}

// ---------- scan / delete / restore / purge ----------

func emailScan(c *Ctx) (any, error) {
	if identityFromToken(c.Auth) == "" {
		return nil, throwErr("Unauthorized")
	}
	var req struct {
		Path string `json:"path"`
	}
	c.Decode(&req)
	dir := req.Path
	if dir == "" {
		dir = maildirRoot()
	}
	scanned, imported, err := scanDirectory(dir)
	if err != nil {
		return nil, err
	}
	return map[string]any{"scanned": scanned, "imported": imported}, nil
}

func emailDeleteHandler(c *Ctx) (any, error) {
	if identityFromToken(c.Auth) == "" {
		return nil, throwErr("Unauthorized")
	}
	var req struct {
		ID string `json:"id"`
	}
	c.Decode(&req)
	if !emailDelete(req.ID) {
		return nil, throwErr("Email not found")
	}
	return map[string]any{}, nil
}

func emailRestoreHandler(c *Ctx) (any, error) {
	if identityFromToken(c.Auth) == "" {
		return nil, throwErr("Unauthorized")
	}
	var req struct {
		ID string `json:"id"`
	}
	c.Decode(&req)
	if !emailRestore(req.ID) {
		return nil, throwErr("Email not found")
	}
	return map[string]any{}, nil
}

func emailPurgeHandler(c *Ctx) (any, error) {
	if identityFromToken(c.Auth) == "" {
		return nil, throwErr("Unauthorized")
	}
	var req struct {
		ID string `json:"id"`
	}
	c.Decode(&req)
	if !emailPurge(req.ID) {
		return nil, throwErr("Email not found")
	}
	return map[string]any{}, nil
}
