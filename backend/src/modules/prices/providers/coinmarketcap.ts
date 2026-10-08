import { looksLikeContractAddress } from '../addresses';
import { PRICE_ERROR_CODES, PriceProviderError } from '../errors';
import { fetchJson, type FetchFn } from '../http';
import { decString, str } from '../normalize';
import { withRetry } from '../retry';
import type { AssetIdentifier, AssetSearchResult, CurrentPrice, PriceProvider } from '../types';

export const COINMARKETCAP_NAME = 'coinmarketcap' as const;

// ---------------------------------------------------------------------------
// Raw CoinMarketCap shapes (Pro API v1/v2)
// ---------------------------------------------------------------------------

interface CmcStatus {
  error_code?: unknown;
  error_message?: unknown;
}

interface CmcMapEntry {
  id?: unknown;
  name?: unknown;
  symbol?: unknown;
  slug?: unknown;
  rank?: unknown;
  is_active?: unknown;
}

interface CmcQuoteUsd {
  price?: unknown;
  volume_24h?: unknown;
  market_cap?: unknown;
  fully_diluted_market_cap?: unknown;
  last_updated?: unknown;
}

interface CmcQuoteEntry {
  id?: unknown;
  name?: unknown;
  symbol?: unknown;
  quote?: { USD?: CmcQuoteUsd } | unknown;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CoinMarketCapOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchFn?: FetchFn;
  maxResults?: number;
  /** Bounded retry attempts (default 2). Set 1 to disable. */
  maxAttempts?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 25;

/** Pseudo-chain tag for CMC-native assets (matches seed convention). */
export const CMC_CHAIN = 'cmc';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class CoinMarketCapProvider implements PriceProvider {
  readonly name = COINMARKETCAP_NAME;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchFn?: FetchFn;
  private readonly maxResults: number;
  private readonly maxAttempts: number;

  constructor(opts: CoinMarketCapOptions = {}) {
    const baseFromEnv = process.env.COINMARKETCAP_BASE_URL?.trim();
    const keyFromEnv = process.env.COINMARKETCAP_API_KEY?.trim();
    this.baseUrl = (opts.baseUrl ?? baseFromEnv ?? 'https://pro-api.coinmarketcap.com').replace(/\/+$/, '');
    this.apiKey = opts.apiKey ?? keyFromEnv ?? '';
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.PROVIDER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.fetchFn = opts.fetchFn;
    this.maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;
    this.maxAttempts = opts.maxAttempts ?? Number(process.env.PROVIDER_MAX_ATTEMPTS ?? 2);
  }

  private ensureConfigured(): void {
    if (!this.apiKey) {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        provider: this.name,
        message: 'COINMARKETCAP_API_KEY is not set. CoinMarketCap is optional; configure a key to enable it.',
      });
    }
  }

  private async get(path: string): Promise<unknown> {
    this.ensureConfigured();
    try {
      return await withRetry(
        () =>
          fetchJson({
            provider: this.name,
            url: `${this.baseUrl}${path}`,
            timeoutMs: this.timeoutMs,
            fetchFn: this.fetchFn,
            headers: { 'X-CMC_PRO_API_KEY': this.apiKey },
          }),
        { maxAttempts: this.maxAttempts },
      );
    } catch (e) {
      // CMC uses 401/403 for bad/missing keys — surface that precisely.
      if (e instanceof PriceProviderError && (e.statusHint === 401 || e.statusHint === 403)) {
        throw new PriceProviderError({
          code: PRICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
          provider: this.name,
          message: 'CoinMarketCap rejected the API key (HTTP 401/403).',
          statusHint: e.statusHint,
        });
      }
      throw e;
    }
  }

  /** CMC sometimes answers HTTP 200 with a body-level error_code. */
  private assertOk(payload: unknown): void {
    if (typeof payload === 'object' && payload !== null) {
      const status = (payload as { status?: CmcStatus }).status;
      const code = typeof status?.error_code === 'number' ? status.error_code : 0;
      if (code !== 0) {
        const msg =
          typeof status?.error_message === 'string' && status.error_message.length > 0
            ? status.error_message
            : `CoinMarketCap error ${code}.`;
        throw new PriceProviderError({
          code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
          provider: this.name,
          message: msg,
        });
      }
    }
  }

  /**
   * Search top/centralized assets by ticker symbol via
   * `/v1/cryptocurrency/map`. Contract queries return [] — CMC has no
   * contract search; Dexscreener covers those. Candidates carry no price
   * (map has none); price resolves on selection via quotes. This keeps
   * credit usage to one cheap call per search.
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
    if (looksLikeContractAddress(q)) return [];

    this.ensureConfigured();
    const symbol = q.toUpperCase();
    const payload = await this.get(
      `/v1/cryptocurrency/map?symbol=${encodeURIComponent(symbol)}&limit=${this.maxResults}`,
    );
    this.assertOk(payload);

    const data = typeof payload === 'object' && payload !== null ? (payload as { data?: unknown }).data : null;
    if (!Array.isArray(data)) {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
        provider: this.name,
        message: 'Unexpected map response shape (no data array).',
      });
    }

    const results: AssetSearchResult[] = [];
    for (const entry of data.slice(0, this.maxResults)) {
      const e = entry as CmcMapEntry;
      const name = str(e.name);
      const sym = str(e.symbol);
      const id = e.id === undefined || e.id === null ? null : String(e.id);
      if (name === null || sym === null || id === null || id === '') continue;
      results.push({
        provider: COINMARKETCAP_NAME,
        name,
        symbol: sym,
        chain: CMC_CHAIN,
        contractAddress: null,
        providerAssetId: id,
        pairAddress: null,
        dexId: null,
        quoteSymbol: 'USD',
        priceUsd: null,
        liquidityUsd: null,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        imageUrl: null,
        dexUrl: null,
        exactContractMatch: false,
      });
    }
    return results;
  }

  /**
   * Current price via `/v2/cryptocurrency/quotes/latest?id=…`.
   * Requires the CMC id (`providerAssetId`). Throws instead of returning 0.
   */
  async getCurrentPrice(asset: AssetIdentifier): Promise<CurrentPrice> {
    const id = asset.providerAssetId?.trim() || null;
    if (id === null) {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.MISSING_IDENTIFIER,
        provider: this.name,
        message: 'CoinMarketCap price lookup requires a providerAssetId (CMC id).',
      });
    }

    const payload = await this.get(
      `/v2/cryptocurrency/quotes/latest?id=${encodeURIComponent(id)}&convert=USD&skip_invalid=true`,
    );
    this.assertOk(payload);

    const data = typeof payload === 'object' && payload !== null ? (payload as { data?: unknown }).data : null;
    let entry: CmcQuoteEntry | null = null;
    if (Array.isArray(data)) {
      entry = (data.find((e) => String((e as CmcQuoteEntry).id) === id) as CmcQuoteEntry | undefined) ?? null;
    } else if (typeof data === 'object' && data !== null) {
      entry = ((data as Record<string, CmcQuoteEntry>)[id] ?? null) as CmcQuoteEntry | null;
    }
    if (entry === null) {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.ASSET_NOT_FOUND,
        provider: this.name,
        message: `No CoinMarketCap quote for id ${id}.`,
      });
    }

    const usd =
      typeof entry.quote === 'object' && entry.quote !== null
        ? (entry.quote as { USD?: CmcQuoteUsd }).USD ?? null
        : null;
    const priceUsd = decString(usd?.price);
    if (priceUsd === null || Number(priceUsd) <= 0) {
      throw new PriceProviderError({
        code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
        provider: this.name,
        message: 'CoinMarketCap quote has no usable USD price.',
      });
    }

    return {
      priceUsd,
      source: this.name,
      fetchedAt: new Date().toISOString(),
      chain: CMC_CHAIN,
      pairAddress: null,
      liquidityUsd: null,
      volume24hUsd: decString(usd?.volume_24h),
      marketCapUsd: decString(usd?.market_cap),
      fdvUsd: decString(usd?.fully_diluted_market_cap),
    };
  }
}
