import Repository from "../../lib/repository";
import { hashGenerate } from "../../methods/crypto";
import { nanoid } from "nanoid";
import { MailboxGrantEntity } from "../../../shared/modules/mailbox/mailbox-grant.entity";
import { MailboxService } from "./mailbox.service";

const grantRepository: Repository<MailboxGrantEntity> = Repository.instance("MailboxGrant");

export interface TauthSession {
    grant: MailboxGrantEntity;
    address: string;
    mailbox_id: string;
}

export class GrantService {
    /**
     * Verify a raw tauth token against stored hashes and return the session
     * when the grant is inside its window. Expired / revoked grants resolve
     * to null — callers treat that as unauthorized.
     */
    static async resolveTauth(token: string | undefined | null): Promise<TauthSession | null> {
        if (!token) return null;
        const grant = await grantRepository.findOne({ token_hash: hashGenerate(token) } as any);
        if (!grant || grant.delete_time) return null;
        const now = Date.now();
        if (now < grant.start_time || now > grant.end_time) return null;
        return { grant, address: grant.address, mailbox_id: grant.mailbox_id };
    }

    static async findActiveByMailbox(mailboxId: string): Promise<MailboxGrantEntity | null> {
        const grants = await grantRepository.find({ mailbox_id: mailboxId } as any);
        const now = Date.now();
        return grants.find((g) => now >= g.start_time && now <= g.end_time) || null;
    }

    static async findById(id: string): Promise<MailboxGrantEntity | null> {
        return await grantRepository.findOne({ id } as any);
    }

    /**
     * Create the single active grant for a mailbox. Refuses when an active
     * grant already exists — revoke it first (one live link per mailbox).
     */
    static async create(mailboxId: string, end_time: number, note: string): Promise<{ grant: MailboxGrantEntity; token: string }> {
        const mailbox = await MailboxService.findById(mailboxId);
        if (!mailbox) throw "Mailbox not found";
        const active = await GrantService.findActiveByMailbox(mailboxId);
        if (active) throw "该邮箱已存在有效授权，请先吊销后再生成新链接";

        const start_time = Date.now();
        if (!Number.isFinite(end_time) || end_time <= start_time) throw "有效期无效";
        const token = `tauth_${nanoid(24)}`;
        const grant = await grantRepository.insert({
            mailbox_id: mailboxId,
            address: mailbox.address,
            token_hash: hashGenerate(token),
            start_time,
            end_time,
            note: note || "",
        } as any);
        return { grant, token };
    }

    /** Revoke = soft delete; resolution and matching stop seeing it instantly. */
    static async revoke(id: string): Promise<boolean> {
        return await grantRepository.delete({ id } as any);
    }

    static async findList(): Promise<MailboxGrantEntity[]> {
        return await grantRepository.find({}, { includeDeleted: true });
    }

    /** Whether a temp strategy (by grant_id) may fire right now. */
    static async isGrantActive(grantId: string): Promise<boolean> {
        if (!grantId) return false;
        const grant = await grantRepository.findOne({ id: grantId } as any);
        if (!grant || grant.delete_time) return false;
        const now = Date.now();
        return now >= grant.start_time && now <= grant.end_time;
    }
}
