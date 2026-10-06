const CODE_RE = /\d{6}/g;
const LINK_RE = /https?:\/\/[^\s<>"'）)\]]+/gi;

// A 6-digit number only counts as a code when a keyword appears within ±32
// characters of it — order ids and prices are 6 digits too.
const CODE_HINT_RE =
    /(验证码|校验码|动态码|动态密码|认证码|短信码|验证代码)|(\b(verification|verify|verified|code|otp|one[ -]?time|passcode|pass[ -]?code|security|pin|confirm)\b)/i;

function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ");
}

function plainSource(text?: string, html?: string): string {
    return `${text || ""}\n${stripHtml(html || "")}`.replace(/\s+/g, " ");
}

export function extractCodes(text?: string, html?: string): string[] {
    const plain = plainSource(text, html);
    if (!plain.trim()) return [];
    const out: string[] = [];
    for (const m of plain.matchAll(CODE_RE)) {
        const at = m.index ?? 0;
        const window = plain.slice(Math.max(0, at - 32), Math.min(plain.length, at + m[0].length + 32));
        if (!CODE_HINT_RE.test(window)) continue;
        out.push(m[0]);
        if (out.length >= 3) break;
    }
    return Array.from(new Set(out));
}

/** http(s) URLs found in the body, capped. */
export function extractLinks(text?: string, html?: string): string[] {
    const source = `${text || ""}\n${html || ""}`;
    if (!source.trim()) return [];
    const matches = source.match(LINK_RE) || [];
    const normalized = matches.map((u) => u.replace(/[.,;:!?]+$/, ""));
    return Array.from(new Set(normalized)).slice(0, 10);
}
