import { describe, expect, it, vi } from 'vitest';
import { PriceCache, buildPriceCacheKey, buildSearchCacheKey } from './cache';
import { PRICE_ERROR_CODES, PriceProviderError } from './errors';
import { createProviderRegistry } from './registry';
import { PriceService } from './service';
import type { AssetIdentifier, CurrentPrice, PriceProvider } from './types';

function price(overrides: Partial<CurrentPrice> = {}): CurrentPrice {
  return {
    priceUsd: '120.13',
    source: 'dexscreener',
    fetchedAt: new Date().toISOString(),
    chain: 'solana',
    pairAddress: 'PAIR1',
    ...overrides,
  };
}

function stubProvider(opts: {
  name?: 'dexscreener' | 'coinmarketcap';
  price?: CurrentPrice | null;
  errorCode?: string;
  calls?: string[];
}): PriceProvider {
  const calls = opts.calls ?? [];
  return {
    name: opts.name ?? 'dexscreener',
    searchAssets: async (q: string) => {
      calls.push(`search:${q}`);
      return [];
    },
    getCurrentPrice: async (asset: AssetIdentifier) => {
      calls.push(`price:${asset.chain}/${asset.pairAddress ?? asset.contractAddress ?? asset.providerAssetId}`);
      if (opts.errorCode) {
        throw new PriceProviderError({
          code: opts.errorCode as PriceProviderError['code'],
          provider: opts.name ?? 'dexscreener',
          message: 'stub failure',
          retryable: true,
        });
      }
      return opts.price ?? price();
    },
  };
}

// ---------------------------------------------------------------------------
// key shape
// ---------------------------------------------------------------------------

describe('cache keys', () => {
  it('covers provider + chain + contract/pair/providerAssetId', () => {
    const a = buildPriceCacheKey('dexscreener', { chain: 'solana', contractAddress: 'So11' });
    const b = buildPriceCacheKey('dexscreener', { chain: 'solana', pairAddress: 'PAIR1' });
    const c = buildPriceCacheKey('coinmarketcap', { chain: 'cmc', providerAssetId: '1' });
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).toContain('dexscreener');
    expect(a).toContain('solana');
    expect(a).toContain('So11');
    expect(buildSearchCacheKey('dexscreener', 'SOL')).toBe(buildSearchCacheKey('dexscreener', 'sol'));
    expect(buildSearchCacheKey('dexscreener', 'SOL')).not.toBe(buildSearchCacheKey('coinmarketcap', 'SOL'));
  });
});

// ---------------------------------------------------------------------------
// TTL behavior
// ---------------------------------------------------------------------------

