package main

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// ---------- generic JSONL + JSON value helpers ----------

func readJSONL(path string) ([]map[string]any, error) {
	var rows []map[string]any
	err := streamJSONL(path, func(row map[string]any) {
		rows = append(rows, row)
	})
	return rows, err
}

// streamJSONL feeds rows one at a time — importing a large legacy store
// (bodies still inline) must not load the whole file into memory.
func streamJSONL(path string, fn func(row map[string]any)) error {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), 64*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var m map[string]any
		if json.Unmarshal([]byte(line), &m) != nil {
			continue
		}
		fn(m)
	}
	return sc.Err()
}

func asStr(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case json.Number:
		return t.String()
	case float64:
		return fmt.Sprintf("%v", t)
	case bool:
		if t {
			return "1"
		}
		return "0"
	default:
		b, _ := json.Marshal(v)
		return string(b)
	}
}

func asInt(v any) int64 {
	switch t := v.(type) {
	case nil:
		return 0
	case json.Number:
		n, _ := t.Int64()
		return n
	case float64:
		return int64(t)
	case int64:
		return t
	case int:
		return int64(t)
	case string:
		var n int64
		fmt.Sscanf(t, "%d", &n)
		return n
	case bool:
		if t {
			return 1
		}
		return 0
	default:
		return 0
	}
}

func asJSON(v any, fallback string) string {
	if v == nil {
		return fallback
	}
	b, err := json.Marshal(v)
	if err != nil {
		return fallback
	}
	return string(b)
}

func rowID(row map[string]any) string {
	if id := asStr(row["id"]); id != "" {
		return id
	}
	return nanoID(6)
}

func rowTimePtr(row map[string]any, key string) any {
	if v, ok := row[key]; ok && v != nil {
		return sqlNullInt(asInt(v))
	}
	return nil
}

func sqlNullInt(n int64) any {
	if n == 0 {
		return nil
	}
	return n
}

// ---------- entity structs (JSON shapes identical to the TS entities) ----------

type EmailRow struct {
	ID          string          `json:"id"`
	EID         string          `json:"eid"`
	From        string          `json:"from"`
	To          string          `json:"to"`
	Subject     string          `json:"subject"`
	HTML        string          `json:"html"`
	Text        string          `json:"text"`
	Time        int64           `json:"time"`
	AccountID   string          `json:"account_id"`
	MessageID   string          `json:"message_id"`
	Source      string          `json:"source"`
	MailboxID   string          `json:"mailbox_id"`
	Eml         string          `json:"eml"`
	Codes       []string        `json:"codes"`
	HasCode     int             `json:"has_code"`
	HasLinks    int             `json:"has_links"`
	Attachments json.RawMessage `json:"attachments"`
	Blocked     int             `json:"blocked"`
	BlockedBy   string          `json:"blocked_by"`
	BlockRule   string          `json:"block_rule"`
	CreateTime  int64           `json:"create_time"`
	UpdateTime  *int64          `json:"update_time"`
	DeleteTime  *int64          `json:"delete_time"`
}

type AccountRow struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Email      string `json:"email"`
	Password   string `json:"password"`
	IsAdmin    int    `json:"is_admin"`
	CreateTime int64  `json:"create_time"`
	UpdateTime *int64 `json:"update_time"`
	DeleteTime *int64 `json:"delete_time"`
}

type StrategyRow struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	FromPattern    string `json:"from_pattern"`
	ToPattern      string `json:"to_pattern"`
	SubjectPattern string `json:"subject_pattern"`
	ForwardTo      string `json:"forward_to"`
	Enabled        int    `json:"enabled"`
	AccountID      string `json:"account_id"`
	Scope          string `json:"scope"`
	GrantID        string `json:"grant_id"`
	CreateTime     int64  `json:"create_time"`
	UpdateTime     *int64 `json:"update_time"`
	DeleteTime     *int64 `json:"delete_time"`
}

type SettingRow struct {
	Key        string `json:"key"`
	Value      string `json:"value"`
	CreateTime int64  `json:"create_time"`
	UpdateTime *int64 `json:"update_time"`
	DeleteTime *int64 `json:"delete_time"`
}

