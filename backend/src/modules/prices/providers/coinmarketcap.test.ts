import { describe, expect, it } from 'vitest';
import { PRICE_ERROR_CODES } from '../errors';
import type { FetchFn, FetchResponseLike } from '../http';
import { createProviderRegistry, resolveProviderName } from '../registry';
import { CoinMarketCapProvider } from './coinmarketcap';
import { DexscreenerProvider } from './dexscreener';

function jsonRes(body: unknown, status = 200): FetchResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

interface Call {
  url: string;
  headers?: Record<string, string>;
}

function stubFetch(
  handler: (url: string) => FetchResponseLike | Promise<FetchResponseLike>,
): FetchFn & { calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (url: string, init: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    return handler(url);
  }) as unknown as FetchFn & { calls: Call[] };
  fn.calls = calls;
  return fn;
}

function mapPayload(entries: unknown[]) {
  return { status: { error_code: 0 }, data: entries };
}

function quotesPayload(entry: Record<string, unknown>) {
  return { status: { error_code: 0 }, data: { [String(entry.id)]: entry } };
}

function btcEntry() {
  return {
    id: 1,
    name: 'Bitcoin',
    symbol: 'BTC',
    quote: {
      USD: {
        price: 67000.12,
        volume_24h: 35_000_000_000,
        market_cap: 1_320_000_000_000,
        fully_diluted_market_cap: 1_407_000_000_000,
        last_updated: '2026-10-02T00:00:00.000Z',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// searchAssets
// ---------------------------------------------------------------------------

describe('CoinMarketCapProvider.searchAssets', () => {
  it('maps symbol search to CMC candidates with providerAssetId', async () => {
    const fetchFn = stubFetch(() =>
      jsonRes(mapPayload([{ id: 1, name: 'Bitcoin', symbol: 'BTC', slug: 'bitcoin', rank: 1, is_active: 1 }])),
    );
    const provider = new CoinMarketCapProvider({ apiKey: 'test-key', fetchFn });
    const results = await provider.searchAssets('btc');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      provider: 'coinmarketcap',
      name: 'Bitcoin',
      symbol: 'BTC',
      chain: 'cmc',
      contractAddress: null,
      providerAssetId: '1',
      pairAddress: null,
    });
    expect(fetchFn.calls).toHaveLength(1);
    expect(fetchFn.calls[0].url).toContain('/v1/cryptocurrency/map?symbol=BTC');
    expect(fetchFn.calls[0].headers?.['X-CMC_PRO_API_KEY']).toBe('test-key');
  });

  it('contract query returns [] without network (Dexscreener covers those)', async () => {
    const fetchFn = stubFetch(() => jsonRes(mapPayload([])));
    const provider = new CoinMarketCapProvider({ apiKey: 'test-key', fetchFn });
    const results = await provider.searchAssets('So11111111111111111111111111111111111111112');
    expect(results).toEqual([]);
    expect(fetchFn.calls).toHaveLength(0);
  });

  it('empty query throws INVALID_QUERY without network', async () => {
    const fetchFn = stubFetch(() => jsonRes(mapPayload([])));
    const provider = new CoinMarketCapProvider({ apiKey: 'k', fetchFn });
    await expect(provider.searchAssets('  ')).rejects.toMatchObject({ code: PRICE_ERROR_CODES.INVALID_QUERY });
    expect(fetchFn.calls).toHaveLength(0);
  });

  it('missing API key throws PROVIDER_NOT_CONFIGURED without network', async () => {
    const saved = process.env.COINMARKETCAP_API_KEY;
    delete process.env.COINMARKETCAP_API_KEY;
    try {
      const fetchFn = stubFetch(() => jsonRes(mapPayload([])));
      const provider = new CoinMarketCapProvider({ apiKey: '', fetchFn });
      await expect(provider.searchAssets('BTC')).rejects.toMatchObject({
        code: PRICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
      });
      expect(fetchFn.calls).toHaveLength(0);
    } finally {
      if (saved !== undefined) process.env.COINMARKETCAP_API_KEY = saved;
    }
  });

  it('body-level error_code throws PROVIDER_BAD_RESPONSE', async () => {
    const fetchFn = stubFetch(() => jsonRes({ status: { error_code: 1002, error_message: 'API key missing.' } }));
    const provider = new CoinMarketCapProvider({ apiKey: 'k', fetchFn });
    await expect(provider.searchAssets('BTC')).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
    });
  });

  it('HTTP 401 maps to PROVIDER_NOT_CONFIGURED (key rejected)', async () => {
    const fetchFn = stubFetch(() => jsonRes({ status: { error_code: 1002 } }, 401));
    const provider = new CoinMarketCapProvider({ apiKey: 'bad', fetchFn });
    await expect(provider.searchAssets('BTC')).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
    });
  });
});

// ---------------------------------------------------------------------------
// getCurrentPrice
// ---------------------------------------------------------------------------

