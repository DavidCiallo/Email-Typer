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

// strategyScheduleArchive records when a mail should be archived. The match has
// already happened at ingest, so the delay costs one column write and the sweep
// below never has to look at a message or its eml.
func strategyScheduleArchive(email *EmailRow, s *StrategyRow) error {
	hours := s.ArchiveAfterHours
	if hours <= 0 {
		return nil
	}
	base := archiveBase(email.Time)
	_, err := db.Exec(`UPDATE emails SET archive_at = ?, update_time = ? WHERE id = ?`,
		base+int64(hours)*3600*1000, nowMillis(), email.ID)
	return err
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
