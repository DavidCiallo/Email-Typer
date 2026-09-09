package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Port of EmailService — index/body split: rows keep metadata only, bodies
// hydrate from the eml archive. Ingests serialize behind a mutex.

var ingestMu sync.Mutex

var indexedEml sync.Map

// maildirRoot resolves the configured maildir against the repo root so a
// relative setting ("./eml") works regardless of the binary's CWD.
func maildirRoot() string {
	raw := orDefault(settingGet("maildir_path"), "./eml")
	if filepath.IsAbs(raw) {
		return raw
	}
	return filepath.Join(repoRoot, raw)
}

const defaultAttachmentLimit = 10 * 1024 * 1024

func attachmentLimit() int64 {
	n := asInt(settingGet("attachment_max_size"))
	if n > 0 {
		return n
	}
	return defaultAttachmentLimit
}

func indexedEmlAdd(rel string)    { indexedEml.Store(rel, true) }
func indexedEmlHas(rel string) bool {
	_, ok := indexedEml.Load(rel)
	return ok
}
func indexedEmlClear() { indexedEml.Range(func(k any, v any) bool { indexedEml.Delete(k); return true }) }

func warmIndexedEml() {
	rows, err := db.Query(`SELECT eml FROM emails WHERE eml != ''`)
	if err != nil {
		log.Printf("[EmailService] warm indexed eml failed: %v", err)
		return
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		var rel string
		if rows.Scan(&rel) == nil && rel != "" {
			indexedEml.Store(rel, true)
			n++
		}
	}
	fmt.Printf("[EmailService] warmed %d indexed eml paths\n", n)
}

const emailCols = `id, eid, from_addr, to_addr, subject, html, text, time, account_id, message_id, source, mailbox_id, eml, codes, has_code, has_links, attachments, blocked, blocked_by, block_rule, create_time, update_time, delete_time`

func emailFindByID(id string) *EmailRow {
	row := db.QueryRow(`SELECT `+emailCols+` FROM emails WHERE id = ? AND delete_time IS NULL`, id)
	e, err := scanEmail(row)
	if err != nil {
		return nil
	}
	return e
}

func emailFindByIDIncludeDeleted(id string) *EmailRow {
	row := db.QueryRow(`SELECT `+emailCols+` FROM emails WHERE id = ?`, id)
	e, err := scanEmail(row)
	if err != nil {
		return nil
	}
	return e
}

func emailFindByMessageID(messageID string) *EmailRow {
	if messageID == "" {
		return nil
	}
	row := db.QueryRow(`SELECT `+emailCols+` FROM emails WHERE message_id = ? LIMIT 1`, messageID)
	e, err := scanEmail(row)
	if err != nil {
		return nil
	}
	return e
}

func emailDedupExists(parsed *ParsedEmail) bool {
	if parsed.MessageID != "" {
		if emailFindByMessageID(parsed.MessageID) != nil {
			return true
		}
	}
	var id string
	err := db.QueryRow(`SELECT id FROM emails WHERE from_addr = ? AND to_addr = ? AND subject = ? AND time = ? LIMIT 1`,
		parsed.From, parsed.To, parsed.Subject, parsed.Time).Scan(&id)
	return err == nil
}

// storeAttachments persists attachment binaries under DATA_DIR/attachments/<eid>/
// and returns the metadata JSON (SQL NULL when nothing stored).
func storeAttachments(eid string, atts []ParsedAttachment) json.RawMessage {
	if len(atts) == 0 {
		return nil
	}
	limit := attachmentLimit()
	dir := filepath.Join(dataDir, "attachments", eid)
	metas := []map[string]any{}
	for i, att := range atts {
		if int64(att.Size) > limit {
			metas = append(metas, map[string]any{"filename": att.Filename, "contentType": att.ContentType,
				"size": att.Size, "cid": att.CID, "inline": att.Inline, "path": "", "skipped": true})
			continue
		}
		safeBase := att.Filename
		if safeBase == "" {
			safeBase = "attachment"
		}
		safeBase = strings.Map(func(r rune) rune {
			switch r {
			case '\\', '/', ':', '*', '?', '"', '<', '>', '|', '\r', '\n', 0:
				return '_'
			}
			return r
		}, safeBase)
		safeName := fmt.Sprintf("%d_%s", i, safeBase)
		if len(safeName) > 180 {
			safeName = safeName[:180]
		}
		os.MkdirAll(dir, 0o755)
		if err := os.WriteFile(filepath.Join(dir, safeName), att.Content, 0o644); err != nil {
			log.Printf("[EmailService] failed to store attachment %s: %v", att.Filename, err)
			metas = append(metas, map[string]any{"filename": att.Filename, "contentType": att.ContentType,
				"size": att.Size, "cid": att.CID, "inline": att.Inline, "path": "", "skipped": true})
			continue
		}
		metas = append(metas, map[string]any{"filename": att.Filename, "contentType": att.ContentType,
			"size": att.Size, "cid": att.CID, "inline": att.Inline, "path": safeName, "skipped": false})
	}
	if len(metas) == 0 {
		return nil
	}
	return jsonRaw(metas)
}

