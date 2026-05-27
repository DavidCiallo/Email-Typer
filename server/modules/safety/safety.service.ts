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
     * Check whether an incoming email should be blocked.
     * Priority: whitelist > blacklist > sensitive_word
     */
    static async isBlocked(from: string, subject: string, html?: string, text?: string): Promise<boolean> {
        const all = await safetyRepository.find({});
        const body = (html || "") + (text || "");

        const whitelist = all.filter(e => e.type === "whitelist");
        const blacklist = all.filter(e => e.type === "blacklist");
        const sensitiveWords = all.filter(e => e.type === "sensitive_word");

        // Whitelist check — if sender matches any whitelist, allow through
        for (const w of whitelist) {
            if (matchPattern(from, w.value)) return false;
        }

        // Blacklist check — if sender matches any blacklist, block
        for (const b of blacklist) {
            if (matchPattern(from, b.value)) return true;
        }

        // Sensitive word check — if subject or body contains any word, block
        for (const sw of sensitiveWords) {
            const keyword = sw.value.toLowerCase();
            if (subject.toLowerCase().includes(keyword) || body.toLowerCase().includes(keyword)) {
                return true;
            }
        }

        return false;
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
