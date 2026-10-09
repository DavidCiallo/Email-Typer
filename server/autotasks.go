package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

// ---------- rows ----------

const autotaskCols = `id, name, enabled, kind, time_of_day, weekdays, month_day, time_zone, action, params, last_run_at, last_status, last_message, create_time, update_time, delete_time`

type AutoTaskRow struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Enabled     int    `json:"enabled"`
	Kind        string `json:"kind"`
	TimeOfDay   string `json:"time_of_day"`
	Weekdays    string `json:"weekdays"`
	MonthDay    int    `json:"month_day"`
	TimeZone    string `json:"time_zone"`
	Action      string `json:"action"`
	Params      string `json:"params"`
	LastRunAt   *int64 `json:"last_run_at"`
	LastStatus  string `json:"last_status"`
	LastMessage string `json:"last_message"`
	CreateTime  int64  `json:"create_time"`
	UpdateTime  *int64 `json:"update_time"`
	DeleteTime  *int64 `json:"delete_time"`
}

func scanAutoTask(sc interface{ Scan(...any) error }) (*AutoTaskRow, error) {
	t := &AutoTaskRow{}
	err := sc.Scan(&t.ID, &t.Name, &t.Enabled, &t.Kind, &t.TimeOfDay, &t.Weekdays, &t.MonthDay,
		&t.TimeZone, &t.Action, &t.Params, &t.LastRunAt, &t.LastStatus, &t.LastMessage,
		&t.CreateTime, &t.UpdateTime, &t.DeleteTime)
	return t, err
}

func autoTaskLoadAll() []*AutoTaskRow {
	rows, err := db.Query(`SELECT ` + autotaskCols + ` FROM autotasks WHERE delete_time IS NULL ORDER BY create_time`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []*AutoTaskRow{}
	for rows.Next() {
		if t, err := scanAutoTask(rows); err == nil {
			out = append(out, t)
		}
	}
	return out
}

func autoTaskFindByID(id string) *AutoTaskRow {
	row := db.QueryRow(`SELECT `+autotaskCols+` FROM autotasks WHERE id = ? AND delete_time IS NULL`, id)
	t, err := scanAutoTask(row)
	if err != nil {
		return nil
	}
	return t
}

func autoTaskParams(t *AutoTaskRow) map[string]any {
	out := map[string]any{}
	if t.Params != "" {
		json.Unmarshal([]byte(t.Params), &out)
	}
	return out
}

func autoTaskJSON(t *AutoTaskRow) map[string]any {
	return map[string]any{
		"id": t.ID, "name": t.Name, "enabled": t.Enabled == 1,
		"kind": t.Kind, "time_of_day": t.TimeOfDay, "weekdays": splitCSV(t.Weekdays),
		"month_day": t.MonthDay, "time_zone": t.TimeZone,
		"action": t.Action, "params": autoTaskParams(t),
		"last_run_at": t.LastRunAt, "last_status": t.LastStatus, "last_message": t.LastMessage,
		"create_time": t.CreateTime,
	}
}

// ---------- schedule ----------

func parseClock(hhmm string) (int, int) {
	parts := strings.Split(strings.TrimSpace(hhmm), ":")
	if len(parts) != 2 {
		return 8, 0
	}
	h, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
	m, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 8, 0
	}
	return h, m
}

// dueAt reports whether the task should have fired by `now`, given it last ran
// at lastRun. It scans back up to a day of candidate slots, so a server that
// was down over the scheduled minute still runs the task on restart.
func (t *AutoTaskRow) dueAt(now time.Time, lastRun time.Time) bool {
	loc, err := time.LoadLocation(orDefault(t.TimeZone, "Asia/Shanghai"))
	if err != nil {
		loc = time.FixedZone("CST", 8*3600)
	}
	hour, minute := parseClock(t.TimeOfDay)

	// walk every minute from the lookback point; cheap enough at this scale
	// and keeps weekly/monthly handling in one place
	const lookback = 24 * time.Hour
	start := now.Add(-lookback)
	if lastRun.After(start) {
		start = lastRun
	}
	for cur := start.Truncate(time.Minute); !cur.After(now); cur = cur.Add(time.Minute) {
		c := cur.In(loc)
		if c.Hour() != hour || c.Minute() != minute {
			continue
		}
		if !t.matchesDay(c) {
			continue
		}
		if cur.After(lastRun) {
			return true
		}
	}
	return false
}

func (t *AutoTaskRow) matchesDay(c time.Time) bool {
	switch t.Kind {
	case "weekly":
		want := splitCSV(t.Weekdays)
		if len(want) == 0 {
			return false
		}
		today := strings.ToUpper(c.Format("MO"))[:2]
		for _, d := range want {
			if strings.EqualFold(d, today) {
				return true
			}
		}
		return false
	case "monthly":
		return c.Day() == t.MonthDay
	default:
		return true
	}
}

