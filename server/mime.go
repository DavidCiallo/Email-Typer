package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/encoding/traditionalchinese"
	"golang.org/x/text/encoding/unicode"
)

// ---------- charsets ----------

func decoderFor(charset string) (interface{ Bytes([]byte) ([]byte, error) }, bool) {
	switch strings.ToLower(strings.Trim(strings.TrimSpace(charset), "\"'")) {
	case "gb2312", "gbk":
		return simplifiedchinese.GBK.NewDecoder(), true
	case "gb18030":
		return simplifiedchinese.GB18030.NewDecoder(), true
	case "big5":
		return traditionalchinese.Big5.NewDecoder(), true
	case "shift_jis", "shift-jis":
		return japanese.ShiftJIS.NewDecoder(), true
	case "euc-jp":
		return japanese.EUCJP.NewDecoder(), true
	case "euc-kr":
		return korean.EUCKR.NewDecoder(), true
	case "windows-1252":
		return charmap.Windows1252.NewDecoder(), true
	case "windows-874":
		return charmap.Windows874.NewDecoder(), true
	case "iso-8859-1":
		return charmap.ISO8859_1.NewDecoder(), true
	case "iso-8859-2":
		return charmap.ISO8859_2.NewDecoder(), true
	case "iso-8859-6":
		return charmap.ISO8859_6.NewDecoder(), true
	case "koi8-r":
		return charmap.KOI8R.NewDecoder(), true
	case "utf-16", "utf-16le":
		return unicode.UTF16(unicode.LittleEndian, unicode.UseBOM).NewDecoder(), true
	case "utf-16be":
		return unicode.UTF16(unicode.BigEndian, unicode.UseBOM).NewDecoder(), true
	default: // utf-8, us-ascii, unknown
		return nil, false
	}
}

func decodeText(buf []byte, charset string) string {
	if dec, ok := decoderFor(charset); ok {
		if out, err := dec.Bytes(buf); err == nil && utf8.Valid(out) {
			return string(out)
		}
	}
	return string(buf)
}

var encodedWordRe = regexp.MustCompile(`=\?([^?]+)\?([bBqQ])\?([^?]*)\?=`)

// decodeMimeHeader decodes RFC 2047 encoded-words like =?UTF-8?B?...?=.
func decodeMimeHeader(value string) string {
	if value == "" {
		return ""
	}
	return encodedWordRe.ReplaceAllStringFunc(value, func(m string) string {
		parts := encodedWordRe.FindStringSubmatch(m)
		charset, enc, data := parts[1], strings.ToUpper(parts[2]), parts[3]
		if enc == "B" {
			raw, err := base64.StdEncoding.DecodeString(data)
			if err != nil {
				return data
			}
			return decodeText(raw, charset)
		}
		src := strings.ReplaceAll(data, "_", " ")
		out := make([]byte, 0, len(src))
		for i := 0; i < len(src); i++ {
			if src[i] == '=' && i+3 <= len(src) {
				var b int
				if n, _ := fmt.Sscanf(src[i+1:i+3], "%02x", &b); n == 1 {
					out = append(out, byte(b))
					i += 2
					continue
				}
			}
			out = append(out, src[i])
		}
		return decodeText(out, charset)
	})
}

// ---------- structure ----------

func splitHeaderBody(buf []byte) (map[string]string, []byte) {
	crlf := bytes.Index(buf, []byte("\r\n\r\n"))
	lf := bytes.Index(buf, []byte("\n\n"))
	end, sepLen := len(buf), 0
	if crlf != -1 && (lf == -1 || crlf < lf) {
		end, sepLen = crlf, 4
	} else if lf != -1 {
		end, sepLen = lf, 2
	}
	headers := parseHeaderLines(string(buf[:end]))
	var body []byte
	if sepLen > 0 && end+sepLen <= len(buf) {
		body = buf[end+sepLen:]
	}
	return headers, body
}

func parseHeaderLines(text string) map[string]string {
	headers := map[string]string{}
	currentKey := ""
	for _, line := range strings.Split(text, "\r\n") {
		for _, l := range strings.Split(line, "\n") {
			if (strings.HasPrefix(l, " ") || strings.HasPrefix(l, "\t")) && currentKey != "" {
				headers[currentKey] += " " + strings.TrimSpace(l)
				continue
			}
			if idx := strings.Index(l, ":"); idx > 0 {
				currentKey = strings.TrimSpace(l[:idx])
				headers[strings.ToLower(currentKey)] = strings.TrimSpace(l[idx+1:])
			}
		}
	}
	return headers
}

