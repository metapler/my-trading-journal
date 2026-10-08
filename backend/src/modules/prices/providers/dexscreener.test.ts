import { describe, expect, it } from 'vitest';
import { detectQueryKind, looksLikeContractAddress, sameContract, shortenContract } from '../addresses';
import { PRICE_ERROR_CODES, PriceProviderError } from '../errors';
import { fetchJson, type FetchFn, type FetchResponseLike } from '../http';
import { createProviderRegistry, resolveProviderName } from '../registry';
import type { CurrentPrice } from '../types';
import { DexscreenerProvider } from './dexscreener';

function jsonRes(body: unknown, status = 200): FetchResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubFetch(handler: (url: string) => FetchResponseLike | Promise<FetchResponseLike>): FetchFn & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    return handler(url);
  }) as unknown as FetchFn & { calls: string[] };
  fn.calls = calls;
  return fn;
}

function pair(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 'solana',
    dexId: 'raydium',
    url: 'https://dexscreener.com/solana/PAIR1',
    pairAddress: 'PAIR1',
    baseToken: { address: 'So11111111111111111111111111111111111111112', name: 'Wrapped SOL', symbol: 'SOL' },
    quoteToken: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', name: 'USD Coin', symbol: 'USDC' },
    priceUsd: '120.13',
    liquidity: { usd: 37141195.01, base: 154708, quote: 18593829 },
    volume: { h24: 13608987.24 },
    marketCap: 1467673362,
    fdv: 2510364426,
    info: { imageUrl: 'https://example.com/sol.png' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// addresses
// ---------------------------------------------------------------------------

describe('addresses', () => {
  it('detects EVM, Solana base58, and Sui contract shapes', () => {
    expect(looksLikeContractAddress('0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82')).toBe(true);
    expect(looksLikeContractAddress('So11111111111111111111111111111111111111112')).toBe(true);
    expect(looksLikeContractAddress('0x' + 'ab'.repeat(32))).toBe(true);
    expect(looksLikeContractAddress('SOL')).toBe(false);
    expect(looksLikeContractAddress('Wrapped Solana')).toBe(false);
    expect(looksLikeContractAddress('')).toBe(false);
  });

  it('detectQueryKind splits contract vs text', () => {
    expect(detectQueryKind('So11111111111111111111111111111111111111112')).toBe('contract');
    expect(detectQueryKind('PEPE')).toBe('text');
  });

  it('sameContract is case-insensitive for EVM hex, exact otherwise', () => {
    expect(sameContract('0xABCDEF1234567890abcdef1234567890ABCDEF12', '0xabcdef1234567890abcdef1234567890abcdef12')).toBe(true);
    expect(sameContract('So11111111111111111111111111111111111111112', 'so11111111111111111111111111111111111111112')).toBe(false);
  });

  it('shortenContract keeps full value available, shortens display', () => {
    const addr = '0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82';
    expect(shortenContract(addr)).toContain('…');
    expect(shortenContract('SOL')).toBe('SOL');
  });
});

// ---------------------------------------------------------------------------
// searchAssets
// ---------------------------------------------------------------------------

describe('DexscreenerProvider.searchAssets', () => {
  it('contract query returns exact-match pairs ranked by liquidity (deep first)', async () => {
    const deep = pair({ pairAddress: 'DEEP', liquidity: { usd: 37_000_000 }, volume: { h24: 1_000 } });
    const shallow = pair({ pairAddress: 'SHALLOW', liquidity: { usd: 19_000 }, volume: { h24: 70_000 } });
    const unrelated = pair({
      pairAddress: 'OTHER',
      baseToken: { address: 'OTHERTOKEN111111111111111111111111111', name: 'Other', symbol: 'OTH' },
      liquidity: { usd: 999_999_999 },
    });
    const fetchFn = stubFetch(() => jsonRes({ pairs: [shallow, unrelated, deep] }));
    const provider = new DexscreenerProvider({ fetchFn });

    const results = await provider.searchAssets('So11111111111111111111111111111111111111112');

    // Unrelated token filtered out; shallow NOT silently promoted over deep.
    expect(results.map((r) => r.pairAddress)).toEqual(['DEEP', 'SHALLOW']);
    expect(results[0].exactContractMatch).toBe(true);
    expect(results[0].chain).toBe('solana');
    expect(results[0].contractAddress).toBe('So11111111111111111111111111111111111111112');
    expect(results[0].provider).toBe('dexscreener');
    expect(typeof results[0].priceUsd).toBe('string');
  });

  it('text query returns multiple candidates for ambiguous ticker', async () => {
    const fetchFn = stubFetch(() =>
      jsonRes({
        pairs: [
          pair({ chainId: 'solana', pairAddress: 'A', liquidity: { usd: 100 } }),
          pair({ chainId: 'base', pairAddress: 'B', liquidity: { usd: 200 } }),
          pair({ chainId: 'ethereum', pairAddress: 'C', liquidity: { usd: 50 } }),
        ],
      }),
    );
    const provider = new DexscreenerProvider({ fetchFn });
    const results = await provider.searchAssets('SOL');
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.exactContractMatch === false)).toBe(true);
    // Ranked by liquidity desc: B, A, C
    expect(results.map((r) => r.pairAddress)).toEqual(['B', 'A', 'C']);
    expect(fetchFn.calls[0]).toContain('/latest/dex/search?q=SOL');
  });

  it('normalizes numbers to canonical decimal strings and nulls for missing', async () => {
    const fetchFn = stubFetch(() =>
      jsonRes({
        pairs: [
          pair({
            pairAddress: 'P1',
            priceUsd: 120.19,
            liquidity: { usd: 683946.94 },
            marketCap: null,
            fdv: undefined,
            info: {},
          }),
        ],
      }),
    );
    const provider = new DexscreenerProvider({ fetchFn });
    const [r] = await provider.searchAssets('SOL');
    expect(r.priceUsd).toBe('120.19');
    expect(r.liquidityUsd).toBe('683946.94');
    expect(r.marketCapUsd).toBeNull();
    expect(r.fdvUsd).toBeNull();
    expect(r.imageUrl).toBeNull();
  });

  it('rejects empty query without calling network', async () => {
    const fetchFn = stubFetch(() => jsonRes({ pairs: [] }));
    const provider = new DexscreenerProvider({ fetchFn });
    await expect(provider.searchAssets('   ')).rejects.toMatchObject({ code: PRICE_ERROR_CODES.INVALID_QUERY });
    expect(fetchFn.calls).toHaveLength(0);
  });

  it('malformed shape throws PROVIDER_BAD_RESPONSE', async () => {
    const fetchFn = stubFetch(() => jsonRes({ nope: true }));
    const provider = new DexscreenerProvider({ fetchFn });
    await expect(provider.searchAssets('SOL')).rejects.toMatchObject({ code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE });
  });
});

