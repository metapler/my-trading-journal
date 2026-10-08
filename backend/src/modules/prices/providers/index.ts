import { createProviderRegistry, type ProviderRegistry } from '../registry';
import { CoinMarketCapProvider } from './coinmarketcap';
import { DexscreenerProvider } from './dexscreener';

let cached: ProviderRegistry | null = null;

/** Default registry: Dexscreener (primary) + CoinMarketCap (optional fallback). */
export function getProviderRegistry(): ProviderRegistry {
  if (!cached) {
    cached = createProviderRegistry([new DexscreenerProvider(), new CoinMarketCapProvider()]);
  }
  return cached;
}

/** Test hook — resets the cached singleton (e.g. after changing env keys). */
export function resetProviderRegistry(): void {
  cached = null;
}

export { CoinMarketCapProvider, DexscreenerProvider };