// nextRunAt is the next firing time after now, for display.
func (t *AutoTaskRow) nextRunAt(now time.Time) *time.Time {
	loc, err := time.LoadLocation(orDefault(t.TimeZone, "Asia/Shanghai"))
	if err != nil {
		loc = time.FixedZone("CST", 8*3600)
	}
	hour, minute := parseClock(t.TimeOfDay)
	cur := now.In(loc)
	for i := 0; i < 400*24*60; i++ {
		c := cur.Add(time.Duration(i) * time.Minute).Truncate(time.Minute)
		if c.Hour() != hour || c.Minute() != minute {
			continue
		}
		if c.Before(cur) {
			continue
		}
		if t.matchesDay(c) {
			u := c.UTC()
			return &u
		}
	}
	return nil
}

// ---------- scheduler ----------

func startAutoTaskScheduler() {
	go func() {
		// let the server finish booting before the first sweep
		time.Sleep(10 * time.Second)
		for {
			runDueAutoTasks()
			time.Sleep(30 * time.Second)
		}
	}()
}

func runDueAutoTasks() {
	now := time.Now()
	for _, t := range autoTaskLoadAll() {
		if t.Enabled != 1 {
			continue
		}
		last := time.Unix(0, 0)
		if t.LastRunAt != nil {
			last = time.UnixMilli(*t.LastRunAt)
		}
		if !t.dueAt(now, last) {
			continue
		}
		// record the attempt first, so a crash mid-run cannot loop forever
		autoTaskMarkRun(t.ID, "running", "")
		status, message := autoTaskExecute(t)
		autoTaskMarkRun(t.ID, status, message)
		log.Printf("[AutoTask] %s (%s): %s %s", t.Name, t.Action, status, message)
	}
}

func autoTaskMarkRun(id, status, message string) {
	db.Exec(`UPDATE autotasks SET last_run_at = ?, last_status = ?, last_message = ?, update_time = ? WHERE id = ?`,
		nowMillis(), status, message, nowMillis(), id)
}

func autoTaskExecute(t *AutoTaskRow) (string, string) {
	switch t.Action {
	case "archive":
		status, message, _ := autoTaskArchive(t)
		return status, message
	case "archive_report":
		return autoTaskArchiveReport(t)
	default:
		return "failed", fmt.Sprintf("未知动作：%s", t.Action)
	}
}

// ---------- archive ----------

// archiveFilter builds the WHERE clause shared by the archive run and the
// report, so both agree on what "matches".
func archiveFilter(params map[string]any) (string, []any) {
	conds := []string{`delete_time IS NULL`}
	args := []any{}

	if to := strings.TrimSpace(asStr(params["to"])); to != "" {
		ors := []string{}
		for _, addr := range splitAnyList(to) {
			ors = append(ors, `instr(lower(to_addr), ?) > 0`)
			args = append(args, strings.ToLower(addr))
		}
		if len(ors) > 0 {
			conds = append(conds, "("+strings.Join(ors, " OR ")+")")
		}
	}
	if kw := strings.TrimSpace(asStr(params["keyword"])); kw != "" {
		conds = append(conds, `(instr(lower(subject), ?) > 0 OR instr(lower(body), ?) > 0 OR instr(lower(snippet), ?) > 0)`)
		lk := strings.ToLower(kw)
		args = append(args, lk, lk, lk)
	}
	if days := asIntDefault(params["days"], 0); days > 0 {
		conds = append(conds, `time < ?`)
		args = append(args, nowMillis()-int64(days)*86400000)
	}
	return strings.Join(conds, " AND "), args
}

func splitAnyList(raw string) []string {
	out := []string{}
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == ';' || r == '\n' || r == ' '
	}) {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func asIntDefault(v any, def int) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case string:
		if i, err := strconv.Atoi(strings.TrimSpace(n)); err == nil {
			return i
		}
	}
	return def
}

// autoTaskArchive soft-deletes every matching mail and returns the run's
// timestamp, which is what the report selects on so it never re-reports mail
// archived by an earlier run.
func autoTaskArchive(t *AutoTaskRow) (string, string, int64) {
	params := autoTaskParams(t)
	where, args := archiveFilter(params)
	var matched int
	if err := db.QueryRow(`SELECT COUNT(*) FROM emails WHERE `+where, args...).Scan(&matched); err != nil {
		return "failed", fmt.Sprintf("统计失败：%v", err), 0
	}
	now := nowMillis()
	if matched == 0 {
		return "ok", "没有符合条件的邮件", now
	}
	res, err := db.Exec(`UPDATE emails SET delete_time = ?, update_time = ? WHERE `+where, append([]any{now, now}, args...)...)
	if err != nil {
		return "failed", fmt.Sprintf("归档失败：%v", err), 0
	}
	n, _ := res.RowsAffected()
	return "ok", fmt.Sprintf("归档了 %d 封邮件", n), now
}