type MailboxRow struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Type          string `json:"type"`
	Address       string `json:"address"`
	Domain        string `json:"domain"`
	LocalPart     string `json:"local_part"`
	Provider      string `json:"provider"`
	ImapHost      string `json:"imap_host"`
	ImapPort      int    `json:"imap_port"`
	ImapTLS       int    `json:"imap_tls"`
	SyncInterval  int    `json:"sync_interval"`
	Credential    string `json:"credential"`
	Status        string `json:"status"`
	ForwardEnable int    `json:"forward_enabled"`
	SyncError     string `json:"sync_error"`
	LastSyncTime  *int64 `json:"last_sync_time"`
	LastUID       int    `json:"last_uid"`
	UIDValidity   int    `json:"uidvalidity"`
	Note          string `json:"note"`
	CreateTime    int64  `json:"create_time"`
	UpdateTime    *int64 `json:"update_time"`
	DeleteTime    *int64 `json:"delete_time"`
}

type GrantRow struct {
	ID         string `json:"id"`
	MailboxID  string `json:"mailbox_id"`
	Address    string `json:"address"`
	TokenHash  string `json:"token_hash"`
	StartTime  int64  `json:"start_time"`
	EndTime    int64  `json:"end_time"`
	Note       string `json:"note"`
	CreateTime int64  `json:"create_time"`
	UpdateTime *int64 `json:"update_time"`
	DeleteTime *int64 `json:"delete_time"`
}

type SafetyRow struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Value      string `json:"value"`
	Note       string `json:"note"`
	CreateTime int64  `json:"create_time"`
	UpdateTime *int64 `json:"update_time"`
	DeleteTime *int64 `json:"delete_time"`
}

type SendLogRow struct {
	ID          string          `json:"id"`
	From        string          `json:"from"`
	To          string          `json:"to"`
	Subject     string          `json:"subject"`
	HTML        string          `json:"html"`
	Status      string          `json:"status"`
	Channel     string          `json:"channel"`
	Error       string          `json:"error"`
	Attachments json.RawMessage `json:"attachments"`
	CreateTime  int64           `json:"create_time"`
	UpdateTime  *int64          `json:"update_time"`
	DeleteTime  *int64          `json:"delete_time"`
}

// ---------- scanners (column order matches the schema) ----------

func scanEmail(sc interface{ Scan(...any) error }) (*EmailRow, error) {
	e := &EmailRow{}
	var codes string
	var atts []byte
	err := sc.Scan(&e.ID, &e.EID, &e.From, &e.To, &e.Subject, &e.HTML, &e.Text, &e.Time,
		&e.AccountID, &e.MessageID, &e.Source, &e.MailboxID, &e.Eml, &codes, &e.HasCode, &e.HasLinks,
		&atts, &e.Blocked, &e.BlockedBy, &e.BlockRule, &e.CreateTime, &e.UpdateTime, &e.DeleteTime)
	if err != nil {
		return nil, err
	}
	if atts != nil {
		e.Attachments = json.RawMessage(atts)
	}
	e.Codes = []string{}
	json.Unmarshal([]byte(codes), &e.Codes)
	if e.Codes == nil {
		e.Codes = []string{}
	}
	return e, nil
}

func scanAccount(sc interface{ Scan(...any) error }) (*AccountRow, error) {
	a := &AccountRow{}
	err := sc.Scan(&a.ID, &a.Name, &a.Email, &a.Password, &a.IsAdmin, &a.CreateTime, &a.UpdateTime, &a.DeleteTime)
	return a, err
}

func scanStrategy(sc interface{ Scan(...any) error }) (*StrategyRow, error) {
	s := &StrategyRow{}
	err := sc.Scan(&s.ID, &s.Name, &s.FromPattern, &s.ToPattern, &s.SubjectPattern, &s.ForwardTo,
		&s.Enabled, &s.AccountID, &s.Scope, &s.GrantID, &s.CreateTime, &s.UpdateTime, &s.DeleteTime)
	return s, err
}

func scanSetting(sc interface{ Scan(...any) error }) (*SettingRow, error) {
	s := &SettingRow{}
	err := sc.Scan(&s.Key, &s.Value, &s.CreateTime, &s.UpdateTime, &s.DeleteTime)
	return s, err
}

