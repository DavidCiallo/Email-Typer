import Repository from "../../lib/repository";
import { MailboxEntity } from "../../../shared/modules/mailbox/mailbox.entity";
import { MailboxDTO, DerivedAddress } from "../../../shared/modules/mailbox/mailbox.interface";
import { SettingsService } from "../settings/settings.service";
import { EmailService, maildirRoot } from "../email/email.service";
import { aesEncrypt, aesDecrypt } from "../../lib/crypto";
import { IMAP_PROVIDERS, resolveProvider } from "./imap.providers";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";

const mailboxRepository: Repository<MailboxEntity> = Repository.instance("Mailbox");

export class MailboxService {
    static async findList(where?: Partial<MailboxEntity>): Promise<MailboxEntity[]> {
        return await mailboxRepository.find(where);
    }

    static async findById(id: string): Promise<MailboxEntity | null> {
        return await mailboxRepository.findOne({ id } as any);
    }

    static async findByApiKey(key: string): Promise<MailboxEntity | null> {
        if (!key) return null;
        return await mailboxRepository.findOne({ api_key: key } as any);
    }

    /**
     * Domains a catchall/api mailbox may bind to — i.e. domains this system
     * can actually receive mail for. Union of the allowed_domains setting and
     * the domain folders Postfix is delivering into (maildir directories that
     * contain a new/ folder). Synthetic folders (_receive, _sync_*) are ignored.
     */
    static async allowedDomains(): Promise<string[]> {
        const configured = (SettingsService.get("allowed_domains") || "")
            .split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
        try {
            const root = maildirRoot();
            const discovered = fs.readdirSync(root, { withFileTypes: true })
                .filter(d => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
                .filter(d => fs.existsSync(path.join(root, d.name, "new")))
                .map(d => d.name.toLowerCase());
            return Array.from(new Set([...configured, ...discovered])).sort();
        } catch {
            return configured;
        }
    }

    static toDTO(e: MailboxEntity): MailboxDTO {
        return {
            id: e.id,
            name: e.name,
            type: e.type,
            address: e.address,
            domain: e.domain,
            local_part: e.local_part,
            provider: e.provider,
            imap_host: e.imap_host,
            imap_port: e.imap_port,
            imap_tls: e.imap_tls,
            sync_interval: e.sync_interval,
            api_key: e.type === "api" ? e.api_key : "",
            status: e.status || "active",
            sync_error: e.sync_error || "",
            last_sync_time: e.last_sync_time ?? null,
            note: e.note || "",
            has_credential: !!e.credential,
        };
    }

    /**
     * Create or update a mailbox. IMAP credentials are stored AES-encrypted;
     * an empty password on update keeps the existing credential.
     */
    static async save(body: {
        name: string; type: string; address: string; provider: string;
        imap_host: string; imap_port: number; imap_tls: number; sync_interval: number;
        password: string; note: string;
    }, id?: string): Promise<MailboxEntity> {
        const [localPart, domain] = body.address.split("@");

        if (body.type === "catchall" || body.type === "api") {
            const allowed = await MailboxService.allowedDomains();
            if (allowed.length && !allowed.includes(domain.toLowerCase())) {
                throw `域名不在允许列表内，仅支持: ${allowed.join(", ")}`;
            }
        }

        const patch: Partial<MailboxEntity> = {
            name: body.name || body.address,
            type: body.type,
            address: body.address,
            domain: domain.toLowerCase(),
            local_part: localPart,
            provider: body.type === "imap" ? body.provider : "",
            note: body.note || "",
        };

        if (body.type === "imap") {
            const preset = resolveProvider(body.provider);
            patch.imap_host = body.imap_host || preset?.host || "";
            patch.imap_port = body.imap_port || preset?.port || 993;
            patch.imap_tls = body.imap_tls !== undefined ? body.imap_tls : (preset?.tls === false ? 0 : 1);
            patch.sync_interval = body.sync_interval || 0;
            if (!patch.imap_host) throw "IMAP 服务器地址不能为空";
            if (body.password) {
                patch.credential = aesEncrypt(JSON.stringify({ user: body.address, password: body.password }));
            }
        } else {
            patch.imap_host = "";
            patch.imap_port = 0;
            patch.imap_tls = 0;
            patch.sync_interval = 0;
            patch.credential = "";
            if (body.type === "api") {
                patch.api_key = `mk_${nanoid(32)}`;
            }
        }

        if (id) {
            const existing = await MailboxService.findById(id);
            if (!existing) throw "Mailbox not found";
            // keep credential when updating without a new password
            if (!patch.credential) delete patch.credential;
            // api keys are managed via regenerateKey — don't overwrite on save
            if (existing.type === "api") delete patch.api_key;
            const ok = await mailboxRepository.update({ id } as any, patch as any);
            if (!ok) throw "Mailbox not found";
            const updated = (await MailboxService.findById(id))!;
            return updated;
        }

        return await mailboxRepository.insert({
            ...patch,
            api_key: patch.api_key ?? "",
            status: "active",
            sync_error: "",
            last_sync_time: null,
            last_uid: 0,
            uidvalidity: 0,
        } as any);
    }

    static async delete(id: string): Promise<boolean> {
        return await mailboxRepository.delete({ id } as any);
    }

    static async regenerateKey(id: string): Promise<string> {
        const existing = await MailboxService.findById(id);
        if (!existing) throw "Mailbox not found";
        const api_key = `mk_${nanoid(32)}`;
        await mailboxRepository.update({ id } as any, { api_key } as any);
        return api_key;
    }

    static async setStatus(id: string, status: string, syncError?: string): Promise<void> {
        await mailboxRepository.atomicPatch({ id } as any, () => ({
            status,
            sync_error: syncError !== undefined ? syncError : undefined,
        } as any));
    }

    /**
     * All recipient addresses: declared mailboxes (catchall/api) plus addresses
     * derived from received traffic that have no mailbox record yet.
     */
    static async listAddresses(): Promise<{ declared: MailboxDTO[]; derived: DerivedAddress[] }> {
        const mailboxes = await mailboxRepository.find({ delete_time: null } as any);
        const declaredAddresses = new Set(mailboxes.map(m => m.address));
        const declared = mailboxes
            .filter(m => m.type !== "imap")
            .sort((a, b) => a.address.localeCompare(b.address))
            .map(MailboxService.toDTO);

        const derived = new Map<string, DerivedAddress>();
        const stats = new Map<string, { count: number; last: number }>();

        await EmailService.findEachEmail((email) => {
            const addr = extractAddress(email.to);
            if (!addr || declaredAddresses.has(addr)) return;
            const prev = stats.get(addr);
            const time = Number(email.time) || 0;
            if (prev) {
                prev.count += 1;
                prev.last = Math.max(prev.last, time);
            } else {
                stats.set(addr, { count: 1, last: time });
            }
        });

        for (const [address, s] of stats) {
            derived.set(address, { address, count: s.count, last_time: s.last });
        }

        return {
            declared,
            derived: Array.from(derived.values()).sort((a, b) => b.last_time - a.last_time),
        };
    }

    /** Decode the stored IMAP credential. */
    static decryptCredential(mailbox: MailboxEntity): { user: string; password: string } | null {
        if (!mailbox.credential) return null;
        const json = aesDecrypt(mailbox.credential);
        if (!json) return null;
        try {
            return JSON.parse(json);
        } catch {
            return null;
        }
    }

    static providerPresets() {
        return Object.entries(IMAP_PROVIDERS).map(([key, p]) => ({ key, label: p.label, host: p.host, port: p.port, tls: p.tls }));
    }
}

/** Pull the bare address out of a possibly "Name <a@b>" header value. */
export function extractAddress(value: string): string {
    const m = (value || "").match(/[\w.+-]+@[\w.-]+/);
    return m ? m[0].toLowerCase() : "";
}
