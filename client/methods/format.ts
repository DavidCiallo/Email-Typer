export function formatEmail(email: string): { name: string; email: string } {
    const match = email.match(/^"?([^"]*)"?\s*<?([\w.+-]+@[\w.-]+)>?$/);
    if (match) {
        return { name: match[1].trim(), email: match[2].trim() };
    }
    return { name: "", email: email.trim() };
}