func scanMailbox(sc interface{ Scan(...any) error }) (*MailboxRow, error) {
	m := &MailboxRow{}
	err := sc.Scan(&m.ID, &m.Name, &m.Type, &m.Address, &m.Domain, &m.LocalPart, &m.Provider,
		&m.ImapHost, &m.ImapPort, &m.ImapTLS, &m.SyncInterval, &m.Credential, &m.Status,
		&m.ForwardEnable, &m.SyncError, &m.LastSyncTime, &m.LastUID, &m.UIDValidity, &m.Note,
		&m.CreateTime, &m.UpdateTime, &m.DeleteTime)
	return m, err
}

func scanGrant(sc interface{ Scan(...any) error }) (*GrantRow, error) {
	g := &GrantRow{}
	err := sc.Scan(&g.ID, &g.MailboxID, &g.Address, &g.TokenHash, &g.StartTime, &g.EndTime,
		&g.Note, &g.CreateTime, &g.UpdateTime, &g.DeleteTime)
	return g, err
}

func scanSafety(sc interface{ Scan(...any) error }) (*SafetyRow, error) {
	s := &SafetyRow{}
	err := sc.Scan(&s.ID, &s.Type, &s.Value, &s.Note, &s.CreateTime, &s.UpdateTime, &s.DeleteTime)
	return s, err
}

func scanSendLog(sc interface{ Scan(...any) error }) (*SendLogRow, error) {
	s := &SendLogRow{}
	var atts []byte
	err := sc.Scan(&s.ID, &s.From, &s.To, &s.Subject, &s.HTML, &s.Status, &s.Channel, &s.Error,
		&atts, &s.CreateTime, &s.UpdateTime, &s.DeleteTime)
	if err != nil {
		return nil, err
	}
	if atts != nil {
		s.Attachments = json.RawMessage(atts)
	}
	return s, nil
}

// ---------- generic-row importers (JSONL migration + account import) ----------

func insertEmailRow(tx *sql.Tx, row map[string]any) error {
	codes := asJSON(row["codes"], "[]")
	if codes == "" || codes == "null" {
		codes = "[]"
	}
	atts := asJSON(row["attachments"], "null")
	if atts == "" {
		atts = "null"
	}
	_, err := tx.Exec(`INSERT OR REPLACE INTO emails (id, eid, from_addr, to_addr, subject, html, text, time,
		account_id, message_id, source, mailbox_id, eml, codes, has_code, has_links, attachments,
		blocked, blocked_by, block_rule, create_time, update_time, delete_time)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		rowID(row), asStr(row["eid"]), asStr(row["from"]), asStr(row["to"]), asStr(row["subject"]),
		asStr(row["html"]), asStr(row["text"]), asInt(row["time"]), asStr(row["account_id"]),
		asStr(row["message_id"]), orDefault(asStr(row["source"]), "maildir"), asStr(row["mailbox_id"]),
		asStr(row["eml"]), codes, asInt(row["has_code"]), asInt(row["has_links"]), jsonOrNull(atts),
		asInt(row["blocked"]), asStr(row["blocked_by"]), asStr(row["block_rule"]),
		asInt(orDefaultAny(row["create_time"], nowMillis())), rowTimePtr(row, "update_time"), rowTimePtr(row, "delete_time"))
	return err
}

func insertAccountRow(tx *sql.Tx, row map[string]any) error {
	_, err := tx.Exec(`INSERT OR REPLACE INTO accounts (id, name, email, password, is_admin, create_time, update_time, delete_time)
		VALUES (?,?,?,?,?,?,?,?)`,
		rowID(row), asStr(row["name"]), asStr(row["email"]), asStr(row["password"]),
		asInt(row["is_admin"]), asInt(orDefaultAny(row["create_time"], nowMillis())),
		rowTimePtr(row, "update_time"), rowTimePtr(row, "delete_time"))
	return err
}

func insertStrategyRow(tx *sql.Tx, row map[string]any) error {
	_, err := tx.Exec(`INSERT OR REPLACE INTO strategies (id, name, from_pattern, to_pattern, subject_pattern,
		forward_to, enabled, account_id, scope, grant_id, create_time, update_time, delete_time)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		rowID(row), asStr(row["name"]), asStr(row["from_pattern"]), asStr(row["to_pattern"]),
		asStr(row["subject_pattern"]), asStr(row["forward_to"]), asInt(orDefaultAny(row["enabled"], 1)),
		asStr(row["account_id"]), orDefault(asStr(row["scope"]), "persistent"), asStr(row["grant_id"]),
		asInt(orDefaultAny(row["create_time"], nowMillis())), rowTimePtr(row, "update_time"), rowTimePtr(row, "delete_time"))
	return err
}

