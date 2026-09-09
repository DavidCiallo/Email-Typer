package main

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
)

// Port of server/modules/mailbox (sync/test are IMAP — stubbed, both live
// mailboxes are api-type).

var imapProviders = []map[string]any{
	{"key": "163", "label": "网易 163", "host": "imap.163.com", "port": 993, "tls": true},
	{"key": "126", "label": "网易 126", "host": "imap.126.com", "port": 993, "tls": true},
	{"key": "yeah", "label": "网易 yeah", "host": "imap.yeah.net", "port": 993, "tls": true},
	{"key": "qq", "label": "QQ 邮箱", "host": "imap.qq.com", "port": 993, "tls": true},
	{"key": "foxmail", "label": "Foxmail", "host": "imap.qq.com", "port": 993, "tls": true},
	{"key": "sina", "label": "新浪邮箱", "host": "imap.sina.com", "port": 993, "tls": true},
	{"key": "outlook", "label": "Outlook", "host": "outlook.office365.com", "port": 993, "tls": true},
	{"key": "custom", "label": "自定义", "host": "", "port": 993, "tls": true},
}

func resolveProviderPreset(key string) map[string]any {
	for _, p := range imapProviders {
		if p["key"] == key {
			return p
		}
	}
	return nil
}

const mailboxCols = `id, name, type, address, domain, local_part, provider, imap_host, imap_port, imap_tls, sync_interval, credential, status, forward_enabled, sync_error, last_sync_time, last_uid, uidvalidity, note, create_time, update_time, delete_time`

func mailboxFindByID(id string) *MailboxRow {
	row := db.QueryRow(`SELECT `+mailboxCols+` FROM mailboxes WHERE id = ? AND delete_time IS NULL`, id)
	m, err := scanMailbox(row)
	if err != nil {
		return nil
	}
	return m
}

func mailboxFindByAddress(address string) *MailboxRow {
	if address == "" {
		return nil
	}
	row := db.QueryRow(`SELECT `+mailboxCols+` FROM mailboxes WHERE address = ? AND delete_time IS NULL`, address)
	m, err := scanMailbox(row)
	if err != nil {
		return nil
	}
	return m
}

func mailboxLoadAll(mailboxType string) []*MailboxRow {
	query := `SELECT ` + mailboxCols + ` FROM mailboxes WHERE delete_time IS NULL`
	args := []any{}
	if mailboxType != "" {
		query += ` AND type = ?`
		args = append(args, mailboxType)
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []*MailboxRow{}
	for rows.Next() {
		if m, err := scanMailbox(rows); err == nil {
			out = append(out, m)
		}
	}
	return out
}

// allowedDomains: configured domains + maildir folders that contain new/.
func mailboxAllowedDomains() []string {
	configured := splitCSV(strings.ToLower(settingGet("allowed_domains")))
	discovered := map[string]bool{}
	entries, err := osReadDir(maildirRoot())
	if err == nil {
		for _, e := range entries {
			name := e.Name()
			if !e.IsDir() || strings.HasPrefix(name, "_") || strings.HasPrefix(name, ".") {
				continue
			}
			if dirExists(joinPath(maildirRoot(), name, "new")) {
				discovered[strings.ToLower(name)] = true
			}
		}
	}
	set := map[string]bool{}
	out := []string{}
	for _, d := range configured {
		if !set[d] {
			set[d] = true
			out = append(out, d)
		}
	}
	for d := range discovered {
		if !set[d] {
			set[d] = true
			out = append(out, d)
		}
	}
	sort.Strings(out)
	return out
}

func mailboxToDTO(m *MailboxRow) map[string]any {
	forwardEnabled := m.ForwardEnable
	if m.ForwardEnable == 0 && m.Type == "catchall" {
		forwardEnabled = 1
	}
	var lastSync any
	if m.LastSyncTime != nil {
		lastSync = *m.LastSyncTime
	}
	return map[string]any{
		"id": m.ID, "name": m.Name, "type": m.Type, "address": m.Address,
		"domain": m.Domain, "local_part": m.LocalPart, "provider": m.Provider,
		"imap_host": m.ImapHost, "imap_port": m.ImapPort, "imap_tls": m.ImapTLS,
		"sync_interval": m.SyncInterval, "status": orDefault(m.Status, "active"),
		"forward_enabled": forwardEnabled, "sync_error": m.SyncError,
		"last_sync_time": lastSync, "note": m.Note, "has_credential": m.Credential != "",
	}
}

type mailboxSaveBody struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	Address       string `json:"address"`
	Provider      string `json:"provider"`
	ImapHost      string `json:"imap_host"`
	ImapPort      int    `json:"imap_port"`
	ImapTLS       *int   `json:"imap_tls"`
	SyncInterval  int    `json:"sync_interval"`
	Password      string `json:"password"`
	Note          string `json:"note"`
	ForwardEnable int    `json:"forward_enabled"`
}

