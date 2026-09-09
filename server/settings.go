package main

import (
	"encoding/json"
	"sort"
	"sync"
)

// Port of server/modules/settings — DB rows override env defaults; an empty
// save clears the row so the env value shines through again.

var settingKeys = map[string]string{
	"allow_register":          "ALLOW_REGISTER",
	"resend_api_key":          "RESEND_API_KEY",
	"resend_api_keys":         "RESEND_API_KEYS",
	"allowed_domains":         "ALLOWED_DOMAINS",
	"allowed_from_domains":    "ALLOWED_FROM_DOMAINS",
	"client_url":              "CLIENT_URL",
	"mailbox_sync_interval":   "MAILBOX_SYNC_INTERVAL",
	"attachment_max_size":     "ATTACHMENT_MAX_SIZE",
	"email_receive_api_key":   "EMAIL_RECEIVE_API_KEY",
	"push_rate_limit_per_min": "PUSH_RATE_LIMIT_PER_MIN",
	"maildir_path":            "MAILDIR_PATH",
}

var (
	settingsMu    sync.RWMutex
	settingsCache = map[string]string{}
)

func settingsLoad() {
	settingsMu.Lock()
	defer settingsMu.Unlock()
	settingsCache = map[string]string{}
	rows, err := db.Query(`SELECT key, value FROM settings WHERE delete_time IS NULL`)
	if err == nil {
		for rows.Next() {
			var k, v string
			if rows.Scan(&k, &v) == nil {
				settingsCache[k] = v
			}
		}
		rows.Close()
	}
	keys := make([]string, 0, len(settingKeys))
	for k := range settingKeys {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if _, ok := settingsCache[k]; !ok {
			if v := envStr(settingKeys[k], ""); v != "" {
				settingsCache[k] = v
			}
		}
	}
}

func settingGet(key string) string {
	settingsMu.RLock()
	defer settingsMu.RUnlock()
	return settingsCache[key]
}

type settingEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func settingGetAll() []settingEntry {
	settingsMu.RLock()
	defer settingsMu.RUnlock()
	keys := make([]string, 0, len(settingKeys))
	for k := range settingKeys {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]settingEntry, 0, len(keys))
	for _, k := range keys {
		out = append(out, settingEntry{Key: k, Value: settingsCache[k]})
	}
	return out
}

func settingSet(key, value string) error {
	settingsMu.Lock()
	defer settingsMu.Unlock()
	if value == "" {
		db.Exec(`DELETE FROM settings WHERE key = ?`, key)
		settingsCache[key] = envStr(settingKeys[key], "")
		return nil
	}
	settingsCache[key] = value
	now := nowMillis()
	res, err := db.Exec(`UPDATE settings SET value = ?, update_time = ? WHERE key = ?`, value, now, key)
	if err == nil {
		if n, _ := res.RowsAffected(); n == 0 {
			_, err = db.Exec(`INSERT INTO settings (key, value, create_time) VALUES (?,?,?)`, key, value, now)
		}
	}
	return err
}

func settingSetMany(entries map[string]string) error {
	keys := make([]string, 0, len(entries))
	for k := range entries {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if _, ok := settingKeys[k]; ok {
			if err := settingSet(k, entries[k]); err != nil {
				return err
			}
		}
	}
	return nil
}

func marshalJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "null"
	}
	return string(b)
}
