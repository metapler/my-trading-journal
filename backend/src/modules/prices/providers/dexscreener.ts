import { looksLikeContractAddress, sameContract } from '../addresses';
import { PRICE_ERROR_CODES, PriceProviderError } from '../errors';
import { fetchJson, type FetchFn } from '../http';
import { decString, numValue, str } from '../normalize';
import { withRetry } from '../retry';
import type { AssetIdentifier, AssetSearchResult, CurrentPrice, PriceProvider } from '../types';

export const DEXSCREENER_NAME = 'dexscreener' as const;

// ---------------------------------------------------------------------------
// Raw Dexscreener shapes (verified live against api.dexscreener.com)
// ---------------------------------------------------------------------------

interface DexToken {
  address?: unknown;
  name?: unknown;
  symbol?: unknown;
}

interface DexPair {
  chainId?: unknown;
  dexId?: unknown;
  url?: unknown;
  pairAddress?: unknown;
  baseToken?: DexToken;
  quoteToken?: DexToken;
  priceUsd?: unknown;
  liquidity?: { usd?: unknown } | unknown;
  volume?: { h24?: unknown } | unknown;
  marketCap?: unknown;
  fdv?: unknown;
  info?: { imageUrl?: unknown } | unknown;
}

interface DexSearchResponse {
  pairs?: unknown;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DexscreenerOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: FetchFn;
  /** Cap on candidates returned from search (default 25). */
  maxResults?: number;
  /** Bounded retry attempts (default 2). Set 1 to disable. */
  maxAttempts?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 25;

/** Quote assets preferred when ranking otherwise-similar pairs. */
const PREFERRED_QUOTES = new Set(['USDC', 'USDT', 'USD1', 'USDS', 'DAI', 'WETH', 'ETH', 'SOL', 'WSOL', 'WBTC']);

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

interface RankedPair {
  pair: DexPair;
  matchedAddress: string | null;
  exactContractMatch: boolean;
  score: number;
}

function rankPairs(pairs: DexPair[], contractQuery: string | null): RankedPair[] {
  const ranked: RankedPair[] = pairs
    .filter((p) => typeof p === 'object' && p !== null)
    .map((pair) => {
      const baseAddr = str(pair.baseToken?.address);
      const quoteAddr = str(pair.quoteToken?.address);
      const matchedAddress =
        contractQuery !== null && baseAddr !== null && sameContract(baseAddr, contractQuery)
          ? baseAddr
          : contractQuery !== null && quoteAddr !== null && sameContract(quoteAddr, contractQuery)
            ? quoteAddr
            : null;
      const exactContractMatch = matchedAddress !== null;

      const liquidity = numValue(
        typeof pair.liquidity === 'object' && pair.liquidity !== null
          ? (pair.liquidity as { usd?: unknown }).usd
          : null,
      );
      const volume = numValue(
        typeof pair.volume === 'object' && pair.volume !== null
          ? (pair.volume as { h24?: unknown }).h24
          : null,
      );
      const quoteSymbol = str(pair.quoteToken?.symbol)?.toUpperCase() ?? '';
      const quoteBoost = PREFERRED_QUOTES.has(quoteSymbol) ? 1 : 0;

      // Exact contract match dominates; then liquidity, then volume, then
      // stable/major quote preference. Deterministic: no randomness, and a
      // low-liquidity pair can never outrank a deeper one for the same token.
      const score = (exactContractMatch ? 1e15 : 0) + liquidity * 1e6 + volume + quoteBoost * 1e3;
      return { pair, matchedAddress, exactContractMatch, score };
    });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function toSearchResult(ranked: RankedPair): AssetSearchResult | null {
  const { pair, matchedAddress, exactContractMatch } = ranked;
  const chain = str(pair.chainId);
  // Token identity comes from the matched side when the query was a contract;
  // otherwise the base token is the listed asset.
  const tokenSide =
    matchedAddress !== null && str(pair.quoteToken?.address) === matchedAddress
      ? pair.quoteToken
      : pair.baseToken;
  const name = str(tokenSide?.name);
  const symbol = str(tokenSide?.symbol);
  const contractAddress = str(tokenSide?.address);
  if (chain === null || name === null || symbol === null) return null;

  return {
    provider: DEXSCREENER_NAME,
    name,
    symbol,
    chain,
    contractAddress,
    providerAssetId: null,
    pairAddress: str(pair.pairAddress),
    dexId: str(pair.dexId),
    quoteSymbol: str(pair.quoteToken?.symbol),
    priceUsd: decString(pair.priceUsd),
    liquidityUsd: decString(
      typeof pair.liquidity === 'object' && pair.liquidity !== null
        ? (pair.liquidity as { usd?: unknown }).usd
        : null,
    ),
    volume24hUsd: decString(
      typeof pair.volume === 'object' && pair.volume !== null
        ? (pair.volume as { h24?: unknown }).h24
        : null,
    ),
    marketCapUsd: decString(pair.marketCap),
    fdvUsd: decString(pair.fdv),
    imageUrl:
      typeof pair.info === 'object' && pair.info !== null
        ? str((pair.info as { imageUrl?: unknown }).imageUrl)
        : null,
    dexUrl: str(pair.url),
    exactContractMatch,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class DexscreenerProvider implements PriceProvider {
  readonly name = DEXSCREENER_NAME;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn?: FetchFn;
  private readonly maxResults: number;
  private readonly maxAttempts: number;

  constructor(opts: DexscreenerOptions = {}) {
    const fromEnv = process.env.DEXSCREENER_BASE_URL?.trim();
    this.baseUrl = (opts.baseUrl ?? fromEnv ?? 'https://api.dexscreener.com').replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.PROVIDER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.fetchFn = opts.fetchFn;
    this.maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;
    this.maxAttempts = opts.maxAttempts ?? Number(process.env.PROVIDER_MAX_ATTEMPTS ?? 2);
  }

  private get(url: string): Promise<unknown> {
    return withRetry(
      () => fetchJson({ provider: this.name, url, timeoutMs: this.timeoutMs, fetchFn: this.fetchFn }),
      { maxAttempts: this.maxAttempts },
    );
  }

  private extractPairs(payload: unknown): DexPair[] {
    if (Array.isArray(payload)) return payload as DexPair[];
    if (typeof payload === 'object' && payload !== null) {
      const maybePairs = (payload as DexSearchResponse).pairs ?? (payload as { pair?: unknown }).pair;
      if (Array.isArray(maybePairs)) return maybePairs as DexPair[];
      if (maybePairs !== undefined) return [maybePairs as DexPair];
    }
    throw new PriceProviderError({
      code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
      provider: this.name,
      message: 'Unexpected response shape (no pairs array).',
    });
  }

  /**
   * Search by ticker, name, or contract address. Contract queries return
   * exact-match pairs ranked by depth; text queries return ranked candidates.
   * Ambiguous results are ALL returned so the UI can ask the user to pick —
   * never silently picks one pair for storage.
   */
  async searchAssets(query: string): Promise<AssetSearchResult[]> {
    const q = query.trim();
    if (q.length === 0) {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.INVALID_QUERY,
        provider: this.name,
        message: 'Search query must not be empty.',
      });
    }

    const payload = await this.get(`${this.baseUrl}/latest/dex/search?q=${encodeURIComponent(q)}`);
    const pairs = this.extractPairs(payload);

    const contractQuery = looksLikeContractAddress(q) ? q : null;
    const ranked = rankPairs(pairs, contractQuery);
    const exacts = ranked.filter((r) => r.exactContractMatch);

    const shortlist = contractQuery !== null && exacts.length > 0 ? exacts : ranked;
    const results: AssetSearchResult[] = [];
    for (const r of shortlist.slice(0, this.maxResults)) {
      const normalized = toSearchResult(r);
      if (normalized !== null) results.push(normalized);
    }
    return results;
  }

  /**
   * Resolve the current price. Pair-pinned assets hit the pair endpoint
   * directly; otherwise the deepest pair for chain+contract is used.
   * Throws ASSET_NOT_FOUND / MISSING_IDENTIFIER instead of returning 0.
   */
  async getCurrentPrice(asset: AssetIdentifier): Promise<CurrentPrice> {
    const chain = asset.chain?.trim() || null;
    const pairAddress = asset.pairAddress?.trim() || null;
    const contractAddress = asset.contractAddress?.trim() || null;

    let pair: DexPair | null = null;
    let resolvedChain = chain;

    if (pairAddress !== null) {
      if (chain === null) {
        throw new PriceProviderError({
          code: PRICE_ERROR_CODES.MISSING_IDENTIFIER,
          provider: this.name,
          message: 'Pair lookup requires a chain.',
        });
      }
      const payload = await this.get(
        `${this.baseUrl}/latest/dex/pairs/${encodeURIComponent(chain)}/${encodeURIComponent(pairAddress)}`,
      );
      const pairs = this.extractPairs(payload);
      pair = pairs.find((p) => str(p.pairAddress) === pairAddress) ?? pairs[0] ?? null;
    } else if (chain !== null && contractAddress !== null) {
      const payload = await this.get(
        `${this.baseUrl}/token-pairs/v1/${encodeURIComponent(chain)}/${encodeURIComponent(contractAddress)}`,
      );
      const pairs = this.extractPairs(payload);
      const ranked = rankPairs(pairs, contractAddress);
      pair = ranked[0]?.pair ?? null;
      resolvedChain = pair ? (str(pair.chainId) ?? chain) : chain;
    } else {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.MISSING_IDENTIFIER,
        provider: this.name,
        message: 'Price lookup requires chain + pairAddress, or chain + contractAddress.',
      });
    }

    if (pair === null) {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.ASSET_NOT_FOUND,
        provider: this.name,
        message: 'No Dexscreener pair found for this asset.',
      });
    }

    const priceUsd = decString(pair.priceUsd);
    if (priceUsd === null || Number(priceUsd) <= 0) {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
        provider: this.name,
        message: 'Pair has no usable USD price.',
      });
    }

    return {
      priceUsd,
      source: this.name,
      fetchedAt: new Date().toISOString(),
      chain: resolvedChain,
      pairAddress: str(pair.pairAddress),
      liquidityUsd: decString(
        typeof pair.liquidity === 'object' && pair.liquidity !== null
          ? (pair.liquidity as { usd?: unknown }).usd
          : null,
      ),
      volume24hUsd: decString(
        typeof pair.volume === 'object' && pair.volume !== null
          ? (pair.volume as { h24?: unknown }).h24
          : null,
      ),
      marketCapUsd: decString(pair.marketCap),
      fdvUsd: decString(pair.fdv),
    };
  }
}
