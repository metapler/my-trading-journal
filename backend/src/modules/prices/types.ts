/**
 * Phase 5 — Price provider abstraction.
 *
 * The frontend must NEVER call Dexscreener/CoinMarketCap directly.
 * All price data flows through the backend behind this interface so we can
 * hide API keys, cache, fall back between providers, and normalize responses.
 *
 * Financial values cross boundaries as strings (Decimal at rest), never raw
 * JS floats.
 */

export type PriceProviderName = 'dexscreener' | 'coinmarketcap';

/** Minimal identity needed to resolve + fetch a price for an asset. */
export interface AssetIdentifier {
  chain?: string | null;
  contractAddress?: string | null;
  pairAddress?: string | null;
  providerAssetId?: string | null;
  /** Stored `provider` tag on the Asset row (e.g. 'dexscreener' | 'coinmarketcap'). */
  provider?: string | null;
  preferredPriceProvider?: string | null;
}

/** One selectable candidate from an asset search (one row per pair). */
export interface AssetSearchResult {
  provider: PriceProviderName;
  name: string;
  symbol: string;
  chain: string;
  /** Null for provider-native assets without a contract (e.g. CMC top assets). */
  contractAddress: string | null;
  /** Provider-native id (e.g. CMC id). Null for DEX pairs. */
  providerAssetId: string | null;
  pairAddress: string | null;
  dexId: string | null;
  quoteSymbol: string | null;
  priceUsd: string | null;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  marketCapUsd: string | null;
  fdvUsd: string | null;
  imageUrl: string | null;
  dexUrl: string | null;
  /** True when the query exactly matched this pair's token contract. */
  exactContractMatch: boolean;
}

/** Normalized current-price response (PLAN §9). */
export interface CurrentPrice {
  priceUsd: string;
  source: string;
  /** ISO-8601 fetch timestamp. */
  fetchedAt: string;
  chain?: string | null;
  pairAddress?: string | null;
  liquidityUsd?: string | null;
  volume24hUsd?: string | null;
  marketCapUsd?: string | null;
  fdvUsd?: string | null;
}

export interface PriceProvider {
  readonly name: PriceProviderName;
  searchAssets(query: string): Promise<AssetSearchResult[]>;
  getCurrentPrice(asset: AssetIdentifier): Promise<CurrentPrice>;
}
