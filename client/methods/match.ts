/**
 * Simple glob matching — mirrors server/modules/strategy/strategy.service.ts matchGlob.
 * `*` matches anything, otherwise case-insensitive full match.
 */
export function wildcardMatch(value: string, pattern: string): boolean {
    if (!pattern) return true;
    if (pattern === "*") return true;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try {
        return new RegExp("^" + escaped + "$", "i").test(value);
    } catch {
        return value.toLowerCase().includes(pattern.toLowerCase());
    }
}

export type StrategyLike = {
    name?: string;
    from_pattern?: string;
    to_pattern?: string;
    subject_pattern?: string;
    forward_to?: string;
    enabled?: number;
    create_time?: number | null;
};

/**
 * Preview which strategy would win for a given email.
 * Winner semantics match the server: first matching enabled strategy in insertion order.
 */
export function testStrategies(
    strategies: StrategyLike[],
    input: { from: string; to: string; subject: string },
): { winner: StrategyLike | null; matched: StrategyLike[] } {
    const matched = strategies.filter(
        (s) =>
            s.enabled === 1 &&
            (!s.from_pattern || wildcardMatch(input.from, s.from_pattern)) &&
            (!s.to_pattern || wildcardMatch(input.to, s.to_pattern)) &&
            (!s.subject_pattern || wildcardMatch(input.subject, s.subject_pattern)),
    );
    const sorted = [...matched].sort(
        (a, b) => (a.create_time || 0) - (b.create_time || 0),
    );
    return { winner: sorted[0] || null, matched };
}