func mailboxSave(body mailboxSaveBody, id string) (*MailboxRow, error) {
	localPart, domain := body.Address, ""
	if at := strings.Index(body.Address, "@"); at != -1 {
		localPart, domain = body.Address[:at], body.Address[at+1:]
	}
	domainLower := strings.ToLower(domain)
	if body.Type == "catchall" {
		allowed := mailboxAllowedDomains()
		if len(allowed) > 0 && !containsStr(allowed, domainLower) {
			return nil, throwErr("域名不在接收列表内，仅支持: " + strings.Join(allowed, ", "))
		}
	}
	// one mailbox per address
	if dupe := mailboxFindByAddress(body.Address); dupe != nil && dupe.ID != id {
		return nil, throwErr("地址已被其他邮箱占用: " + body.Address)
	}

	name := body.Name
	if name == "" {
		name = body.Address
	}
	credential := ""
	imapHost, imapPort, imapTLS, syncInterval := "", 0, 0, 0
	if body.Type == "imap" {
		preset := resolveProviderPreset(body.Provider)
		imapHost = body.ImapHost
		if imapHost == "" && preset != nil {
			imapHost, _ = preset["host"].(string)
		}
		imapPort = body.ImapPort
		if imapPort == 0 && preset != nil {
			imapPort = int(asInt(preset["port"]))
		}
		if imapPort == 0 {
			imapPort = 993
		}
		if body.ImapTLS != nil {
			imapTLS = bool01(*body.ImapTLS != 0)
		} else if preset != nil {
			tls, _ := preset["tls"].(bool)
			imapTLS = bool01(tls)
		} else {
			imapTLS = 1
		}
		syncInterval = body.SyncInterval
		if imapHost == "" {
			return nil, throwErr("IMAP 服务器地址不能为空")
		}
		if body.Password != "" {
			cred, _ := json.Marshal(map[string]string{"user": body.Address, "password": body.Password})
			credential = aesEncrypt(string(cred))
		}
	}

	if id != "" {
		existing := mailboxFindByID(id)
		if existing == nil {
			return nil, throwErr("Mailbox not found")
		}
		updates := `name = ?, type = ?, address = ?, domain = ?, local_part = ?, provider = ?, note = ?, forward_enabled = ?,
			imap_host = ?, imap_port = ?, imap_tls = ?, sync_interval = ?, update_time = ?`
		args := []any{name, body.Type, body.Address, domainLower, localPart,
			imapProviderOrEmpty(body.Type, body.Provider), body.Note,
			bool01(body.Type == "catchall" || body.ForwardEnable != 0),
			imapHost, imapPort, imapTLS, syncInterval, nowMillis()}
		// IMAP 编辑未填新密码时保留旧凭据；切到非 imap 类型则清空
		if body.Type == "imap" && credential == "" {
			// omit credential — keep the stored one
		} else {
			updates += `, credential = ?`
			args = append(args, credential)
		}
		args = append(args, id)
		if _, err := db.Exec(`UPDATE mailboxes SET `+updates+` WHERE id = ?`, args...); err != nil {
			return nil, throwErr("Mailbox not found")
		}
		return mailboxFindByID(id), nil
	}

	newID := nanoID(6)
	_, err := db.Exec(`INSERT INTO mailboxes (id, name, type, address, domain, local_part, provider, imap_host,
		imap_port, imap_tls, sync_interval, credential, status, forward_enabled, sync_error, last_uid, uidvalidity, note, create_time)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?, '', 0, 0, ?, ?)`,
		newID, name, body.Type, body.Address, domainLower, localPart,
		imapProviderOrEmpty(body.Type, body.Provider), imapHost, imapPort, imapTLS, syncInterval,
		credential, bool01(body.Type == "catchall" || body.ForwardEnable != 0), body.Note, nowMillis())
	if err != nil {
		return nil, throwErr("Save failed")
	}
	return mailboxFindByID(newID), nil
}

