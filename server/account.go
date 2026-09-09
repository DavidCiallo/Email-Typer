package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

func jsonMarshalAny(v any) ([]byte, error) { return json.Marshal(v) }

func osReadDir(dir string) ([]os.DirEntry, error) { return os.ReadDir(dir) }

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func joinPath(parts ...string) string {
	return filepath.Join(parts...)
}

// ---------- strategy handlers ----------

type strategyIdentity struct {
	admin bool
	email string
	tauth *tauthSession
}

func strategyResolveIdentity(c *Ctx) (*strategyIdentity, error) {
	tauth := resolveTauth(c.Headers["x-tauth"])
	if tauth != nil {
		return &strategyIdentity{admin: false, tauth: tauth}, nil
	}
	email := identityFromToken(c.Auth)
	if email != "" {
		account := accountFindByEmail(email)
		return &strategyIdentity{admin: account != nil && account.IsAdmin == 1, email: email}, nil
	}
	return nil, throwErr("Unauthorized")
}

func strategySaveRow(s StrategyRow) (*StrategyRow, error) {
	now := nowMillis()
	if s.ID != "" {
		res, err := db.Exec(`UPDATE strategies SET name = ?, from_pattern = ?, to_pattern = ?, subject_pattern = ?,
			forward_to = ?, enabled = ?, account_id = ?, scope = ?, grant_id = ?, update_time = ? WHERE id = ? AND delete_time IS NULL`,
			s.Name, s.FromPattern, s.ToPattern, s.SubjectPattern, s.ForwardTo, s.Enabled, s.AccountID,
			s.Scope, s.GrantID, now, s.ID)
		if err != nil {
			return nil, throwErr("Save failed")
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, throwErr("Strategy not found")
		}
		row := db.QueryRow(`SELECT id, name, from_pattern, to_pattern, subject_pattern, forward_to, enabled, account_id, scope, grant_id, create_time, update_time, delete_time FROM strategies WHERE id = ?`, s.ID)
		out, err := scanStrategy(row)
		if err != nil {
			return nil, throwErr("Strategy not found")
		}
		return out, nil
	}
	id := nanoID(6)
	scope := s.Scope
	if scope == "" {
		scope = "persistent"
	}
	if _, err := db.Exec(`INSERT INTO strategies (id, name, from_pattern, to_pattern, subject_pattern, forward_to, enabled, account_id, scope, grant_id, create_time)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		id, s.Name, s.FromPattern, s.ToPattern, s.SubjectPattern, s.ForwardTo, s.Enabled, s.AccountID, scope, s.GrantID, now); err != nil {
		return nil, throwErr("Save failed")
	}
	row := db.QueryRow(`SELECT id, name, from_pattern, to_pattern, subject_pattern, forward_to, enabled, account_id, scope, grant_id, create_time, update_time, delete_time FROM strategies WHERE id = ?`, id)
	out, err := scanStrategy(row)
	if err != nil {
		return nil, throwErr("Save failed")
	}
	return out, nil
}

func strategyListHandler(c *Ctx) (any, error) {
	identity, err := strategyResolveIdentity(c)
	if err != nil {
		return nil, err
	}
	strategies, err := db.Query(`SELECT id, name, from_pattern, to_pattern, subject_pattern, forward_to, enabled, account_id, scope, grant_id, create_time, update_time, delete_time FROM strategies WHERE delete_time IS NULL`)
	if err != nil {
		return nil, throwErr("Query failed")
	}
	all := []*StrategyRow{}
	for strategies.Next() {
		if s, err := scanStrategy(strategies); err == nil {
			all = append(all, s)
		}
	}
	strategies.Close()

	accountMap := map[string][2]string{}
	if identity.admin {
		arows, err := db.Query(`SELECT id, name, email FROM accounts WHERE delete_time IS NULL`)
		if err == nil {
			for arows.Next() {
				var id, name, email string
				if arows.Scan(&id, &name, &email) == nil {
					accountMap[id] = [2]string{name, email}
				}
			}
			arows.Close()
		}
	}
	grants := map[string]*GrantRow{}
	grows, err := db.Query(`SELECT ` + grantCols + ` FROM mailboxgrants`)
	if err == nil {
		for grows.Next() {
			if g, err := scanGrant(grows); err == nil {
				grants[g.ID] = g
			}
		}
		grows.Close()
	}

	now := nowMillis()
	list := []map[string]any{}
	for _, s := range all {
		if identity.tauth != nil {
			if s.Scope != "temp" || s.GrantID != identity.tauth.grant.ID {
				continue
			}
		}
		scope := orDefault(s.Scope, "persistent")
		grantActive := false
		grantExpired := false
		grantAddress, grantStart, grantEnd := "", int64(0), int64(0)
		var grant any
		if scope == "temp" {
			g := grants[s.GrantID]
			if g != nil {
				grant = grantJSON(g)
				grantAddress = g.Address
				grantStart = g.StartTime
				grantEnd = g.EndTime
				grantActive = g.DeleteTime == nil && now >= g.StartTime && now <= g.EndTime
				grantExpired = g.DeleteTime != nil || now > g.EndTime
			} else {
				grantExpired = true
			}
		}
		creator := accountMap[s.AccountID]
		list = append(list, map[string]any{
			"id": s.ID, "name": s.Name, "from_pattern": s.FromPattern, "to_pattern": s.ToPattern,
			"subject_pattern": s.SubjectPattern, "forward_to": s.ForwardTo, "enabled": s.Enabled,
			"account_id": s.AccountID, "creator_name": creator[0], "creator_email": creator[1],
			"scope": scope, "grant_id": s.GrantID,
			"grant_address": grantAddress, "grant_start": grantStart, "grant_end": grantEnd,
			"grant_active": grantActive, "grant_expired": grantExpired,
		})
		_ = grant
	}
	return map[string]any{"list": list}, nil
}

func strategySaveHandler(c *Ctx) (any, error) {
	identity, err := strategyResolveIdentity(c)
	if err != nil {
		return nil, err
	}
	var req struct {
		Strategy StrategyRow `json:"strategy"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	s := req.Strategy
	if identity.tauth != nil {
		t := identity.tauth
		s.Scope = "temp"
		s.GrantID = t.grant.ID
		s.ToPattern = t.address
		s.AccountID = ""
		if s.FromPattern == "" {
			s.FromPattern = "*"
		}
		if s.SubjectPattern == "" {
			s.SubjectPattern = "*"
		}
		if s.ID != "" {
			existing := strategyFindByID(s.ID)
			if existing == nil || existing.Scope != "temp" || existing.GrantID != t.grant.ID {
				return nil, throwErr("Strategy not found")
			}
		}
		out, err := strategySaveRow(s)
		if err != nil {
			return nil, err
		}
		return strategyJSON(out), nil
	}
	if s.ID != "" {
		if existing := strategyFindByID(s.ID); existing != nil && existing.Scope == "temp" {
			s.Scope = "temp"
			s.GrantID = existing.GrantID
			s.ToPattern = existing.ToPattern
		}
	}
	if identity.email != "" {
		if account := accountFindByEmail(identity.email); account != nil {
			s.AccountID = account.ID
		}
	}
	if s.ID == "" && s.Enabled == 0 && !enabledProvided(c) {
		s.Enabled = 1
	}
	out, err := strategySaveRow(s)
	if err != nil {
		return nil, err
	}
	return strategyJSON(out), nil
}

// enabledProvided: TS StrategyService.save defaults enabled=1 only when
// undefined; the JSON body omits the field for new strategies without it.
func enabledProvided(c *Ctx) bool {
	var raw struct {
		Strategy map[string]any `json:"strategy"`
	}
	b, _ := jsonMarshalAny(c.Body)
	json.Unmarshal(b, &raw)
	_, ok := raw.Strategy["enabled"]
	return ok
}

func strategyFindByID(id string) *StrategyRow {
	row := db.QueryRow(`SELECT id, name, from_pattern, to_pattern, subject_pattern, forward_to, enabled, account_id, scope, grant_id, create_time, update_time, delete_time FROM strategies WHERE id = ? AND delete_time IS NULL`, id)
	s, err := scanStrategy(row)
	if err != nil {
		return nil
	}
	return s
}

func strategyJSON(s *StrategyRow) map[string]any {
	var updateTime, deleteTime any
	if s.UpdateTime != nil {
		updateTime = *s.UpdateTime
	}
	if s.DeleteTime != nil {
		deleteTime = *s.DeleteTime
	}
	return map[string]any{
		"id": s.ID, "name": s.Name, "from_pattern": s.FromPattern, "to_pattern": s.ToPattern,
		"subject_pattern": s.SubjectPattern, "forward_to": s.ForwardTo, "enabled": s.Enabled,
		"account_id": s.AccountID, "scope": s.Scope, "grant_id": s.GrantID,
		"create_time": s.CreateTime, "update_time": updateTime, "delete_time": deleteTime,
	}
}

func strategyDeleteHandler(c *Ctx) (any, error) {
	identity, err := strategyResolveIdentity(c)
	if err != nil {
		return nil, err
	}
	var req struct {
		ID string `json:"id"`
	}
	c.Decode(&req)
	if identity.tauth != nil {
		existing := strategyFindByID(req.ID)
		if existing == nil || existing.Scope != "temp" || existing.GrantID != identity.tauth.grant.ID {
			return nil, throwErr("Strategy not found")
		}
	}
	res, err := db.Exec(`UPDATE strategies SET delete_time = ?, update_time = ? WHERE id = ? AND delete_time IS NULL`, nowMillis(), nowMillis(), req.ID)
	if err != nil {
		return nil, throwErr("Strategy not found")
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, throwErr("Strategy not found")
	}
	return map[string]any{}, nil
}

// ---------- settings handlers ----------

func settingsListHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	return map[string]any{"entries": settingGetAll()}, nil
}

func settingsSaveHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Entries []settingEntry `json:"entries"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	entries := map[string]string{}
	for _, e := range req.Entries {
		entries[e.Key] = e.Value
	}
	if err := settingSetMany(entries); err != nil {
		return nil, throwErr("Save failed")
	}
	return map[string]any{}, nil
}

// ---------- account handlers ----------

func accountListHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Limit  *int64 `json:"limit"`
		Offset int64  `json:"offset"`
	}
	c.Decode(&req)
	var total int64
	db.QueryRow(`SELECT COUNT(*) FROM accounts WHERE delete_time IS NULL`).Scan(&total)
	query := `SELECT id, name, email, password, is_admin, create_time, update_time, delete_time FROM accounts WHERE delete_time IS NULL ORDER BY rowid DESC`
	if req.Limit != nil {
		query += limitOffsetSQL(*req.Limit, req.Offset)
	}
	rows, err := db.Query(query)
	if err != nil {
		return nil, throwErr("Query failed")
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		a, err := scanAccount(rows)
		if err == nil {
			list = append(list, accountJSON(a))
		}
	}
	return map[string]any{"list": list, "total": total}, nil
}

func accountJSON(a *AccountRow) map[string]any {
	var updateTime, deleteTime any
	if a.UpdateTime != nil {
		updateTime = *a.UpdateTime
	}
	if a.DeleteTime != nil {
		deleteTime = *a.DeleteTime
	}
	return map[string]any{
		"id": a.ID, "name": a.Name, "email": a.Email, "password": a.Password,
		"is_admin": a.IsAdmin, "create_time": a.CreateTime, "update_time": updateTime, "delete_time": deleteTime,
	}
}

func accountCreateHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Account struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
			IsAdmin  *int   `json:"is_admin"`
		} `json:"account"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	password := req.Account.Password
	if password != "" {
		password = hashGenerate(password)
	}
	isAdmin := 0
	if req.Account.IsAdmin != nil {
		isAdmin = *req.Account.IsAdmin
	}
	id := nanoID(6)
	now := nowMillis()
	if _, err := db.Exec(`INSERT INTO accounts (id, name, email, password, is_admin, create_time) VALUES (?,?,?,?,?,?)`,
		id, req.Account.Name, req.Account.Email, password, isAdmin, now); err != nil {
		return nil, throwErr("Create failed")
	}
	row := db.QueryRow(`SELECT id, name, email, password, is_admin, create_time, update_time, delete_time FROM accounts WHERE id = ?`, id)
	a, err := scanAccount(row)
	if err != nil {
		return nil, throwErr("Create failed")
	}
	return accountJSON(a), nil
}

func accountUpdateHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		ID      string `json:"id"`
		Account struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
			IsAdmin  *int   `json:"is_admin"`
		} `json:"account"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	existing := accountFindByID(req.ID)
	if existing == nil {
		return nil, throwErr("Account not found")
	}
	sets := []string{}
	args := []any{}
	add := func(col, val string) {
		sets = append(sets, col+" = ?")
		args = append(args, val)
	}
	// TS sends the whole partial entity — fields the client included are
	// applied; an empty password keeps the old hash (client omits it).
	var raw struct {
		Account map[string]any `json:"account"`
	}
	b, _ := jsonMarshalAny(c.Body)
	json.Unmarshal(b, &raw)
	if _, ok := raw.Account["name"]; ok {
		add("name", req.Account.Name)
	}
	if _, ok := raw.Account["email"]; ok {
		add("email", req.Account.Email)
	}
	if v, ok := raw.Account["password"]; ok {
		if asStr(v) != "" {
			add("password", hashGenerate(asStr(v)))
		} else {
			add("password", "")
		}
	}
	if v, ok := raw.Account["is_admin"]; ok {
		sets = append(sets, "is_admin = ?")
		args = append(args, asInt(v))
	}
	if len(sets) == 0 {
		return map[string]any{}, nil
	}
	sets = append(sets, "update_time = ?")
	args = append(args, nowMillis())
	args = append(args, req.ID)
	if _, err := db.Exec(`UPDATE accounts SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...); err != nil {
		return nil, throwErr("Account not found")
	}
	return map[string]any{}, nil
}