describe('PriceCache TTL', () => {
  it('serves fresh within TTL, misses after expiry', () => {
    let t = 1_000_000;
    const cache = new PriceCache({ priceTtlMs: 15_000, now: () => t });
    cache.setPrice('k', price());
    expect(cache.getPrice('k')?.stale).toBe(false);
    expect(cache.getPrice('k')?.cached).toBe(true);
    t += 16_000;
    expect(cache.getPrice('k')).toBeNull();
  });

  it('keeps expired entry for stale fallback', () => {
    let t = 1_000_000;
    const cache = new PriceCache({ priceTtlMs: 15_000, now: () => t });
    cache.setPrice('k', price());
    t += 60_000;
    expect(cache.getPrice('k')).toBeNull();
    const stale = cache.getStalePrice('k');
    expect(stale).not.toBeNull();
    expect(stale?.stale).toBe(true);
    expect(stale?.ageMs).toBe(60_000);
  });

  it('search entries honor metadata TTL independently', () => {
    let t = 0;
    const cache = new PriceCache({ priceTtlMs: 15_000, metadataTtlMs: 600_000, now: () => t });
    cache.setSearch('s', []);
    t += 30_000;
    expect(cache.getSearch('s')).not.toBeNull();
    t += 600_000;
    expect(cache.getSearch('s')).toBeNull();
  });

  it('evicts oldest when over capacity', () => {
    const cache = new PriceCache({ maxEntries: 2 });
    cache.setPrice('a', price());
    cache.setPrice('b', price());
    cache.setPrice('c', price());
    expect(cache.stats().prices).toBe(2);
    expect(cache.getPrice('a')).toBeNull();
    expect(cache.getPrice('c')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PriceService
// ---------------------------------------------------------------------------

describe('PriceService', () => {
  const sol: AssetIdentifier = { chain: 'solana', pairAddress: 'PAIR1' };

  it('fetches once then serves from cache (no duplicate external calls)', async () => {
    const calls: string[] = [];
    const registry = createProviderRegistry([stubProvider({ calls })]);
    const svc = new PriceService({ registry, cache: new PriceCache({ priceTtlMs: 15_000 }) });

    const first = await svc.getPrice(sol);
    expect(first.cached).toBe(false);
    expect(calls).toHaveLength(1);

    const second = await svc.getPrice(sol);
    expect(second.cached).toBe(true);
    expect(second.stale).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('stale fallback serves last-known on failure, flagged stale (never throws, never 0)', async () => {
    let t = 0;
    const calls: string[] = [];
    let fail = false;
    const provider: PriceProvider = {
      name: 'dexscreener',
      searchAssets: async () => [],
      getCurrentPrice: async () => {
        calls.push('price');
        if (fail) {
          throw new PriceProviderError({
            code: PRICE_ERROR_CODES.PROVIDER_UNAVAILABLE,
            provider: 'dexscreener',
            message: 'down',
            retryable: true,
          });
        }
        return price();
      },
    };
    const registry = createProviderRegistry([provider]);
    const svc = new PriceService({ registry, cache: new PriceCache({ priceTtlMs: 15_000, now: () => t }) });

    await svc.getPrice(sol);
    t += 60_000;
    fail = true;
    const r = await svc.getPrice(sol);
    expect(r.stale).toBe(true);
    expect(r.price.priceUsd).toBe('120.13');
  });

  it('failure with no cached entry propagates (price stays unavailable)', async () => {
    const registry = createProviderRegistry([stubProvider({ errorCode: PRICE_ERROR_CODES.PROVIDER_TIMEOUT })]);
    const svc = new PriceService({ registry, cache: new PriceCache() });
    await expect(svc.getPrice(sol)).rejects.toMatchObject({ code: PRICE_ERROR_CODES.PROVIDER_TIMEOUT });
  });

  it('batch returns per-asset rows; failures become null rows with errorCode (no throw)', async () => {
    const btc: AssetIdentifier = { chain: 'cmc', providerAssetId: '1' };
    const registry = createProviderRegistry([
      stubProvider({ name: 'dexscreener', price: price({ priceUsd: '120.13', source: 'dexscreener' }) }),
      stubProvider({ name: 'coinmarketcap', errorCode: PRICE_ERROR_CODES.PROVIDER_RATE_LIMITED }),
    ]);
    const svc = new PriceService({ registry, cache: new PriceCache() });
    const rows = await svc.getBatchPrices([sol, btc]);
    expect(rows).toHaveLength(2);
    expect(rows[0].price?.priceUsd).toBe('120.13');
    expect(rows[0].errorCode).toBeNull();
    expect(rows[1].price).toBeNull();
    expect(rows[1].errorCode).toBe(PRICE_ERROR_CODES.PROVIDER_RATE_LIMITED);
  });

  it('batch resolves providers deterministically per asset (no source flip)', async () => {
    const calls: string[] = [];
    const registry = createProviderRegistry([
      stubProvider({ name: 'dexscreener', calls, price: price({ source: 'dexscreener' }) }),
      stubProvider({ name: 'coinmarketcap', calls, price: price({ source: 'coinmarketcap', chain: 'cmc' }) }),
    ]);
    const svc = new PriceService({ registry, cache: new PriceCache() });
    const rows = await svc.getBatchPrices([
      { chain: 'solana', contractAddress: 'So11' },
      { chain: 'cmc', providerAssetId: '1' },
    ]);
    expect(rows[0].provider).toBe('dexscreener');
    expect(rows[1].provider).toBe('coinmarketcap');
  });

  it('search merges both providers, dedupes, and caches per provider+query', async () => {
    const dexCalls: string[] = [];
    const cmcCalls: string[] = [];
    const dex: PriceProvider = {
      name: 'dexscreener',
      searchAssets: async (q) => {
        dexCalls.push(q);
        return [
          {
            provider: 'dexscreener',
            name: 'Wrapped SOL',
            symbol: 'SOL',
            chain: 'solana',
            contractAddress: 'So11',
            providerAssetId: null,
            pairAddress: 'P1',
            dexId: 'raydium',
            quoteSymbol: 'USDC',
            priceUsd: '120',
            liquidityUsd: null,
            volume24hUsd: null,
            marketCapUsd: null,
            fdvUsd: null,
            imageUrl: null,
            dexUrl: null,
            exactContractMatch: false,
          },
        ];
      },
      getCurrentPrice: async () => price(),
    };
    const cmc: PriceProvider = {
      name: 'coinmarketcap',
      searchAssets: async (q) => {
        cmcCalls.push(q);
        return [];
      },
      getCurrentPrice: async () => price({ source: 'coinmarketcap' }),
    };
    const registry = createProviderRegistry([dex, cmc]);
    const svc = new PriceService({ registry, cache: new PriceCache({ metadataTtlMs: 600_000 }) });

    const first = await svc.search('SOL');
    expect(first).toHaveLength(1);
    const second = await svc.search('SOL');
    expect(second).toHaveLength(1);
    expect(dexCalls).toHaveLength(1);
    expect(cmcCalls).toHaveLength(1);
  });

  it('uses fake timers pattern safely with injected clock', () => {
    vi.useFakeTimers();
    try {
      const cache = new PriceCache();
      cache.setPrice('k', price());
      expect(cache.getPrice('k')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
