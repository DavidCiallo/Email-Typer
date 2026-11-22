package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

// One connection: writes are serialized app-side anyway, so this avoids
// SQLITE_BUSY entirely and keeps RSS low.
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
	archive_at INTEGER NOT NULL DEFAULT 0,
	forward_status TEXT NOT NULL DEFAULT '', forward_error TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);
CREATE INDEX IF NOT EXISTS idx_emails_msgid ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_fp ON emails(from_addr, to_addr, subject, time);
CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_addr);
CREATE INDEX IF NOT EXISTS idx_emails_time ON emails(time);
CREATE INDEX IF NOT EXISTS idx_emails_deleted ON emails(delete_time);

CREATE TABLE IF NOT EXISTS strategies (
	id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
	from_pattern TEXT NOT NULL DEFAULT '', to_pattern TEXT NOT NULL DEFAULT '', subject_pattern TEXT NOT NULL DEFAULT '',
	forward_to TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT 'send',
	webhook_url TEXT NOT NULL DEFAULT '',
	archive_after_hours INTEGER NOT NULL DEFAULT 0,
	enabled INTEGER NOT NULL DEFAULT 1, account_id TEXT NOT NULL DEFAULT '',
	scope TEXT NOT NULL DEFAULT 'persistent', grant_id TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS strategytemplates (
	id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
	from_pattern TEXT NOT NULL DEFAULT '', subject_pattern TEXT NOT NULL DEFAULT '',
	action TEXT NOT NULL DEFAULT 'send', forward_to TEXT NOT NULL DEFAULT '', webhook_url TEXT NOT NULL DEFAULT '',
	note TEXT NOT NULL DEFAULT '',
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
	labels TEXT NOT NULL DEFAULT '[]',
	sort_offset INTEGER NOT NULL DEFAULT 0,
	sort_order INTEGER NOT NULL DEFAULT 0,
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS mailboxgrants (
	id TEXT PRIMARY KEY, mailbox_id TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
	token_hash TEXT NOT NULL DEFAULT '', grant_link TEXT NOT NULL DEFAULT '',
	can_send INTEGER NOT NULL DEFAULT 0,
	start_time INTEGER NOT NULL DEFAULT 0, end_time INTEGER NOT NULL DEFAULT 0,
	note TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS safety (
	id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT '', value TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

CREATE TABLE IF NOT EXISTS sendlogs (
	id TEXT PRIMARY KEY, from_addr TEXT NOT NULL DEFAULT '', to_addr TEXT NOT NULL DEFAULT '',
	subject TEXT NOT NULL DEFAULT '', html TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
	channel TEXT NOT NULL DEFAULT 'external', error TEXT NOT NULL DEFAULT '', attachments TEXT,
	strategy_id TEXT NOT NULL DEFAULT '', email_id TEXT NOT NULL DEFAULT '',
	create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER, delete_time INTEGER);

-- 每一封邮件 × 每一条策略只允许执行一次，重复投递或重启重扫都不会重复外发。
CREATE TABLE IF NOT EXISTS strategy_runs (
	id TEXT PRIMARY KEY, email_id TEXT NOT NULL DEFAULT '', strategy_id TEXT NOT NULL DEFAULT '',
	action TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'running',
	reason TEXT NOT NULL DEFAULT '', create_time INTEGER NOT NULL DEFAULT 0, update_time INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_email_strategy ON strategy_runs(email_id, strategy_id);
CREATE INDEX IF NOT EXISTS idx_runs_email ON strategy_runs(email_id);

-- 安全事件：既是审计日志，也是熔断锁状态的唯一真值来源。
CREATE TABLE IF NOT EXISTS security_events (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL DEFAULT '',
	severity TEXT NOT NULL DEFAULT '',
	email_id TEXT NOT NULL DEFAULT '',
	hit_count INTEGER NOT NULL DEFAULT 0,
	send_count INTEGER NOT NULL DEFAULT 0,
	detail TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'open',
	acked_by TEXT NOT NULL DEFAULT '',
	acked_at INTEGER NOT NULL DEFAULT 0,
	create_time INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_security_status ON security_events(status, kind);
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
	// columns added after the first release; every connection runs it because
	// the ?_pragma cache setting rejects ALTER TABLE
	for _, stmt := range migrations {
		if _, err := db.Exec(stmt); err != nil && !strings.Contains(err.Error(), "duplicate column name") {
			return fmt.Errorf("migration %q: %w", stmt, err)
		}
	}
	// 数据回填类迁移放在这里：它们必须只跑一次，所以用 meta 做标记，
	// 不能塞进上面那个每次启动都会执行的 migrations 切片。
	migrateCatchallForward()
	migrateSafetyRules()
	return nil
}

// migrateSafetyRules 把旧的三分类映射到新的四维模型，只跑一次。
// 映射与 models.go 的 safetyDefaults 必须一致，否则「新库导入老备份」与
// 「老库升级」会得到两套语义。
func migrateSafetyRules() {
	if metaGet("migration_safety_v2") != "" {
		return
	}
	statements := []string{
		// 白名单：只判发件人，最先判
		`UPDATE safety SET action = 'allow', match_field = 'from', match_mode = 'glob', priority = 10
			WHERE type = 'whitelist' AND action = ''`,
		// 黑名单：发件人 + 收件人都判
		`UPDATE safety SET action = 'block', match_field = 'any', match_mode = 'glob', priority = 50
			WHERE type = 'blacklist' AND action = ''`,
		// 敏感词：旧语义是「主题 或 正文」，用 content 精确表达，不用 any（any 会误含地址）
		`UPDATE safety SET action = 'block', match_field = 'content', match_mode = 'keyword', priority = 80
			WHERE type = 'sensitive_word' AND action = ''`,
		// 兜底：万一有未知 type，按阻止处理，不让它变成永远不匹配的幽灵规则
		`UPDATE safety SET action = 'block', match_field = 'any', match_mode = 'glob', priority = 100
			WHERE action = ''`,
	}
	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			log.Printf("[Migration] safety v2 failed: %v", err)
			return
		}
	}
	metaSet("migration_safety_v2", "1")
}

// migrateCatchallForward 是改法 Y 的回填：旧代码在 mailboxSave / mailboxUpdate
// 里把 catchall 的 forward_enabled 强制写成 1，界面上却不显示这个开关。
// 新代码不再强制，这里把历史上被隐式打开的本地邮箱显式落库，避免升级后转发突然停止。
func migrateCatchallForward() {
	if metaGet("migration_catchall_forward_v1") != "" {
		return
	}
	db.Exec(`UPDATE mailboxes SET forward_enabled = 1, update_time = ?
		WHERE type = 'catchall' AND delete_time IS NULL AND forward_enabled = 0`, nowMillis())
	metaSet("migration_catchall_forward_v1", "1")
}

var migrations = []string{
	`ALTER TABLE mailboxgrants ADD COLUMN grant_link TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE mailboxes ADD COLUMN labels TEXT NOT NULL DEFAULT '[]'`,
	`ALTER TABLE strategies ADD COLUMN action TEXT NOT NULL DEFAULT 'send'`,
	`ALTER TABLE strategies ADD COLUMN webhook_url TEXT NOT NULL DEFAULT ''`,
	// existing grants keep sending; only new ones default to read-only
	`ALTER TABLE mailboxgrants ADD COLUMN can_send INTEGER NOT NULL DEFAULT 1`,
	`ALTER TABLE mailboxes ADD COLUMN sort_offset INTEGER NOT NULL DEFAULT 0`,
	`ALTER TABLE mailboxes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
	`ALTER TABLE strategies ADD COLUMN archive_after_hours INTEGER NOT NULL DEFAULT 0`,
	// archive_at is when a strategy's delay elapses; 0 means "not scheduled".
	// The index must come after the column, so both live here rather than in
	// schema, which runs first and would fail on an older database.
	`ALTER TABLE emails ADD COLUMN archive_at INTEGER NOT NULL DEFAULT 0`,
	`CREATE INDEX IF NOT EXISTS idx_emails_archive_at ON emails(archive_at)`,
	// scheduled tasks are folded into strategies; the table and its rows are gone
	`DROP TABLE IF EXISTS autotasks`,
	// ---------- P2 转发改造（2026-11-17）----------
	// 转发结果落到邮件本身，让列表能直接标出失败原因
	`ALTER TABLE emails ADD COLUMN forward_status TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE emails ADD COLUMN forward_error TEXT NOT NULL DEFAULT ''`,
	// 发送记录挂上来源策略与原始邮件，一封信触发多次外发时能归组
	`ALTER TABLE sendlogs ADD COLUMN strategy_id TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE sendlogs ADD COLUMN email_id TEXT NOT NULL DEFAULT ''`,
	// 索引必须建在列之后：老库执行到这里才有 email_id 这一列
	`CREATE INDEX IF NOT EXISTS idx_sendlogs_email ON sendlogs(email_id)`,
	// 策略按创建顺序执行，顺序必须可预测（日志与截断都靠它）
	`CREATE INDEX IF NOT EXISTS idx_strategies_live ON strategies(delete_time, enabled, create_time)`,
	// 邮箱列表按域内 sort_order 排序，原来没有索引，每次全表扫 + 排序
	`CREATE INDEX IF NOT EXISTS idx_mailboxes_sort ON mailboxes(domain, sort_order)`,
	// ---------- P3 规则引擎（2026-11-17）----------
	// 判定不再由 type 单独决定：action（放行/阻止）+ match_field（判哪个字段）
	// + match_mode（怎么匹配）+ priority（谁先判）自由组合
	`ALTER TABLE safety ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`,
	`ALTER TABLE safety ADD COLUMN priority INTEGER NOT NULL DEFAULT 100`,
	`ALTER TABLE safety ADD COLUMN action TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE safety ADD COLUMN match_field TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE safety ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'glob'`,
	// scope 留空 = 全局规则；填邮箱 id = 只对该邮箱收到的邮件生效
	`ALTER TABLE safety ADD COLUMN scope TEXT NOT NULL DEFAULT ''`,
	`CREATE INDEX IF NOT EXISTS idx_safety_priority ON safety(priority)`,
	`CREATE INDEX IF NOT EXISTS idx_safety_scope ON safety(scope)`,
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

// migrateJSONL imports the legacy *.jsonl stores once. The files are left in
// place as a backup; a meta marker keeps this idempotent.
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
	// Rows predating the eml column still work through readBody's inline
	// fallback, so no rescan at boot.
	metaSet("migrated", "1")
	return nil
}

func dbFileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
