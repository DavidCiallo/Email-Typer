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
     * Streams rules one at a time — no accumulation in memory.
     */
    static async isBlocked(from: string, subject: string, html?: string, text?: string): Promise<boolean> {
        const body = (html || "") + (text || "");

        let whitelisted = false;
        let blacklisted = false;
        let sensitive = false;

        await safetyRepository.findEach((e) => {
            if (e.type === "whitelist" && matchPattern(from, e.value)) {
                whitelisted = true;
            }
            if (!blacklisted && e.type === "blacklist" && matchPattern(from, e.value)) {
                blacklisted = true;
            }
            if (!sensitive && e.type === "sensitive_word") {
                const keyword = e.value.toLowerCase();
                if (subject.toLowerCase().includes(keyword) || body.toLowerCase().includes(keyword)) {
                    sensitive = true;
                }
            }
        });

        // Whitelist takes priority over everything
        if (whitelisted) return false;
        // Blacklist and sensitive words both cause blocking
        return blacklisted || sensitive;
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
