/**
 * Parse email string like "Name <email>" or "email" into { name, email }.
 * If no name, email is used as name. If name equals email, only name is set.
 */
export function formatEmail(raw: string): { name: string; email: string } {
    if (!raw) return { name: "", email: "" };

    let name = "";
    let email = "";

    // "Name <email@domain.com>"
    const angleMatch = raw.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
    if (angleMatch) {
        name = angleMatch[1].replace(/^"|"$/g, "").trim();
        email = angleMatch[2].trim();
    } else {
        // bare email
        const bareMatch = raw.match(/([\w.+-]+@[\w.-]+)/);
        if (bareMatch) {
            email = bareMatch[1].trim();
        } else {
            email = raw.trim();
        }
    }

    // No name → email becomes name
    if (!name) {
        name = email;
    }
    // Name equals email → keep only name (don't show email twice)
    if (name === email) {
        email = "";
    }

    return { name, email };
}

/** Human label for a safety block reason ("blacklist" | "sensitive_word"). */
export function blockLabel(blockedBy?: string): string {
    if (blockedBy === "blacklist") return "黑名单";
    if (blockedBy === "sensitive_word") return "敏感词";
    return "拦截";
}

/** Human label for a mail source ("maildir" | "api" | "imap" | "receive"). */
export function sourceLabel(source?: string): string {
    if (source === "api") return "API";
    if (source === "imap") return "IMAP";
    if (source === "receive") return "接口";
    return "收信";
}

/** "1523" → "1.5 KB" */
export function formatSize(bytes?: number): string {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
