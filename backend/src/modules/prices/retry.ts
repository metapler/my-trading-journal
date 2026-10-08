import { PriceProviderError } from './errors';

export interface RetryOptions {
  /** Max attempts total (1 = no retry). Default 2. */
  maxAttempts?: number;
  /** Base backoff ms between attempts (linear: base × attempt). Default 250. */
  backoffMs?: number;
  /** Sleep override for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS = 250;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Bounded retry for safe (idempotent GET) provider requests (PLAN §24).
 * Retries ONLY errors flagged retryable (timeout, 5xx, network blips).
 * Never retries 4xx, bad-shape, not-found, or unconfigured errors — those
 * fail identically on every attempt and would waste upstream credits.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const retryable = e instanceof PriceProviderError && e.retryable;
      if (!retryable || attempt >= maxAttempts) throw e;
      await sleep(backoffMs * attempt);
    }
  }
  throw lastError;
}