func jsonRaw(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func ingestBuffer(raw []byte, emlPath string) *EmailRow {
	ingestMu.Lock()
	defer ingestMu.Unlock()
	return ingestBufferInner(raw, emlPath)
}

func ingestBufferInner(raw []byte, emlPath string) *EmailRow {
	parsed := parseRawEmail(raw)
	if parsed == nil {
		return nil
	}
	if emailDedupExists(parsed) {
		return nil
	}
	verdict := safetyEvaluate(parsed.From, parsed.To, parsed.Subject, parsed.HTML, parsed.Text)
	if verdict.blocked {
		log.Printf(`[Safety] Blocked email from "%s" subject "%s" (%s: %s)`, parsed.From, parsed.Subject, verdict.blockedBy, verdict.rule)
	}

	eid := nanoID(12)
	atts := storeAttachments(eid, parsed.Attachments)
	codes := extractCodes(parsed.Text, parsed.HTML)
	now := nowMillis()
	stored := &EmailRow{
		ID: nanoID(6), EID: eid,
		From: parsed.From, To: parsed.To, Subject: parsed.Subject,
		Time: parsed.Time, AccountID: parsed.AccountID, MessageID: parsed.MessageID,
		Source: orDefault(parsed.Source, "maildir"), MailboxID: parsed.MailboxID,
		Eml: emlPath, Codes: codes,
		HasCode: bool01(len(codes) > 0), HasLinks: bool01(len(extractLinks(parsed.Text, parsed.HTML)) > 0),
		Attachments: atts,
		Blocked:     bool01(verdict.blocked), BlockedBy: verdict.blockedBy, BlockRule: verdict.rule,
		CreateTime: now,
	}
	_, err := db.Exec(`INSERT INTO emails (id, eid, from_addr, to_addr, subject, html, text, time, account_id,
		message_id, source, mailbox_id, eml, codes, has_code, has_links, attachments, blocked, blocked_by, block_rule, create_time)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		stored.ID, stored.EID, stored.From, stored.To, stored.Subject, "", "", stored.Time, stored.AccountID,
		stored.MessageID, stored.Source, stored.MailboxID, stored.Eml, marshalJSON(stored.Codes),
		stored.HasCode, stored.HasLinks, nullOrNil(stored.Attachments), stored.Blocked, stored.BlockedBy, stored.BlockRule, stored.CreateTime)
	if err != nil {
		log.Printf("[EmailService] insert failed: %v", err)
		return nil
	}
	if emlPath != "" {
		indexedEml.Store(emlPath, true)
	}

	forwardedCopy := parsed.Forwarded ||
		strings.Contains(sliceStr(parsed.HTML, 300), "原发件人：") ||
		strings.HasPrefix(parsed.Text, "原发件人：")

	finalizeIngest(stored, verdict.blocked || forwardedCopy, [2]string{parsed.HTML, parsed.Text})
	return stored
}

func bool01(b bool) int {
	if b {
		return 1
	}
	return 0
}

func sliceStr(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func nullOrNil(v any) any {
	if v == nil {
		return nil
	}
	if b, ok := v.(json.RawMessage); ok && string(b) == "null" {
		return nil
	}
	return v
}

func finalizeIngest(stored *EmailRow, blocked bool, body [2]string) {
	if !blocked && emailShouldForward(stored) {
		go func() {
			if err := strategyMatchAndForward(stored, body); err != nil {
				log.Printf("[EmailService] Strategy forward failed: %v", err)
			}
		}()
	}
	broadcastWsMessage(map[string]any{
		"name": "email:new",
		"data": map[string]any{
			"id": stored.ID, "from": stored.From, "to": stored.To, "subject": stored.Subject,
			"time": stored.Time, "account_id": stored.AccountID, "source": stored.Source,
		},
	})
}

func emailShouldForward(stored *EmailRow) bool {
	if stored.Source == "api" || stored.Source == "imap" {
		if stored.MailboxID == "" {
			return false
		}
		row := db.QueryRow(`SELECT forward_enabled FROM mailboxes WHERE id = ? AND delete_time IS NULL`, stored.MailboxID)
		var fw int
		if row.Scan(&fw) != nil {
			return false
		}
		return fw == 1
	}
	return true
}

// readBody hydrates the body from the archived eml (inline fallback for
// pre-split rows or missing archives).
func readBody(e *EmailRow) [2]string {
	if e.Eml == "" {
		return [2]string{e.HTML, e.Text}
	}
	rel := strings.ReplaceAll(e.Eml, "\\", "/")
	if strings.Contains(rel, "..") {
		return [2]string{"", ""}
	}
	data, err := os.ReadFile(filepath.Join(maildirRoot(), filepath.FromSlash(rel)))
	if err != nil {
		log.Printf("[EmailService] Failed to read archived body: %s %v", rel, err)
		return [2]string{"", ""}
	}
	parsed := parseRawEmail(data)
	if parsed == nil {
		return [2]string{"", ""}
	}
	return [2]string{parsed.HTML, parsed.Text}
}

// relativizeEmlPath returns the archive path relative to the maildir root;
// files living outside the archive are copied into _import first.
func relativizeEmlPath(resolvedPath string) string {
	rootAbs, _ := filepath.Abs(maildirRoot())
	pathAbs, _ := filepath.Abs(resolvedPath)
	rel, err := filepath.Rel(rootAbs, pathAbs)
	if err != nil || rel == "" || strings.HasPrefix(rel, "..") {
		data, err := os.ReadFile(pathAbs)
		if err != nil {
			return ""
		}
		delivered := deliverToMaildir(maildirRoot(), "_import", data)
		rel = strings.TrimPrefix(strings.ReplaceAll(delivered, "\\", "/"), strings.ReplaceAll(rootAbs, "\\", "/")+"/")
		return rel
	}
	return filepath.ToSlash(rel)
}

func ingestFile(filePath string) *EmailRow {
	resolved, err := filepath.Abs(filePath)
	if err != nil {
		return nil
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		log.Printf("[EmailService] Failed to ingest email file: %s %v", filePath, err)
		return nil
	}
	return ingestBuffer(data, relativizeEmlPath(resolved))
}

type ingestOptions struct {
	source    string
	mailboxID string
	folder    string
}

// ingestRaw archives the raw mail into the maildir, then ingests the file.
func ingestRaw(raw []byte, opts ingestOptions) *EmailRow {
	extra := map[string]string{}
	if opts.source != "" {
		extra["X-CFRS-Source"] = opts.source
	}
	if opts.mailboxID != "" {
		extra["X-CFRS-Mailbox"] = opts.mailboxID
	}
	stamped := stampHeadersBuffer(raw, extra)
	folder := opts.folder
	if folder == "" {
		folder = "_receive"
	}
	filePath := deliverToMaildir(maildirRoot(), folder, stamped)
	return ingestFile(filePath)
}

func receiveEmail(raw string) *EmailRow {
	return ingestRaw([]byte(raw), ingestOptions{source: "receive", folder: "_receive"})
}

func scanDirectory(dirPath string) (int64, int64, error) {
	info, err := os.Stat(dirPath)
	if err != nil {
		return 0, 0, throwErr("Directory not found: " + dirPath)
	}
	if !info.IsDir() {
		return 0, 0, throwErr("Path is not a directory: " + dirPath)
	}
	var scanned, imported int64
	var mu sync.Mutex
	walkFiles(dirPath, func(p string) {
		mu.Lock()
		scanned++
		mu.Unlock()
		if ingestFile(p) != nil {
			mu.Lock()
			imported++
			mu.Unlock()
		}
	})
	return scanned, imported, nil
}

func emailDelete(id string) bool {
	res, err := db.Exec(`UPDATE emails SET delete_time = ?, update_time = ? WHERE id = ? AND delete_time IS NULL`, nowMillis(), nowMillis(), id)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n > 0
}

func emailRestore(id string) bool {
	res, err := db.Exec(`UPDATE emails SET delete_time = NULL, update_time = ? WHERE id = ?`, nowMillis(), id)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n > 0
}

func emailPurge(id string) bool {
	row := emailFindByIDIncludeDeleted(id)
	res, err := db.Exec(`DELETE FROM emails WHERE id = ?`, id)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	if row != nil && row.EID != "" {
		os.RemoveAll(filepath.Join(dataDir, "attachments", row.EID))
	}
	return n > 0
}

// watcher — periodic scan replaces chokidar (same semantics: only files under
// a */new/ directory, skipping paths already indexed).
func startEmailWatcher(maildirPath string) {
	if _, err := os.Stat(maildirPath); err != nil {
		log.Printf("[EmailWatcher] Maildir path not found: %s", maildirPath)
		return
	}
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			scanNewDirs(maildirPath)
		}
	}()
	log.Printf("[EmailWatcher] Scanning recursively under: %s (every 5s)", maildirPath)
}

func scanNewDirs(root string) {
	filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err != nil || info == nil {
			return nil
		}
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !info.Mode().IsRegular() || strings.HasPrefix(info.Name(), ".") {
			return nil
		}
		norm := strings.ReplaceAll(filepath.ToSlash(p), "\\", "/")
		if !strings.Contains(norm, "/new/") {
			return nil
		}
		rel := relativizeEmlPath(p)
		if indexedEmlHas(rel) {
			return nil
		}
		ingestFile(p)
		return nil
	})
}
