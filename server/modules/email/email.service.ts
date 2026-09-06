import Repository, { getDataDir } from "../../lib/repository";
import { EmailEntity, AttachmentMeta } from "../../../shared/modules/email/email.entity";
import { MailboxEntity } from "../../../shared/modules/mailbox/mailbox.entity";
import { SettingsService } from "../settings/settings.service";
import { SafetyService } from "../safety/safety.service";
import { broadcastWsMessage } from "../../lib/mount";
import { parseRawEmail, stampHeadersBuffer } from "../../lib/mime";
import { deliverToMaildir } from "../../lib/maildir";
import { nanoid } from "nanoid";
import chokidar from "chokidar";
import path from "path";
import fs from "fs";

const emailRepository: Repository<EmailEntity> = Repository.instance("Email");
const mailboxRepository: Repository<MailboxEntity> = Repository.instance("Mailbox");
const RESEND_API_URL = "https://api.resend.com/emails";

const DEFAULT_ATTACHMENT_LIMIT = 10 * 1024 * 1024; // 10MB per attachment

export function maildirRoot(): string {
    return process.env.MAILDIR_PATH || "./eml";
}

function attachmentLimit(): number {
    const raw = Number(SettingsService.get("attachment_max_size"));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ATTACHMENT_LIMIT;
}

interface SendEmailParams {
    from: string;
    to: string;
    subject: string;
    html: string;
    /** optional Reply-To header — used by strategy forwards so replies reach the original sender */
    replyTo?: string;
    /** optional extra custom headers (e.g. the forward loop-guard stamp) */
    headers?: Record<string, string>;
}

