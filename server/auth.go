package main

import (
	"net/url"
	"strings"
)

// Port of server/modules/auth — token = aesEncrypt(identity + "|-|" + expiryMs).

func identityFromToken(token string) string {
	dt, ok := aesDecrypt(token)
	if !ok {
		return ""
	}
	parts := strings.SplitN(dt, "|-|", 2)
	if len(parts) != 2 {
		return ""
	}
	expired := asInt(parts[1])
	if nowMillis() > expired {
		return ""
	}
	return parts[0]
}

func genTokenForIdentify(identity string, ttlMillis int64) string {
	if ttlMillis == 0 {
		ttlMillis = 1000 * 60 * 60 * 24 * 3
	}
	return aesEncrypt(identity + "|-|" + itoa64(nowMillis()+ttlMillis))
}

func accountFindByEmail(email string) *AccountRow {
	row := db.QueryRow(`SELECT id, name, email, password, is_admin, create_time, update_time, delete_time FROM accounts WHERE email = ? AND delete_time IS NULL`, email)
	a, err := scanAccount(row)
	if err != nil {
		return nil
	}
	return a
}

func accountFindIgnoreDeleteByEmail(email string) *AccountRow {
	row := db.QueryRow(`SELECT id, name, email, password, is_admin, create_time, update_time, delete_time FROM accounts WHERE email = ?`, email)
	a, err := scanAccount(row)
	if err != nil {
		return nil
	}
	return a
}

func requireAdmin(auth string) error {
	if auth == "" {
		return throwErr("Authorization failed")
	}
	email := identityFromToken(auth)
	if email == "" {
		return throwErr("Authorization failed")
	}
	account := accountFindByEmail(email)
	if account == nil || account.IsAdmin == 0 {
		return throwErr("Permission denied")
	}
	return nil
}

func authedUser(auth string) *AccountRow {
	if auth == "" {
		return nil
	}
	email := identityFromToken(auth)
	if email == "" {
		return nil
	}
	return accountFindByEmail(email)
}

// ---------- handlers ----------

func authLogin(c *Ctx) (any, error) {
	var req struct {
		Identify struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		} `json:"identify"`
	}
	if err := c.Decode(&req); err != nil || req.Identify.Email == "" {
		return nil, throwErr("Authorized failed")
	}
	hashed := hashGenerate(req.Identify.Password)
	row := db.QueryRow(`SELECT id, name, email, password, is_admin, create_time, update_time, delete_time FROM accounts WHERE email = ? AND password = ? AND delete_time IS NULL`, req.Identify.Email, hashed)
	account, err := scanAccount(row)
	if err != nil || account == nil {
		return nil, throwErr("Invalid email or password")
	}
	return map[string]any{"token": genTokenForIdentify(account.Email, 0), "is_admin": account.IsAdmin}, nil
}

func authAlive(c *Ctx) (any, error) {
	var req struct {
		Auth string `json:"auth"`
	}
	c.Decode(&req)
	email := identityFromToken(req.Auth)
	if email == "" {
		return nil, throwErr("Unauthorized")
	}
	if account := accountFindByEmail(email); account != nil {
		return map[string]any{"is_admin": account.IsAdmin}, nil
	}
	return map[string]any{"is_admin": 0}, nil
}

func authConfig(c *Ctx) (any, error) {
	allowedDomains := splitCSV(settingGet("allowed_domains"))
	allowedFromDomains := splitCSV(settingGet("allowed_from_domains"))
	allowRegister := settingGet("allow_register") != "0"
	return map[string]any{"allowed_domains": allowedDomains, "allowed_from_domains": allowedFromDomains, "allow_register": allowRegister}, nil
}

func splitCSV(s string) []string {
	out := []string{}
	for _, d := range strings.Split(s, ",") {
		d = strings.TrimSpace(d)
		if d != "" {
			out = append(out, d)
		}
	}
	return out
}

func authRegister(c *Ctx) (any, error) {
	if settingGet("allow_register") == "0" {
		return nil, throwErr("注册功能已关闭")
	}
	var req struct {
		Identify struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
		} `json:"identify"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Register data is missing")
	}
	if err := preRegisterUser(req.Identify.Name, req.Identify.Email, req.Identify.Password); err != nil {
		return nil, err
	}
	return map[string]any{"token": "", "needs_verification": true}, nil
}

func checkAllowedDomain(email string) error {
	allowed := settingGet("allowed_domains")
	if allowed == "" {
		return nil
	}
	at := strings.Index(email, "@")
	if at == -1 || at+1 >= len(email) {
		return throwErr("Invalid email format")
	}
	domain := strings.ToLower(email[at+1:])
	for _, d := range strings.Split(allowed, ",") {
		if strings.EqualFold(strings.TrimSpace(d), domain) {
			return nil
		}
	}
	return throwErr("Registration is limited to " + strings.Join(splitCSV(allowed), ", ") + " email addresses")
}

func preRegisterUser(name, email, password string) error {
	if err := checkAllowedDomain(email); err != nil {
		return err
	}
	if accountFindIgnoreDeleteByEmail(email) != nil {
		return throwErr("Registration failed, email may already exist")
	}
	payload := strings.Join([]string{name, email, password}, "|-|")
	token := aesEncrypt(payload)
	verifyURL := settingGet("client_url") + "/verify?token=" + url.QueryEscape(token)
	fromRaw := settingGet("allowed_from_domains")
	if fromRaw == "" {
		fromRaw = settingGet("allowed_domains")
	}
	from := "noreply@example.com"
	if d := strings.Split(fromRaw+",", ",")[0]; strings.TrimSpace(d) != "" {
		from = "noreply@" + strings.TrimSpace(d)
	}
	subject, html := buildVerificationEmail(verifyURL)
	if !sendEmail(sendEmailParams{From: from, To: email, Subject: subject, HTML: html}) {
		return throwErr("Registration failed, email may already exist")
	}
	return nil
}

func authVerify(c *Ctx) (any, error) {
	var req struct {
		Token string `json:"token"`
	}
	c.Decode(&req)
	if req.Token == "" {
		return nil, throwErr("Verification token is required")
	}
	decrypted, ok := aesDecrypt(req.Token)
	if !ok {
		return nil, throwErr("Invalid or expired verification link, or email already registered")
	}
	parts := strings.SplitN(decrypted, "|-|", 3)
	if len(parts) < 3 {
		return nil, throwErr("Invalid or expired verification link, or email already registered")
	}
	name, email, plainPassword := parts[0], parts[1], parts[2]
	if accountFindIgnoreDeleteByEmail(email) != nil {
		return nil, throwErr("Invalid or expired verification link, or email already registered")
	}
	now := nowMillis()
	if _, err := db.Exec(`INSERT INTO accounts (id, name, email, password, is_admin, create_time) VALUES (?,?,?,?,0,?)`,
		nanoID(6), name, email, hashGenerate(plainPassword), now); err != nil {
		return nil, throwErr("Invalid or expired verification link, or email already registered")
	}
	return map[string]any{}, nil
}