func parseContentType(value string) (string, map[string]string) {
	semi := strings.Index(value, ";")
	typ := strings.ToLower(strings.TrimSpace(value))
	paramsStr := ""
	if semi != -1 {
		typ = strings.ToLower(strings.TrimSpace(value[:semi]))
		paramsStr = value[semi+1:]
	}
	return typ, resolveExtendedParams(parseParams(paramsStr))
}

func parseParams(s string) map[string]string {
	params := map[string]string{}
	i := 0
	for i < len(s) {
		for i < len(s) && (s[i] == ';' || s[i] == ' ' || s[i] == '\t') {
			i++
		}
		eq := strings.Index(s[i:], "=")
		if eq == -1 {
			break
		}
		eq += i
		name := strings.ToLower(strings.TrimSpace(s[i:eq]))
		i = eq + 1
		value := ""
		if i < len(s) && s[i] == '"' {
			i++
			for i < len(s) && s[i] != '"' {
				if s[i] == '\\' && i+1 < len(s) {
					value += string(s[i+1])
					i += 2
				} else {
					value += string(s[i])
					i++
				}
			}
			i++
		} else {
			j := strings.IndexByte(s[i:], ';')
			if j == -1 {
				value = strings.TrimSpace(s[i:])
				i = len(s)
			} else {
				value = strings.TrimSpace(s[i : i+j])
				i = i + j
			}
		}
		if name != "" {
			params[name] = value
		}
		if i < len(s) && s[i] == ';' {
			i++
		}
	}
	return params
}

var rfc2231SegRe = regexp.MustCompile(`^(.+?)\*(\d+)?(\*)?$`)

func resolveExtendedParams(params map[string]string) map[string]string {
	type frag struct{ idx int; ext bool; value string }
	out := map[string]string{}
	frags := map[string][]frag{}
	for k, v := range params {
		m := rfc2231SegRe.FindStringSubmatch(k)
		if m == nil {
			out[k] = v
			continue
		}
		base := m[1]
		idx := 0
		if m[2] != "" {
			fmt.Sscanf(m[2], "%d", &idx)
		}
		ext := m[3] == "*" || m[2] == ""
		frags[base] = append(frags[base], frag{idx, ext, v})
	}
	for base, arr := range frags {
		for i := 1; i < len(arr); i++ {
			for j := i; j > 0 && arr[j].idx < arr[j-1].idx; j-- {
				arr[j], arr[j-1] = arr[j-1], arr[j]
			}
		}
		isExt := false
		var parts []string
		for _, f := range arr {
			if f.ext {
				isExt = true
			}
			parts = append(parts, f.value)
		}
		joined := strings.Join(parts, "")
		if isExt {
			out[base] = decodeExtendedParam(joined)
		} else {
			out[base] = decodeMimeHeader(joined)
		}
	}
	return out
}

