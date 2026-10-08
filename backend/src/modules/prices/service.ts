import { logger } from '../../config/logger';
import { PriceCache, buildPriceCacheKey, buildSearchCacheKey, getPriceCache, type CachedPrice } from './cache';
import { PriceProviderError } from './errors';
import type { ProviderRegistry } from './registry';
import { getProviderRegistry } from './providers';
import type { AssetIdentifier, AssetSearchResult, CurrentPrice, PriceProviderName } from './types';

export interface PriceServiceOptions {
  registry?: ProviderRegistry;
  cache?: PriceCache;
}

export interface BatchPriceResult {
  key: string;
  asset: AssetIdentifier;
  provider: PriceProviderName;
  price: CurrentPrice | null;
  cached: boolean;
  stale: boolean;
  ageMs: number | null;
  errorCode: string | null;
}

/**
 * Cached price façade. Phase 9 routes call this instead of providers
 * directly. Stale-fallback included: when the fetch fails but an entry
 * exists, the stale value is returned flagged — callers surface "stale",
 * never 0. With no entry at all the error propagates and price stays
 * unavailable.
 */
export class PriceService {
  private readonly registry: ProviderRegistry;
  private readonly cache: PriceCache;

  constructor(opts: PriceServiceOptions = {}) {
    this.registry = opts.registry ?? getProviderRegistry();
    this.cache = opts.cache ?? getPriceCache();
  }

  async getPrice(asset: AssetIdentifier): Promise<CachedPrice> {
    const provider = this.registry.resolve(asset);
    const key = buildPriceCacheKey(provider.name, asset);

    const fresh = this.cache.getPrice(key);
    if (fresh) return fresh;

    try {
      const price = await provider.getCurrentPrice(asset);
      this.cache.setPrice(key, price);
      return { price, cached: false, stale: false, ageMs: 0 };
    } catch (e) {
      const stale = this.cache.getStalePrice(key);
      if (stale) {
        logger.warn(
          { provider: provider.name, key, code: e instanceof PriceProviderError ? e.code : 'UNKNOWN' },
          'Price fetch failed; serving stale cached price.',
        );
        return stale;
      }
      throw e;
    }
  }

  async getBatchPrices(items: AssetIdentifier[]): Promise<BatchPriceResult[]> {
    // Sequential to respect provider rate limits; Phase 9 batch endpoint
    // caps the asset count before calling this.
    const out: BatchPriceResult[] = [];
    for (const asset of items) {
      const providerName = this.registry.resolve(asset).name;
      const key = buildPriceCacheKey(providerName, asset);
      try {
        const r = await this.getPrice(asset);
        out.push({
          key,
          asset,
          provider: providerName,
          price: r.price,
          cached: r.cached,
          stale: r.stale,
          ageMs: r.ageMs,
          errorCode: null,
        });
      } catch (e) {
        out.push({
          key,
          asset,
          provider: providerName,
          price: null,
          cached: false,
          stale: false,
          ageMs: null,
          errorCode: e instanceof PriceProviderError ? e.code : 'UNKNOWN',
        });
      }
    }
    return out;
  }

  async search(query: string, providerName?: PriceProviderName): Promise<AssetSearchResult[]> {
    const names = providerName ? [this.registry.get(providerName)] : this.registryList();
    const seen = new Set<string>();
    const merged: AssetSearchResult[] = [];
    // One dead provider must not sink the whole search (PLAN §24). When a
    // single provider is explicitly requested, its error still propagates.
    let firstError: unknown = null;
    const pushAll = (results: AssetSearchResult[]) => {
      for (const r of results) {
        const k = `${r.provider}|${r.chain}|${r.contractAddress ?? ''}|${r.pairAddress ?? ''}|${r.providerAssetId ?? ''}`;
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(r);
        }
      }
    };
    for (const p of names) {
      const cacheKey = buildSearchCacheKey(p.name, query);
      const cached = this.cache.getSearch(cacheKey);
      if (cached) {
        pushAll(cached);
        continue;
      }
      try {
        const results = await p.searchAssets(query);
        this.cache.setSearch(cacheKey, results);
        pushAll(results);
      } catch (e) {
        if (providerName) throw e;
        if (!firstError) firstError = e;
        logger.warn({ provider: p.name, code: e instanceof PriceProviderError ? e.code : 'UNKNOWN' }, 'Search provider failed; continuing with others.');
      }
    }
    if (merged.length === 0 && firstError) throw firstError;
    return merged;
  }

  private registryList() {
    return this.registry.names().map((n) => this.registry.get(n));
  }
}

let cachedService: PriceService | null = null;

/** Process-wide default service. */
export function getPriceService(): PriceService {
  if (!cachedService) cachedService = new PriceService();
  return cachedService;
}

/** Test hooks. */
export function resetPriceService(): void {
  cachedService = null;
}
export function setPriceServiceForTests(svc: PriceService | null): void {
  cachedService = svc;
}
