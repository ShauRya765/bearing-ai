// Best-effort in-memory fixed-window rate limiter for phase 1.
//
// NOTE: state lives in a single process, so on a multi-instance/serverless
// deploy each instance keeps its own counter — the effective limit is
// (limit × instances). That's fine as an abuse guard for launch; swap in a
// shared store (Upstash Redis, etc.) before this needs to be exact.

interface Window {
    count: number;
    resetAt: number;
}

const buckets = new Map<string, Window>();

// Occasionally drop expired buckets so the map can't grow unbounded.
function sweep(now: number) {
    if (buckets.size < 5000) return;
    for (const [key, w] of buckets) {
        if (w.resetAt <= now) buckets.delete(key);
    }
}

export interface RateLimitResult {
    ok: boolean;
    remaining: number;
    /** Unix ms when the current window resets. */
    resetAt: number;
    /** Seconds until reset — for a Retry-After header. */
    retryAfter: number;
}

export function checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
): RateLimitResult {
    const now = Date.now();
    sweep(now);

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
        const resetAt = now + windowMs;
        buckets.set(key, { count: 1, resetAt });
        return { ok: true, remaining: limit - 1, resetAt, retryAfter: 0 };
    }

    existing.count += 1;
    const remaining = Math.max(0, limit - existing.count);
    return {
        ok: existing.count <= limit,
        remaining,
        resetAt: existing.resetAt,
        retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
}