func decodeExtendedParam(value string) string {
	charset := "utf-8"
	raw := value
	if m := regexp.MustCompile(`^([^']*)'[^']*'(.*)$`).FindStringSubmatch(value); m != nil {
		if m[1] != "" {
			charset = m[1]
		}
		raw = m[2]
	}
	out := make([]byte, 0, len(raw))
	hexDigits := func(c byte) bool { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F') }
	for i := 0; i < len(raw); i++ {
		if raw[i] == '%' && i+2 < len(raw)+1 && i+3 <= len(raw) && hexDigits(raw[i+1]) && hexDigits(raw[i+2]) {
			var b int
			fmt.Sscanf(raw[i+1:i+3], "%02x", &b)
			out = append(out, byte(b))
			i += 2
			continue
		}
		out = append(out, raw[i])
	}
	return decodeText(out, charset)
}

func sanitizeFilename(name string) string {
	decoded := strings.NewReplacer("\r", "", "\n", "", "\x00", "").Replace(decodeMimeHeader(name))
	if idx := strings.LastIndexAny(decoded, "/\\"); idx != -1 {
		decoded = decoded[idx+1:]
	}
	decoded = strings.TrimSpace(decoded)
	// rune-safe 200 cap (byte slicing would corrupt multi-byte names)
	if runes := []rune(decoded); len(runes) > 200 {
		decoded = string(runes[:200])
	}
	return decoded
}

// ---------- transfer decoding ----------

func decodeTransfer(body []byte, encoding string) []byte {
	switch strings.ToLower(strings.TrimSpace(encoding)) {
	case "base64":
		clean := make([]byte, 0, len(body))
		for _, b := range body {
			if (b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z') || (b >= '0' && b <= '9') || b == '+' || b == '/' || b == '=' {
				clean = append(clean, b)
			}
		}
		out := make([]byte, base64.StdEncoding.DecodedLen(len(clean)))
		if n, err := base64.StdEncoding.Decode(out, clean); err == nil {
			return out[:n]
		}
		if n, err := base64.RawStdEncoding.Decode(out, clean); err == nil {
			return out[:n]
		}
		return body
	case "quoted-printable":
		return decodeQuotedPrintable(body)
	default:
		return body
	}
}

func decodeQuotedPrintable(body []byte) []byte {
	out := make([]byte, 0, len(body))
	for i := 0; i < len(body); i++ {
		if body[i] == '=' {
			if i+2 < len(body) && body[i+1] == '\r' && body[i+2] == '\n' {
				i += 2
				continue
			}
			if i+1 < len(body) && body[i+1] == '\n' {
				i++
				continue
			}
			if i+2 < len(body) && isHex(body[i+1]) && isHex(body[i+2]) {
				out = append(out, (unhex(body[i+1])<<4)|unhex(body[i+2]))
				i += 2
				continue
			}
		}
		out = append(out, body[i])
	}
	return out
}

func isHex(b byte) bool { return (b >= '0' && b <= '9') || (b >= 'a' && b <= 'f') || (b >= 'A' && b <= 'F') }
func unhex(b byte) byte {
	switch {
	case b >= '0' && b <= '9':
		return b - '0'
	case b >= 'a' && b <= 'f':
		return b - 'a' + 10
	default:
		return b - 'A' + 10
	}
}

// ---------- multipart walking ----------

type ParsedAttachment struct {
	Filename    string
	ContentType string
	Size        int
	CID         string
	Inline      bool
	Content     []byte
}

type ParsedEmail struct {
	From       string
	To         string
	Subject    string
	Text       string
	HTML       string
	Time       int64
	MessageID  string
	Source     string
	MailboxID  string
	Forwarded  bool
	AccountID  string
	Attachments []ParsedAttachment
}

const maxDepth = 10

type walkOut struct {
	text        string
	html        string
	attachments []ParsedAttachment
}

func splitMultipart(body []byte, boundary string) [][]byte {
	delim := []byte("--" + boundary)
	type mark struct {
		start int
		close bool
	}
	var marks []mark
	pos := 0
	for {
		idx := bytes.Index(body[pos:], delim)
		if idx == -1 {
			break
		}
		idx += pos
		if idx == 0 || (idx > 0 && body[idx-1] == 0x0a) {
			after := idx + len(delim)
			close := after+1 < len(body) && body[after] == 0x2d && body[after+1] == 0x2d
			marks = append(marks, mark{idx, close})
			if close {
				break
			}
		}
		pos = idx + len(delim)
	}
	var parts [][]byte
	for i := 0; i+1 < len(marks); i++ {
		segStart := marks[i].start + len(delim)
		for segStart < len(body) && body[segStart] != 0x0a {
			segStart++
		}
		segStart++
		segEnd := marks[i+1].start
		if segEnd > 0 && body[segEnd-1] == 0x0a {
			segEnd--
		}
		if segEnd > 0 && body[segEnd-1] == 0x0d {
			segEnd--
		}
		if segEnd > segStart {
			parts = append(parts, body[segStart:segEnd])
		}
	}
	return parts
}

func walkPart(buf []byte, headers map[string]string, depth int, out *walkOut) {
	if depth > maxDepth {
		return
	}
	ctHeader := headers["content-type"]
	if ctHeader == "" {
		ctHeader = "text/plain"
	}
	ctype, params := parseContentType(ctHeader)
	_, body := splitHeaderBody(buf)

	if strings.HasPrefix(ctype, "multipart/") {
		boundary := params["boundary"]
		if boundary == "" {
			return
		}
		for _, part := range splitMultipart(body, boundary) {
			subHeaders, _ := splitHeaderBody(part)
			walkPart(part, subHeaders, depth+1, out)
		}
		return
	}

	if ctype == "message/rfc822" {
		subHeaders, subBody := splitHeaderBody(body)
		walkPart(subBody, subHeaders, depth+1, out)
		return
	}

	dispositionHeader := headers["content-disposition"]
	disposition := ""
	if semi := strings.Index(dispositionHeader, ";"); semi != -1 {
		disposition = strings.ToLower(strings.TrimSpace(dispositionHeader[:semi]))
	} else {
		disposition = strings.ToLower(strings.TrimSpace(dispositionHeader))
	}
	dispoParamsStr := ""
	if strings.Contains(dispositionHeader, ";") {
		dispoParamsStr = dispositionHeader[strings.Index(dispositionHeader, ";")+1:]
	}
	dispoParams := resolveExtendedParams(parseParams(dispoParamsStr))
	cid := strings.Trim(strings.Trim(headers["content-id"], " "), "<>")
	encoding := headers["content-transfer-encoding"]

	filename := ""
	if v, ok := dispoParams["filename"]; ok {
		filename = v
	} else if v, ok := params["name"]; ok {
		filename = v
	} else if v, ok := dispoParams["name"]; ok {
		filename = v
	}
	filename = sanitizeFilename(filename)

	isTextPart := ctype == "text/plain" || ctype == "text/html"
	isAttachment := disposition == "attachment"
	if !isAttachment && disposition == "inline" {
		isAttachment = (cid != "" && !isTextPart) || (filename != "" && !isTextPart)
	}
	if !isAttachment && disposition == "" {
		isAttachment = !isTextPart
	}

	if isAttachment {
		content := decodeTransfer(body, encoding)
		out.attachments = append(out.attachments, ParsedAttachment{
			Filename:    orDefault(filename, "untitled"),
			ContentType: ctype,
			Size:        len(content),
			CID:         cid,
			Inline:      disposition == "inline" && cid != "",
			Content:     content,
		})
		return
	}

	decoded := decodeText(decodeTransfer(body, encoding), params["charset"])
	if ctype == "text/html" {
		out.html += decoded
	} else {
		out.text += decoded
	}
}

var emailAddrRe = regexp.MustCompile(`[\w.-]+@[\w.-]+`)

// parseRawEmail mirrors server/lib/mime.ts parseRawEmail.
func parseRawEmail(raw []byte) *ParsedEmail {
	if len(raw) == 0 {
		return nil
	}
	topHeaders, _ := splitHeaderBody(raw)
	if len(topHeaders) == 0 {
		return nil
	}
	out := &walkOut{}
	walkPart(raw, topHeaders, 0, out)

	from := decodeMimeHeader(topHeaders["from"])
	to := decodeMimeHeader(topHeaders["to"])
	subject := decodeMimeHeader(topHeaders["subject"])
	messageID := strings.TrimSpace(topHeaders["message-id"])
	source := strings.TrimSpace(topHeaders["x-cfrs-source"])
	if source == "" {
		source = "maildir"
	}
	mailboxID := strings.TrimSpace(topHeaders["x-cfrs-mailbox"])
	forwarded := strings.TrimSpace(topHeaders["x-cfrs-forwarded"]) != ""

	timeVal := parseDateHeader(topHeaders["date"])
	accountID := ""
	if m := emailAddrRe.FindString(to); m != "" {
		if at := strings.Index(m, "@"); at != -1 {
			accountID = m[:at]
		}
	}
	text := strings.TrimSpace(out.text)
	if text == "" && out.html != "" {
		t := regexp.MustCompile(`(?is)<style[\s\S]*?</style>`).ReplaceAllString(out.html, "")
		t = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(t, " ")
		text = strings.TrimSpace(regexp.MustCompile(`\s+`).ReplaceAllString(t, " "))
	}
	return &ParsedEmail{
		From: from, To: to, Subject: subject, Text: text, HTML: out.html,
		Time: timeVal, MessageID: messageID, Source: source, MailboxID: mailboxID,
		Forwarded: forwarded, AccountID: accountID, Attachments: out.attachments,
	}
}

var namedZones = map[string]string{
	"UT": "+0000", "GMT": "+0000", "UTC": "+0000", "Z": "+0000",
	"EST": "-0500", "EDT": "-0400", "CST": "-0600", "CDT": "-0500",
	"MST": "-0700", "MDT": "-0600", "PST": "-0800", "PDT": "-0700",
	"JST": "+0900", "KST": "+0900", "HKT": "+0800", "SGT": "+0800",
	"CET": "+0100", "CEST": "+0200", "BST": "+0100", "AEST": "+1000",
}

func parseDateHeader(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return nowMillis()
	}
	layouts := []string{
		time.RFC1123Z, // Mon, 02 Jan 2006 15:04:05 -0700
		"Mon, 2 Jan 2006 15:04:05 -0700",
		"Mon, 02 Jan 2006 15:04:05 GMT",
		"Mon, 2 Jan 2006 15:04:05 GMT",
		time.RFC1123,
		time.RFC822Z, // 02 Jan 06 15:04 -0700
		time.RFC822,
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	}
	for _, l := range layouts {
		if t, err := time.Parse(l, s); err == nil {
			return t.UnixMilli()
		}
	}
	// trailing named zone → numeric offset, then retry
	if idx := strings.LastIndex(s, " "); idx != -1 {
		zone := s[idx+1:]
		if off, ok := namedZones[zone]; ok {
			s2 := s[:idx] + " " + off
			for _, l := range []string{time.RFC1123Z, "Mon, 2 Jan 2006 15:04:05 -0700"} {
				if t, err := time.Parse(l, s2); err == nil {
					return t.UnixMilli()
				}
			}
		}
	}
	return nowMillis()
}

