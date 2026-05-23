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
        const list = await emailRepository.find(where, config);
        const total = await emailRepository.count(where);
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
            raw_path: "",
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
     * Parse an email file from disk and store it in the repository.
     * Simple MIME parser — extracts headers and body.
     */
    static async importFromFile(filePath: string): Promise<EmailEntity | null> {
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const parsed = EmailService.parseRawEmail(content);
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
                raw_path: filePath,
            };

            return await emailRepository.insert(email);
        } catch (e) {
            console.error("Failed to import email from file:", filePath, e);
            return null;
        }
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

            const from = headers["from"] || "";
            const to = headers["to"] || "";
            const subject = headers["subject"] || "";
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
                    if (part.includes("Content-Type: text/plain")) {
                        const partBody = part.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
                        text = partBody;
                    } else if (part.includes("Content-Type: text/html")) {
                        const partBody = part.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
                        html = partBody;
                    }
                }

                return { from, to, subject, text, html, time, account_id };
            } else {
                // Single part — check if it's base64 encoded
                const encoding = headers["content-transfer-encoding"] || "";
                let body = bodySection;
                if (encoding.toLowerCase() === "base64") {
                    try {
                        body = Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf-8");
                    } catch { /* ignore */ }
                }

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

// ========== Maildir Watcher ==========

let watcher: chokidar.FSWatcher | null = null;

export function startEmailWatcher(maildirPath: string): void {
    if (watcher) return;

    const watchPath = path.join(maildirPath, "new");

    if (!fs.existsSync(watchPath)) {
        console.warn(`Maildir 'new' directory not found: ${watchPath}`);
        return;
    }

    watcher = chokidar.watch(watchPath, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
    });

    watcher.on("add", async (filePath: string) => {
        console.log(`[EmailWatcher] New email detected: ${filePath}`);
        try {
            const email = await EmailService.importFromFile(filePath);
            if (email) {
                console.log(`[EmailWatcher] Email stored: ${email.id}`);
                // TODO: trigger forwarding strategies here
            }
        } catch (e) {
            console.error("[EmailWatcher] Failed to process email:", e);
        }
    });

    watcher.on("error", (error: any) => {
        console.error("[EmailWatcher] Error:", error);
    });

    console.log(`[EmailWatcher] Watching: ${watchPath}`);
}

export function stopEmailWatcher(): void {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
}