func insertSettingRow(tx *sql.Tx, row map[string]any) error {
	_, err := tx.Exec(`INSERT OR REPLACE INTO settings (key, value, create_time, update_time, delete_time)
		VALUES (?,?,?,?,?)`,
		asStr(row["key"]), asStr(row["value"]), asInt(orDefaultAny(row["create_time"], nowMillis())),
		rowTimePtr(row, "update_time"), rowTimePtr(row, "delete_time"))
	return err
}

func insertMailboxRow(tx *sql.Tx, row map[string]any) error {
	_, err := tx.Exec(`INSERT OR REPLACE INTO mailboxes (id, name, type, address, domain, local_part, provider,
		imap_host, imap_port, imap_tls, sync_interval, credential, status, forward_enabled, sync_error,
		last_sync_time, last_uid, uidvalidity, note, create_time, update_time, delete_time)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		rowID(row), asStr(row["name"]), asStr(row["type"]), asStr(row["address"]), asStr(row["domain"]),
		asStr(row["local_part"]), asStr(row["provider"]), asStr(row["imap_host"]), asInt(row["imap_port"]),
		asInt(row["imap_tls"]), asInt(row["sync_interval"]), asStr(row["credential"]),
		orDefault(asStr(row["status"]), "active"), asInt(row["forward_enabled"]), asStr(row["sync_error"]),
		rowTimePtr(row, "last_sync_time"), asInt(row["last_uid"]), asInt(row["uidvalidity"]), asStr(row["note"]),
		asInt(orDefaultAny(row["create_time"], nowMillis())), rowTimePtr(row, "update_time"), rowTimePtr(row, "delete_time"))
	return err
}

func insertGrantRow(tx *sql.Tx, row map[string]any) error {
	_, err := tx.Exec(`INSERT OR REPLACE INTO mailboxgrants (id, mailbox_id, address, token_hash, start_time, end_time, note, create_time, update_time, delete_time)
		VALUES (?,?,?,?,?,?,?,?,?,?)`,
		rowID(row), asStr(row["mailbox_id"]), asStr(row["address"]), asStr(row["token_hash"]),
		asInt(row["start_time"]), asInt(row["end_time"]), asStr(row["note"]),
		asInt(orDefaultAny(row["create_time"], nowMillis())), rowTimePtr(row, "update_time"), rowTimePtr(row, "delete_time"))
	return err
}

func insertSafetyRow(tx *sql.Tx, row map[string]any) error {
	_, err := tx.Exec(`INSERT OR REPLACE INTO safety (id, type, value, note, create_time, update_time, delete_time)
		VALUES (?,?,?,?,?,?,?)`,
		rowID(row), asStr(row["type"]), asStr(row["value"]), asStr(row["note"]),
		asInt(orDefaultAny(row["create_time"], nowMillis())), rowTimePtr(row, "update_time"), rowTimePtr(row, "delete_time"))
	return err
}

func insertSendLogRow(tx *sql.Tx, row map[string]any) error {
	atts := asJSON(row["attachments"], "null")
	if atts == "" {
		atts = "null"
	}
	_, err := tx.Exec(`INSERT OR REPLACE INTO sendlogs (id, from_addr, to_addr, subject, html, status, channel, error, attachments, create_time, update_time, delete_time)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		rowID(row), asStr(row["from"]), asStr(row["to"]), asStr(row["subject"]), asStr(row["html"]),
		orDefault(asStr(row["status"]), "pending"), orDefault(asStr(row["channel"]), "external"),
		asStr(row["error"]), jsonOrNull(atts),
		asInt(orDefaultAny(row["create_time"], nowMillis())), rowTimePtr(row, "update_time"), rowTimePtr(row, "delete_time"))
	return err
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func orDefaultAny(v any, def any) any {
	if v == nil {
		return def
	}
	return v
}

// jsonOrNull stores a JSON string column as real SQL NULL when it is "null".
func jsonOrNull(s string) any {
	if s == "null" {
		return nil
	}
	return s
}
