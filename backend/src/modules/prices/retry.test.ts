import { describe, expect, it } from 'vitest';
import { PRICE_ERROR_CODES, PriceProviderError } from './errors';
import { withRetry } from './retry';

function err(code: keyof typeof PRICE_ERROR_CODES, retryable: boolean) {
  return new PriceProviderError({ code: PRICE_ERROR_CODES[code], provider: 'test', message: code, retryable });
}

describe('withRetry (PLAN §24 bounded retry)', () => {
  it('returns first success without sleeping', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const out = await withRetry(
      async () => {
        calls += 1;
        return 'ok';
      },
      { sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(out).toBe('ok');
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('retries retryable errors (timeout) then succeeds', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const out = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw err('PROVIDER_TIMEOUT', true);
        return 'recovered';
      },
      { maxAttempts: 2, backoffMs: 100, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(out).toBe('recovered');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([100]);
  });

  it('gives up after maxAttempts and throws the last error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw err('PROVIDER_UNAVAILABLE', true);
        },
        { maxAttempts: 3, backoffMs: 50, sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ code: PRICE_ERROR_CODES.PROVIDER_UNAVAILABLE });
    expect(calls).toBe(3);
  });

  it('never retries non-retryable errors (404, bad shape, bad key)', async () => {
    for (const code of ['ASSET_NOT_FOUND', 'PROVIDER_BAD_RESPONSE', 'PROVIDER_NOT_CONFIGURED'] as const) {
      let calls = 0;
      await expect(
        withRetry(
          async () => {
            calls += 1;
            throw err(code, false);
          },
          { maxAttempts: 3, sleep: async () => undefined },
        ),
      ).rejects.toMatchObject({ code: PRICE_ERROR_CODES[code] });
      expect(calls).toBe(1);
    }
  });

  it('maxAttempts: 1 disables retry entirely', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw err('PROVIDER_TIMEOUT', true);
        },
        { maxAttempts: 1, sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ code: PRICE_ERROR_CODES.PROVIDER_TIMEOUT });
    expect(calls).toBe(1);
  });

  it('backs off linearly (base × attempt)', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw err('PROVIDER_RATE_LIMITED', true);
        },
        { maxAttempts: 3, backoffMs: 200, sleep: async (ms) => void sleeps.push(ms) },
      ),
    ).rejects.toBeDefined();
    expect(sleeps).toEqual([200, 400]);
  });
});
