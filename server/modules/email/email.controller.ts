import path from "path";
import {
    EmailListRequest,
    EmailDetailRequest,
    EmailSendRequest,
    EmailReceiveRequest,
    EmailScanRequest,
    EmailDeleteRequest,
    EmailRestoreRequest,
    EmailPushRequest,
    EmailAttachmentRequest,
} from "../../../shared/modules/email/email.interface";
import { emailRoutes } from "../../../shared/modules/email/email.router";
import { SettingsService } from "../settings/settings.service";
import { EmailService, sendEmail, maildirRoot } from "./email.service";
import { MailboxService } from "../mailbox/mailbox.service";
import { composeRawEmail, parseRawEmail, ComposeAttachment } from "../../lib/mime";
import { getDataDir } from "../../lib/repository";
import { getIdentifyByVerify } from "../auth/auth.service";

async function list(request: EmailListRequest) {
    request = EmailListRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const archived = request.archived === true;
    const where: Record<string, any> = archived
        ? { delete_time: { $ne: null } }
        : { delete_time: null };
    if (request.account_id) {
        where.account_id = request.account_id;
    }
    const q = (request.q || "").trim();
    if (q) {
        where.$or = [
            { from: { $contains: q } },
            { to: { $contains: q } },
            { subject: { $contains: q } },
        ];
    }
    // "Only intercepted" filter — never filters blocked=0 by default
    // so legacy rows without the flag stay visible in the inbox.
    if (request.blocked === true) {
        where.blocked = 1;
    }
    if (request.source) {
        where.source = request.source;
    }
    if (request.mailbox_id) {
        where.mailbox_id = request.mailbox_id;
    }

    const result = await EmailService.findList(where, {
        limit: request.limit,
        offset: request.offset,
        includeDeleted: archived,
    });
    const list = result.list.map(e => ({
        id: e.id,
        eid: e.eid,
        from: e.from,
        to: e.to,
        subject: e.subject,
        html: e.html,
        text: e.text,
        time: e.time,
        account_id: e.account_id,
        blocked: e.blocked || 0,
        blocked_by: e.blocked_by || "",
        block_rule: e.block_rule || "",
        message_id: e.message_id || "",
        source: e.source || "maildir",
        mailbox_id: e.mailbox_id || "",
        has_attachments: !!e.attachments?.some(a => !a.skipped),
        attachment_count: (e.attachments || []).filter(a => !a.skipped).length,
    }));

    // Distinct recipient accounts (for the filter dropdown)
    const accountSet = new Set<string>();
    await EmailService.findEachAccount((account: string) => accountSet.add(account));

    return { list, total: result.total, accounts: Array.from(accountSet).sort() };
}

async function detail(request: EmailDetailRequest) {
    request = EmailDetailRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const data = await EmailService.findById(request.id);
    if (!data) throw "Email not found";
    return data;
}

async function send(request: EmailSendRequest) {
    request = EmailSendRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const { from, to, subject, html } = request.email;

    // Validate from domain against allowed_from_domains
    const allowedFrom = SettingsService.get("allowed_from_domains");
    if (allowedFrom) {
        const domains = allowedFrom.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
        const fromDomain = from.split("@")[1]?.toLowerCase();
        if (!fromDomain || !domains.includes(fromDomain)) {
            throw `发件域名不允许，仅支持: ${allowedFrom}`;
        }
    }

    const result = await sendEmail({ from, to, subject, html });
    if (!result) throw "Failed to send email";
    return {};
}

async function receive(request: EmailReceiveRequest) {
    request = EmailReceiveRequest.self(request);

    // Auth via API key — either from request or env
    const req = request as any;
    const apiKey = req.auth || req.__headers?.["x-api-key"] || "";
    const expectedKey = process.env.EMAIL_RECEIVE_API_KEY || "";
    if (!expectedKey || apiKey !== expectedKey) throw "Unauthorized";

    const raw = req.raw || req.__raw_body || "";
    const email = await EmailService.receiveEmail(raw);
    if (!email) {
        // duplicate delivery — report the already-stored copy idempotently
        const parsed = parseRawEmail(raw);
        const existing = parsed?.message_id ? await EmailService.findByMessageId(parsed.message_id) : null;
        if (!existing) throw "Failed to parse email";
        return { id: existing.id };
    }
    return { id: email.id };
}

