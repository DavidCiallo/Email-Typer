import Repository from "../../lib/repository";
import { EmailEntity } from "../../../shared/modules/email/email.entity";
import { SettingsService } from "../settings/settings.service";
import { nanoid } from "nanoid";
import chokidar from "chokidar";
import path from "path";
import fs from "fs";

const emailRepository: Repository<EmailEntity> = Repository.instance("Email");
const RESEND_API_URL = "https://api.resend.com/emails";

// ========== Resend API (sending) ==========

interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
    const api_key = SettingsService.get("resend_api_key");
    if (!api_key) {
        console.error("RESEND_API_KEY is not configured");
        return false;
    }

    const from = SettingsService.get("email_from") || "noreply@cfrs.dev";

    try {
        const response = await fetch(RESEND_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${api_key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ from, to, subject, html }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error("Resend API error:", response.status, error);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Failed to send email:", error);
        return false;
    }
}

export function buildVerificationEmail(verifyUrl: string): { subject: string; html: string } {
    const subject = "Verify your email address";
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <h2 style="color: #1a1a1a; margin-bottom: 16px;">Verify Your Email</h2>
            <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
                Thank you for registering. Please click the button below to verify your email address.
            </p>
            <a href="${verifyUrl}"
               style="display: inline-block; background-color: #0066FF; color: #fff; text-decoration: none;
                      padding: 12px 32px; border-radius: 8px; font-weight: 600;">
                Verify Email
            </a>
            <p style="color: #999; font-size: 13px; margin-top: 32px;">
                If you did not create an account, you can safely ignore this email.
                This link expires in 3 days.
            </p>
        </div>
    `;
    return { subject, html };
}

// ========== Email Storage ==========

export class EmailService {
    static async findList(where?: Partial<EmailEntity>, config?: { limit?: number; offset?: number }): Promise<{ list: EmailEntity[]; total: number }> {
        const all = await emailRepository.find(where);
        all.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
        const total = all.length;
        const { limit, offset = 0 } = config ?? {};
        const list = limit !== undefined ? all.slice(offset, offset + limit) : all;
        return { list, total };
    }

    static async findById(id: string): Promise<EmailEntity | null> {
        return await emailRepository.findOne({ id });
    }

    static async insert(email: Partial<EmailEntity>): Promise<EmailEntity> {
        return await emailRepository.insert(email);
    }

    static async delete(id: string): Promise<boolean> {
        return await emailRepository.delete({ id } as any);
    }

    static async restore(id: string): Promise<boolean> {
        return await emailRepository.atomicPatch({ id } as any, () => ({ delete_time: null }), true);
    }

    /**
     * Receive raw email string, parse and store it in the repository.
     * Used by the /api/email/receive endpoint (called by external MTA).
     */
    static async receiveEmail(raw: string): Promise<EmailEntity | null> {
        const parsed = EmailService.parseRawEmail(raw);
        if (!parsed) return null;

        const email: Partial<EmailEntity> = {
            eid: nanoid(12),
            from: parsed.from || "",
            to: parsed.to || "",
            subject: parsed.subject || "",
            html: parsed.html || "",
            text: parsed.text || "",
            time: parsed.time || Date.now(),
            account_id: parsed.account_id || "",
        };

        const stored = await emailRepository.insert(email);

        // Trigger forwarding strategies
        const { StrategyService } = await import("../strategy/strategy.service");
        StrategyService.matchAndForward(stored).catch(e => {
            console.error("[EmailService] Strategy forward failed:", e);
        });

        return stored;
    }

    /**
     * Dedup signature: from + to + subject + time uniquely identifies an email.
     */
    private static dedupKey(e: { from?: string; to?: string; subject?: string; time?: number }): string {
        return `${e.from || ""}|${e.to || ""}|${e.subject || ""}|${e.time || 0}`;
    }

    /**
     * Scan a directory recursively for Maildir files and import any that don't already exist.
     * Supports both standard Maildir structure (domain/new/filename) and plain .eml files.
     * Deduplication: uses from+to+subject+time fingerprint (include soft-deleted to prevent re-import).
     * Returns { scanned, imported } counts.
     */
    static async scanDirectory(dirPath: string): Promise<{ scanned: number; imported: number }> {
        if (!fs.existsSync(dirPath)) {
            throw `Directory not found: ${dirPath}`;
        }

        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) {
            throw `Path is not a directory: ${dirPath}`;
        }

        // Build set of known dedup keys (include soft-deleted)
        const existingKeys = new Set<string>();
        const allEmails = await emailRepository.findAllIgnoreDelete();
        for (const e of allEmails) {
            existingKeys.add(EmailService.dedupKey(e));
        }

        // Recursively collect all regular files, skip dotfiles
        const mailFiles: string[] = [];
        function walk(dir: string) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.name.startsWith(".")) continue;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                } else if (entry.isFile()) {
                    mailFiles.push(full);
                }
            }
        }
        walk(dirPath);

        let imported = 0;

        for (const fullPath of mailFiles) {
            try {
                const content = fs.readFileSync(fullPath, "utf-8");
                const parsed = EmailService.parseRawEmail(content);
                if (!parsed) continue;

                // Skip if a matching email already exists
                if (existingKeys.has(EmailService.dedupKey(parsed))) {
                    continue;
                }

                const email: Partial<EmailEntity> = {
                    eid: nanoid(12),
                    from: parsed.from || "",
                    to: parsed.to || "",
                    subject: parsed.subject || "",
                    html: parsed.html || "",
                    text: parsed.text || "",
                    time: parsed.time || Date.now(),
                    account_id: parsed.account_id || "",
                };

                await emailRepository.insert(email);
                existingKeys.add(EmailService.dedupKey(email));
                imported++;

                const { StrategyService } = await import("../strategy/strategy.service");
                StrategyService.matchAndForward(email as any).catch(e => {
                    console.error("[EmailService] Strategy forward failed:", e);
                });
            } catch (e) {
                console.error("[EmailService] Failed to import:", fullPath, e);
            }
        }

        return { scanned: mailFiles.length, imported };
    }

    /**
     * Parse an email file from disk and store it in the repository.
     * Simple MIME parser — extracts headers and body.
     */
    static async importFromFile(filePath: string): Promise<EmailEntity | null> {
        const resolvedPath = path.resolve(filePath);

        try {
            const content = fs.readFileSync(resolvedPath, "utf-8");
            const parsed = EmailService.parseRawEmail(content);
            if (!parsed) return null;

            // Dedup by content fingerprint (from+to+subject+time), even if soft-deleted
            const dedupKey = EmailService.dedupKey(parsed);
            const allEmails = await emailRepository.findAllIgnoreDelete();
            if (allEmails.some(e => EmailService.dedupKey(e) === dedupKey)) return null;

            const email: Partial<EmailEntity> = {
                eid: nanoid(12),
                from: parsed.from || "",
                to: parsed.to || "",
                subject: parsed.subject || "",
                html: parsed.html || "",
                text: parsed.text || "",
                time: parsed.time || Date.now(),
                account_id: parsed.account_id || "",
            };

            return await emailRepository.insert(email);
        } catch (e) {
            console.error("Failed to import email from file:", filePath, e);
            return null;
        }
    }

    /**
     * Decode RFC 2047 MIME encoded-words like =?UTF-8?B?base64?= or =?UTF-8?Q?quoted-printable?=
     */
    private static decodeMimeHeader(value: string): string {
        return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_match, _charset: string, encoding: string, data: string) => {
            try {
                if (encoding.toUpperCase() === "B") {
                    return Buffer.from(data, "base64").toString("utf-8");
                } else if (encoding.toUpperCase() === "Q") {
                    // Decode via bytes to handle multi-byte UTF-8 sequences properly
                    const bytes: number[] = [];
                    const src = data.replace(/_/g, " ");
                    let i = 0;
                    while (i < src.length) {
                        if (src[i] === "=" && i + 2 < src.length) {
                            bytes.push(parseInt(src.substring(i + 1, i + 3), 16));
                            i += 3;
                        } else {
                            bytes.push(src.charCodeAt(i));
                            i++;
                        }
                    }
                    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
                }
            } catch { /* use raw if decode fails */ }
            return data;
        });
    }

    /**
     * Decode a body part according to Content-Transfer-Encoding.
     */
    private static decodeBody(body: string, encoding: string): string {
        const enc = encoding.toLowerCase();
        if (enc === "base64") {
            try {
                return Buffer.from(body.replace(/[\s\n\r]/g, ""), "base64").toString("utf-8");
            } catch { /* fall through */ }
        } else if (enc === "quoted-printable") {
            // Decode via bytes to properly handle multi-byte UTF-8 sequences like =E9=AA=8C
            const bytes: number[] = [];
            const src = body.replace(/=\r?\n/g, "");      // soft line breaks
            let i = 0;
            while (i < src.length) {
                if (src[i] === "=" && i + 2 < src.length) {
                    bytes.push(parseInt(src.substring(i + 1, i + 3), 16));
                    i += 3;
                } else {
                    bytes.push(src.charCodeAt(i));
                    i++;
                }
            }
            return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
        }
        return body;
    }

    /**
     * Simple email parser. Extracts headers and separates text/html parts.
     */
    private static parseRawEmail(raw: string): { from?: string; to?: string; subject?: string; text?: string; html?: string; time?: number; account_id?: string } | null {
        try {
            const headerEnd = raw.indexOf("\r\n\r\n") !== -1 ? raw.indexOf("\r\n\r\n") : raw.indexOf("\n\n");
            if (headerEnd === -1) return null;

            const headerSection = raw.substring(0, headerEnd);
            const bodySection = raw.substring(headerEnd + (raw.indexOf("\r\n\r\n") !== -1 ? 4 : 2));

            const headers: Record<string, string> = {};
            const headerLines = headerSection.split(/\r?\n/);
            let currentKey = "";
            for (const line of headerLines) {
                if (/^\s/.test(line) && currentKey) {
                    headers[currentKey] += " " + line.trim();
                } else {
                    const colonIdx = line.indexOf(":");
                    if (colonIdx > 0) {
                        currentKey = line.substring(0, colonIdx).toLowerCase();
                        headers[currentKey] = line.substring(colonIdx + 1).trim();
                    }
                }
            }

            const from = EmailService.decodeMimeHeader(headers["from"] || "");
            const to = EmailService.decodeMimeHeader(headers["to"] || "");
            const subject = EmailService.decodeMimeHeader(headers["subject"] || "");
            const dateStr = headers["date"] || "";
            const time = dateStr ? new Date(dateStr).getTime() : Date.now();

            // Try to find recipient as account_id
            let account_id = "";
            const toMatch = to.match(/[\w.-]+@[\w.-]+/);
            if (toMatch) {
                account_id = toMatch[0].split("@")[0];
            }

            // Parse body — check for multipart boundaries
            const contentType = headers["content-type"] || "";
            const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);

            if (boundaryMatch) {
                const boundary = boundaryMatch[1];
                const parts = bodySection.split("--" + boundary);
                let text = "";
                let html = "";

                for (const part of parts) {
                    // Extract part headers for transfer encoding
                    const partHeaders: Record<string, string> = {};
                    const partHeaderMatch = part.match(/([\s\S]*?)\r?\n\r?\n/);
                    if (partHeaderMatch) {
                        for (const line of partHeaderMatch[1].split(/\r?\n/)) {
                            const ci = line.indexOf(":");
                            if (ci > 0) {
                                partHeaders[line.substring(0, ci).toLowerCase()] = line.substring(ci + 1).trim();
                            }
                        }
                    }
                    const partEncoding = partHeaders["content-transfer-encoding"] || "";

                    if (partHeaders["content-type"]?.includes("text/plain")) {
                        const partBody = part.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
                        text = EmailService.decodeBody(partBody, partEncoding);
                    } else if (partHeaders["content-type"]?.includes("text/html")) {
                        const partBody = part.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
                        html = EmailService.decodeBody(partBody, partEncoding);
                    }
                }

                return { from, to, subject, text, html, time, account_id };
            } else {
                // Single part
                const encoding = headers["content-transfer-encoding"] || "";
                const body = EmailService.decodeBody(bodySection, encoding);

                if (contentType.includes("text/html")) {
                    return { from, to, subject, html: body, text: body.replace(/<[^>]+>/g, ""), time, account_id };
                } else {
                    return { from, to, subject, text: body, html: "", time, account_id };
                }
            }
        } catch {
            return null;
        }
    }
}

let watcher: ReturnType<typeof chokidar.watch> | null = null;

export function startEmailWatcher(maildirPath: string): void {
    if (watcher) return;

    if (!fs.existsSync(maildirPath)) {
        console.warn(`Maildir path not found: ${maildirPath}`);
        return;
    }

    // Watch the entire maildir directory (the ** /new glob pattern doesn't work on Windows).
    // Filter for files inside */new/ subdirectories in the "add" handler.
    watcher = chokidar.watch(maildirPath, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: false,
        depth: 5,
    });

    watcher.on("add", async (filePath: string) => {
        const basename = path.basename(filePath);
        if (basename.startsWith(".")) return;

        // Only process files inside a */new/ subdirectory
        const normalized = filePath.replace(/\\/g, "/");
        if (!normalized.includes("/new/")) return;

        try {
            const email = await EmailService.importFromFile(filePath);
            if (email) {
                const { StrategyService } = await import("../strategy/strategy.service");
                StrategyService.matchAndForward(email).catch(e => {
                    console.error("[EmailWatcher] Strategy forward failed:", e);
                });
            }
        } catch (e) {
            console.error("[EmailWatcher] Failed to process email:", e);
        }
    });

    watcher.on("error", (error: any) => {
        console.error("[EmailWatcher] Error:", error);
    });

    console.log(`[EmailWatcher] Watching recursively under: ${maildirPath}`);
}

export function stopEmailWatcher(): void {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
}
