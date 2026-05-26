import Repository from "../../lib/repository";
import { StrategyEntity } from "../../../shared/modules/strategy/strategy.entity";

const strategyRepository: Repository<StrategyEntity> = Repository.instance("Strategy");

export class StrategyService {
    static async findList(where?: Partial<StrategyEntity>): Promise<StrategyEntity[]> {
        return await strategyRepository.find(where);
    }

    static async findById(id: string): Promise<StrategyEntity | null> {
        return await strategyRepository.findOne({ id });
    }

    static async save(strategy: Partial<StrategyEntity> & { id?: string }): Promise<StrategyEntity> {
        if (strategy.id) {
            // Update existing
            const { id, ...data } = strategy;
            await strategyRepository.update({ id }, data as any);
            return (await strategyRepository.findOne({ id }))!;
        } else {
            // Create new
            return await strategyRepository.insert(strategy);
        }
    }

    static async delete(id: string): Promise<boolean> {
        return await strategyRepository.delete({ id } as any);
    }

    /**
     * Run matching and forwarding for a received email.
     */
    static async matchAndForward(email: { from: string; to: string; subject: string; html?: string; text?: string }): Promise<void> {
        const strategy = await StrategyService.matchStrategy(email.from, email.to, email.subject);
        if (!strategy || !strategy.forward_to) return;

        const { sendEmail } = await import("../email/email.service");
        const content = email.html || email.text || "";
        await sendEmail({
            to: strategy.forward_to,
            subject: `Fwd: ${email.subject}`,
            html: content,
        });
        console.log(`[Strategy] Forwarded email from ${email.from} to ${strategy.forward_to}`);
    }

    /**
     * Find matching strategies for an email.
     * Returns the first matching enabled strategy or null.
     */
    static async matchStrategy(from: string, to: string, subject: string): Promise<StrategyEntity | null> {
        const strategies = await strategyRepository.find({ enabled: 1 });
        for (const s of strategies) {
            if (s.from_pattern && !matchGlob(from, s.from_pattern)) continue;
            if (s.to_pattern && !matchGlob(to, s.to_pattern)) continue;
            if (s.subject_pattern && !matchGlob(subject, s.subject_pattern)) continue;
            return s;
        }
        return null;
    }
}

/** Simple glob matching: * matches anything, otherwise exact match */
function matchGlob(value: string, pattern: string): boolean {
    if (!pattern) return true;
    if (pattern === "*") return true;
    // Support simple * wildcard in pattern
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try {
        return new RegExp("^" + escaped + "$", "i").test(value);
    } catch {
        return value.toLowerCase().includes(pattern.toLowerCase());
    }
}
