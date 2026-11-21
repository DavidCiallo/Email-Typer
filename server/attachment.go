package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

// ============ 附件投递策略（L0 / L2 / L3）============
//
// 缺陷⑤：改造前转发完全不带附件——收件方只能看到正文，附件静默丢失。
// 现在按体积分档：
//   L0  总 ≤ 上限 且 单个 ≤ 上限  → 全部随信送达
//   超限 → 贪心装填，装不下的走 L2（签名外链）或 L3（只列清单）
// L1（对象存储）本系统没有 OSS/S3 配置，直接跳过。

type storedAttachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	CID         string `json:"cid"`
	Inline      bool   `json:"inline"`
	Path        string `json:"path"`
	Skipped     bool   `json:"skipped"`
}

type omittedAttachment struct {
	Index       int
	Filename    string
	Size        int64
	Reason      string
	DownloadURL string // 空 = 没有配置外链
}

// attachmentPlan 是一封邮件的附件投递方案。按邮件算一次，多个策略共用，
// 避免同一份 20MB 附件被重复读盘 + base64 编码 N 次。
type attachmentPlan struct {
	included []map[string]string
	sizes    []int64
	omitted  []omittedAttachment
	notice   string // HTML 提示块（无省略附件时为空）
	noticeTx string // 纯文本版
}

// includedMeta 是写进 sendlogs.attachments 的元信息（不含 base64 内容）。
func (p *attachmentPlan) includedMeta() []map[string]any {
	out := make([]map[string]any, 0, len(p.included))
	for i, a := range p.included {
		var size int64
		if i < len(p.sizes) {
			size = p.sizes[i]
		}
		out = append(out, map[string]any{"filename": a["filename"], "size": size})
	}
	return out
}

func emailAttachmentList(e *EmailRow) []storedAttachment {
	if len(e.Attachments) == 0 || string(e.Attachments) == "null" {
		return nil
	}
	var atts []storedAttachment
	if json.Unmarshal(e.Attachments, &atts) != nil {
		return nil
	}
	return atts
}

func settingMB(key string, fallback int64) int64 {
	n := asInt(settingGet(key))
	if n <= 0 {
		return fallback
	}
	return n * 1024 * 1024
}

func attachmentTotalLimit() int64  { return settingMB("forward_attach_total_mb", 20) }
func attachmentSingleLimit() int64 { return settingMB("forward_attach_single_mb", 10) }

func fmtSize(n int64) string {
	if n >= 1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(n)/(1024*1024))
	}
	return fmt.Sprintf("%.0f KB", float64(n)/1024)
}

// publicBaseURL 是签名链接的前缀，例如 https://mail.example.com
func publicBaseURL() string {
	return strings.TrimRight(strings.TrimSpace(settingGet("public_base_url")), "/")
}

var (
	attachSecretOnce sync.Once
	attachSecretVal  string
)

// attachmentLinkSecret 首次使用时生成并落库（meta 表），保证重启后旧链接仍然有效。
// 不放进 settings：settingGet 只认 settingKeys 白名单里的键，直接写库读不到。
func attachmentLinkSecret() string {
	attachSecretOnce.Do(func() {
		attachSecretVal = metaGet("attachment_link_secret")
		if attachSecretVal != "" {
			return
		}
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			return
		}
		attachSecretVal = hex.EncodeToString(buf)
		metaSet("attachment_link_secret", attachSecretVal)
	})
	return attachSecretVal
}

// attachmentToken = HMAC-SHA256(key = SHA256(secret), msg = attachID + ":" + expire)
func attachmentToken(attachID string, expire int64) string {
	secret := attachmentLinkSecret()
	if secret == "" || attachID == "" {
		return ""
	}
	key := sha256.Sum256([]byte(secret))
	mac := hmac.New(sha256.New, key[:])
	mac.Write([]byte(attachID + ":" + strconv.FormatInt(expire, 10)))
	return hex.EncodeToString(mac.Sum(nil))
}

func attachmentLinkTTL() int64 {
	h := asInt(settingGet("attachment_link_ttl_hours"))
	if h <= 0 {
		h = 168 // 7 天
	}
	return h * 3600
}

// signedAttachmentURL 返回 "" 表示没配 public_base_url，只能降级到 L3。
func signedAttachmentURL(emailID string, index int) string {
	base := publicBaseURL()
	if base == "" {
		return ""
	}
	attachID := emailID + ":" + strconv.Itoa(index)
	expire := nowMillis()/1000 + attachmentLinkTTL()
	token := attachmentToken(attachID, expire)
	if token == "" {
		return ""
	}
	return fmt.Sprintf("%s/api/attachment/download?id=%s&expire=%d&token=%s",
		base, attachID, expire, token)
}

