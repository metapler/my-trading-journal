import { PRICE_ERROR_CODES, PriceProviderError } from './errors';

/** Minimal fetch surface so tests can inject stubs. Global fetch satisfies this. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

const globalFetch = fetch as unknown as FetchFn;

export const defaultFetchFn: FetchFn = (url, init) => globalFetch(url, init);

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /aborted|abortion/i.test(e.message));
}

/**
 * GET JSON with a hard timeout. Maps transport/HTTP failures to normalized
 * PriceProviderError codes. Never throws raw fetch errors.
 */
export async function fetchJson(opts: {
  provider: string;
  url: string;
  timeoutMs: number;
  fetchFn?: FetchFn;
  headers?: Record<string, string>;
}): Promise<unknown> {
  const fetchFn = opts.fetchFn ?? defaultFetchFn;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    let res: FetchResponseLike;
    try {
      res = await fetchFn(opts.url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
      });
    } catch (e) {
      if (isAbortError(e)) {
        throw new PriceProviderError({
          code: PRICE_ERROR_CODES.PROVIDER_TIMEOUT,
          provider: opts.provider,
          message: `Request timed out after ${opts.timeoutMs}ms.`,
          retryable: true,
        });
      }
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        provider: opts.provider,
        message: `Network error: ${e instanceof Error ? e.message : String(e)}`,
        retryable: true,
      });
    }

    if (!res.ok) {
      if (res.status === 404) {
        throw new PriceProviderError({
          code: PRICE_ERROR_CODES.ASSET_NOT_FOUND,
          provider: opts.provider,
          message: `Provider returned 404 for ${opts.url}.`,
          statusHint: 404,
        });
      }
      if (res.status === 429) {
        throw new PriceProviderError({
          code: PRICE_ERROR_CODES.PROVIDER_RATE_LIMITED,
          provider: opts.provider,
          message: 'Provider rate limit exceeded.',
          retryable: true,
          statusHint: 429,
        });
      }
      if (res.status >= 500) {
        throw new PriceProviderError({
          code: PRICE_ERROR_CODES.PROVIDER_UNAVAILABLE,
          provider: opts.provider,
          message: `Provider returned HTTP ${res.status}.`,
          retryable: true,
          statusHint: res.status,
        });
      }
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
        provider: opts.provider,
        message: `Provider returned HTTP ${res.status}.`,
        statusHint: res.status,
      });
    }

    try {
      return await res.json();
    } catch {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
        provider: opts.provider,
        message: 'Provider returned invalid JSON.',
      });
    }
  } finally {
    clearTimeout(timer);
  }
}
