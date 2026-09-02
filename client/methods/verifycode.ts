/**
 * Extract verification codes from email body text.
 * Mirrors the detection used in the email detail modal.
 */
const CODE_RE = /\d{6}/g;

export function extractCodes(text?: string, html?: string): string[] {
    const source = `${text || ""}\n${html || ""}`;
    if (!source.trim()) return [];
    return Array.from(new Set(source.match(CODE_RE) || [])).slice(0, 3);
}
