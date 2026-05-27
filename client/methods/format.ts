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
