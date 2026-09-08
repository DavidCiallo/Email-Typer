import Repository from "../../lib/repository";
import { SafetyEntity } from "../../../shared/modules/safety/safety.entity";
import { EmailEntity } from "../../../shared/modules/email/email.entity";

const safetyRepository: Repository<SafetyEntity> = Repository.instance("Safety");
const emailRepository: Repository<EmailEntity> = Repository.instance("Email");

/** Serial background queue — retroactive re-evaluation runs here, off the
 * request path. A single promise chain guarantees one pass at a time so
 * concurrent rule edits never rewrite the email store in parallel. */
let reapplyChain: Promise<void> = Promise.resolve();
let reapplyQueued = false;

export class SafetyService {
    static async findList(where?: Partial<SafetyEntity>): Promise<SafetyEntity[]> {
        return await safetyRepository.find(where);
    }

    static async findById(id: string): Promise<SafetyEntity | null> {
        return await safetyRepository.findOne({ id } as any);
    }

    static async save(entry: Partial<SafetyEntity> & { id?: string }): Promise<SafetyEntity> {
        const value = String(entry.value || "").trim();
        const type = String(entry.type || "");
        if (!value) throw "规则内容不能为空";

        // one rule per type+value — matching is case-insensitive, so is this
        const rules = await safetyRepository.find({ type } as any);
        const lower = value.toLowerCase();
        const dup = rules.find(r => r.id !== entry.id && (r.value || "").trim().toLowerCase() === lower);
        if (dup) {
            const label = type === "sensitive_word" ? "敏感词" : type === "blacklist" ? "黑名单" : type === "whitelist" ? "白名单" : "规则";
            throw `${label}已存在: ${dup.value}`;
        }

        if (entry.id) {
            const { id, ...data } = entry;
            await safetyRepository.update({ id } as any, { ...data, value } as any);
            return (await safetyRepository.findOne({ id } as any))!;
        } else {
            return await safetyRepository.insert({ ...entry, value } as any);
        }
    }

    static async delete(id: string): Promise<boolean> {
        return await safetyRepository.delete({ id } as any);
    }

    /**
     * Queue a full retroactive re-evaluation in the background and return
     * immediately. Rule edits stay snappy regardless of email-store size; the
     * reapply drains serially on its own chain. Coalesced: a second request
     * while one is queued just marks another pass (single-flight).
     */
    static scheduleReapply(): void {
        if (reapplyQueued) return;
        reapplyQueued = true;
        reapplyChain = reapplyChain.then(async () => {
            try {
                await SafetyService.reapplyToAllInner();
            } catch (e) {
                console.error("[Safety] background reapply failed:", e);
            } finally {
                reapplyQueued = false;
            }
        });
    }

    /**
     * Re-run the current rules over every stored email and refresh blocked
     * flags. Rules are normally evaluated at ingest time only; this makes a
     * rule change retroactive so existing mail is classified the same way as
     * newly arriving mail. Rules are loaded once and all changed rows are
     * written back in a single pass — oversized JSONL stores would otherwise
     * pay one full-file rewrite per changed email.
     */
    private static async reapplyToAllInner(): Promise<number> {
        const rules = await safetyRepository.find({} as any);
        // Sensitive-word rules need bodies and stored rows no longer carry
        // them — hydrate once up front (one eml read per mail, off the
        // request path). Address-only rules skip the file reads entirely.
        const hasSensitive = rules.some((e) => e.type === "sensitive_word");
        const bodies = new Map<string, { html: string; text: string }>();
        if (hasSensitive) {
            const { EmailService } = await import("../email/email.service");
            const rows = await emailRepository.find({}, { includeDeleted: true });
            for (const row of rows) {
                bodies.set(row.id, EmailService.readBody(row));
            }
        }
        const updated = await emailRepository.patchAll((e) => {
            const body = bodies.get(e.id as string) || { html: "", text: "" };
            const verdict = SafetyService.evaluateWithRules(
                rules,
                e.from || "",
                e.to || "",
                e.subject || "",
                body.html,
                body.text,
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
