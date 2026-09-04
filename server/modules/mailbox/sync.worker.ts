import Repository from "../../lib/repository";
import { MailboxEntity } from "../../../shared/modules/mailbox/mailbox.entity";
import { MailboxService } from "./mailbox.service";
import { ImapClient } from "../../lib/imap-client";
import { deliverToMaildir } from "../../lib/maildir";
import { maildirRoot, EmailService } from "../email/email.service";
import { SettingsService } from "../settings/settings.service";
import { resolveProvider } from "./imap.providers";

const mailboxRepository: Repository<MailboxEntity> = Repository.instance("Mailbox");

const DEFAULT_INTERVAL = 60;       // seconds between polls
const MIN_INTERVAL = 15;
const FIRST_SYNC_LIMIT = 200;      // cap the initial backlog pull

/** Prepend header lines without a Buffer→string roundtrip (8bit bodies stay intact). */
function stampBuffer(raw: Uint8Array, extra: Record<string, string>): Buffer {
    const head = Object.entries(extra).map(([k, v]) => `${k}: ${v}\r\n`).join("");
    return Buffer.concat([Buffer.from(head, "utf-8"), raw]);
}

async function patchBox(id: string, patch: Partial<MailboxEntity>): Promise<void> {
    await mailboxRepository.atomicPatch({ id } as any, () => patch as any);
}

export interface ConnectionTestParams {
    host: string;
    port: number;
    tls: boolean;
    user: string;
    password: string;
}

/**
 * Polls IMAP mailboxes and funnels fetched mail through the shared ingest
 * pipeline: every message is archived into the maildir under _sync_<id>/new/
 * (file is the source of truth) and then ingested exactly like Postfix mail.
 */
export class MailboxSyncWorker {
    private static timers = new Map<string, ReturnType<typeof setInterval>>();
    private static running = new Set<string>();

    static async startAll(): Promise<void> {
        const boxes = await MailboxService.findList({ type: "imap" } as any);
        for (const box of boxes) {
            MailboxSyncWorker.schedule(box);
        }
        if (MailboxSyncWorker.timers.size > 0) {
            console.log(`[MailboxSync] ${MailboxSyncWorker.timers.size} IMAP mailbox(es) scheduled`);
        }
    }

    private static intervalFor(box: MailboxEntity): number {
        const seconds = box.sync_interval
            || Number(SettingsService.get("mailbox_sync_interval"))
            || DEFAULT_INTERVAL;
        return Math.max(MIN_INTERVAL, seconds) * 1000;
    }

    static schedule(box: MailboxEntity): void {
        MailboxSyncWorker.stop(box.id);
        if (box.type !== "imap" || box.status === "disabled") return;
        const timer = setInterval(() => {
            MailboxSyncWorker.syncQuietly(box.id);
        }, MailboxSyncWorker.intervalFor(box));
        MailboxSyncWorker.timers.set(box.id, timer);
    }

    /** Re-apply scheduling after a save (config change, enable/disable, type change). */
    static async reschedule(box: MailboxEntity): Promise<void> {
        MailboxSyncWorker.schedule(box);
    }

    static stop(id: string): void {
        const timer = MailboxSyncWorker.timers.get(id);
        if (timer) {
            clearInterval(timer);
            MailboxSyncWorker.timers.delete(id);
        }
    }

    private static async syncQuietly(id: string): Promise<void> {
        try {
            await MailboxSyncWorker.syncNow(id);
        } catch {
            // failure already recorded on the mailbox; the next tick retries
        }
    }

    /** Run a sync immediately; throws with the failure message on error. */
    static async syncNow(id: string): Promise<{ imported: number; scanned: number }> {
        if (MailboxSyncWorker.running.has(id)) {
            return { imported: 0, scanned: 0 };
        }
        const box = await MailboxService.findById(id);
        if (!box || box.type !== "imap") throw "IMAP mailbox not found";

        MailboxSyncWorker.running.add(id);
        try {
            return await MailboxSyncWorker.syncMailbox(box);
        } catch (e: any) {
            const message = String(e?.message || e).slice(0, 500);
            await patchBox(id, { status: "error", sync_error: message, last_sync_time: Date.now() });
            throw e?.message ? e : new Error(message);
        } finally {
            MailboxSyncWorker.running.delete(id);
        }
    }

    private static async syncMailbox(box: MailboxEntity): Promise<{ imported: number; scanned: number }> {
        const cred = MailboxService.decryptCredential(box);
        if (!cred) throw "缺少登录凭据，请编辑该邮箱并重新填写授权码";

        const preset = box.provider ? resolveProvider(box.provider) : null;
        const host = box.imap_host || preset?.host || "";
        if (!host) throw "缺少 IMAP 服务器地址";

        const client = await ImapClient.connect({
            host,
            port: box.imap_port || preset?.port || 993,
            tls: box.imap_tls !== 0,
        });

        try {
            await client.login(cred.user, cred.password);
            const { uidvalidity } = await client.selectInbox();

            let lastUid = box.last_uid || 0;
            if (uidvalidity && box.uidvalidity && uidvalidity !== box.uidvalidity) {
                lastUid = 0; // remote mailbox was rebuilt — resync from scratch (dedup keeps it sane)
            }

            let uids = await client.uidSearch(lastUid > 0 ? lastUid : undefined);
            if (lastUid > 0) uids = uids.filter(u => u > lastUid);
            if (lastUid === 0 && uids.length > FIRST_SYNC_LIMIT) {
                uids = uids.slice(-FIRST_SYNC_LIMIT); // first sync: only the latest backlog
            }
            uids.sort((a, b) => a - b);

            let imported = 0;
            for (const uid of uids) {
                const { raw } = await client.uidFetch(uid);
                const stamped = stampBuffer(raw, {
                    "X-CFRS-Source": "imap",
                    "X-CFRS-Mailbox": box.id,
                });
                const filePath = deliverToMaildir(maildirRoot(), `_sync_${box.id}`, stamped);
                const stored = await EmailService.ingestFile(filePath);
                if (stored) imported++;
                await patchBox(box.id, { last_uid: uid });
            }

            await patchBox(box.id, {
                status: "active",
                sync_error: "",
                last_sync_time: Date.now(),
                uidvalidity: uidvalidity || box.uidvalidity || 0,
            });

            return { imported, scanned: uids.length };
        } finally {
            client.close();
        }
    }

    static async testConnection(params: ConnectionTestParams): Promise<{ ok: boolean; message: string }> {
        let client: ImapClient | null = null;
        try {
            client = await ImapClient.connect({ host: params.host, port: params.port, tls: params.tls });
            await client.login(params.user, params.password);
            const { exists } = await client.selectInbox();
            return { ok: true, message: `连接成功，收件箱共 ${exists} 封邮件` };
        } catch (e: any) {
            return { ok: false, message: String(e?.message || e).slice(0, 300) };
        } finally {
            client?.close();
        }
    }
}