// ---------------------------------------------------------------------------
// getCurrentPrice
// ---------------------------------------------------------------------------

describe('DexscreenerProvider.getCurrentPrice', () => {
  it('pair-pinned asset hits pair endpoint and returns normalized CurrentPrice', async () => {
    const fetchFn = stubFetch((url) => {
      expect(url).toContain('/latest/dex/pairs/solana/PAIR1');
      return jsonRes({ pair: pair({ pairAddress: 'PAIR1' }) });
    });
    const provider = new DexscreenerProvider({ fetchFn });
    const price: CurrentPrice = await provider.getCurrentPrice({ chain: 'solana', pairAddress: 'PAIR1' });
    expect(price.priceUsd).toBe('120.13');
    expect(price.source).toBe('dexscreener');
    expect(typeof price.fetchedAt).toBe('string');
    expect(price.chain).toBe('solana');
    expect(price.pairAddress).toBe('PAIR1');
    expect(price.liquidityUsd).toBe('37141195.01');
  });

  it('chain+contract resolves deepest pair (low liquidity never wins silently)', async () => {
    const fetchFn = stubFetch((url) => {
      expect(url).toContain('/token-pairs/v1/solana/');
      return jsonRes([
        pair({ pairAddress: 'THIN', priceUsd: '999.99', liquidity: { usd: 100 } }),
        pair({ pairAddress: 'DEEP', priceUsd: '120.13', liquidity: { usd: 37_000_000 } }),
      ]);
    });
    const provider = new DexscreenerProvider({ fetchFn });
    const price = await provider.getCurrentPrice({
      chain: 'solana',
      contractAddress: 'So11111111111111111111111111111111111111112',
    });
    expect(price.priceUsd).toBe('120.13');
    expect(price.pairAddress).toBe('DEEP');
  });

  it('requires chain for pair lookup and identifiers otherwise', async () => {
    const provider = new DexscreenerProvider({ fetchFn: stubFetch(() => jsonRes({})) });
    await expect(provider.getCurrentPrice({ pairAddress: 'PAIR1' })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.MISSING_IDENTIFIER,
    });
    await expect(provider.getCurrentPrice({})).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.MISSING_IDENTIFIER,
    });
  });

  it('empty pair list throws ASSET_NOT_FOUND (never 0)', async () => {
    const fetchFn = stubFetch(() => jsonRes([]));
    const provider = new DexscreenerProvider({ fetchFn });
    await expect(
      provider.getCurrentPrice({ chain: 'solana', contractAddress: 'So11111111111111111111111111111111111111112' }),
    ).rejects.toMatchObject({ code: PRICE_ERROR_CODES.ASSET_NOT_FOUND });
  });

  it('pair without usable price throws instead of returning 0', async () => {
    const fetchFn = stubFetch(() => jsonRes({ pair: pair({ priceUsd: null }) }));
    const provider = new DexscreenerProvider({ fetchFn });
    await expect(provider.getCurrentPrice({ chain: 'solana', pairAddress: 'PAIR1' })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
    });
  });
});