// ---------- report ----------

func autoTaskArchiveReport(t *AutoTaskRow) (string, string) {
	params := autoTaskParams(t)
	status, archiveNote, runAt := autoTaskArchive(t)
	if status == "failed" {
		return "failed", archiveNote
	}

	// only what this run archived: delete_time carries the run timestamp
	rows, err := db.Query(`SELECT from_addr, to_addr, subject, time FROM emails WHERE delete_time = ? ORDER BY time DESC LIMIT 200`, runAt)
	if err != nil {
		return "failed", fmt.Sprintf("读取归档结果失败：%v", err)
	}
	defer rows.Close()

	type item struct {
		From, To, Subject string
		Time              int64
	}
	items := []item{}
	for rows.Next() {
		var it item
		if rows.Scan(&it.From, &it.To, &it.Subject, &it.Time) == nil {
			items = append(items, it)
		}
	}

	from := strings.TrimSpace(asStr(params["from"]))
	to := strings.TrimSpace(asStr(params["report_to"]))
	if from == "" || to == "" {
		return "failed", "缺少发件邮箱或报告收件人"
	}

	var body strings.Builder
	body.WriteString(`<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#111">`)
	body.WriteString(fmt.Sprintf("<p>任务「%s」执行完成：%s</p>", t.Name, archiveNote))
	if len(items) == 0 {
		body.WriteString("<p>本次没有归档任何邮件。</p>")
	} else {
		body.WriteString(fmt.Sprintf("<p>本次归档 %d 封：</p>", len(items)))
		body.WriteString(`<table cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:13px">`)
		body.WriteString(`<tr style="background:#f4f4f5"><th align="left">时间</th><th align="left">发件人</th><th align="left">收件邮箱</th><th align="left">主题</th></tr>`)
		for _, it := range items {
			body.WriteString(fmt.Sprintf(
				`<tr><td style="border-top:1px solid #e4e4e7;white-space:nowrap">%s</td><td style="border-top:1px solid #e4e4e7">%s</td><td style="border-top:1px solid #e4e4e7">%s</td><td style="border-top:1px solid #e4e4e7">%s</td></tr>`,
				time.UnixMilli(it.Time).Format("2006-01-02 15:04"), escapeHTMLString(it.From), escapeHTMLString(it.To), escapeHTMLString(it.Subject)))
		}
		body.WriteString("</table>")
	}
	body.WriteString("</div>")

	subject := fmt.Sprintf("[邮件归档] %s %s", t.Name, time.Now().Format("2006-01-02"))
	recipients := splitAnyList(to)
	channel := "external"
	if resolveResendKey(from) != "" {
		channel = "resend"
	}
	failed := []string{}
	for _, rcpt := range recipients {
		entry := sendLogCreate(from, rcpt, subject, body.String(), channel, nil)
		if entry == nil {
			failed = append(failed, rcpt+"（创建发件记录失败）")
			continue
		}
		if channel != "resend" {
			continue // 没有直连通道，留给外部 worker 发送
		}
		if !sendEmail(sendEmailParams{From: from, To: rcpt, Subject: subject, HTML: body.String()}) {
			sendLogSetStatus(entry.ID, "failed", "Resend send failed")
			failed = append(failed, rcpt)
			continue
		}
		sendLogSetStatus(entry.ID, "sent", "")
	}
	if len(failed) > 0 {
		return "failed", fmt.Sprintf("%s；日志邮件发送失败：%s", archiveNote, strings.Join(failed, ", "))
	}
	if channel != "resend" {
		return "ok", fmt.Sprintf("%s；日志邮件已入队，等待外部通道发送至 %s", archiveNote, strings.Join(recipients, ", "))
	}
	return "ok", fmt.Sprintf("%s；日志邮件已发送至 %s", archiveNote, strings.Join(recipients, ", "))
}

// ---------- handlers ----------

type autoTaskSaveBody struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Enabled  *bool          `json:"enabled"`
	Kind     string         `json:"kind"`
	TimeOfDay string        `json:"time_of_day"`
	Weekdays []string       `json:"weekdays"`
	MonthDay int            `json:"month_day"`
	TimeZone string         `json:"time_zone"`
	Action   string         `json:"action"`
	Params   map[string]any `json:"params"`
}

