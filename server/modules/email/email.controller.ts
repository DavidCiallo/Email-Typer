import {
    EmailListRequest,
    EmailDetailRequest,
    EmailSendRequest,
    EmailReceiveRequest,
    EmailScanRequest,
    EmailDeleteRequest,
    EmailRestoreRequest,
} from "../../../shared/modules/email/email.interface";
import { emailRoutes } from "../../../shared/modules/email/email.router";
import { SettingsService } from "../settings/settings.service";
import { EmailService, sendEmail } from "./email.service";
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
    if (!email) throw "Failed to parse email";
    return { id: email.id };
}

async function scan(request: EmailScanRequest) {
    request = EmailScanRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const maildirPath = request.path || process.env.MAILDIR_PATH || "./maildir";
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
    handlers: { list, detail, send, receive, scan, delete: deleteEmail, restore },
};