/**
 * Push a structured email through a mailbox's API key.
 * The message is composed into a valid RFC 5322 mail, archived into the
 * maildir (tmp → new rename) and then ingested through the shared pipeline.
 */
async function push(request: EmailPushRequest) {
    request = EmailPushRequest.self(request);
    const req = request as any;
    const apiKey = req.__headers?.["x-api-key"] || req.auth || "";

    let to = (request.to || "").trim();
    let mailbox = await MailboxService.findByApiKey(apiKey);
    if (mailbox) {
        // the mailbox owns the address — ignore any client-supplied `to`
        to = mailbox.address;
    } else {
        const masterKey = process.env.EMAIL_RECEIVE_API_KEY || "";
        if (!masterKey || apiKey !== masterKey) throw "Unauthorized";
        if (!to) throw "Missing `to` address";
        mailbox = null;
    }

    const subject = request.subject || "";
    const html = request.html || "";
    const text = request.text || "";
    if (!subject && !html && !text) throw "Subject or body is required";

    const from = request.from || `push@${to.split("@")[1] || "cfrs.local"}`;
    const attachments: ComposeAttachment[] = (request.attachments || []).slice(0, 50).map((a, i) => ({
        filename: (a.filename || `attachment_${i + 1}`).slice(0, 200),
        contentType: a.contentType,
        content: Buffer.from((a.base64 || "").replace(/\s/g, ""), "base64"),
    })).filter(a => a.content.length > 0);

    const raw = composeRawEmail({
        from,
        to,
        subject,
        html: html || undefined,
        text: text || undefined,
        attachments: attachments.length ? attachments : undefined,
        headers: {
            "X-CFRS-Source": "api",
            ...(mailbox ? { "X-CFRS-Mailbox": mailbox.id } : {}),
        },
        messageId: request.message_id,
    });

    const stored = await EmailService.ingestRaw(raw, {
        source: "api",
        mailboxId: mailbox?.id,
        // archive under a synthetic folder — API mail must not create domain
        // folders that would pollute the receiving-domain discovery
        folder: `_api_${(to.split("@")[1] || "local").toLowerCase()}`,
    });
    if (!stored) {
        // duplicate (same message_id already ingested) — report it idempotently
        const existing = request.message_id ? await EmailService.findByMessageId(request.message_id) : null;
        if (!existing) throw "Failed to ingest pushed email";
        return { id: existing.id, message_id: existing.message_id };
    }
    return { id: stored.id, message_id: stored.message_id };
}

/**
 * Download one attachment. Responds with the raw file (mounted as a Response).
 */
async function attachment(request: EmailAttachmentRequest) {
    request = EmailAttachmentRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const data = await EmailService.findById(request.id);
    if (!data) throw "Email not found";
    const meta = (data.attachments || [])[request.index];
    if (!meta) throw "Attachment not found";
    if (meta.skipped || !meta.path) throw "Attachment was not stored (size limit exceeded)";

    const filePath = path.join(getDataDir(), "attachments", String(data.eid), meta.path);
    // @ts-ignore Bun global
    const file = Bun.file(filePath);
    if (!(await file.exists())) throw "Attachment file missing";

    const encoded = encodeURIComponent(meta.filename);
    const fallback = meta.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    return new Response(file, {
        headers: {
            "Content-Type": meta.contentType || "application/octet-stream",
            "Content-Length": String(meta.size),
            "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
            "Access-Control-Allow-Origin": "*",
        },
    });
}

async function scan(request: EmailScanRequest) {
    request = EmailScanRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const maildirPath = request.path || maildirRoot();
    const result = await EmailService.scanDirectory(maildirPath);
    return result;
}

async function deleteEmail(request: EmailDeleteRequest) {
    request = EmailDeleteRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";
    const result = await EmailService.delete(request.id);
    if (!result) throw "Email not found";
    return {};
}

async function restore(request: EmailRestoreRequest) {
    request = EmailRestoreRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";
    const result = await EmailService.restore(request.id);
    if (!result) throw "Email not found";
    return {};
}

export const emailMount = {
    routes: emailRoutes,
    handlers: { list, detail, send, receive, scan, delete: deleteEmail, restore, push, attachment },
};