func autoTaskSave(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req autoTaskSaveBody
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, throwErr("请填写任务名称")
	}
	kind := orDefault(req.Kind, "daily")
	switch kind {
	case "daily", "weekly", "monthly":
	default:
		return nil, throwErr("不支持的计划类型")
	}
	if kind == "weekly" && len(req.Weekdays) == 0 {
		return nil, throwErr("请选择每周执行的星期")
	}
	action := req.Action
	if action != "archive" && action != "archive_report" {
		return nil, throwErr("不支持的动作")
	}
	params := req.Params
	if params == nil {
		params = map[string]any{}
	}
	if action == "archive_report" {
		if strings.TrimSpace(asStr(params["from"])) == "" {
			return nil, throwErr("请选择发件邮箱")
		}
		if strings.TrimSpace(asStr(params["report_to"])) == "" {
			return nil, throwErr("请填写日志邮件收件人")
		}
	}
	if action == "archive" && strings.TrimSpace(asStr(params["to"])) == "" &&
		strings.TrimSpace(asStr(params["keyword"])) == "" && asIntDefault(params["days"], 0) <= 0 {
		return nil, throwErr("至少要设置一个归档条件")
	}

	enabled := 1
	if req.Enabled != nil && !*req.Enabled {
		enabled = 0
	}
	paramsJSON := marshalJSON(params)
	weekdays := strings.Join(req.Weekdays, ",")
	monthDay := req.MonthDay
	if monthDay < 1 || monthDay > 31 {
		monthDay = 1
	}
	tz := orDefault(strings.TrimSpace(req.TimeZone), "Asia/Shanghai")
	if _, err := time.LoadLocation(tz); err != nil {
		return nil, throwErr("无效的时区：" + tz)
	}
	timeOfDay := orDefault(strings.TrimSpace(req.TimeOfDay), "08:00")
	if _, _, ok := clockParts(timeOfDay); !ok {
		return nil, throwErr("时间格式应为 HH:mm")
	}

	now := nowMillis()
	if req.ID == "" {
		id := nanoID(8)
		if _, err := db.Exec(`INSERT INTO autotasks (id, name, enabled, kind, time_of_day, weekdays, month_day, time_zone, action, params, create_time)
			VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
			id, name, enabled, kind, timeOfDay, weekdays, monthDay, tz, action, paramsJSON, now); err != nil {
			return nil, throwErr("保存失败：" + err.Error())
		}
		return autoTaskJSON(autoTaskFindByID(id)), nil
	}
	if autoTaskFindByID(req.ID) == nil {
		return nil, throwErr("任务不存在")
	}
	if _, err := db.Exec(`UPDATE autotasks SET name = ?, enabled = ?, kind = ?, time_of_day = ?, weekdays = ?, month_day = ?,
		time_zone = ?, action = ?, params = ?, update_time = ? WHERE id = ?`,
		name, enabled, kind, timeOfDay, weekdays, monthDay, tz, action, paramsJSON, now, req.ID); err != nil {
		return nil, throwErr("保存失败：" + err.Error())
	}
	return autoTaskJSON(autoTaskFindByID(req.ID)), nil
}

func clockParts(hhmm string) (int, int, bool) {
	parts := strings.Split(strings.TrimSpace(hhmm), ":")
	if len(parts) != 2 {
		return 0, 0, false
	}
	h, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
	m, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, 0, false
	}
	return h, m, true
}

func autoTaskList(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	now := time.Now()
	list := []map[string]any{}
	for _, t := range autoTaskLoadAll() {
		item := autoTaskJSON(t)
		if next := t.nextRunAt(now); next != nil && t.Enabled == 1 {
			item["next_run_at"] = next.UnixMilli()
		} else {
			item["next_run_at"] = nil
		}
		list = append(list, item)
	}
	return map[string]any{"list": list}, nil
}

func autoTaskDelete(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	req.ID = strings.TrimSpace(req.ID)
	if _, err := db.Exec(`UPDATE autotasks SET delete_time = ? WHERE id = ?`, nowMillis(), req.ID); err != nil {
		return nil, throwErr("删除失败")
	}
	return map[string]any{}, nil
}

func autoTaskRunNow(c *Ctx) (any, error) {
	if err := requireAdmin(c.Auth); err != nil {
		return nil, err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := c.Decode(&req); err != nil {
		return nil, throwErr("Invalid request")
	}
	t := autoTaskFindByID(strings.TrimSpace(req.ID))
	if t == nil {
		return nil, throwErr("任务不存在")
	}
	status, message := autoTaskExecute(t)
	autoTaskMarkRun(t.ID, status, message)
	if status == "failed" {
		return map[string]any{"status": status, "message": message}, nil
	}
	return map[string]any{"status": status, "message": message}, nil
}
