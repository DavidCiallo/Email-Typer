import Repository from "../../lib/repository";
import { StrategyEntity } from "../../../shared/modules/strategy/strategy.entity";
import { SettingsService } from "../settings/settings.service";

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
        const from = StrategyService.resolveForwardFrom(email.from, strategy.forward_to);
        await sendEmail({
            from,
            to: strategy.forward_to,
            subject: `Fwd: ${email.subject}`,
            html: content,
        });
        console.log(`[Strategy] Forwarded email from ${from} to ${strategy.forward_to}`);
    }

    /**
     * Resolve the from address for forwarding.
     * If the original from domain is in allowed_from_domains, keep it as-is.
     * Otherwise, convert domain to: domain_tld@allowedDomain
     *   - preferred: same domain as the recipient (forward_to)
     *   - fallback: first allowed_from_domain
     */
    static resolveForwardFrom(originalFrom: string, forwardTo: string): string {
        const fromDomain = (originalFrom.split("@")[1] || "").toLowerCase();
        const allowedFrom = (SettingsService.get("allowed_from_domains") || SettingsService.get("allowed_domains") || "")
            .split(",").map(d => d.trim().toLowerCase()).filter(Boolean);

        // Already an allowed domain — keep original
        if (allowedFrom.includes(fromDomain)) return originalFrom;

        // Convert domain to safe local part: yeah.net → yeah_net
        const safeDomain = fromDomain.replace(/[^a-zA-Z0-9]/g, "_") || "unknown";

        // Prefer recipient's domain if it's in allowed list
        const toDomain = (forwardTo.split("@")[1] || "").toLowerCase();
        if (allowedFrom.includes(toDomain)) {
            return `${safeDomain}@${toDomain}`;
        }

        // Fallback to first allowed domain
        return `${safeDomain}@${allowedFrom[0] || "example.com"}`;
    }

    /**
     * Find matching strategies for an email.
     * Returns the first matching enabled strategy or null.
     */
    static async matchStrategy(from: string, to: string, subject: string): Promise<StrategyEntity | null> {
        let best: StrategyEntity | null = null;
        await strategyRepository.findEach((s) => {
            if (best) return;
            if (s.from_pattern && !matchGlob(from, s.from_pattern)) return;
            if (s.to_pattern && !matchGlob(to, s.to_pattern)) return;
            if (s.subject_pattern && !matchGlob(subject, s.subject_pattern)) return;
            best = s;
        }, { where: { enabled: 1 } });
        return best;
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
