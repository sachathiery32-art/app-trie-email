import "server-only";

const WINDOW_MS = 10 * 60 * 1_000;
const MAX_REQUESTS_PER_WINDOW = 20;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalRateLimit = globalThis as typeof globalThis & {
  emailOrganizerRateLimits?: Map<string, RateLimitBucket>;
};

const rateLimitBuckets =
  globalRateLimit.emailOrganizerRateLimits ?? new Map<string, RateLimitBucket>();

globalRateLimit.emailOrganizerRateLimits = rateLimitBuckets;

function getClientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "local-development";
}

/**
 * Limitation légère adaptée à la démonstration.
 * Une production multi-instance devra utiliser un stockage partagé comme Redis.
 */
export function checkAiRateLimit(request: Request) {
  const now = Date.now();
  const identifier = getClientIdentifier(request);
  const currentBucket = rateLimitBuckets.get(identifier);

  if (!currentBucket || currentBucket.resetAt <= now) {
    rateLimitBuckets.set(identifier, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });

    return { allowed: true, retryAfterSeconds: 0 } as const;
  }

  if (currentBucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((currentBucket.resetAt - now) / 1_000),
      ),
    } as const;
  }

  currentBucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 } as const;
}