describe('CoinMarketCapProvider.getCurrentPrice', () => {
  it('returns normalized CurrentPrice for a CMC id', async () => {
    const fetchFn = stubFetch((url) => {
      expect(url).toContain('/v2/cryptocurrency/quotes/latest?id=1');
      return jsonRes(quotesPayload(btcEntry()));
    });
    const provider = new CoinMarketCapProvider({ apiKey: 'k', fetchFn });
    const price = await provider.getCurrentPrice({ providerAssetId: '1' });
    expect(price.priceUsd).toBe('67000.12');
    expect(price.source).toBe('coinmarketcap');
    expect(price.chain).toBe('cmc');
    expect(typeof price.fetchedAt).toBe('string');
    expect(price.marketCapUsd).toBe('1320000000000');
  });

  it('supports array-form data payloads', async () => {
    const fetchFn = stubFetch(() => jsonRes({ status: { error_code: 0 }, data: [btcEntry()] }));
    const provider = new CoinMarketCapProvider({ apiKey: 'k', fetchFn });
    const price = await provider.getCurrentPrice({ providerAssetId: '1' });
    expect(price.priceUsd).toBe('67000.12');
  });

  it('missing providerAssetId throws MISSING_IDENTIFIER', async () => {
    const fetchFn = stubFetch(() => jsonRes({}));
    const provider = new CoinMarketCapProvider({ apiKey: 'k', fetchFn });
    await expect(provider.getCurrentPrice({ chain: 'cmc' })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.MISSING_IDENTIFIER,
    });
    expect(fetchFn.calls).toHaveLength(0);
  });

  it('unknown id throws ASSET_NOT_FOUND (never 0)', async () => {
    const fetchFn = stubFetch(() => jsonRes({ status: { error_code: 0 }, data: {} }));
    const provider = new CoinMarketCapProvider({ apiKey: 'k', fetchFn });
    await expect(provider.getCurrentPrice({ providerAssetId: '999999' })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.ASSET_NOT_FOUND,
    });
  });

  it('quote without price throws instead of returning 0', async () => {
    const fetchFn = stubFetch(() =>
      jsonRes(quotesPayload({ id: 1, name: 'Bitcoin', symbol: 'BTC', quote: { USD: { price: null } } })),
    );
    const provider = new CoinMarketCapProvider({ apiKey: 'k', fetchFn });
    await expect(provider.getCurrentPrice({ providerAssetId: '1' })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.PROVIDER_BAD_RESPONSE,
    });
  });

  it('missing key throws before network', async () => {
    const fetchFn = stubFetch(() => jsonRes({}));
    const provider = new CoinMarketCapProvider({ apiKey: '', fetchFn });
    await expect(provider.getCurrentPrice({ providerAssetId: '1' })).rejects.toMatchObject({
      code: PRICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
    });
    expect(fetchFn.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deterministic resolution
// ---------------------------------------------------------------------------

describe('deterministic resolution with CMC registered', () => {
  it('routes per PLAN §11 and never flips for the same asset', () => {
    // preferred always wins
    expect(
      resolveProviderName({ chain: 'cmc', providerAssetId: '1', preferredPriceProvider: 'dexscreener' }),
    ).toBe('dexscreener');
    expect(
      resolveProviderName({
        chain: 'solana',
        contractAddress: 'So11111111111111111111111111111111111111112',
        preferredPriceProvider: 'coinmarketcap',
      }),
    ).toBe('coinmarketcap');
    // provider tag wins
    expect(resolveProviderName({ provider: 'coinmarketcap', providerAssetId: '1' })).toBe('coinmarketcap');
    // providerAssetId without DEX identity → CMC
    expect(resolveProviderName({ chain: 'cmc', providerAssetId: '1' })).toBe('coinmarketcap');
    expect(resolveProviderName({ providerAssetId: '1' })).toBe('coinmarketcap');
    // DEX identity → Dexscreener even with a providerAssetId present
    expect(
      resolveProviderName({ chain: 'solana', contractAddress: 'So11', providerAssetId: '1' }),
    ).toBe('dexscreener');
    expect(resolveProviderName({ chain: 'solana', pairAddress: 'PAIR1' })).toBe('dexscreener');
    // determinism: repeated calls agree
    const asset = { chain: 'cmc', providerAssetId: '1' };
    expect(resolveProviderName(asset)).toBe(resolveProviderName({ ...asset }));
  });

  it('registry resolves both providers', () => {
    const dex = new DexscreenerProvider({ fetchFn: (async () => jsonRes({ pairs: [] })) as never });
    const cmc = new CoinMarketCapProvider({ apiKey: 'k', fetchFn: (async () => jsonRes({})) as never });
    const registry = createProviderRegistry([dex, cmc]);
    expect(registry.names().sort()).toEqual(['coinmarketcap', 'dexscreener']);
    expect(registry.resolve({ chain: 'cmc', providerAssetId: '1' }).name).toBe('coinmarketcap');
    expect(registry.resolve({ chain: 'solana', contractAddress: 'So11' }).name).toBe('dexscreener');
  });
});
