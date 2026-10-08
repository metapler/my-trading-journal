import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Lazy singleton: the connection string is read on first USE, not at import
// time. Integration tests override process.env.DATABASE_URL before any query
// runs, so static import order cannot leak the dev database into tests.
let cached: PrismaClient | null = null;

function create(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!cached) cached = create();
  return cached;
}

/** Test hook — drop the cached client (e.g. after switching DATABASE_URL). */
export function resetPrismaClient(): void {
  cached = null;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