func imapProviderOrEmpty(mailboxType, provider string) string {
	if mailboxType == "imap" {
		return provider
	}
	return ""
}

var extractAddressRe = regexp.MustCompile(`[\w.+-]+@[\w.-]+`)

func extractAddress(value string) string {
	m := extractAddressRe.FindString(value)
	return strings.ToLower(m)
}

func mailboxAddresses(c *Ctx) (any, error) {
	mailboxes := mailboxLoadAll("")
	declaredSet := map[string]bool{}
	for _, m := range mailboxes {
		declaredSet[m.Address] = true
	}
	declared := []map[string]any{}
	for _, m := range mailboxes {
		if m.Type != "imap" {
			declared = append(declared, mailboxToDTO(m))
		}
	}
	sort.Slice(declared, func(i, j int) bool { return declared[i]["address"].(string) < declared[j]["address"].(string) })

	type stat struct {
		count int64
		last  int64
	}
	stats := map[string]*stat{}
	rows, err := db.Query(`SELECT to_addr, time FROM emails WHERE delete_time IS NULL`)
	if err == nil {
		for rows.Next() {
			var to string
			var time int64
			if rows.Scan(&to, &time) != nil {
				continue
			}
			addr := extractAddress(to)
			if addr == "" || declaredSet[addr] {
				continue
			}
			s, ok := stats[addr]
			if !ok {
				s = &stat{}
				stats[addr] = s
			}
			s.count++
			if time > s.last {
				s.last = time
			}
		}
		rows.Close()
	}
	derived := []map[string]any{}
	for addr, s := range stats {
		derived = append(derived, map[string]any{"address": addr, "count": s.count, "last_time": s.last})
	}
	sort.Slice(derived, func(i, j int) bool {
		return derived[i]["last_time"].(int64) > derived[j]["last_time"].(int64)
	})
	return map[string]any{"declared": declared, "derived": derived}, nil
}

// ---------- handlers ----------

func mailboxList(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Type string `json:"type"`
	}
	c.Decode(&req)
	list := []map[string]any{}
	for _, m := range mailboxLoadAll(req.Type) {
		list = append(list, mailboxToDTO(m))
	}
	return map[string]any{"list": list, "domains": mailboxAllowedDomains()}, nil
}

func mailboxSaveHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Mailbox mailboxSaveBody `json:"mailbox"`
		ID      string          `json:"id"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	saved, err := mailboxSave(req.Mailbox, req.ID)
	if err != nil {
		return nil, err
	}
	return mailboxToDTO(saved), nil
}

func mailboxDeleteHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		ID string `json:"id"`
	}
	c.Decode(&req)
	res, err := db.Exec(`UPDATE mailboxes SET delete_time = ?, update_time = ? WHERE id = ? AND delete_time IS NULL`, nowMillis(), nowMillis(), req.ID)
	if err != nil {
		return nil, throwErr("Mailbox not found")
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, throwErr("Mailbox not found")
	}
	return map[string]any{}, nil
}

func mailboxSyncHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	return map[string]any{"ok": false, "message": "Go 版服务端暂不支持 IMAP 同步，请使用推送 API 或 maildir 投递"}, nil
}

func mailboxTestHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	return map[string]any{"ok": false, "message": "Go 版服务端暂不支持 IMAP 连接测试"}, nil
}

func mailboxProviders(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	return map[string]any{"presets": imapProviders}, nil
}

// ---------- grants (tauth) ----------

const grantCols = `id, mailbox_id, address, token_hash, start_time, end_time, note, create_time, update_time, delete_time`

func grantFindActiveByMailbox(mailboxID string) *GrantRow {
	rows, err := db.Query(`SELECT `+grantCols+` FROM mailboxgrants WHERE mailbox_id = ? AND delete_time IS NULL`, mailboxID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	now := nowMillis()
	for rows.Next() {
		g, err := scanGrant(rows)
		if err == nil && now >= g.StartTime && now <= g.EndTime {
			return g
		}
	}
	return nil
}

func grantList() []map[string]any {
	rows, err := db.Query(`SELECT ` + grantCols + ` FROM mailboxgrants`)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		g, err := scanGrant(rows)
		if err == nil {
			out = append(out, grantJSON(g))
		}
	}
	return out
}

func grantJSON(g *GrantRow) map[string]any {
	var updateTime, deleteTime any
	if g.UpdateTime != nil {
		updateTime = *g.UpdateTime
	}
	if g.DeleteTime != nil {
		deleteTime = *g.DeleteTime
	}
	return map[string]any{
		"id": g.ID, "mailbox_id": g.MailboxID, "address": g.Address, "token_hash": g.TokenHash,
		"start_time": g.StartTime, "end_time": g.EndTime, "note": g.Note,
		"create_time": g.CreateTime, "update_time": updateTime, "delete_time": deleteTime,
	}
}

func mailboxGrantGet(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		MailboxID string `json:"mailbox_id"`
	}
	c.Decode(&req)
	var grant any
	if g := grantFindActiveByMailbox(req.MailboxID); g != nil {
		grant = grantJSON(g)
	}
	return map[string]any{"grant": grant}, nil
}

func mailboxGrantCreate(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		MailboxID string `json:"mailbox_id"`
		Days      int64  `json:"days"`
		Note      string `json:"note"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	mailbox := mailboxFindByID(req.MailboxID)
	if mailbox == nil {
		return nil, throwErr("Mailbox not found")
	}
	if grantFindActiveByMailbox(req.MailboxID) != nil {
		return nil, throwErr("该邮箱已存在有效授权，请先吊销后再生成新链接")
	}
	startTime := nowMillis()
	endTime := startTime + req.Days*86400000
	if endTime <= startTime {
		return nil, throwErr("有效期无效")
	}
	token := "tauth_" + nanoID(24)
	id := nanoID(6)
	if _, err := db.Exec(`INSERT INTO mailboxgrants (id, mailbox_id, address, token_hash, start_time, end_time, note, create_time)
		VALUES (?,?,?,?,?,?,?,?)`,
		id, req.MailboxID, mailbox.Address, hashGenerate(token), startTime, endTime, req.Note, startTime); err != nil {
		return nil, throwErr("Create failed")
	}
	return map[string]any{"token": token, "grant": grantJSON(grantFindByID(id))}, nil
}

func mailboxGrantRevoke(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		ID string `json:"id"`
	}
	c.Decode(&req)
	res, err := db.Exec(`UPDATE mailboxgrants SET delete_time = ?, update_time = ? WHERE id = ? AND delete_time IS NULL`, nowMillis(), nowMillis(), req.ID)
	if err != nil {
		return nil, throwErr("Grant not found")
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, throwErr("Grant not found")
	}
	return map[string]any{}, nil
}

func mailboxGrantList(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	return map[string]any{"list": grantList()}, nil
}

func mailboxTauthInfo(c *Ctx) (any, error) {
	session := resolveTauth(c.Headers["x-tauth"])
	if session == nil {
		return nil, throwErr("Unauthorized")
	}
	return map[string]any{
		"address":    session.grant.Address,
		"start_time": session.grant.StartTime,
		"end_time":   session.grant.EndTime,
	}, nil
}
