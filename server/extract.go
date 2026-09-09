package main

import (
	"regexp"
	"strings"
)

// Port of shared/lib/extract.ts — verification-code + link flags recorded at ingest.

var (
	codeRe     = regexp.MustCompile(`\d{6}`)
	linkRe     = regexp.MustCompile(`(?i)https?://[^\s<>"'）)\]]+`)
	codeHintRe = regexp.MustCompile(`(验证码|校验码|动态码|动态密码|认证码|短信码|验证代码)|(\b(verification|verify|verified|code|otp|one[ -]?time|passcode|pass[ -]?code|security|pin|confirm)\b)`)
)

func stripHtmlTags(html string) string {
	s := regexp.MustCompile(`(?is)<style[\s\S]*?</style>`).ReplaceAllString(html, " ")
	s = regexp.MustCompile(`(?is)<script[\s\S]*?</script>`).ReplaceAllString(s, " ")
	s = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(s, " ")
	return strings.ReplaceAll(s, "&nbsp;", " ")
}

func plainSource(text, html string) string {
	src := text + "\n" + stripHtmlTags(html)
	return regexp.MustCompile(`\s+`).ReplaceAllString(src, " ")
}

func extractCodes(text, html string) []string {
	plain := plainSource(text, html)
	if strings.TrimSpace(plain) == "" {
		return []string{}
	}
	seen := map[string]bool{}
	out := []string{}
	for _, loc := range codeRe.FindAllStringIndex(plain, -1) {
		start := loc[0] - 32
		if start < 0 {
			start = 0
		}
		end := loc[1] + 32
		if end > len(plain) {
			end = len(plain)
		}
		if !codeHintRe.MatchString(plain[start:end]) {
			continue
		}
		code := plain[loc[0]:loc[1]]
		if !seen[code] {
			seen[code] = true
			out = append(out, code)
		}
		if len(out) >= 3 {
			break
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}

func extractLinks(text, html string) []string {
	source := text + "\n" + html
	if strings.TrimSpace(source) == "" {
		return []string{}
	}
	seen := map[string]bool{}
	out := []string{}
	for _, m := range linkRe.FindAllString(source, -1) {
		m = strings.TrimRight(m, ".,;:!?")
		if !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	if len(out) > 10 {
		out = out[:10]
	}
	if out == nil {
		out = []string{}
	}
	return out
}
