package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// ---------- Resend sending (port of sendEmail) ----------

const resendAPIURL = "https://api.resend.com/emails"

type sendEmailParams struct {
	From, To, Subject, HTML string
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
	payload := map[string]any{"from": p.From, "to": p.To, "subject": p.Subject, "html": p.HTML}
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
	req, err := http.NewRequest("POST", resendAPIURL, bytes.NewReader(body))
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

const sendLogCols = `id, from_addr, to_addr, subject, html, status, channel, error, attachments, create_time, update_time, delete_time`

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

// ---------- strategy matching + forwarding (port of StrategyService) ----------

var bareAddrRe = regexp.MustCompile(`[\w.+-]+@[\w.-]+`)

func bareAddress(value string) string {
	m := bareAddrRe.FindString(value)
	return m
}

func strategyLoadAll() []StrategyRow {
	rows := []StrategyRow{}
	r, err := db.Query(`SELECT id, name, from_pattern, to_pattern, subject_pattern, forward_to, enabled, account_id, scope, grant_id, create_time, update_time, delete_time FROM strategies WHERE delete_time IS NULL AND enabled = 1`)
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
	r, err := db.Query(`SELECT id, mailbox_id, address, token_hash, start_time, end_time, note, create_time, update_time, delete_time FROM mailboxgrants WHERE delete_time IS NULL`)
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

func strategyMatch(from, to, subject string) *StrategyRow {
	live := grantLiveMap()
	all := strategyLoadAll()
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
		return s
	}
	return nil
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

func resolveForwardFrom(originalFrom, forwardTo string) string {
	rawEmail := originalFrom
	if m := bareAddrRe.FindString(originalFrom); m != "" {
		rawEmail = m
	}
	fromDomain := ""
	if at := strings.Index(rawEmail, "@"); at != -1 {
		fromDomain = strings.ToLower(rawEmail[at+1:])
	}
	allowedRaw := settingGet("allowed_from_domains")
	if allowedRaw == "" {
		allowedRaw = settingGet("allowed_domains")
	}
	var allowedFrom []string
	for _, d := range strings.Split(allowedRaw, ",") {
		d = strings.ToLower(strings.TrimSpace(d))
		if d != "" {
			allowedFrom = append(allowedFrom, d)
		}
	}
	sendable := sendableDomains()
	if containsStr(sendable, fromDomain) {
		return rawEmail
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
	convertedLocal := localPart + "__" + safeDomain
	toDomain := ""
	if at := strings.Index(forwardTo, "@"); at != -1 {
		toDomain = strings.ToLower(forwardTo[at+1:])
	}
	if containsStr(sendable, toDomain) {
		return convertedLocal + "@" + toDomain
	}
	if len(sendable) > 0 {
		return convertedLocal + "@" + sendable[0]
	}
	fallback := "example.com"
	if len(allowedFrom) > 0 {
		fallback = allowedFrom[0]
	}
	return convertedLocal + "@" + fallback
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

// strategyMatchAndForward runs on a goroutine after a clean ingest.
func strategyMatchAndForward(email *EmailRow, body [2]string) error {
	strategy := strategyMatch(email.From, email.To, email.Subject)
	if strategy == nil || strategy.ForwardTo == "" {
		return nil
	}
	from := resolveForwardFrom(email.From, strategy.ForwardTo)
	replyTo := bareAddress(email.From)
	html := body[0]
	text := body[1]
	subject := "Fwd: " + email.Subject
	bodyHTML := html
	if html == "" {
		bodyHTML = forwardPreamblePlain(email.From, email.To) + text
	} else {
		bodyHTML = forwardPreambleHTML(email.From, email.To) + html
	}
	ok := sendEmail(sendEmailParams{
		From: from, To: strategy.ForwardTo, Subject: subject, HTML: bodyHTML,
		ReplyTo: replyTo,
		Headers: map[string]string{"X-CFRS-Forwarded": "1"},
	})
	if !ok {
		return fmt.Errorf("forward send failed")
	}
	log.Printf("[Strategy] Forwarded email from %s to %s", from, strategy.ForwardTo)
	return nil
}