func accountFindByID(id string) *AccountRow {
	row := db.QueryRow(`SELECT id, name, email, password, is_admin, create_time, update_time, delete_time FROM accounts WHERE id = ? AND delete_time IS NULL`, id)
	a, err := scanAccount(row)
	if err != nil {
		return nil
	}
	return a
}

func accountDeleteHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		ID string `json:"id"`
	}
	c.Decode(&req)
	res, err := db.Exec(`UPDATE accounts SET delete_time = ?, update_time = ? WHERE id = ? AND delete_time IS NULL`, nowMillis(), nowMillis(), req.ID)
	if err != nil {
		return nil, throwErr("Account not found")
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, throwErr("Account not found")
	}
	return map[string]any{}, nil
}

// ---------- export / import ----------

func accountExportHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	accounts := []map[string]any{}
	rows, err := db.Query(`SELECT id, name, email, password, is_admin, create_time, update_time, delete_time FROM accounts`)
	if err == nil {
		for rows.Next() {
			if a, err := scanAccount(rows); err == nil {
				accounts = append(accounts, accountJSON(a))
			}
		}
		rows.Close()
	}
	strategies := []map[string]any{}
	rows, err = db.Query(`SELECT id, name, from_pattern, to_pattern, subject_pattern, forward_to, enabled, account_id, scope, grant_id, create_time, update_time, delete_time FROM strategies`)
	if err == nil {
		for rows.Next() {
			if s, err := scanStrategy(rows); err == nil {
				strategies = append(strategies, strategyJSON(s))
			}
		}
		rows.Close()
	}
	settings := []map[string]any{}
	rows, err = db.Query(`SELECT key, value, create_time, update_time, delete_time FROM settings`)
	if err == nil {
		for rows.Next() {
			if s, err := scanSetting(rows); err == nil {
				var ut, dt any
				if s.UpdateTime != nil {
					ut = *s.UpdateTime
				}
				if s.DeleteTime != nil {
					dt = *s.DeleteTime
				}
				settings = append(settings, map[string]any{"key": s.Key, "value": s.Value, "create_time": s.CreateTime, "update_time": ut, "delete_time": dt})
			}
		}
		rows.Close()
	}
	emails := []map[string]any{}
	rows, err = db.Query(`SELECT ` + emailCols + ` FROM emails`)
	if err == nil {
		for rows.Next() {
			if e, err := scanEmail(rows); err == nil {
				b, _ := jsonMarshal(e)
				var m map[string]any
				json.Unmarshal(b, &m)
				emails = append(emails, m)
			}
		}
		rows.Close()
	}
	return map[string]any{
		"version":     1,
		"exported_at": nowMillis(),
		"data": map[string]any{
			"accounts": accounts, "emails": emails, "strategies": strategies, "settings": settings,
		},
	}, nil
}