// ---------- composing ----------

type ComposeAttachment struct {
	Filename    string
	ContentType string
	Content     []byte
}

type ComposeOptions struct {
	From, To, Subject string
	Text, HTML        string
	Attachments       []ComposeAttachment
	Headers           map[string]string
	MessageID         string
	Date              time.Time
}

func bEncodeHeader(value string) string {
	if value == "" {
		return ""
	}
	ascii := true
	for _, r := range value {
		if r < 0x20 || r > 0x7e {
			ascii = false
			break
		}
	}
	if ascii {
		return value
	}
	data := []byte(value)
	var chunks []string
	start := 0
	for start < len(data) {
		end := start + 40
		if end > len(data) {
			end = len(data)
		} else {
			for end < len(data) && (data[end]&0xc0) == 0x80 {
				end--
			}
		}
		chunks = append(chunks, "=?UTF-8?B?"+base64.StdEncoding.EncodeToString(data[start:end])+"?=")
		start = end
	}
	return strings.Join(chunks, "\r\n ")
}

func base64Wrap(content []byte) string {
	b64 := base64.StdEncoding.EncodeToString(content)
	var lines []string
	for len(b64) > 76 {
		lines = append(lines, b64[:76])
		b64 = b64[76:]
	}
	lines = append(lines, b64)
	return strings.Join(lines, "\r\n")
}