// buildAttachmentPlan 决定这次转发带哪些附件、哪些给链接、哪些只能让收件方找管理员。
func buildAttachmentPlan(e *EmailRow) *attachmentPlan {
	plan := &attachmentPlan{included: []map[string]string{}, omitted: []omittedAttachment{}}
	atts := emailAttachmentList(e)
	if len(atts) == 0 {
		return plan
	}
	totalLimit := attachmentTotalLimit()
	singleLimit := attachmentSingleLimit()
	var used int64
	for i, a := range atts {
		if a.Skipped || a.Path == "" {
			plan.omitted = append(plan.omitted, omittedAttachment{i, a.Filename, a.Size, "超过本系统单附件存储上限，未保存", ""})
			continue
		}
		if singleLimit > 0 && a.Size > singleLimit {
			plan.omitted = append(plan.omitted, omittedAttachment{i, a.Filename, a.Size,
				fmt.Sprintf("单个附件超过 %s", fmtSize(singleLimit)), signedAttachmentURL(e.ID, i)})
			continue
		}
		if totalLimit > 0 && used+a.Size > totalLimit {
			plan.omitted = append(plan.omitted, omittedAttachment{i, a.Filename, a.Size,
				fmt.Sprintf("累计超过 %s", fmtSize(totalLimit)), signedAttachmentURL(e.ID, i)})
			continue
		}
		content, err := os.ReadFile(filepath.Join(dataDir, "attachments", e.EID, a.Path))
		if err != nil {
			log.Printf("[Attachment] read %s failed: %v", a.Path, err)
			plan.omitted = append(plan.omitted, omittedAttachment{i, a.Filename, a.Size, "附件文件丢失", signedAttachmentURL(e.ID, i)})
			continue
		}
		plan.included = append(plan.included, map[string]string{
			"filename": orDefault(a.Filename, "attachment"),
			"content":  base64.StdEncoding.EncodeToString(content),
		})
		plan.sizes = append(plan.sizes, a.Size)
		used += a.Size
	}
	if len(plan.omitted) > 0 {
		plan.notice, plan.noticeTx = attachmentNotice(atts, plan)
	}
	return plan
}

// attachmentNotice 生成收件方看到的提示块（告知体系第 1 层）。
func attachmentNotice(atts []storedAttachment, plan *attachmentPlan) (string, string) {
	var total int64
	for _, a := range atts {
		total += a.Size
	}
	head := fmt.Sprintf("本邮件原始包含 %d 个附件，共 %s，超出转发上限（%s）。",
		len(atts), fmtSize(total), fmtSize(attachmentTotalLimit()))

	var sb strings.Builder
	sb.WriteString(`<div style="border:1px solid #f0c36d;background:#fffbe6;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.7;color:#664d03;">`)
	sb.WriteString(`<div style="font-weight:600;margin-bottom:6px;">⚠️ 附件提示</div>`)
	sb.WriteString("<div>" + htmlEscape(head) + "</div>")
	sb.WriteString(`<div style="margin-top:8px;">以下附件未能随本邮件送达：</div><ul style="margin:6px 0 0 18px;padding:0;">`)

	var tx strings.Builder
	tx.WriteString("⚠️ 附件提示\n" + head + "\n以下附件未能随本邮件送达：\n")

	linked := false
	for _, o := range plan.omitted {
		if o.DownloadURL != "" {
			sb.WriteString(fmt.Sprintf(`<li>%s — %s <a href="%s">下载（%d 天内有效）</a>（%s）</li>`,
				htmlEscape(o.Filename), fmtSize(o.Size), htmlEscape(o.DownloadURL), attachmentLinkTTL()/3600, htmlEscape(o.Reason)))
			tx.WriteString(fmt.Sprintf("  · %s — %s  下载：%s（%d 天内有效）\n", o.Filename, fmtSize(o.Size), o.DownloadURL, attachmentLinkTTL()/3600))
			linked = true
		} else {
			sb.WriteString(fmt.Sprintf(`<li>%s — %s（%s，请联系发件方管理员获取）</li>`,
				htmlEscape(o.Filename), fmtSize(o.Size), htmlEscape(o.Reason)))
			tx.WriteString(fmt.Sprintf("  · %s — %s（%s，请联系发件方管理员获取）\n", o.Filename, fmtSize(o.Size), o.Reason))
		}
	}
	sb.WriteString(`</ul>`)
	if !linked {
		sb.WriteString(`<div style="margin-top:6px;">系统未配置外链下载地址，需要这些附件请联系发件方管理员。</div>`)
	}
	if len(plan.included) > 0 {
		dropped := map[int]bool{}
		for _, o := range plan.omitted {
			dropped[o.Index] = true
		}
		names := []string{}
		for i, a := range atts {
			if dropped[i] {
				continue
			}
			names = append(names, a.Filename+"（"+fmtSize(a.Size)+"）")
		}
		if len(names) > 0 {
			sb.WriteString(`<div style="margin-top:8px;">已随信送达：` + htmlEscape(strings.Join(names, "、")) + "</div>")
			tx.WriteString("已随信送达：" + strings.Join(names, "、") + "\n")
		}
	}
	sb.WriteString(`</div>`)
	return sb.String(), tx.String()
}