export async function sendEmail({ from, to, subject, html, replyTo, headers }: SendEmailParams): Promise<boolean> {
    // Match API key by from domain: "resend_api_keys" stores "domain1:key1,domain2:key2"
    let api_key = SettingsService.get("resend_api_key");
    const keyMap = SettingsService.get("resend_api_keys");
    if (keyMap) {
        const fromDomain = from.split("@")[1]?.toLowerCase();
        for (const pair of keyMap.split(",")) {
            const [domain, key] = pair.split(":").map(s => s.trim());
            if (domain && key && domain.toLowerCase() === fromDomain) {
                api_key = key;
                break;
            }
        }
    }
    if (!api_key) {
        console.error("RESEND_API_KEY is not configured for domain in:", from);
        return false;
    }

    try {
        const response = await fetch(RESEND_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${api_key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from, to, subject, html,
                ...(replyTo ? { reply_to: replyTo } : {}),
                ...(headers && Object.keys(headers).length ? { headers } : {}),
            }),
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

/** Push a "new email arrived" notification to all connected dashboard clients. */
function notifyNewEmail(email: Partial<EmailEntity>): void {
    try {
        broadcastWsMessage({
            name: "email:new",
            data: {
                id: email.id,
                from: email.from,
                to: email.to,
                subject: email.subject,
                time: email.time,
                account_id: email.account_id,
                source: email.source,
            },
        });
    } catch (e) {
        console.error("[EmailService] Broadcast failed:", e);
    }
}

export class EmailService {
    /** Serializes ingests — a watcher event and a direct ingest of the same
     *  file must never pass the dedup check concurrently. */
    private static ingestChain: Promise<any> = Promise.resolve();

    static async findList(where?: Partial<EmailEntity>, config?: { limit?: number; offset?: number; includeDeleted?: boolean }): Promise<{ list: EmailEntity[]; total: number }> {
        const { limit, offset = 0, includeDeleted = false } = config ?? {};
        const total = await emailRepository.count(where, undefined, includeDeleted);
        const list = await emailRepository.find(where, { limit, offset, includeDeleted });
        return { list, total };
    }

    /** Stream distinct recipient accounts (non-deleted emails) for filter dropdowns. */
    static async findEachAccount(callback: (account: string) => void): Promise<void> {
        await emailRepository.findEach((e) => {
            if (e.account_id) callback(e.account_id);
        });
    }

    /** Stream every non-deleted email (lightweight aggregation use-cases). */
    static async findEachEmail(callback: (email: EmailEntity) => void): Promise<void> {
        await emailRepository.findEach((e) => callback(e));
    }

    static async findById(id: string): Promise<EmailEntity | null> {
        return await emailRepository.findOne({ id });
    }

    static async findByMessageId(messageId: string): Promise<EmailEntity | null> {
        if (!messageId) return null;
        return await emailRepository.findFirst({ message_id: messageId } as any, true);
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
     * Post-storage pipeline shared by all ingest paths:
     * forward only clean mail, then broadcast to dashboard clients.
     */
    private static async finalizeIngest(stored: EmailEntity, blocked: boolean): Promise<void> {
        if (!blocked && await EmailService.shouldForward(stored)) {
            const { StrategyService } = await import("../strategy/strategy.service");
            StrategyService.matchAndForward(stored).catch(e => {
                console.error("[EmailService] Strategy forward failed:", e);
            });
        }
        notifyNewEmail(stored);
    }

    /**
     * Forwarding policy: mail that arrived on our own domains (maildir /
     * receive) is always eligible; imported mail (api / imap) only when its
     * mailbox opted in via forward_enabled — private mail pushed in from an
     * external provider must not leak out through Resend by accident.
     */
    private static async shouldForward(stored: EmailEntity): Promise<boolean> {
        if (stored.source === "api" || stored.source === "imap") {
            if (!stored.mailbox_id) return false;
            const box = await mailboxRepository.findOne({ id: stored.mailbox_id } as any);
            return !!box && box.forward_enabled === 1;
        }
        return true;
    }

    /**
     * Check whether an identical email was already ingested.
     * Message-ID wins when present (stable across IMAP/API/receive paths);
     * otherwise fall back to the content fingerprint (from+to+subject+time).
     * Includes soft-deleted rows so re-importing an archived mail never
     * duplicates it.
     */
    private static async dedupExists(parsed: { message_id?: string; from?: string; to?: string; subject?: string; time?: number }): Promise<boolean> {
        if (parsed.message_id) {
            const byId = await emailRepository.findFirst({ message_id: parsed.message_id } as any, true);
            if (byId) return true;
        }
        const existing = await emailRepository.findFirst(
            { from: parsed.from || "", to: parsed.to || "", subject: parsed.subject || "", time: parsed.time as any } as any,
            true,
        );
        return existing !== null;
    }

    /** Persist extracted attachments under DATA_DIR/attachments/<eid>/ and build metadata. */
    private static storeAttachments(eid: string, attachments: { filename: string; contentType: string; size: number; cid: string; inline: boolean; content: Buffer }[] | null): AttachmentMeta[] | null {
        if (!attachments || attachments.length === 0) return null;
        const limit = attachmentLimit();
        const dir = path.join(getDataDir(), "attachments", eid);
        const metas: AttachmentMeta[] = [];

        attachments.forEach((att, i) => {
            if (att.size > limit) {
                metas.push({ filename: att.filename, contentType: att.contentType, size: att.size, cid: att.cid, inline: att.inline, path: "", skipped: true });
                return;
            }
            const safeName = `${i}_${(att.filename || "attachment").replace(/[\\/:*?"<>|\r\n\0]/g, "_")}`.slice(0, 180);
            try {
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, safeName), att.content);
                metas.push({ filename: att.filename, contentType: att.contentType, size: att.size, cid: att.cid, inline: att.inline, path: safeName, skipped: false });
            } catch (e) {
                console.error("[EmailService] Failed to store attachment:", att.filename, e);
                metas.push({ filename: att.filename, contentType: att.contentType, size: att.size, cid: att.cid, inline: att.inline, path: "", skipped: true });
            }
        });

        return metas.length ? metas : null;
    }

    /**
     * Core ingest: parse a raw email buffer, dedup, evaluate safety rules,
     * store attachments, insert the row, then forward + broadcast.
     * Every source (maildir watcher, HTTP receive, push API, IMAP sync) funnels
     * here. Ingests are serialized so concurrent discoveries of the same file
     * (watcher + direct call) cannot slip past the dedup check.
     * Returns null when the mail is a duplicate or unparseable.
     */
    static ingestBuffer(raw: Uint8Array): Promise<EmailEntity | null> {
        const run = EmailService.ingestChain.then(() => EmailService.ingestBufferInner(raw));
        EmailService.ingestChain = run.catch(() => null);
        return run;
    }

    private static async ingestBufferInner(raw: Uint8Array): Promise<EmailEntity | null> {
        const parsed = parseRawEmail(raw);
        if (!parsed) return null;

        if (await EmailService.dedupExists(parsed)) return null;

        // Evaluate safety rules first — blocked mail is stored but never forwarded
        const verdict = await SafetyService.evaluate(
            parsed.from || "",
            parsed.subject || "",
            parsed.html || "",
            parsed.text || "",
        );
        if (verdict.blocked) {
            console.log(`[Safety] Blocked email from "${parsed.from}" subject "${parsed.subject}" (${verdict.blockedBy}: ${verdict.rule})`);
        }

        const eid = nanoid(12);
        const metas = EmailService.storeAttachments(eid, parsed.attachments);

        const email: Partial<EmailEntity> = {
            eid,
            from: parsed.from || "",
            to: parsed.to || "",
            subject: parsed.subject || "",
            html: parsed.html || "",
            text: parsed.text || "",
            time: parsed.time || Date.now(),
            account_id: parsed.account_id || "",
            message_id: parsed.message_id || "",
            source: parsed.source || "maildir",
            mailbox_id: parsed.mailbox_id || "",
            attachments: metas,
            blocked: verdict.blocked ? 1 : 0,
            blocked_by: verdict.blockedBy,
            block_rule: verdict.rule,
        };

        const stored = await emailRepository.insert(email);

        // A copy of our own forward that re-entered the system (remote
        // auto-forwarders, scrapers pushing back over the API): store it but
        // never forward again. The stamped header is authoritative; the
        // byline is the fallback for copies that lost their headers.
        const forwardedCopy = parsed.forwarded
            || (parsed.html || "").slice(0, 300).includes("原发件人：")
            || (parsed.text || "").startsWith("原发件人：");
        await EmailService.finalizeIngest(stored, verdict.blocked || forwardedCopy);

        return stored;
    }

    /** Ingest an email file from disk (watcher, IMAP sync, batch import). */
    static async ingestFile(filePath: string): Promise<EmailEntity | null> {
        const resolvedPath = path.resolve(filePath);
        try {
            const content = fs.readFileSync(resolvedPath);
            return await EmailService.ingestBuffer(content);
        } catch (e) {
            console.error("[EmailService] Failed to ingest email file:", filePath, e);
            return null;
        }
    }

    /**
     * Ingest a raw email delivered over HTTP: archive it as a maildir file
     * (file is the source of truth — re-scans keep working, attachments stay
     * re-extractable), then run the shared file ingest. The watcher may pick up
     * the same file afterwards; dedup makes that pass a no-op.
     * Source metadata is stamped into the archived file so re-scans reproduce
     * the provenance.
     */
    static async ingestRaw(raw: string | Uint8Array, options?: {
        source?: string;
        mailboxId?: string;
        folder?: string;
        /** extra headers stamped into the archived file (override source/mailbox) */
        headers?: Record<string, string>;
    }): Promise<EmailEntity | null> {
        const extra: Record<string, string> = {};
        if (options?.source) extra["X-CFRS-Source"] = options.source;
        if (options?.mailboxId) extra["X-CFRS-Mailbox"] = options.mailboxId;
        Object.assign(extra, options?.headers || {});

        const stamped = stampHeadersBuffer(typeof raw === "string" ? Buffer.from(raw, "utf-8") : raw, extra);
        const folder = options?.folder || "_receive";
        const filePath = deliverToMaildir(maildirRoot(), folder, stamped);
        return await EmailService.ingestFile(filePath);
    }

    /** Legacy entry point for the /api/email/receive endpoint. */
    static async receiveEmail(raw: string): Promise<EmailEntity | null> {
        return await EmailService.ingestRaw(raw, { source: "receive", folder: "_receive" });
    }

    /** Scan a directory recursively for Maildir files and import any that don't already exist. */
    static async scanDirectory(dirPath: string): Promise<{ scanned: number; imported: number }> {
        if (!fs.existsSync(dirPath)) {
            throw `Directory not found: ${dirPath}`;
        }

        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) {
            throw `Path is not a directory: ${dirPath}`;
        }

        let scanned = 0;
        let imported = 0;

        for (const fullPath of EmailService.walkFiles(dirPath)) {
            scanned++;
            try {
                const stored = await EmailService.ingestFile(fullPath);
                if (stored) imported++;
            } catch (e) {
                console.error("[EmailService] Failed to import:", fullPath, e);
            }
        }

        return { scanned, imported };
    }

    /** Recursively yield all regular files in a directory, skipping dotfiles */
    private static *walkFiles(dir: string): Generator<string, void, void> {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".")) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                yield* EmailService.walkFiles(full);
            } else if (entry.isFile()) {
                yield full;
            }
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
            await EmailService.ingestFile(filePath);
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