func accountImportHandler(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		Data struct {
			Data struct {
				Accounts   []map[string]any `json:"accounts"`
				Emails     []map[string]any `json:"emails"`
				Strategies []map[string]any `json:"strategies"`
				Settings   []map[string]any `json:"settings"`
			} `json:"data"`
		} `json:"data"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	imported := map[string]int{}
	tx, err := db.Begin()
	if err != nil {
		return nil, throwErr("Import failed")
	}
	commit := func() error { return tx.Commit() }
	rollback := func() { tx.Rollback() }

	if err := func() error {
		if len(req.Data.Data.Accounts) > 0 {
			if _, err := tx.Exec(`DELETE FROM accounts`); err != nil {
				return err
			}
			for _, row := range req.Data.Data.Accounts {
				if err := insertAccountRow(tx, row); err != nil {
					return err
				}
				imported["accounts"]++
			}
		}
		if len(req.Data.Data.Emails) > 0 {
			if _, err := tx.Exec(`DELETE FROM emails`); err != nil {
				return err
			}
			for _, row := range req.Data.Data.Emails {
				if err := insertEmailRow(tx, row); err != nil {
					return err
				}
				imported["emails"]++
			}
		}
		if len(req.Data.Data.Strategies) > 0 {
			if _, err := tx.Exec(`DELETE FROM strategies`); err != nil {
				return err
			}
			for _, row := range req.Data.Data.Strategies {
				if err := insertStrategyRow(tx, row); err != nil {
					return err
				}
				imported["strategies"]++
			}
		}
		if len(req.Data.Data.Settings) > 0 {
			if _, err := tx.Exec(`DELETE FROM settings`); err != nil {
				return err
			}
			for _, row := range req.Data.Data.Settings {
				if err := insertSettingRow(tx, row); err != nil {
					return err
				}
				imported["settings"]++
			}
		}
		return nil
	}(); err != nil {
		rollback()
		return nil, throwErr("Import failed: " + err.Error())
	}
	if err := commit(); err != nil {
		return nil, throwErr("Import failed")
	}
	if _, ok := imported["emails"]; ok {
		indexedEmlClear()
		warmIndexedEml()
	}
	settingsLoad()
	return map[string]any{"imported": imported}, nil
}

func limitOffsetSQL(limit, offset int64) string {
	return " LIMIT " + itoa64(limit) + " OFFSET " + itoa64(offset)
}
