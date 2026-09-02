import Repository from "../../lib/repository";
import { SafetyEntity } from "../../../shared/modules/safety/safety.entity";

const safetyRepository: Repository<SafetyEntity> = Repository.instance("Safety");

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
     * Evaluate an incoming email against safety rules.
     * Priority: whitelist > blacklist > sensitive_word
     * The email is stored regardless — the verdict only decides forwarding.
     * Streams rules one at a time — no accumulation in memory.
     */
    static async evaluate(
        from: string,
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
            if (!blacklistRule && e.type === "blacklist" && matchPattern(from, e.value)) {
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