func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")
	return r.Replace(s)
}

// buildPickedAttachmentPlan 只装用户勾选的附件（「重新转发」用）。
// 体积上限照旧：勾多了会明确报错，而不是悄悄少发。
func buildPickedAttachmentPlan(e *EmailRow, pick []int) (*attachmentPlan, error) {
	plan := &attachmentPlan{included: []map[string]string{}, omitted: []omittedAttachment{}}
	atts := emailAttachmentList(e)
	totalLimit := attachmentTotalLimit()
	singleLimit := attachmentSingleLimit()
	var used int64
	for _, idx := range pick {
		if idx < 0 || idx >= len(atts) {
			return nil, fmt.Errorf("附件序号无效：%d", idx)
		}
		a := atts[idx]
		if a.Skipped || a.Path == "" {
			return nil, fmt.Errorf("附件「%s」没有被保存，无法发送", a.Filename)
		}
		if singleLimit > 0 && a.Size > singleLimit {
			return nil, fmt.Errorf("附件「%s」有 %s，超过单附件上限 %s", a.Filename, fmtSize(a.Size), fmtSize(singleLimit))
		}
		if totalLimit > 0 && used+a.Size > totalLimit {
			return nil, fmt.Errorf("所选附件累计超过 %s，请少选几个", fmtSize(totalLimit))
		}
		content, err := os.ReadFile(filepath.Join(dataDir, "attachments", e.EID, a.Path))
		if err != nil {
			return nil, fmt.Errorf("附件「%s」文件丢失", a.Filename)
		}
		plan.included = append(plan.included, map[string]string{
			"filename": orDefault(a.Filename, "attachment"),
			"content":  base64.StdEncoding.EncodeToString(content),
		})
		plan.sizes = append(plan.sizes, a.Size)
		used += a.Size
	}
	return plan, nil
}

// ============ 签名下载接口 ============
//
// GET /api/attachment/download?id=<emailID>:<index>&expire=<unix>&token=<hex>
// 无鉴权（收件方在外部），靠签名 + 过期时间保护；只能取到被签名的那一个附件。

func attachmentDownloadSigned(c *Ctx) (any, error) {
	attachID := asStr(c.Body["id"])
	expire := asInt(c.Body["expire"])
	token := strings.ToLower(strings.TrimSpace(asStr(c.Body["token"])))
	if attachID == "" || expire <= 0 || token == "" {
		return nil, throwErr("下载链接无效")
	}
	if nowMillis()/1000 > expire {
		return nil, throwErr("下载链接已过期，请联系发件方重新转发")
	}
	if !hmac.Equal([]byte(attachmentToken(attachID, expire)), []byte(token)) {
		return nil, throwErr("下载链接无效")
	}
	parts := strings.SplitN(attachID, ":", 2)
	if len(parts) != 2 {
		return nil, throwErr("下载链接无效")
	}
	emailID := parts[0]
	index, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, throwErr("下载链接无效")
	}
	data := emailFindByID(emailID)
	if data == nil {
		return nil, throwErr("邮件不存在或已删除")
	}
	atts := emailAttachmentList(data)
	if index < 0 || index >= len(atts) {
		return nil, throwErr("附件不存在")
	}
	meta := atts[index]
	if meta.Skipped || meta.Path == "" {
		return nil, throwErr("该附件未保存")
	}
	content, err := os.ReadFile(filepath.Join(dataDir, "attachments", data.EID, meta.Path))
	if err != nil {
		return nil, throwErr("附件文件丢失")
	}
	ip := c.Headers["x-forwarded-for"]
	if ip == "" {
		ip = c.Headers["x-real-ip"]
	}
	if ip == "" {
		ip = "-"
	}
	// 安全要求：每次访问都留痕
	log.Printf("[Attachment] signed download %s (%s) from %s", attachID, meta.Filename, ip)
	filename := orDefault(meta.Filename, "attachment")
	fallback := strings.Map(func(r rune) rune {
		if r > 0x7e || r < 0x20 || r == '"' {
			return '_'
		}
		return r
	}, filename)
	ct := orDefault(meta.ContentType, "application/octet-stream")
	return rawResponse(func(w http.ResponseWriter) {
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Content-Length", strconv.FormatInt(int64(len(content)), 10))
		w.Header().Set("Content-Disposition",
			fmt.Sprintf("attachment; filename=\"%s\"; filename*=UTF-8''%s", fallback, urlQueryEscape(filename)))
		w.Header().Set("Cache-Control", "private, max-age=600")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(content)
	}), nil
}
