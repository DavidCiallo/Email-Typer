import {
    MailboxListRequest,
    MailboxSaveRequest,
    MailboxDeleteRequest,
    MailboxAddressesRequest,
    MailboxRegenerateKeyRequest,
    MailboxSyncRequest,
    MailboxTestRequest,
    MailboxProvidersRequest,
} from "../../../shared/modules/mailbox/mailbox.interface";
import { mailboxRoutes } from "../../../shared/modules/mailbox/mailbox.router";
import { MailboxService } from "./mailbox.service";
import { MailboxSyncWorker } from "./sync.worker";
import { requireAdmin } from "../auth/auth.service";

async function list(request: MailboxListRequest) {
    request = MailboxListRequest.self(request);
    await requireAdmin(request.auth);

    const where: Record<string, any> = {};
    if (request.type) where.type = request.type;

    const rows = await MailboxService.findList(where);
    return {
        list: rows.map(MailboxService.toDTO),
        domains: await MailboxService.allowedDomains(),
    };
}

async function save(request: MailboxSaveRequest) {
    request = MailboxSaveRequest.self(request);
    await requireAdmin(request.auth);

    const saved = await MailboxService.save(request.mailbox, request.id);
    await MailboxSyncWorker.reschedule(saved);
    return MailboxService.toDTO(saved);
}

async function deleteMailbox(request: MailboxDeleteRequest) {
    request = MailboxDeleteRequest.self(request);
    await requireAdmin(request.auth);

    await MailboxSyncWorker.stop(request.id);
    const result = await MailboxService.delete(request.id);
    if (!result) throw "Mailbox not found";
    return {};
}

async function addresses(request: MailboxAddressesRequest) {
    request = MailboxAddressesRequest.self(request);
    await requireAdmin(request.auth);
    return await MailboxService.listAddresses();
}

async function regenerateKey(request: MailboxRegenerateKeyRequest) {
    request = MailboxRegenerateKeyRequest.self(request);
    await requireAdmin(request.auth);

    const api_key = await MailboxService.regenerateKey(request.id);
    return { api_key };
}

async function sync(request: MailboxSyncRequest) {
    request = MailboxSyncRequest.self(request);
    await requireAdmin(request.auth);

    return await MailboxSyncWorker.syncNow(request.id);
}

async function test(request: MailboxTestRequest) {
    request = MailboxTestRequest.self(request);
    await requireAdmin(request.auth);

    const preset = request.provider ? resolvePreset(request.provider) : null;
    const host = request.imap_host || preset?.host || "";
    const port = request.imap_port || preset?.port || 993;
    const tls = request.imap_tls !== undefined ? Number(request.imap_tls) !== 0 : (preset?.tls !== false);

    let user = request.address || "";
    let password = request.password || "";

    if (request.id) {
        const mailbox = await MailboxService.findById(request.id);
        if (!mailbox) throw "Mailbox not found";
        const cred = MailboxService.decryptCredential(mailbox);
        user = cred?.user || mailbox.address;
        password = cred?.password || "";
        const storedPreset = mailbox.provider ? resolvePreset(mailbox.provider) : null;
        const testHost = mailbox.imap_host || storedPreset?.host || "";
        const testPort = mailbox.imap_port || storedPreset?.port || 993;
        return await MailboxSyncWorker.testConnection({ host: testHost, port: testPort, tls: mailbox.imap_tls !== 0, user, password });
    }

    if (!host || !user || !password) {
        return { ok: false, message: "缺少服务器地址、账号或授权码" };
    }
    return await MailboxSyncWorker.testConnection({ host, port, tls, user, password });
}

function resolvePreset(key?: string) {
    if (!key) return null;
    return MailboxService.providerPresets().find(p => p.key === key) || null;
}

async function providers(request: MailboxProvidersRequest) {
    request = MailboxProvidersRequest.self(request);
    await requireAdmin(request.auth);
    return { presets: MailboxService.providerPresets() };
}

export const mailboxMount = {
    routes: mailboxRoutes,
    handlers: {
        list, save, delete: deleteMailbox, addresses,
        regenerateKey, sync, test, providers,
    },
};
