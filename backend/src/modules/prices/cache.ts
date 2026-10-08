import type { AssetIdentifier, AssetSearchResult, CurrentPrice, PriceProviderName } from './types';

/**
 * Phase 8 — in-memory TTL price cache.
 *
 * Goals (PLAN §12): fewer external calls, save CMC credits, avoid rate
 * limits. Keys cover `provider + chain + contract/pair/providerAssetId`.
 *
 * Stale policy (PLAN §24): on provider failure with an expired entry still
 * in memory, the stale value is returned flagged `stale: true` so the UI
 * can show last-known data with a stale indicator. A failure with NO cached
 * entry propagates the error — callers must treat price as unavailable,
 * never as 0.
 */

export interface CacheOptions {
  /** Price TTL ms. PLAN suggests 10–20s. Default 15s. */
  priceTtlMs?: number;
  /** Metadata (search) TTL ms. PLAN suggests 5–30min. Default 10min. */
  metadataTtlMs?: number;
  /** Max entries before oldest-eviction. Default 1000. */
  maxEntries?: number;
  /** Clock override for tests. */
  now?: () => number;
}

export interface CachedPrice {
  price: CurrentPrice;
  /** True when served from cache (fresh or stale). */
  cached: boolean;
  /** True when past TTL (served only as fallback after fetch failure). */
  stale: boolean;
  /** ms since fetchedAt. */
  ageMs: number;
}

interface Entry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

export function buildPriceCacheKey(provider: PriceProviderName, asset: AssetIdentifier): string {
  const parts = [
    provider,
    (asset.chain ?? '').trim().toLowerCase(),
    (asset.contractAddress ?? '').trim(),
    (asset.pairAddress ?? '').trim(),
    (asset.providerAssetId ?? '').trim(),
  ];
  return `price:${parts.join('|')}`;
}

export function buildSearchCacheKey(provider: string, query: string): string {
  return `search:${provider}:${query.trim().toLowerCase()}`;
}

export class PriceCache {
  private readonly priceTtlMs: number;
  private readonly metadataTtlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly prices = new Map<string, Entry<CurrentPrice>>();
  private readonly searches = new Map<string, Entry<AssetSearchResult[]>>();

  constructor(opts: CacheOptions = {}) {
    this.priceTtlMs = opts.priceTtlMs ?? 15_000;
    this.metadataTtlMs = opts.metadataTtlMs ?? 10 * 60_000;
    this.maxEntries = opts.maxEntries ?? 1000;
    this.now = opts.now ?? Date.now;
  }

  /** Fresh entry, or null when missing/expired. Never throws. */
  getPrice(key: string): CachedPrice | null {
    return this.readEntry(this.prices, key);
  }

  /**
   * Last-known entry for stale-fallback, or null when absent.
   * NOTE: expired entries are intentionally kept (bounded by maxEntries)
   * so a later fetch failure can still serve them flagged stale.
   */
  getStalePrice(key: string): CachedPrice | null {
    const entry = this.prices.get(key);
    if (!entry) return null;
    const now = this.now();
    return { price: entry.value, cached: true, stale: now > entry.expiresAt, ageMs: now - entry.storedAt };
  }

  setPrice(key: string, price: CurrentPrice): void {
    this.store(this.prices, key, price, this.priceTtlMs);
  }

  getSearch(key: string): AssetSearchResult[] | null {
    const entry = this.searches.get(key);
    if (!entry) return null;
    if (this.now() > entry.expiresAt) {
      this.searches.delete(key);
      return null;
    }
    return entry.value;
  }

  setSearch(key: string, results: AssetSearchResult[]): void {
    this.store(this.searches, key, results, this.metadataTtlMs);
  }

  invalidatePrice(key: string): void {
    this.prices.delete(key);
  }

  clear(): void {
    this.prices.clear();
    this.searches.clear();
  }

  stats(): { prices: number; searches: number } {
    return { prices: this.prices.size, searches: this.searches.size };
  }

  private readEntry(map: Map<string, Entry<CurrentPrice>>, key: string): CachedPrice | null {
    const entry = map.get(key);
    if (!entry) return null;
    const now = this.now();
    // Expired entries stay in the map (bounded by maxEntries) so a later
    // fetch failure can serve them flagged stale via getStalePrice().
    if (now > entry.expiresAt) return null;
    return { price: entry.value, cached: true, stale: false, ageMs: now - entry.storedAt };
  }

  private store<T>(map: Map<string, Entry<T>>, key: string, value: T, ttlMs: number): void {
    if (map.size >= this.maxEntries) {
      const oldest = map.keys().next();
      if (!oldest.done) map.delete(oldest.value);
    }
    const storedAt = this.now();
    map.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
  }
}

/** Process-wide default cache (single host, MVP). */
let defaultCache: PriceCache | null = null;

export function getPriceCache(): PriceCache {
  if (!defaultCache) defaultCache = new PriceCache();
  return defaultCache;
}

/** Test hook. */
export function resetPriceCache(): void {
  defaultCache = null;
}
