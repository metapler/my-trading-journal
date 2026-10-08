import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { PriceProvider } from '../src/modules/prices/types';

type PriceProviderStub = PriceProvider;
import { setPrismaClientForTests as setAssetsClient } from '../src/modules/assets/service';
import { setPrismaClientForTests as setPortfolioClient } from '../src/modules/portfolio/service';
import { unstubPriceService, stubPriceService } from './stubPrices';
import { authed, createAuthedAgent, createTestAsset, createTestClient, resetDb, type AuthedAgent } from './helpers';

const SOL = 'So11111111111111111111111111111111111111112';

const app = createApp();
const client = createTestClient();
let t: AuthedAgent;

function buy(overrides: Record<string, unknown> = {}) {
  return {
    type: 'BUY',
    quantity: '100',
    pricePerToken: '1',
    fee: '0',
    executedAt: '2026-01-10T10:00:00.000Z',
    ...overrides,
  };
}

beforeAll(() => {
  setAssetsClient(client);
  setPortfolioClient(client);
});

afterAll(async () => {
  setAssetsClient(null);
  setPortfolioClient(null);
  unstubPriceService();
  await client.$disconnect();
});

beforeEach(async () => {
  await resetDb(client);
  unstubPriceService();
  t = await createAuthedAgent(app, client);
});

// ---------------------------------------------------------------------------
// Flow A — Add asset
// ---------------------------------------------------------------------------

