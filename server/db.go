package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// One connection: SQLite writes are serialized app-side anyway (same as the
// JSONL write lock), it dodges SQLITE_BUSY entirely and keeps RSS low.
var db *sql.DB

const schema = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS accounts (
	id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
	password TEXT NOT NULL DEFAULT '', is_admin INTEGER NOT NULL DEFAULT 0,
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS emails (
	id TEXT PRIMARY KEY, eid TEXT NOT NULL DEFAULT '',
	from_addr TEXT NOT NULL DEFAULT '', to_addr TEXT NOT NULL DEFAULT '',
	subject TEXT NOT NULL DEFAULT '', html TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '',
	time INTEGER NOT NULL DEFAULT 0, account_id TEXT NOT NULL DEFAULT '',
	message_id TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'maildir',
	mailbox_id TEXT NOT NULL DEFAULT '', eml TEXT NOT NULL DEFAULT '',
	codes TEXT NOT NULL DEFAULT '[]', has_code INTEGER NOT NULL DEFAULT 0, has_links INTEGER NOT NULL DEFAULT 0,
	attachments TEXT, blocked INTEGER NOT NULL DEFAULT 0, blocked_by TEXT NOT NULL DEFAULT '', block_rule TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);
CREATE INDEX IF NOT EXISTS idx_emails_msgid ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_fp ON emails(from_addr, to_addr, subject, time);
CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_addr);
CREATE INDEX IF NOT EXISTS idx_emails_deleted ON emails(delete_time);

CREATE TABLE IF NOT EXISTS strategies (
	id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
	from_pattern TEXT NOT NULL DEFAULT '', to_pattern TEXT NOT NULL DEFAULT '', subject_pattern TEXT NOT NULL DEFAULT '',
	forward_to TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, account_id TEXT NOT NULL DEFAULT '',
	scope TEXT NOT NULL DEFAULT 'persistent', grant_id TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS mailboxes (
	id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
	domain TEXT NOT NULL DEFAULT '', local_part TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '',
	imap_host TEXT NOT NULL DEFAULT '', imap_port INTEGER NOT NULL DEFAULT 0, imap_tls INTEGER NOT NULL DEFAULT 1,
	sync_interval INTEGER NOT NULL DEFAULT 0, credential TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
	forward_enabled INTEGER NOT NULL DEFAULT 0, sync_error TEXT NOT NULL DEFAULT '', last_sync_time INTEGER,
	last_uid INTEGER NOT NULL DEFAULT 0, uidvalidity INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS mailboxgrants (
	id TEXT PRIMARY KEY, mailbox_id TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
	token_hash TEXT NOT NULL DEFAULT '', start_time INTEGER NOT NULL DEFAULT 0, end_time INTEGER NOT NULL DEFAULT 0,
	note TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS safety (
	id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT '', value TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS sendlogs (
	id TEXT PRIMARY KEY, from_addr TEXT NOT NULL DEFAULT '', to_addr TEXT NOT NULL DEFAULT '',
	subject TEXT NOT NULL DEFAULT '', html TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
	channel TEXT NOT NULL DEFAULT 'external', error TEXT NOT NULL DEFAULT '', attachments TEXT,
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);
`

func openDB() error {
	path := filepath.Join(dataDir, "cfrs.db")
	d, err := sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
	if err != nil {
		return err
	}
	d.SetMaxOpenConns(1)
	if _, err := d.Exec(schema); err != nil {
		return fmt.Errorf("schema: %w", err)
	}
	db = d
	return nil
}

func metaGet(k string) string {
	var v string
	db.QueryRow(`SELECT v FROM meta WHERE k = ?`, k).Scan(&v)
	return v
}

func metaSet(k, v string) {
	db.Exec(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, k, v)
}

func tableEmpty(table string) bool {
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&n)
	return n == 0
}

// migrateJSONL imports the Bun server's *.jsonl stores once. The files are
// left in place as a backup; a meta marker keeps this idempotent.
func migrateJSONL() error {
	if metaGet("migrated") == "1" {
		return nil
	}
	type job struct {
		table  string
		marker string
	}
	jobs := []job{
		{"accounts", "account"}, {"emails", "email"}, {"strategies", "strategy"},
		{"settings", "settings"}, {"mailboxes", "mailbox"}, {"mailboxgrants", "mailboxgrant"},
		{"safety", "safety"}, {"sendlogs", "sendlog"},
	}
	for _, j := range jobs {
		if !tableEmpty(j.table) {
			continue // partially migrated by hand — never duplicate
		}
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		count := 0
		var importErr error
		scanErr := streamJSONL(filepath.Join(dataDir, j.marker+".jsonl"), func(row map[string]any) {
			if importErr != nil {
				return
			}
			var err error
			switch j.table {
			case "accounts":
				err = insertAccountRow(tx, row)
			case "emails":
				err = insertEmailRow(tx, row)
			case "strategies":
				err = insertStrategyRow(tx, row)
			case "settings":
				err = insertSettingRow(tx, row)
			case "mailboxes":
				err = insertMailboxRow(tx, row)
			case "mailboxgrants":
				err = insertGrantRow(tx, row)
			case "safety":
				err = insertSafetyRow(tx, row)
			case "sendlogs":
				err = insertSendLogRow(tx, row)
			}
			if err != nil {
				importErr = fmt.Errorf("import %s id %v: %w", j.table, row["id"], err)
				return
			}
			count++
		})
		if importErr == nil {
			importErr = scanErr
		}
		if importErr == nil {
			importErr = tx.Commit()
		} else {
			tx.Rollback()
			return importErr
		}
		fmt.Printf("[Migrate] %s: %d rows\n", j.table, count)
	}
	// index files that exist but predate the eml column keep working through
	// readBody's inline fallback — no rescan needed at boot.
	metaSet("migrated", "1")
	return nil
}

func dbFileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
