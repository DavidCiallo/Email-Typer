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
     * newly arriving mail. Rules are loaded once and all changed rows are
     * written back in a single pass — oversized JSONL stores would otherwise
     * pay one full-file rewrite per changed email.
     */
    static async reapplyToAll(): Promise<number> {
        const rules = await safetyRepository.find({} as any);
        const updated = await emailRepository.patchAll((e) => {
            const verdict = SafetyService.evaluateWithRules(
                rules,
                e.from || "",
                e.to || "",
                e.subject || "",
                e.html || "",
                e.text || "",
            );
            const blocked = verdict.blocked ? 1 : 0;
            if (blocked === (e.blocked || 0)
                && verdict.blockedBy === (e.blocked_by || "")
                && verdict.rule === (e.block_rule || "")) {
                return null;
            }
            return { blocked, blocked_by: verdict.blockedBy, block_rule: verdict.rule } as any;
        }, { includeDeleted: true });
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
        const rules = await safetyRepository.find({} as any);
        return SafetyService.evaluateWithRules(rules, from, to, subject, html, text);
    }

    /** Rules are pre-loaded (caller) so a bulk pass doesn't re-read the rule store per email. */
    private static evaluateWithRules(
        rules: SafetyEntity[],
        from: string,
        to: string,
        subject: string,
        html?: string,
        text?: string,
    ): { blocked: boolean; blockedBy: string; rule: string } {
        const subjectLower = subject.toLowerCase();
        // Lowercase the body at most once, and only when a sensitive-word rule
        // exists — blacklist/whitelist rows never need the body.
        let bodyLower: string | null = null;
        const hasSensitive = rules.some((e) => e.type === "sensitive_word");

        let whitelisted = false;
        let blacklistRule = "";
        let sensitiveRule = "";

        if (hasSensitive) {
            bodyLower = ((html || "") + (text || "")).toLowerCase();
        }

        for (const e of rules) {
            if (e.type === "whitelist" && matchPattern(from, e.value)) {
                whitelisted = true;
            }
            if (!blacklistRule && e.type === "blacklist" && (matchPattern(from, e.value) || matchPattern(to, e.value))) {
                blacklistRule = e.value;
            }
            if (!sensitiveRule && e.type === "sensitive_word") {
                const keyword = e.value.toLowerCase();
                if (subjectLower.includes(keyword) || (bodyLower && bodyLower.includes(keyword))) {
                    sensitiveRule = e.value;
                }
            }
        }

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
