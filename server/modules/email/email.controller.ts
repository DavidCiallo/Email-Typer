import {
    EmailListRequest,
    EmailDetailRequest,
    EmailSendRequest,
    EmailReceiveRequest,
    EmailScanRequest,
    EmailDeleteRequest,
} from "../../../shared/modules/email/email.interface";
import { emailRoutes } from "../../../shared/modules/email/email.router";
import { EmailService, sendEmail } from "./email.service";
import { getIdentifyByVerify } from "../auth/auth.service";

async function list(request: EmailListRequest) {
    request = EmailListRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const where: Record<string, any> = { delete_time: null };
    if (request.account_id) {
        where.account_id = request.account_id;
    }

    const result = await EmailService.findList(where, { limit: request.limit, offset: request.offset });
    const list = result.list.map(e => ({
        id: e.id,
        eid: e.eid,
        from: e.from,
        to: e.to,
        subject: e.subject,
        text: e.text,
        time: e.time,
        account_id: e.account_id,
    }));
    return { list, total: result.total };
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

    const { to, subject, html } = request.email;
    const result = await sendEmail({ to, subject, html });
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

export const emailMount = {
    routes: emailRoutes,
    handlers: { list, detail, send, receive, scan, delete: deleteEmail },
};