func textPartBody(content, subtype string) string {
	return "Content-Type: text/" + subtype + "; charset=utf-8\r\n" +
		"Content-Transfer-Encoding: base64\r\n\r\n" + base64Wrap([]byte(content))
}

func assembleMultipart(boundary string, parts []string) string {
	var sb strings.Builder
	for _, p := range parts {
		sb.WriteString("--" + boundary + "\r\n" + p + "\r\n")
	}
	sb.WriteString("--" + boundary + "--")
	return sb.String()
}

func composeRawEmail(opts ComposeOptions) string {
	date := opts.Date
	if date.IsZero() {
		date = time.Now()
	}
	messageID := opts.MessageID
	if messageID == "" {
		messageID = fmt.Sprintf("<%s.%d@cfrs.local>", nanoID(14), date.UnixMilli())
	}
	atts := opts.Attachments

	headerLines := []string{
		"Date: " + date.UTC().Format("Mon, 02 Jan 2006 15:04:05 GMT"),
		"From: " + bEncodeHeader(opts.From),
		"To: " + bEncodeHeader(opts.To),
		"Subject: " + bEncodeHeader(opts.Subject),
		"Message-ID: " + messageID,
		"MIME-Version: 1.0",
	}
	keys := make([]string, 0, len(opts.Headers))
	for k := range opts.Headers {
		keys = append(keys, k)
	}
	sortStrings(keys)
	for _, k := range keys {
		headerLines = append(headerLines, k+": "+opts.Headers[k])
	}

	hasText := opts.Text != ""
	hasHTML := opts.HTML != ""
	var bodyType, body string

	if len(atts) > 0 {
		var inner string
		if hasText && hasHTML {
			altBoundary := "=_cfrs_alt_" + nanoID(12)
			inner = "Content-Type: multipart/alternative; boundary=\"" + altBoundary + "\"\r\n\r\n" +
				assembleMultipart(altBoundary, []string{textPartBody(opts.Text, "plain"), textPartBody(opts.HTML, "html")})
		} else if hasHTML {
			inner = textPartBody(opts.HTML, "html")
		} else {
			inner = textPartBody(opts.Text, "plain")
		}
		mixedBoundary := "=_cfrs_mixed_" + nanoID(12)
		parts := []string{inner}
		for _, att := range atts {
			ct := orDefault(att.ContentType, "application/octet-stream")
			name := bEncodeHeader(orDefault(att.Filename, "attachment"))
			parts = append(parts, "Content-Type: "+ct+"; name=\""+name+"\"\r\n"+
				"Content-Disposition: attachment; filename=\""+name+"\"\r\n"+
				"Content-Transfer-Encoding: base64\r\n\r\n"+base64Wrap(att.Content))
		}
		bodyType = "multipart/mixed; boundary=\"" + mixedBoundary + "\""
		body = assembleMultipart(mixedBoundary, parts)
	} else if hasText && hasHTML {
		altBoundary := "=_cfrs_alt_" + nanoID(12)
		bodyType = "multipart/alternative; boundary=\"" + altBoundary + "\""
		body = assembleMultipart(altBoundary, []string{textPartBody(opts.Text, "plain"), textPartBody(opts.HTML, "html")})
	} else if hasHTML {
		bodyType = "text/html; charset=utf-8"
		body = base64Wrap([]byte(opts.HTML))
	} else {
		bodyType = "text/plain; charset=utf-8"
		body = base64Wrap([]byte(opts.Text))
	}

	head := strings.Join(headerLines, "\r\n")
	if bodyType != "" && !strings.HasPrefix(bodyType, "multipart/") {
		return head + "\r\nContent-Type: " + bodyType + "\r\nContent-Transfer-Encoding: base64\r\n\r\n" + body + "\r\n"
	}
	if bodyType != "" {
		return head + "\r\nContent-Type: " + bodyType + "\r\n\r\n" + body + "\r\n"
	}
	return head + "\r\n\r\n" + body + "\r\n"
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

// stampHeadersBuffer prepends extra headers (binary-safe).
func stampHeadersBuffer(raw []byte, extra map[string]string) []byte {
	head := ""
	keys := make([]string, 0, len(extra))
	for k := range extra {
		keys = append(keys, k)
	}
	sortStrings(keys)
	for _, k := range keys {
		head += k + ": " + extra[k] + "\r\n"
	}
	return append([]byte(head), raw...)
}

// withDateHeader rewrites (or inserts) the top-level Date header, byte-safe.
func withDateHeader(raw []byte, date time.Time) []byte {
	dateLine := "Date: " + date.UTC().Format("Mon, 02 Jan 2006 15:04:05 GMT")
	sepStart, sepEnd := -1, -1
	for i := 0; i+1 < len(raw); i++ {
		if raw[i] != 0x0a {
			continue
		}
		if raw[i+1] == 0x0a {
			sepStart, sepEnd = i, i+2
			break
		}
		if raw[i+1] == 0x0d && i+2 < len(raw) && raw[i+2] == 0x0a {
			sepStart, sepEnd = i, i+3
			break
		}
	}
	if sepStart == -1 {
		return append([]byte(dateLine+"\r\n"), raw...)
	}
	headEnd := sepStart
	if headEnd > 0 && raw[headEnd-1] == 0x0d {
		headEnd--
	}
	if headEnd > 0 && raw[headEnd-1] == 0x0a {
		headEnd--
	}
	head := string(raw[:headEnd])
	lines := regexp.MustCompile(`\r\n|\r|\n`).Split(head, -1)
	idx := -1
	for i, l := range lines {
		if regexp.MustCompile(`(?i)^date:`).MatchString(l) {
			idx = i
			break
		}
	}
	if idx >= 0 {
		lines[idx] = dateLine
	} else {
		lines = append([]string{dateLine}, lines...)
	}
	newHead := append([]byte(strings.Join(lines, "\r\n")+"\r\n\r\n"), raw[sepEnd:]...)
	return newHead
}
