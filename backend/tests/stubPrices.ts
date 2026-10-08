import { PriceCache } from '../src/modules/prices/cache';
import { PriceProviderError } from '../src/modules/prices/errors';
import { createProviderRegistry } from '../src/modules/prices/registry';
import { PriceService, setPriceServiceForTests } from '../src/modules/prices/service';
import type { AssetIdentifier, CurrentPrice, PriceProvider } from '../src/modules/prices/types';

/**
 * Deterministic stub provider for integration tests — no real network.
 * `prices` maps a lookup key to a USD price. Lookup order: pairAddress >
 * contractAddress > providerAssetId.
 */
export interface StubPricesOptions {
  prices?: Record<string, string>;
  failAll?: string;
}

function lookupKey(asset: AssetIdentifier): string {
  return asset.pairAddress?.trim() || asset.contractAddress?.trim() || asset.providerAssetId?.trim() || '';
}

function makeStub(name: 'dexscreener' | 'coinmarketcap', opts: StubPricesOptions, calls: string[]): PriceProvider {
  return {
    name,
    searchAssets: async () => [],
    getCurrentPrice: async (asset: AssetIdentifier) => {
      const key = lookupKey(asset);
      calls.push(`${name}:${key}`);
      if (opts.failAll) {
        throw new PriceProviderError({
          code: opts.failAll as unknown as PriceProviderError['code'],
          provider: name,
          message: 'stubbed failure',
          retryable: true,
        });
      }
      const usd = opts.prices?.[key];
      if (!usd) {
        throw new PriceProviderError({
          code: 'ASSET_NOT_FOUND',
          provider: name,
          message: `No stubbed price for ${key}.`,
        });
      }
      const price: CurrentPrice = {
        priceUsd: usd,
        source: 'stub',
        fetchedAt: new Date().toISOString(),
        chain: asset.chain ?? null,
        pairAddress: asset.pairAddress ?? null,
      };
      return price;
    },
  };
}

export function stubPriceService(opts: StubPricesOptions = {}): { service: PriceService; calls: string[] } {
  const calls: string[] = [];
  // Both names registered like production, so deterministic resolution
  // (dex vs cmc) behaves identically to the real registry.
  const registry = createProviderRegistry([makeStub('dexscreener', opts, calls), makeStub('coinmarketcap', opts, calls)]);
  const service = new PriceService({ registry, cache: new PriceCache() });
  setPriceServiceForTests(service);
  return { service, calls };
}

export function unstubPriceService(): void {
  setPriceServiceForTests(null);
}