// ---------------------------------------------------------------------------
// http error mapping
// ---------------------------------------------------------------------------

describe('fetchJson error mapping', () => {
  it('maps 404 / 429 / 5xx / bad-json / network / timeout', async () => {
    const base = { provider: 'dexscreener', url: 'https://x.test', timeoutMs: 1000 };

    await expect(fetchJson({ ...base, fetchFn: async () => jsonRes({}, 404) })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.ASSET_NOT_FOUND,
    });
    await expect(fetchJson({ ...base, fetchFn: async () => jsonRes({}, 429) })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.PROVIDER_RATE_LIMITED,
    });
    await expect(fetchJson({ ...base, fetchFn: async () => jsonRes({}, 503) })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.PROVIDER_UNAVAILABLE,
    });
    await expect(
      fetchJson({
        ...base,
        fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new Error('nope'); } }),
      }),
    ).rejects.toMatchObject({ code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE });
    await expect(
      fetchJson({
        ...base,
        fetchFn: async () => { throw new Error('boom'); },
      }),
    ).rejects.toMatchObject({ code: PRICE_ERROR_CODES.PROVIDER_UNAVAILABLE });

    const hanging: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    await expect(fetchJson({ ...base, timeoutMs: 10, fetchFn: hanging })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.PROVIDER_TIMEOUT,
    });
  });
});

// ---------------------------------------------------------------------------
// bounded retry engagement (PLAN §24)
// ---------------------------------------------------------------------------

describe('provider retry engagement', () => {
  it('retries a transient 503 then succeeds', async () => {
    let calls = 0;
    const fetchFn = stubFetch(() => {
      calls += 1;
      return calls === 1 ? jsonRes({}, 503) : jsonRes({ pairs: [] });
    });
    const provider = new DexscreenerProvider({ fetchFn, maxAttempts: 2 });
    // Empty pairs → [] results, but the point is 2 calls happened (retry engaged).
    const results = await provider.searchAssets('SOL');
    expect(results).toEqual([]);
    expect(calls).toBe(2);
  });

  it('does not retry 404 (non-retryable)', async () => {
    let calls = 0;
    const fetchFn = stubFetch(() => {
      calls += 1;
      return jsonRes({}, 404);
    });
    const provider = new DexscreenerProvider({ fetchFn, maxAttempts: 3 });
    await expect(
      provider.getCurrentPrice({ chain: 'solana', contractAddress: 'So11111111111111111111111111111111111111112' }),
    ).rejects.toMatchObject({ code: PRICE_ERROR_CODES.ASSET_NOT_FOUND });
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

describe('provider registry', () => {
  it('resolves deterministically; preferred provider wins', () => {
    const dex = new DexscreenerProvider({ fetchFn: stubFetch(() => jsonRes({ pairs: [] })) });
    const registry = createProviderRegistry([dex]);
    expect(registry.names()).toEqual(['dexscreener']);
    expect(resolveProviderName({ chain: 'solana', contractAddress: 'So11' })).toBe('dexscreener');
    expect(resolveProviderName({ chain: 'solana', preferredPriceProvider: 'dexscreener' })).toBe('dexscreener');
    expect(registry.resolve({ chain: 'solana' }).name).toBe('dexscreener');
    expect(() => registry.get('coinmarketcap')).toThrow(PriceProviderError);
  });

  it('provider errors never leak raw stacks (code + provider present)', async () => {
    const fetchFn = stubFetch(() => jsonRes({}, 500));
    const provider = new DexscreenerProvider({ fetchFn });
    const err = await provider.searchAssets('SOL').catch((e) => e);
    expect(err).toBeInstanceOf(PriceProviderError);
    expect(typeof err.code).toBe('string');
    expect(err.provider).toBe('dexscreener');
    expect(err.message.startsWith('[dexscreener]')).toBe(true);
  });
});
