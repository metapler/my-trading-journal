import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// Local dev account (documented in README). Password is dev-only.
// Must satisfy the register email policy (valid format with TLD).
const DEV_EMAIL = 'dev@local.test';
const DEV_PASSWORD = 'DevPassword123!';

async function main() {
  const solMint = 'So11111111111111111111111111111111111111112';

  const dev = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, passwordHash: await bcrypt.hash(DEV_PASSWORD, 12) },
  });

  const sol = await prisma.asset.upsert({
    where: {
      userId_chain_contractAddress: { userId: dev.id, chain: 'solana', contractAddress: solMint },
    },
    update: {},
    create: {
      userId: dev.id,
      name: 'Wrapped SOL',
      symbol: 'SOL',
      chain: 'solana',
      contractAddress: solMint,
      provider: 'dexscreener',
      dexId: 'raydium',
      quoteSymbol: 'USDC',
      status: 'ACTIVE',
    },
  });

  const btc = await prisma.asset.upsert({
    where: {
      userId_chain_contractAddress: { userId: dev.id, chain: 'cmc', contractAddress: 'cmc-bitcoin' },
    },
    update: {},
    create: {
      userId: dev.id,
      name: 'Bitcoin',
      symbol: 'BTC',
      chain: 'cmc',
      contractAddress: 'cmc-bitcoin',
      provider: 'coinmarketcap',
      providerAssetId: '1',
      preferredPriceProvider: 'coinmarketcap',
      status: 'WATCHLIST',
    },
  });

  const seedExecutedAt = new Date('2026-01-10T10:00:00Z');
  const existingSeedTx = await prisma.transaction.findFirst({
    where: {
      assetId: sol.id,
      type: 'BUY',
      executedAt: seedExecutedAt,
      note: 'Seed: first SOL buy',
    },
    select: { id: true },
  });
  if (!existingSeedTx) {
    await prisma.transaction.create({
      data: {
        assetId: sol.id,
        type: 'BUY',
        quantity: '1.5',
        pricePerToken: '142.10',
        fee: '0.50',
        executedAt: seedExecutedAt,
        note: 'Seed: first SOL buy',
      },
    });
  }

  await prisma.journal.upsert({
    where: { assetId: sol.id },
    update: {},
    create: {
      assetId: sol.id,
      thesis: 'Seed thesis: SOL as core L1 holding.',
      strategy: 'DCA',
      tags: ['seed', 'L1'],
    },
  });

  await prisma.watchlist.upsert({
    where: { assetId: btc.id },
    update: {},
    create: {
      assetId: btc.id,
      targetEntryPrice: '60000',
      note: 'Seed watchlist entry.',
    },
  });

  console.log(`Seed done: user=${DEV_EMAIL} SOL=${sol.id} BTC=${btc.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
