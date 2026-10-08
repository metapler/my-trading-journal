import { PRICE_ERROR_CODES, PriceProviderError } from './errors';
import type { AssetIdentifier, PriceProvider, PriceProviderName } from './types';

/**
 * Deterministic provider resolution (PLAN §11):
 *  1. Explicit `preferredPriceProvider` on the asset always wins.
 *  2. Asset tagged `provider: 'coinmarketcap'`, or carrying a
 *     `providerAssetId` with no DEX identity (no chain+contract/pair),
 *     → CoinMarketCap.
 *  3. Everything else → Dexscreener.
 *
 * The resolved name never changes between calls for the same asset, so the
 * price source can't silently flip request-to-request.
 */
export function resolveProviderName(asset: AssetIdentifier): PriceProviderName {
  const preferred = asset.preferredPriceProvider?.trim().toLowerCase();
  if (preferred === 'dexscreener' || preferred === 'coinmarketcap') return preferred;

  if (asset.provider?.trim().toLowerCase() === 'coinmarketcap') return 'coinmarketcap';

  const hasDexIdentity =
    (asset.chain?.trim() ? true : false) &&
    ((asset.contractAddress?.trim() ? true : false) || (asset.pairAddress?.trim() ? true : false));
  if (!hasDexIdentity && (asset.providerAssetId?.trim() ? true : false)) return 'coinmarketcap';

  return 'dexscreener';
}

export interface ProviderRegistry {
  get(name: PriceProviderName): PriceProvider;
  resolve(asset: AssetIdentifier): PriceProvider;
  names(): PriceProviderName[];
}

export function createProviderRegistry(providers: PriceProvider[]): ProviderRegistry {
  const map = new Map<PriceProviderName, PriceProvider>();
  for (const p of providers) map.set(p.name, p);

  return {
    get(name: PriceProviderName): PriceProvider {
      const p = map.get(name);
      if (!p) {
        throw new PriceProviderError({
          code: PRICE_ERROR_CODES.PROVIDER_UNAVAILABLE,
          provider: name,
          message: `Price provider '${name}' is not registered.`,
        });
      }
      return p;
    },
    resolve(asset: AssetIdentifier): PriceProvider {
      return this.get(resolveProviderName(asset));
    },
    names(): PriceProviderName[] {
      return [...map.keys()];
    },
  };
}
