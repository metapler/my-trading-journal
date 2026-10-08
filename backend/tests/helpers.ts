import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../src/generated/prisma/client';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/password';

// Fail fast: integration tests must NEVER run against the dev database.
const TEST_URL = process.env.TEST_DATABASE_URL ?? '';
if (!TEST_URL || !TEST_URL.includes('trading_journal_test')) {
  throw new Error(
    'Integration tests require TEST_DATABASE_URL pointing at trading_journal_test. Refusing to run.',
  );
}

function createClient(): PrismaClientType {
  const adapter = new PrismaPg({ connectionString: TEST_URL });
  return new PrismaClient({ adapter });
}

/**
 * Fresh isolated client per suite file. Tables are truncated between tests;
 * call `resetDb(client)` in beforeEach.
 */
export function createTestClient(): PrismaClientType {
  return createClient();
}

export async function resetDb(client: PrismaClientType): Promise<void> {
  // FK-safe order: children first.
  await client.session.deleteMany();
  await client.priceSnapshot.deleteMany();
  await client.watchlist.deleteMany();
  await client.journal.deleteMany();
  await client.transaction.deleteMany();
  await client.asset.deleteMany();
  await client.portfolioSnapshot.deleteMany();
  await client.portfolioHistoryState.deleteMany();
  await client.user.deleteMany();
}

/** Default test user. Pass a distinct email per test needing isolation. */
export async function createTestUser(client: PrismaClientType, email = 'test@example.com') {
  return client.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: await hashPassword('TestPassword123!') },
  });
}

export interface AuthedAgent {
  /** supertest agent with session cookie jar. */
  agent: ReturnType<typeof import('supertest').agent>;
  userId: string;
  email: string;
  csrfToken: string;
}

function parseSetCookie(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const session = list.find((c) => c.startsWith('tj_session='));
  if (!session) return null;
  return session.split(';')[0].slice('tj_session='.length);
}

/**
 * Register a fresh user and return an authed supertest agent that carries
 * the session cookie. Mutations must ALSO send `x-csrf-token` (use
 * `authed(agent, csrf, method, path)` or set the header manually).
 */
export async function createAuthedAgent(
  app: Parameters<typeof import('supertest').agent>[0],
  client: PrismaClientType,
  email = 'test@example.com',
): Promise<AuthedAgent> {
  const { agent } = await import('supertest');
  const jar = agent(app);
  const res = await jar.post('/api/auth/register').send({ email, password: 'TestPassword123!' });
  if (res.status !== 201) throw new Error(`register failed in test setup: ${res.status} ${JSON.stringify(res.body)}`);
  const user = await client.user.findUniqueOrThrow({ where: { email } });
  return { agent: jar, userId: user.id, email, csrfToken: res.body.csrfToken as string };
}

/** Convenience: authed request with CSRF header pre-set. */
export function authed(agent: AuthedAgent, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
  const req = agent.agent[method](path);
  if (method !== 'get') req.set('x-csrf-token', agent.csrfToken);
  return req;
}

export { parseSetCookie };

export interface AssetOverrides {
  name?: string;
  symbol?: string;
  chain?: string;
  contractAddress?: string | null;
  provider?: string | null;
  providerAssetId?: string | null;
  preferredPriceProvider?: string | null;
  dexId?: string | null;
  pairAddress?: string | null;
  quoteSymbol?: string | null;
  imageUrl?: string | null;
  status?: 'ACTIVE' | 'CLOSED' | 'WATCHLIST';
}

export async function createTestAsset(
  client: PrismaClientType,
  overrides: AssetOverrides = {},
  userId?: string,
) {
  const owner = userId ?? (await createTestUser(client)).id;
  const { userId: _overrideUserId, ...rest } = overrides as AssetOverrides & { userId?: string };
  return client.asset.create({
    data: {
      userId: _overrideUserId ?? owner,
      name: 'Wrapped SOL',
      symbol: 'SOL',
      chain: 'solana',
      contractAddress: 'So11111111111111111111111111111111111111112',
      provider: 'dexscreener',
      dexId: 'raydium',
      quoteSymbol: 'USDC',
      status: 'ACTIVE',
      ...rest,
    },
  });
}
