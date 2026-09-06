import Repository from "../../lib/repository";
import { SendLogEntity } from "../../../shared/modules/email/send-log.entity";
import { SettingsService } from "../settings/settings.service";

const sendLogRepository: Repository<SendLogEntity> = Repository.instance("SendLog");

export class SendLogService {
    /**
     * Resolve the Resend API key for a from address, or null when the domain
     * has no send capability (such mail must go through an external channel).
     * Only domains explicitly present in resend_api_keys count — the legacy
     * global resend_api_key is not domain-annotated, so it cannot prove a
     * from domain is verified on Resend.
     */
    static resolveResendKey(from: string): string | null {
        const keyMap = SettingsService.get("resend_api_keys");
        const fromDomain = from.split("@")[1]?.toLowerCase();
        if (!keyMap || !fromDomain) return null;
        for (const pair of keyMap.split(",")) {
            const [domain, key] = pair.split(":").map((s) => s.trim());
            if (domain && key && domain.toLowerCase() === fromDomain) return key;
        }
        return null;
    }

    static async create(entry: {
        from: string;
        to: string;
        subject: string;
        html: string;
        channel: string;
    }): Promise<SendLogEntity> {
        return await sendLogRepository.insert({
            ...entry,
            status: "pending",
            error: "",
        } as any);
    }

    static async findById(id: string): Promise<SendLogEntity | null> {
        return await sendLogRepository.findOne({ id } as any);
    }

    static async findList(where?: Partial<SendLogEntity>, limit?: number, offset?: number): Promise<{ list: SendLogEntity[]; total: number }> {
        const result = await sendLogRepository.find(where as any, { limit, offset, includeDeleted: true });
        const total = await sendLogRepository.count(where as any, undefined, true);
        return { list: result, total };
    }

    static async setStatus(id: string, status: string, error = ""): Promise<SendLogEntity | null> {
        await sendLogRepository.update({ id } as any, { status, error } as any, true);
        return await sendLogRepository.findOne({ id } as any);
    }
}
