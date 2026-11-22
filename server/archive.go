package main

import (
	"log"
	"time"
)

const archiveSweepInterval = time.Minute

// Intercepted mail is worth a glance, not permanent shelf space, so it leaves the
// interception list an hour after it arrived.
const blockedArchiveDelayMillis = int64(3600 * 1000)

// archiveBase is when the delay should be measured from. A missing or bogus Date
// header must not put the deadline in the past.
func archiveBase(t int64) int64 {
	if t <= 0 {
		return nowMillis()
	}
	return t
}

// ===== 原实现（改造前，保留备查 2026-11-17）=====
// 每条命中的归档策略各自写一次 archive_at，后写的覆盖先写的，多条命中时结果
// 取决于执行顺序而不是用户的意图。
// func strategyScheduleArchive(email *EmailRow, s *StrategyRow) error {
// 	hours := s.ArchiveAfterHours
// 	if hours <= 0 {
// 		return nil
// 	}
// 	base := archiveBase(email.Time)
// 	_, err := db.Exec(`UPDATE emails SET archive_at = ?, update_time = ? WHERE id = ?`,
// 		base+int64(hours)*3600*1000, nowMillis(), email.ID)
// 	return err
// }
// ===== 改造后 =====
// strategyArchiveAt 只计算该策略要求的归档时间，不写库。调用方在一封邮件的
// 所有策略跑完后取最小值统一写入，这样多条归档策略命中时结果确定。
func strategyArchiveAt(email *EmailRow, s *StrategyRow) int64 {
	if s.ArchiveAfterHours <= 0 {
		return 0
	}
	return archiveBase(email.Time) + int64(s.ArchiveAfterHours)*3600*1000
}

// archiveDue moves every mail whose delay has elapsed into the archive. It is a
// single indexed UPDATE over archive_at.
func archiveDue() {
	now := nowMillis()
	self, err := db.Exec(`UPDATE emails SET delete_time = ?, update_time = ?
		WHERE delete_time IS NULL AND archive_at > 0 AND archive_at <= ?`, now, now, now)
	if err != nil {
		log.Printf("[Archive] sweep failed: %v", err)
		return
	}
	if n, _ := self.RowsAffected(); n > 0 {
		log.Printf("[Archive] archived %d deferred mail", n)
	}
}

func startArchiveScheduler() {
	archiveDue()
	go func() {
		for range time.Tick(archiveSweepInterval) {
			archiveDue()
		}
	}()
}