describe('Flow A — asset CRUD + identity rules', () => {
  it('creates a DEX asset with chain+contract', async () => {
    const res = await authed(t, 'post', '/api/assets').send({
      name: 'Wrapped SOL',
      symbol: 'SOL',
      chain: 'solana',
      contractAddress: SOL,
    });
    expect(res.status).toBe(201);
    expect(res.body.asset.symbol).toBe('SOL');
    expect(res.body.asset.chain).toBe('solana');
  });

  it('rejects ticker-only asset (no identity)', async () => {
    const res = await authed(t, 'post', '/api/assets').send({ name: 'Pepe', symbol: 'PEPE', chain: 'ethereum' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate chain+contract with 409', async () => {
    const payload = { name: 'Wrapped SOL', symbol: 'SOL', chain: 'solana', contractAddress: SOL };
    expect((await authed(t, 'post', '/api/assets').send(payload)).status).toBe(201);
    const dup = await authed(t, 'post', '/api/assets').send(payload);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_ASSET');
  });

  it('lists assets and fetches one by id; 404 for unknown', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const list = await authed(t, 'get', '/api/assets');
    expect(list.status).toBe(200);
    expect(list.body.assets).toHaveLength(1);

    expect((await authed(t, 'get', `/api/assets/${asset.id}`)).status).toBe(200);
    const missing = await authed(t, 'get', '/api/assets/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: { code: 'ASSET_NOT_FOUND', message: 'Asset not found.' } });
  });

  it('PATCH updates mutable fields only (identity immutable by omission)', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const res = await authed(t, 'patch', `/api/assets/${asset.id}`).send({ status: 'CLOSED', dexId: 'orca' });
    expect(res.status).toBe(200);
    expect(res.body.asset.status).toBe('CLOSED');
    expect(res.body.asset.dexId).toBe('orca');
    expect(res.body.asset.contractAddress).toBe(SOL);
  });

  it('PATCH rejects empty body and bad status', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    expect((await authed(t, 'patch', `/api/assets/${asset.id}`).send({})).status).toBe(400);
    expect((await authed(t, 'patch', `/api/assets/${asset.id}`).send({ status: 'MOON' })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Flow B/C — BUY + DCA change average
// ---------------------------------------------------------------------------

describe('Flow B/C — transactions drive the ledger', () => {
  it('first BUY creates position inputs (avg buy correct)', async () => {
    stubPriceService({ prices: { [SOL]: '1' } });
    const asset = await createTestAsset(client, {}, t.userId);
    const tx = await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy());
    expect(tx.status).toBe(201);

    const pos = await authed(t, 'get', `/api/positions/${asset.id}`);
    expect(pos.status).toBe(200);
    expect(pos.body.position.remainingQuantity).toBe('100');
    expect(pos.body.position.averageBuy).toBe('1');
    expect(pos.body.position.remainingCostBasis).toBe('100');
  });

  it('second BUY (DCA) moves average and cost basis', async () => {
    stubPriceService({ prices: { [SOL]: '1' } });
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy());
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`)
      .send(buy({ quantity: '100', pricePerToken: '0.5', executedAt: '2026-01-11T10:00:00.000Z' }));

    const pos = await authed(t, 'get', `/api/positions/${asset.id}`);
    expect(pos.body.position.remainingQuantity).toBe('200');
    expect(pos.body.position.averageBuy).toBe('0.75');
    expect(pos.body.position.remainingCostBasis).toBe('150');
  });

  it('transaction validation: zero qty, negative price, bad date', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    expect(
      (await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy({ quantity: '0' }))).status,
    ).toBe(400);
    expect(
      (await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy({ pricePerToken: '-1' })))
        .status,
    ).toBe(400);
    expect(
      (await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy({ executedAt: 'nope' })))
        .status,
    ).toBe(400);
  });

  it('chronological validation: backdated SELL before any BUY fails even if entered later', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy());
    // SELL dated BEFORE the buy: chronologically there is nothing to sell.
    const res = await authed(t, 'post', `/api/assets/${asset.id}/transactions`)
      .send({ type: 'SELL', quantity: '10', pricePerToken: '2', executedAt: '2026-01-01T10:00:00.000Z' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_POSITION');
  });
});

// ---------------------------------------------------------------------------
// Flow F/G — partial + full SELL
// ---------------------------------------------------------------------------

describe('Flow F/G — partial and full exit', () => {
  it('partial SELL records realized PnL, keeps surviving average', async () => {
    stubPriceService({ prices: { [SOL]: '1' } });
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`)
      .send(buy({ quantity: '200', pricePerToken: '0.75' }));
    const sell = await authed(t, 'post', `/api/assets/${asset.id}/transactions`)
      .send({ type: 'SELL', quantity: '50', pricePerToken: '1', executedAt: '2026-01-12T10:00:00.000Z' });
    expect(sell.status).toBe(201);

    const pos = await authed(t, 'get', `/api/positions/${asset.id}`);
    expect(pos.body.position.remainingQuantity).toBe('150');
    expect(pos.body.position.averageBuy).toBe('0.75');
    expect(pos.body.position.realizedPnL).toBe('12.5');
  });

  it('oversell fails with 422 INSUFFICIENT_POSITION (normalized shape)', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy({ quantity: '5' }));
    const res = await authed(t, 'post', `/api/assets/${asset.id}/transactions`)
      .send({ type: 'SELL', quantity: '6', pricePerToken: '2', executedAt: '2026-01-12T10:00:00.000Z' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { code: 'INSUFFICIENT_POSITION', message: 'Sell quantity exceeds current position.' },
    });
  });

  it('full exit zeroes quantity/unrealized, keeps final realized', async () => {
    stubPriceService({ prices: { [SOL]: '7' } });
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy({ quantity: '10', pricePerToken: '5' }));
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`)
      .send({ type: 'SELL', quantity: '10', pricePerToken: '7', executedAt: '2026-01-12T10:00:00.000Z' });

    const pos = await authed(t, 'get', `/api/positions/${asset.id}`);
    expect(pos.body.position.remainingQuantity).toBe('0');
    expect(pos.body.position.unrealizedPnL).toBe('0');
    expect(pos.body.position.realizedPnL).toBe('20');
  });

  it('PATCH transaction revalidates whole ledger; DELETE revalidates remainder', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const b = await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy({ quantity: '10' }));
    const s = await authed(t, 'post', `/api/assets/${asset.id}/transactions`)
      .send({ type: 'SELL', quantity: '4', pricePerToken: '2', executedAt: '2026-01-12T10:00:00.000Z' });

    // Growing the sell beyond holdings must fail.
    const bad = await authed(t, 'patch', `/api/transactions/${s.body.transaction.id}`).send({ quantity: '11' });
    expect(bad.status).toBe(422);

    // Deleting the BUY would strand the SELL → must fail.
    const delBuy = await authed(t, 'delete', `/api/transactions/${b.body.transaction.id}`);
    expect(delBuy.status).toBe(422);

    // Deleting the SELL is fine.
    expect((await authed(t, 'delete', `/api/transactions/${s.body.transaction.id}`)).status).toBe(200);
    const txs = await authed(t, 'get', `/api/assets/${asset.id}/transactions`);
    expect(txs.body.transactions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Flow D/E — live price + recovery
// ---------------------------------------------------------------------------

describe('Flow D/E — prices feed positions', () => {
  it('position reflects stubbed price: value, PnL, recovery', async () => {
    stubPriceService({ prices: { [SOL]: '0.6' } });
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy({ quantity: '100' }));
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`)
      .send(buy({ quantity: '100', pricePerToken: '0.5', executedAt: '2026-01-11T10:00:00.000Z' }));

    const pos = await authed(t, 'get', `/api/positions/${asset.id}`);
    expect(pos.body.position.currentPrice).toBe('0.6');
    expect(pos.body.position.currentValue).toBe('120');
    expect(pos.body.position.unrealizedPnL).toBe('-30');
    expect(pos.body.position.unrealizedPnLPercent).toBe('-20');
    expect(pos.body.position.bepPrice).toBe('0.75');
    expect(pos.body.position.recoveryToBepPercent).toBe('25');
    expect(pos.body.position.priceSource).toBe('stub');
  });

  it('single-asset price endpoint returns cached flags; 502 when unavailable', async () => {
    stubPriceService({ prices: { [SOL]: '120.13' } });
    const asset = await createTestAsset(client, {}, t.userId);
    const ok = await authed(t, 'get', `/api/assets/${asset.id}/price`);
    expect(ok.status).toBe(200);
    expect(ok.body.priceUsd).toBe('120.13');
    expect(ok.body.assetId).toBe(asset.id);
    expect(typeof ok.body.cached).toBe('boolean');

    stubPriceService({ failAll: 'PROVIDER_UNAVAILABLE' });
    const down = await authed(t, 'get', `/api/assets/${asset.id}/price`);
    expect(down.status).toBe(502);
    expect(down.body.error.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('position with no price returns nulls (never 0)', async () => {
    stubPriceService({ failAll: 'PROVIDER_UNAVAILABLE' });
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy());
    const pos = await authed(t, 'get', `/api/positions/${asset.id}`);
    expect(pos.status).toBe(200);
    expect(pos.body.position.currentPrice).toBeNull();
    expect(pos.body.position.currentValue).toBeNull();
    expect(pos.body.position.unrealizedPnL).toBeNull();
    expect(pos.body.position.bepPrice).toBe('1');
  });

  it('batch prices: one request, per-row results, unknown id tolerated', async () => {
    stubPriceService({ prices: { [SOL]: '120.13' } });
    const a = await createTestAsset(client, {}, t.userId);
    const b = await createTestAsset(client, {
      symbol: 'BTC',
      chain: 'cmc',
      contractAddress: 'cmc-bitcoin',
      provider: 'coinmarketcap',
      providerAssetId: '1',
    }, t.userId);
    const res = await authed(t, 'get', `/api/prices?assetIds=${a.id},${b.id},missing-id`);
    expect(res.status).toBe(200);
    expect(res.body.prices[a.id].priceUsd).toBe('120.13');
    expect(res.body.prices[b.id].price).toBeNull();
    expect(res.body.prices['missing-id'].errorCode).toBe('ASSET_NOT_FOUND');
  });

  it('batch rejects empty and >50 ids', async () => {
    expect((await authed(t, 'get', '/api/prices?assetIds=')).status).toBe(400);
    const many = Array.from({ length: 51 }, (_, i) => `id-${i}`).join(',');
    expect((await authed(t, 'get', `/api/prices?assetIds=${many}`)).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Portfolio summary
// ---------------------------------------------------------------------------

describe('portfolio summary', () => {
  it('aggregates cost, value, realized, open/closed, coverage', async () => {
    stubPriceService({ prices: { [SOL]: '0.6', Closed11111111111111111111111111111111111: '7' } });
    const open = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${open.id}/transactions`).send(buy({ quantity: '200', pricePerToken: '0.75' }));

    const closed = await createTestAsset(client, {
      symbol: 'CLOSED',
      chain: 'solana',
      contractAddress: 'Closed11111111111111111111111111111111111',
    }, t.userId);
    await authed(t, 'post', `/api/assets/${closed.id}/transactions`).send(buy({ quantity: '10', pricePerToken: '5' }));
    await authed(t, 'post', `/api/assets/${closed.id}/transactions`)
      .send({ type: 'SELL', quantity: '10', pricePerToken: '7', executedAt: '2026-01-12T10:00:00.000Z' });

    const res = await authed(t, 'get', '/api/portfolio/summary');
    expect(res.status).toBe(200);
    // cost 150 + 0(closed) = 150 ; value 120 + 0 = 120 ; realized 20
    expect(res.body.summary.totalCostBasis).toBe('150');
    expect(res.body.summary.portfolioValue).toBe('120');
    expect(res.body.summary.unrealizedPnL).toBe('-30');
    expect(res.body.summary.unrealizedPnLPercent).toBe('-20');
    expect(res.body.summary.realizedPnL).toBe('20');
    expect(res.body.summary.openPositions).toBe(1);
    expect(res.body.summary.closedPositions).toBe(1);
    expect(res.body.summary.priceCoverage).toEqual({ withPrice: 2, withoutPrice: 0 });
  });

  it('flags incomplete coverage when a price is missing', async () => {
    stubPriceService({ failAll: 'PROVIDER_UNAVAILABLE' });
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy());
    const res = await authed(t, 'get', '/api/portfolio/summary');
    expect(res.body.summary.portfolioValue).toBe('0');
    expect(res.body.summary.priceCoverage).toEqual({ withPrice: 0, withoutPrice: 1 });
  });
});

// ---------------------------------------------------------------------------
// Flow H — DCA simulator never persists
// ---------------------------------------------------------------------------

describe('Flow H — DCA simulation', () => {
  it('projects before/after without creating a transaction', async () => {
    stubPriceService({ prices: { [SOL]: '0.5' } });
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy());

    const res = await authed(t, 'post', '/api/dca/simulate').send({
      assetId: asset.id,
      additionalCapital: '200',
      buyPrice: '0.5',
      fee: '0',
    });
    expect(res.status).toBe(200);
    const sim = res.body.simulation;
    expect(sim.currentAverageBuy).toBe('1');
    expect(sim.projectedAverageBuy).toBe('0.6');
    expect(sim.currentQuantity).toBe('100');
    expect(sim.projectedQuantity).toBe('500');
    expect(sim.additionalQuantity).toBe('400');
    expect(sim.projectedTotalExposure).toBe('300');
    expect(sim.buyPriceUsed).toBe('0.5');

    const txs = await authed(t, 'get', `/api/assets/${asset.id}/transactions`);
    expect(txs.body.transactions).toHaveLength(1);
  });

  it('defaults buyPrice to market price; 422 when no market and no buyPrice', async () => {
    stubPriceService({ prices: { [SOL]: '0.5' } });
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy());

    const auto = await authed(t, 'post', '/api/dca/simulate').send({ assetId: asset.id, additionalCapital: '100' });
    expect(auto.status).toBe(200);
    expect(auto.body.simulation.buyPriceUsed).toBe('0.5');

    stubPriceService({ failAll: 'PROVIDER_UNAVAILABLE' });
    const noPrice = await authed(t, 'post', '/api/dca/simulate').send({ assetId: asset.id, additionalCapital: '100' });
    expect(noPrice.status).toBe(422);
    expect(noPrice.body.error.code).toBe('NO_MARKET_PRICE');
  });

  it('unknown asset → 404 ASSET_NOT_FOUND', async () => {
    const res = await authed(t, 'post', '/api/dca/simulate').send({ assetId: 'nope', additionalCapital: '100', buyPrice: '1' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ASSET_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Search + resilience
// ---------------------------------------------------------------------------

describe('asset search', () => {
  it('empty query → 400 VALIDATION_ERROR', async () => {
    const res = await authed(t, 'get', '/api/assets/search');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('search tolerates one dead provider when unfiltered', async () => {
    const { PriceService, setPriceServiceForTests } = await import('../src/modules/prices/service');
    const { PriceCache } = await import('../src/modules/prices/cache');
    const { createProviderRegistry } = await import('../src/modules/prices/registry');
    const { PriceProviderError } = await import('../src/modules/prices/errors');
    const { COINMARKETCAP_NAME } = await import('../src/modules/prices/providers/coinmarketcap');
    const { DEXSCREENER_NAME } = await import('../src/modules/prices/providers/dexscreener');
    const dead: PriceProviderStub = {
      name: COINMARKETCAP_NAME,
      searchAssets: async () => {
        throw new PriceProviderError({
          code: 'PROVIDER_NOT_CONFIGURED',
          provider: COINMARKETCAP_NAME,
          message: 'no key',
        });
      },
      getCurrentPrice: async () => {
        throw new PriceProviderError({ code: 'PROVIDER_NOT_CONFIGURED', provider: COINMARKETCAP_NAME, message: 'no key' });
      },
    };
    const live: PriceProviderStub = {
      name: DEXSCREENER_NAME,
      searchAssets: async () => [
        {
          provider: DEXSCREENER_NAME,
          name: 'Wrapped SOL',
          symbol: 'SOL',
          chain: 'solana',
          contractAddress: SOL,
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
          exactContractMatch: true,
        },
      ],
      getCurrentPrice: async () => {
        throw new PriceProviderError({ code: 'ASSET_NOT_FOUND', provider: DEXSCREENER_NAME, message: 'n/a' });
      },
    };
    const registry = createProviderRegistry([live, dead]);
    setPriceServiceForTests(new PriceService({ registry, cache: new PriceCache() }));
    try {
      const res = await authed(t, 'get', '/api/assets/search?q=SOL');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    } finally {
      unstubPriceService();
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 17 — Journal API
// ---------------------------------------------------------------------------

describe('journal API', () => {
  it('missing journal returns null (not 404)', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const res = await authed(t, 'get', `/api/journal/${asset.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ assetId: asset.id, journal: null });
  });

  it('PUT upserts all PLAN §17 fields; reload persists; PUT is idempotent', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const payload = {
      thesis: 'SOL as core L1 holding.',
      entryReason: 'Breakout retest held.',
      invalidation: 'Close below $120.',
      target: '$200',
      riskLevel: 'medium',
      strategy: 'DCA',
      tags: ['L1', 'core'],
      postTradeReview: 'Patient entry, sized well.',
      exitReason: 'Trimmed into strength.',
    };
    const put = await authed(t, 'put', `/api/journal/${asset.id}`).send(payload);
    expect(put.status).toBe(200);
    expect(put.body.journal.thesis).toBe(payload.thesis);
    expect(put.body.journal.tags).toEqual(['L1', 'core']);

    // Reload persists.
    const get = await authed(t, 'get', `/api/journal/${asset.id}`);
    expect(get.body.journal.thesis).toBe(payload.thesis);

    // Partial PUT patches only sent fields.
    const patch = await authed(t, 'put', `/api/journal/${asset.id}`).send({ strategy: 'Swing' });
    expect(patch.status).toBe(200);
    expect(patch.body.journal.strategy).toBe('Swing');
    expect(patch.body.journal.thesis).toBe(payload.thesis);
  });

  it('rejects empty body, overlong fields, too many tags', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    expect((await authed(t, 'put', `/api/journal/${asset.id}`).send({})).status).toBe(400);
    expect(
      (await authed(t, 'put', `/api/journal/${asset.id}`).send({ thesis: 'x'.repeat(5001) })).status,
    ).toBe(400);
    expect(
      (await authed(t, 'put', `/api/journal/${asset.id}`).send({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }))
        .status,
    ).toBe(400);
  });

  it('unknown asset → 404 ASSET_NOT_FOUND', async () => {
    expect((await authed(t, 'get', '/api/journal/nope')).status).toBe(404);
    expect((await authed(t, 'put', '/api/journal/nope').send({ thesis: 'x' })).status).toBe(404);
  });

  it('lists all journals with asset context', async () => {
    const a = await createTestAsset(client, {}, t.userId);
    await authed(t, 'put', `/api/journal/${a.id}`).send({ thesis: 't', strategy: 'DCA' });
    const res = await authed(t, 'get', '/api/journal');
    expect(res.status).toBe(200);
    expect(res.body.journals).toHaveLength(1);
    expect(res.body.journals[0].asset.symbol).toBe('SOL');
  });
});

// ---------------------------------------------------------------------------
// Phase 18 — Watchlist API
// ---------------------------------------------------------------------------

describe('watchlist API', () => {
  it('upserts target + note; priced row computes distance + direction', async () => {
    stubPriceService({ prices: { [SOL]: '100' } });
    const asset = await createTestAsset(client, { status: 'WATCHLIST' }, t.userId);
    const put = await authed(t, 'put', `/api/watchlist/${asset.id}`)
      .send({ targetEntryPrice: '80', note: 'Dip buy zone.' });
    expect(put.status).toBe(200);
    expect(put.body.watchlist.targetEntryPrice).toBe('80');

    const list = await authed(t, 'get', '/api/watchlist');
    expect(list.status).toBe(200);
    expect(list.body.watchlist).toHaveLength(1);
    const row = list.body.watchlist[0];
    expect(row.currentPrice).toBe('100');
    expect(row.targetEntryPrice).toBe('80');
    // (80−100)/100×100 = −20 → target BELOW current.
    expect(row.distanceToTargetPercent).toBe('-20');
    expect(row.targetDirection).toBe('below');
  });

  it('labels above/at targets distinctly', async () => {
    stubPriceService({ prices: { [SOL]: '100' } });
    const asset = await createTestAsset(client, { status: 'WATCHLIST' }, t.userId);
    await authed(t, 'put', `/api/watchlist/${asset.id}`).send({ targetEntryPrice: '150' });
    const above = (await authed(t, 'get', '/api/watchlist')).body.watchlist[0];
    expect(above.distanceToTargetPercent).toBe('50');
    expect(above.targetDirection).toBe('above');

    await authed(t, 'put', `/api/watchlist/${asset.id}`).send({ targetEntryPrice: '100' });
    const at = (await authed(t, 'get', '/api/watchlist')).body.watchlist[0];
    expect(at.distanceToTargetPercent).toBe('0');
    expect(at.targetDirection).toBe('at');
  });

  it('missing price → nulls (never 0), row survives', async () => {
    stubPriceService({ failAll: 'PROVIDER_UNAVAILABLE' });
    const asset = await createTestAsset(client, { status: 'WATCHLIST' }, t.userId);
    await authed(t, 'put', `/api/watchlist/${asset.id}`).send({ targetEntryPrice: '80' });
    const row = (await authed(t, 'get', '/api/watchlist')).body.watchlist[0];
    expect(row.currentPrice).toBeNull();
    expect(row.distanceToTargetPercent).toBeNull();
    expect(row.targetDirection).toBeNull();
    expect(row.targetEntryPrice).toBe('80');
  });

  it('DELETE removes entry; second DELETE → 404', async () => {
    const asset = await createTestAsset(client, { status: 'WATCHLIST' }, t.userId);
    await authed(t, 'put', `/api/watchlist/${asset.id}`).send({ note: 'watch' });
    expect((await authed(t, 'delete', `/api/watchlist/${asset.id}`)).status).toBe(200);
    expect((await authed(t, 'get', '/api/watchlist')).body.watchlist).toHaveLength(0);
    const again = await authed(t, 'delete', `/api/watchlist/${asset.id}`);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('WATCHLIST_NOT_FOUND');
  });

  it('validates target price; unknown asset → 404', async () => {
    const asset = await createTestAsset(client, { status: 'WATCHLIST' }, t.userId);
    expect(
      (await authed(t, 'put', `/api/watchlist/${asset.id}`).send({ targetEntryPrice: 'abc' })).status,
    ).toBe(400);
    expect((await authed(t, 'put', '/api/watchlist/nope').send({ note: 'x' })).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Phase 19 — Analytics
// ---------------------------------------------------------------------------

describe('analytics', () => {
  const C2 = 'Token22222222222222222222222222222222222';
  const C3 = 'Token33333333333333333333333333333333333';
  const C4 = 'Token44444444444444444444444444444444444';

  async function seedClosedWinnersAndLosers() {
    // Winner: BUY 10 @ 5, SELL all @ 7 → +20.
    const win = await createTestAsset(client, { symbol: 'WIN', contractAddress: SOL }, t.userId);
    await authed(t, 'post', `/api/assets/${win.id}/transactions`).send(buy({ quantity: '10', pricePerToken: '5' }));
    await authed(t, 'post', `/api/assets/${win.id}/transactions`)
      .send({ type: 'SELL', quantity: '10', pricePerToken: '7', executedAt: '2026-01-12T10:00:00.000Z' });
    await authed(t, 'put', `/api/journal/${win.id}`).send({ strategy: 'DCA' });

    // Loser: BUY 10 @ 5, SELL all @ 3 → −20.
    const loss = await createTestAsset(client, { symbol: 'LOSS', contractAddress: C2 }, t.userId);
    await authed(t, 'post', `/api/assets/${loss.id}/transactions`).send(buy({ quantity: '10', pricePerToken: '5' }));
    await authed(t, 'post', `/api/assets/${loss.id}/transactions`)
      .send({ type: 'SELL', quantity: '10', pricePerToken: '3', executedAt: '2026-01-12T10:00:00.000Z' });
    await authed(t, 'put', `/api/journal/${loss.id}`).send({ strategy: 'DCA' });
    return { win, loss };
  }

  it('computes win/loss stats, averages, extremes, and strategy rows', async () => {
    stubPriceService({ prices: {} });
    await seedClosedWinnersAndLosers();

    const res = await authed(t, 'get', '/api/portfolio/analytics');
    expect(res.status).toBe(200);
    const a = res.body.analytics;
    expect(a.totalRealizedPnL).toBe('0');
    expect(a.closedPositions).toBe(2);
    expect(a.winningPositions).toBe(1);
    expect(a.losingPositions).toBe(1);
    expect(a.winRate).toBe('50');
    expect(a.averageWinner).toBe('20');
    expect(a.averageLoser).toBe('-20');
    expect(a.largestRealizedWinner).toMatchObject({ symbol: 'WIN', realizedPnL: '20' });
    expect(a.largestRealizedLoser).toMatchObject({ symbol: 'LOSS', realizedPnL: '-20' });
    expect(a.hasEnoughData).toBe(true);
    expect(a.performanceByStrategy).toEqual([
      { strategy: 'DCA', closedPositions: 2, realizedPnL: '0', winRate: '50' },
    ]);
  });

  it('unrealized covers only priced open positions; breakeven closed counts as neither', async () => {
    stubPriceService({ prices: { [SOL]: '0.6' } });
    // Open: 200 @ 0.75 → value 120, unrealized −30.
    const open = await createTestAsset(client, { symbol: 'OPEN', contractAddress: SOL }, t.userId);
    await authed(t, 'post', `/api/assets/${open.id}/transactions`).send(buy({ quantity: '200', pricePerToken: '0.75' }));
    // Breakeven closed: +0 realized.
    const flat = await createTestAsset(client, { symbol: 'FLAT', contractAddress: C3 }, t.userId);
    await authed(t, 'post', `/api/assets/${flat.id}/transactions`).send(buy({ quantity: '10', pricePerToken: '5' }));
    await authed(t, 'post', `/api/assets/${flat.id}/transactions`)
      .send({ type: 'SELL', quantity: '10', pricePerToken: '5', executedAt: '2026-01-12T10:00:00.000Z' });
    // Unpriced open (no stub price for C4) → excluded from unrealized, counted.
    const dark = await createTestAsset(client, { symbol: 'DARK', contractAddress: C4 }, t.userId);
    await authed(t, 'post', `/api/assets/${dark.id}/transactions`).send(buy({ quantity: '10', pricePerToken: '5' }));

    const a = (await authed(t, 'get', '/api/portfolio/analytics')).body.analytics;
    expect(a.totalUnrealizedPnL).toBe('-30');
    expect(a.closedPositions).toBe(1);
    expect(a.winningPositions).toBe(0);
    expect(a.losingPositions).toBe(0);
    expect(a.winRate).toBe('0');
    expect(a.averageWinner).toBeNull();
    expect(a.largestRealizedWinner).toBeNull();
    expect(a.hasEnoughData).toBe(true);
    expect(a.priceCoverage).toEqual({ withPrice: 1, withoutPrice: 1 });
  });

  it('empty portfolio gates with hasEnoughData=false (PLAN §19 empty state)', async () => {
    stubPriceService({ prices: {} });
    const a = (await authed(t, 'get', '/api/portfolio/analytics')).body.analytics;
    expect(a.closedPositions).toBe(0);
    expect(a.winRate).toBeNull();
    expect(a.averageWinner).toBeNull();
    expect(a.averageLoser).toBeNull();
    expect(a.largestRealizedWinner).toBeNull();
    expect(a.largestRealizedLoser).toBeNull();
    expect(a.performanceByStrategy).toEqual([]);
    expect(a.hasEnoughData).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Positions list + error normalization
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 23 — Data Consistency (PLAN §27 canonical scenario, API level)
// ---------------------------------------------------------------------------

describe('Phase 23 — data consistency (canonical scenario via HTTP)', () => {
  it('BUY 100@1 + BUY 100@0.50 → avg 0.75 → SELL 50@1 → all PLAN numbers', async () => {
    stubPriceService({ prices: { [SOL]: '0.6' } });
    const asset = await createTestAsset(client, {}, t.userId);

    // BUY 100 @ $1.
    expect(
      (await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy({ quantity: '100', pricePerToken: '1' })))
        .status,
    ).toBe(201);
    // BUY 100 @ $0.50.
    expect(
      (
        await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(
          buy({ quantity: '100', pricePerToken: '0.5', executedAt: '2026-01-11T10:00:00.000Z' }),
        )
      ).status,
    ).toBe(201);

    // SELL 50 @ $1.
    const sell = await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send({
      type: 'SELL',
      quantity: '50',
      pricePerToken: '1',
      fee: '0',
      executedAt: '2026-01-12T10:00:00.000Z',
    });
    expect(sell.status).toBe(201);

    const pos = await authed(t, 'get', `/api/positions/${asset.id}`);
    expect(pos.status).toBe(200);
    const p = pos.body.position;
    // Ledger state per PLAN §27.
    expect(p.remainingQuantity).toBe('150');
    expect(p.averageBuy).toBe('0.75');
    expect(p.remainingCostBasis).toBe('112.5');
    expect(p.realizedPnL).toBe('12.5');
    // Market state at $0.60.
    expect(p.currentPrice).toBe('0.6');
    expect(p.currentValue).toBe('90');
    expect(p.unrealizedPnL).toBe('-22.5');
    expect(p.unrealizedPnLPercent).toBe('-20');
    expect(p.bepPrice).toBe('0.75');
    expect(p.recoveryToBepPercent).toBe('25');

    // Portfolio summary stays consistent with the same ledger.
    const summary = await authed(t, 'get', '/api/portfolio/summary');
    expect(summary.body.summary.totalCostBasis).toBe('112.5');
    expect(summary.body.summary.portfolioValue).toBe('90');
    expect(summary.body.summary.unrealizedPnL).toBe('-22.5');
    expect(summary.body.summary.realizedPnL).toBe('12.5');
    expect(summary.body.summary.openPositions).toBe(1);

    // Ledger is append-only: three transactions persisted.
    const txs = await authed(t, 'get', `/api/assets/${asset.id}/transactions`);
    expect(txs.body.transactions).toHaveLength(3);
  });

  it('canonical scenario also matches the pure calculation engine exactly', async () => {
    const { buildPositionFromLedger } = await import('../src/modules/portfolio/calculations');
    const { computePositionMetrics } = await import('../src/modules/portfolio/calculations');
    const ledger = buildPositionFromLedger([
      { type: 'BUY', quantity: '100', pricePerToken: '1' },
      { type: 'BUY', quantity: '100', pricePerToken: '0.5' },
      { type: 'SELL', quantity: '50', pricePerToken: '1' },
    ]);
    expect(ledger.remainingQuantity.toString()).toBe('150');
    expect(ledger.averageBuy.toString()).toBe('0.75');
    expect(ledger.remainingCostBasis.toString()).toBe('112.5');
    expect(ledger.realizedPnL.toString()).toBe('12.5');
    const m = computePositionMetrics({
      remainingQuantity: ledger.remainingQuantity,
      averageBuy: ledger.averageBuy,
      currentPrice: '0.6',
    });
    expect(m.currentValue?.toString()).toBe('90');
    expect(m.unrealizedPnL?.toString()).toBe('-22.5');
    expect(m.unrealizedPnLPercent?.toString()).toBe('-20');
    expect(m.recoveryToBepPercent?.toString()).toBe('25');
  });
});

describe('positions list + error shape', () => {
  it('lists positions with computed metrics', async () => {
    stubPriceService({ prices: { [SOL]: '1' } });
    const asset = await createTestAsset(client, {}, t.userId);
    await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(buy());
    const res = await authed(t, 'get', '/api/positions');
    expect(res.status).toBe(200);
    expect(res.body.positions).toHaveLength(1);
    expect(res.body.positions[0].averageBuy).toBe('1');
  });

  it('unknown position → 404; unknown route → NOT_FOUND; no stacks in prod shape', async () => {
    const res = await authed(t, 'get', '/api/positions/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ASSET_NOT_FOUND');

    const route = await authed(t, 'get', '/api/nope');
    expect(route.status).toBe(404);
    expect(route.body.error.code).toBe('NOT_FOUND');
  });
});
