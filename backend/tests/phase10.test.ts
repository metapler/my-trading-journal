import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { limiter } from '../src/middleware/rateLimit.middleware';
import { notFoundMiddleware } from '../src/middleware/notFound.middleware';
import { setPrismaClientForTests as setAssetsClient } from '../src/modules/assets/service';
import { setPrismaClientForTests as setPortfolioClient } from '../src/modules/portfolio/service';
import { unstubPriceService } from './stubPrices';
import { authed, createAuthedAgent, createTestAsset, createTestClient, resetDb, type AuthedAgent } from './helpers';

const app = createApp();
const client = createTestClient();
let t: AuthedAgent;

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
// Query validation (all list/filter endpoints via Zod)
// ---------------------------------------------------------------------------

describe('query validation', () => {
  it('rejects invalid status on /api/assets and /api/positions', async () => {
    for (const path of ['/api/assets?status=MOON', '/api/positions?status=MOON']) {
      const res = await authed(t, 'get', path);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('accepts lowercase status (normalized to uppercase)', async () => {
    expect((await authed(t, 'get', '/api/assets?status=active')).status).toBe(200);
    expect((await authed(t, 'get', '/api/positions?status=closed')).status).toBe(200);
  });

  it('batch prices: missing/empty/oversize assetIds → 400', async () => {
    expect((await authed(t, 'get', '/api/prices')).status).toBe(400);
    expect((await authed(t, 'get', '/api/prices?assetIds=%20')).status).toBe(400);
    const many = Array.from({ length: 51 }, (_, i) => `id-${i}`).join(',');
    const res = await authed(t, 'get', `/api/prices?assetIds=${many}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Max 50/);
  });

  it('search: empty query and bad provider → 400', async () => {
    expect((await authed(t, 'get', '/api/assets/search?q=%20')).status).toBe(400);
    const bad = await authed(t, 'get', '/api/assets/search?q=SOL&provider=nope');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Body validation: future/ancient dates, decimals, floats rejected
// ---------------------------------------------------------------------------

describe('transaction date + decimal guards', () => {
  it('rejects future executedAt (beyond skew tolerance)', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    const res = await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send({
      type: 'BUY',
      quantity: '1',
      pricePerToken: '1',
      executedAt: future,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/future/i);
  });

  it('rejects ancient executedAt', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const res = await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send({
      type: 'BUY',
      quantity: '1',
      pricePerToken: '1',
      executedAt: '1999-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric quantity/price and negative fee', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const base = { type: 'BUY', quantity: '1', pricePerToken: '1', executedAt: '2026-01-10T10:00:00.000Z' };
    for (const body of [
      { ...base, quantity: 'abc' },
      { ...base, pricePerToken: 'NaN' },
      { ...base, quantity: 'Infinity' },
      { ...base, fee: '-1' },
    ]) {
      const res = await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('unsupported BUY/SELL type → 400', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const res = await authed(t, 'post', `/api/assets/${asset.id}/transactions`).send({
      type: 'DCA',
      quantity: '1',
      pricePerToken: '1',
      executedAt: '2026-01-10T10:00:00.000Z',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Body-parser errors: malformed JSON + oversize payload
// ---------------------------------------------------------------------------

describe('body-parser errors', () => {
  // Raw agent (session cookie, no CSRF header): body-parser runs BEFORE auth,
  // so malformed/oversize bodies surface as 400/413 — never auth errors.
  it('malformed JSON → 400 VALIDATION_ERROR (not 500)', async () => {
    const res = await t.agent
      .post('/api/assets')
      .set('Content-Type', 'application/json')
      .send('{"name": broken');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/stack/i);
  });

  it('oversize body → 413 PAYLOAD_TOO_LARGE', async () => {
    const big = 'x'.repeat(120 * 1024);
    const res = await t.agent.post('/api/assets').send({ name: big, symbol: 'X', chain: 'solana' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

// ---------------------------------------------------------------------------
// Error normalization: shape, no stack leaks, prod audit
// ---------------------------------------------------------------------------

describe('error normalization', () => {
  it('every error has { error: { code, message } } and no stack field', async () => {
    const asset = await createTestAsset(client, {}, t.userId);
    const paths: Array<[string, string, unknown?]> = [
      ['get', '/api/nope'],
      ['get', '/api/assets/missing'],
      ['get', '/api/assets/search?q=%20'],
      ['post', '/api/assets', { name: 'x' }],
      [
        'post',
        `/api/assets/${asset.id}/transactions`,
        { type: 'SELL', quantity: '999', pricePerToken: '1', executedAt: '2026-01-12T10:00:00.000Z' },
      ],
    ];
    for (const [method, path, body] of paths) {
      const req = method === 'get' ? authed(t, 'get', path) : authed(t, 'post', path).send(body ?? {});
      const res = await req;
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(typeof res.body.error?.code).toBe('string');
      expect(typeof res.body.error?.message).toBe('string');
      expect(res.body).not.toHaveProperty('stack');
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\(.*:\d+:\d+\)/);
    }
  });

  it('unknown server error in production hides details (INTERNAL_ERROR)', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const boom = express();
      boom.use(express.json({ limit: '100kb' }));
      boom.get('/boom', () => {
        throw new Error('secret db password=hunter2 at internal.ts:42:7');
      });
      boom.use(notFoundMiddleware);
      boom.use(errorMiddleware);
      const res = await request(boom).get('/boom');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('Prisma P2025 race → 404 NOT_FOUND, other DB errors → 500 without driver detail', async () => {
    const probe = express();
    probe.use(express.json({ limit: '100kb' }));
    probe.get('/p2025', () => {
      throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
    });
    probe.get('/pXXX', () => {
      throw Object.assign(new Error('column "secret_stuff" does not exist'), { code: 'P9999' });
    });
    probe.use(notFoundMiddleware);
    probe.use(errorMiddleware);

    const nf = await request(probe).get('/p2025');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('NOT_FOUND');

    const db = await request(probe).get('/pXXX');
    expect(db.status).toBe(500);
    expect(db.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(db.body)).not.toMatch(/secret_stuff/);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('rate limiting', () => {
  it('tight limiter returns normalized 429 after budget is spent', async () => {
    const probe = express();
    probe.use(express.json({ limit: '100kb' }));
    probe.use('/limited', limiter({ windowMs: 60_000, limit: 3 }));
    probe.get('/limited', (_req, res) => res.json({ ok: true }));
    probe.use(notFoundMiddleware);
    probe.use(errorMiddleware);

    for (let i = 0; i < 3; i++) expect((await request(probe).get('/limited')).status).toBe(200);
    const limited = await request(probe).get('/limited');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('rate-limit headers are the modern draft-8 form (no legacy X-RateLimit-*)', async () => {
    const probe = express();
    probe.use('/h', limiter({ windowMs: 60_000, limit: 100 }));
    probe.get('/h', (_req, res) => res.json({ ok: true }));
    const res = await request(probe).get('/h');
    expect(res.status).toBe(200);
    // draft-8: `RateLimit` + `RateLimit-Policy`; legacy `X-RateLimit-*` off.
    expect(res.headers['ratelimit']).toBeDefined();
    expect(res.headers['ratelimit-policy']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Security headers + CORS posture (spot-check, PLAN §25)
// ---------------------------------------------------------------------------

describe('security posture', () => {
  it('hides x-powered-by and sets helmet headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('CORS allows the configured frontend origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('trusts a single proxy hop (rate limits key on X-Forwarded-For)', async () => {
    expect(app.get('trust proxy')).toBe(1);
  });
});
