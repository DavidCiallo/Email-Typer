import Repository from "../../lib/repository";
import { StrategyEntity } from "../../../shared/modules/strategy/strategy.entity";
import { SettingsService } from "../settings/settings.service";

const strategyRepository: Repository<StrategyEntity> = Repository.instance("Strategy");
const grantRepository: Repository<import("../../../shared/modules/mailbox/mailbox-grant.entity").MailboxGrantEntity> =
    Repository.instance("MailboxGrant");

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
            // Create new — default to enabled unless explicitly disabled
            if (strategy.enabled === undefined) strategy.enabled = 1;
            return await strategyRepository.insert(strategy);
        }
    }

    static async delete(id: string): Promise<boolean> {
        return await strategyRepository.delete({ id } as any);
    }

    /**
     * Run matching and forwarding for a received email. The body is passed in
     * by the caller (it's in memory at ingest time and not stored in the index).
     */
    static async matchAndForward(email: { from: string; to: string; subject: string; html?: string; text?: string; time?: number }, body?: { html?: string; text?: string }): Promise<void> {
        const strategy = await StrategyService.matchStrategy(email.from, email.to, email.subject);
        if (!strategy || !strategy.forward_to) return;

        const { sendEmail } = await import("../email/email.service");
        const from = StrategyService.resolveForwardFrom(email.from, strategy.forward_to);
        // domain rewriting loses the original sender — surface it in the body
        // block and keep a reply path back to the real author
        const replyTo = bareAddress(email.from);
        const html = body?.html ?? email.html ?? "";
        const text = body?.text ?? email.text ?? "";
        await sendEmail({
            from,
            to: strategy.forward_to,
            subject: `Fwd: ${email.subject}`,
            html: html
                ? forwardPreambleHtml(email.from, email.to) + html
                : forwardPreamblePlain(email.from, email.to) + text,
            replyTo: replyTo || undefined,
            // loop guard: if this copy ever re-enters the system (remote
            // forwarders, scrapers pushing back over the API), ingest sees
            // the stamp and stores it without forwarding again
            headers: { "X-CFRS-Forwarded": "1" },
        });
        console.log(`[Strategy] Forwarded email from ${from} to ${strategy.forward_to}`);
    }

    /**
     * Resolve the from address for forwarding.
     * If the original from domain is in allowed_from_domains, keep it as-is.
     * Otherwise, convert to: localpart__domain@allowedDomain
     *   e.g. corfer.wei@yeah.net → corfer.wei__yeah_net@allowedDomain
     *   - preferred: same domain as the recipient (forward_to)
     *   - fallback: first allowed_from_domain
     */
    static resolveForwardFrom(originalFrom: string, forwardTo: string): string {
        // Extract email from possible "Name <email>" format
        const emailMatch = originalFrom.match(/[\w.+-]+@[\w.-]+/);
        const rawEmail = emailMatch ? emailMatch[0] : originalFrom;
        const fromDomain = (rawEmail.split("@")[1] || "").toLowerCase();
        const allowedFrom = (SettingsService.get("allowed_from_domains") || SettingsService.get("allowed_domains") || "")
            .split(",").map(d => d.trim().toLowerCase()).filter(Boolean);

        // Already a sendable domain — keep original
        if (this.sendableDomains().includes(fromDomain)) return rawEmail;

        // Convert to localpart__domain: corfer.wei@yeah.net → corfer.wei__yeah_net
        const localPart = rawEmail.split("@")[0] || "unknown";
        const safeDomain = fromDomain.replace(/[^a-zA-Z0-9]/g, "_") || "unknown";
        const convertedLocal = `${localPart}__${safeDomain}`;

        // Rewrite onto a domain that actually has a Resend key — preferring the
        // recipient's domain — otherwise the forward is guaranteed to 403
        const sendable = this.sendableDomains();
        const toDomain = (forwardTo.split("@")[1] || "").toLowerCase();
        if (sendable.includes(toDomain)) {
            return `${convertedLocal}@${toDomain}`;
        }
        if (sendable.length) {
            return `${convertedLocal}@${sendable[0]}`;
        }

        // Fallback to first allowed domain
        return `${convertedLocal}@${allowedFrom[0] || "example.com"}`;
    }

    /** Domains with an explicit Resend key in resend_api_keys. */
    static sendableDomains(): string[] {
        return (SettingsService.get("resend_api_keys") || "")
            .split(",")
            .map(pair => pair.split(":")[0].trim().toLowerCase())
            .filter(Boolean);
    }

    /**
     * Find matching strategies for an email.
     * Returns the first matching enabled strategy or null.
     */
    static async matchStrategy(from: string, to: string, subject: string): Promise<StrategyEntity | null> {
        // temp strategies stay armed only while their grant is inside its
        // window — expiry / revocation disarms them instantly, no writes
        const now = Date.now();
        const grantLive = new Map<string, boolean>();
        await grantRepository.findEach((g) => {
            grantLive.set(g.id, !g.delete_time && now >= g.start_time && now <= g.end_time);
        });
        let best: StrategyEntity | null = null;
        await strategyRepository.findEach((s) => {
            if (best) return;
            if (s.scope === "temp" && !grantLive.get(s.grant_id || "")) return;
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

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Pull the bare address out of a possibly "Name <a@b>" header value. */
function bareAddress(value: string): string {
    const m = (value || "").match(/[\w.+-]+@[\w.-]+/);
    return m ? m[0] : "";
}

/** Small muted byline at the top of forwarded mail — labeled provenance in two unobtrusive lines. */
function forwardPreambleHtml(from: string, to: string): string {
    return `<div style="margin:0 0 12px;font:12px/1.6 sans-serif;color:#999;">原发件人：${escapeHtml(from)}<br>原收件人：${escapeHtml(to)}</div><hr style="border:none;border-top:1px solid #eee;margin:0 0 12px;">`;
}

function forwardPreamblePlain(from: string, to: string): string {
    return `原发件人：${from}\n原收件人：${to}\n\n`;
}
