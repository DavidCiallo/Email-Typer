import Repository from "../../lib/repository";
import { SafetyEntity } from "../../../shared/modules/safety/safety.entity";
import { EmailEntity } from "../../../shared/modules/email/email.entity";

const safetyRepository: Repository<SafetyEntity> = Repository.instance("Safety");
const emailRepository: Repository<EmailEntity> = Repository.instance("Email");

export class SafetyService {
    static async findList(where?: Partial<SafetyEntity>): Promise<SafetyEntity[]> {
        return await safetyRepository.find(where);
    }

    static async findById(id: string): Promise<SafetyEntity | null> {
        return await safetyRepository.findOne({ id } as any);
    }

    static async save(entry: Partial<SafetyEntity> & { id?: string }): Promise<SafetyEntity> {
        if (entry.id) {
            const { id, ...data } = entry;
            await safetyRepository.update({ id } as any, data as any);
            return (await safetyRepository.findOne({ id } as any))!;
        } else {
            return await safetyRepository.insert(entry);
        }
    }

    static async delete(id: string): Promise<boolean> {
        return await safetyRepository.delete({ id } as any);
    }

    /**
     * Re-run the current rules over every stored email and refresh blocked
     * flags. Rules are normally evaluated at ingest time only; this makes a
     * rule change retroactive so existing mail is classified the same way as
     * newly arriving mail. Only rows whose verdict changed get rewritten.
     */
    static async reapplyToAll(): Promise<number> {
        const rows = await emailRepository.find({} as any, { includeDeleted: true });
        let updated = 0;
        for (const e of rows) {
            const verdict = await SafetyService.evaluate(
                e.from || "",
                e.to || "",
                e.subject || "",
                e.html || "",
                e.text || "",
            );
            const blocked = verdict.blocked ? 1 : 0;
            const blockedBy = verdict.blocked ? verdict.blockedBy : "";
            const rule = verdict.blocked ? verdict.rule : "";
            if (blocked === (e.blocked || 0) && blockedBy === (e.blocked_by || "") && rule === (e.block_rule || "")) continue;
            await emailRepository.update({ id: e.id } as any, { blocked, blocked_by: blockedBy, block_rule: rule } as any, true);
            updated++;
        }
        return updated;
    }

    /**
     * Evaluate an email against safety rules.
     * Priority: whitelist > blacklist > sensitive_word
     * Blacklist hits on either side of the conversation — a blacklisted
     * address blocks mail from it AND mail addressed to it (catch-all
     * inboxes need a way to silence a whole local address).
     * The email is stored regardless — the verdict only decides visibility
     * and forwarding.
     */
    static async evaluate(
        from: string,
        to: string,
        subject: string,
        html?: string,
        text?: string,
    ): Promise<{ blocked: boolean; blockedBy: string; rule: string }> {
        const body = (html || "") + (text || "");

        let whitelisted = false;
        let blacklistRule = "";
        let sensitiveRule = "";

        await safetyRepository.findEach((e) => {
            if (e.type === "whitelist" && matchPattern(from, e.value)) {
                whitelisted = true;
            }
            if (!blacklistRule && e.type === "blacklist" && (matchPattern(from, e.value) || matchPattern(to, e.value))) {
                blacklistRule = e.value;
            }
            if (!sensitiveRule && e.type === "sensitive_word") {
                const keyword = e.value.toLowerCase();
                if (subject.toLowerCase().includes(keyword) || body.toLowerCase().includes(keyword)) {
                    sensitiveRule = e.value;
                }
            }
        });

        // Whitelist takes priority over everything
        if (whitelisted) return { blocked: false, blockedBy: "", rule: "" };
        if (blacklistRule) return { blocked: true, blockedBy: "blacklist", rule: blacklistRule };
        if (sensitiveRule) return { blocked: true, blockedBy: "sensitive_word", rule: sensitiveRule };
        return { blocked: false, blockedBy: "", rule: "" };
    }
}

/** Simple wildcard matching: * matches anything, otherwise case-insensitive contains */
function matchPattern(value: string, pattern: string): boolean {
    if (!pattern) return false;
    if (pattern === "*") return true;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try {
        return new RegExp(escaped, "i").test(value);
    } catch {
        return value.toLowerCase().includes(pattern.toLowerCase());
    }
}
