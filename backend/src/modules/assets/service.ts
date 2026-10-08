import type { PrismaClient } from '../../generated/prisma/client';
import { getPrisma } from '../../config/prisma';
import { buildPositionFromLedger, type LedgerTransaction } from '../portfolio/calculations';
import { bumpLedgerRevision, isBackdated } from '../portfolio/history';
import { ApiError } from '../../utils/apiError';
import type {
  CreateAssetInput,
  CreateTransactionInput,
  UpdateAssetInput,
  UpdateTransactionInput,
  UpsertJournalInput,
  UpsertWatchlistInput,
} from './validation';

/** Prisma client override for tests (isolated test database). */
let clientOverride: PrismaClient | null = null;

export function setPrismaClientForTests(client: PrismaClient | null): void {
  clientOverride = client;
}

function db(): PrismaClient {
  return clientOverride ?? getPrisma();
}

function serializeAsset<T extends { createdAt: Date; updatedAt: Date }>(a: T): T & { createdAt: string; updatedAt: string } {
  return { ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() };
}

function serializeTx<T extends { executedAt: Date; createdAt: Date; updatedAt: Date }>(
  t: T,
): T & { executedAt: string; createdAt: string; updatedAt: string } {
  return {
    ...t,
    executedAt: t.executedAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function listAssets(userId: string, status?: string) {
  const assets = await db().asset.findMany({
    where: { userId, ...(status ? { status: status as 'ACTIVE' | 'CLOSED' | 'WATCHLIST' } : {}) },
    orderBy: [{ status: 'asc' }, { symbol: 'asc' }, { createdAt: 'asc' }],
  });
  return assets.map(serializeAsset);
}

/**
 * Ownership gate (PLAN §21): other users' IDs resolve as 404, never 403 —
 * no oracle for probing foreign IDs.
 */
export async function getAssetOrThrow(userId: string, id: string) {
  const asset = await db().asset.findFirst({ where: { id, userId } });
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
  return asset;
}

export async function createAsset(userId: string, input: CreateAssetInput) {
  const asset = await db().asset.create({
    data: {
      userId,
      name: input.name,
      symbol: input.symbol,
      chain: input.chain,
      contractAddress: input.contractAddress ?? null,
      provider: input.provider ?? null,
      providerAssetId: input.providerAssetId ?? null,
      preferredPriceProvider: input.preferredPriceProvider ?? null,
      dexId: input.dexId ?? null,
      pairAddress: input.pairAddress ?? null,
      quoteSymbol: input.quoteSymbol ?? null,
      imageUrl: input.imageUrl ?? null,
      status: input.status ?? 'ACTIVE',
    },
  });
  return serializeAsset(asset);
}

export async function updateAsset(userId: string, id: string, input: UpdateAssetInput) {
  await getAssetOrThrow(userId, id);
  // Core identity (chain/contractAddress) is immutable — not in the update
  // schema. Provider mapping fields stay editable for corrections (e.g. pair
  // picked in Add-Token flow, preferred provider switch).
  const asset = await db().asset.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
      ...(input.dexId !== undefined ? { dexId: input.dexId } : {}),
      ...(input.pairAddress !== undefined ? { pairAddress: input.pairAddress } : {}),
      ...(input.quoteSymbol !== undefined ? { quoteSymbol: input.quoteSymbol } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.preferredPriceProvider !== undefined ? { preferredPriceProvider: input.preferredPriceProvider } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.providerAssetId !== undefined ? { providerAssetId: input.providerAssetId } : {}),
    },
  });
  return serializeAsset(asset);
}

// ---------------------------------------------------------------------------
// Transactions — ledger mutations with pre-validation against position
// ---------------------------------------------------------------------------

/** Ledger row with execution time for chronological rebuild. */
interface LedgerRow extends LedgerTransaction {
  id: string;
  executedAt: Date;
}

async function ledgerRows(assetId: string, excludeTxId?: string): Promise<LedgerRow[]> {
  const txs = await db().transaction.findMany({
    where: { assetId },
    orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  return txs
    .filter((t) => t.id !== excludeTxId)
    .map((t) => ({
      id: t.id,
      type: t.type as 'BUY' | 'SELL',
      quantity: t.quantity.toString(),
      pricePerToken: t.pricePerToken.toString(),
      fee: t.fee.toString(),
      executedAt: t.executedAt,
    }));
}

/** Chronological ledger — candidate rows are sorted by executedAt, so a late-entered backdated transaction validates in true time order. */
function toLedger(rows: LedgerRow[]): LedgerTransaction[] {
  return [...rows]
    .sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime())
    .map(({ id: _id, executedAt: _at, ...rest }) => rest);
}

export async function listTransactions(userId: string, assetId: string) {
  await getAssetOrThrow(userId, assetId);
  const txs = await db().transaction.findMany({
    where: { assetId },
    orderBy: [{ executedAt: 'desc' }, { createdAt: 'desc' }],
  });
  return txs.map(serializeTx);
}

export async function createTransaction(userId: string, assetId: string, input: CreateTransactionInput) {
  await getAssetOrThrow(userId, assetId);
  // Pre-validate: rebuild ledger + candidate in chronological order so a
  // SELL-over-position fails with 422 BEFORE writing (CalculationError → error middleware).
  const rows = await ledgerRows(assetId);
  rows.push({
    id: '__candidate__',
    type: input.type,
    quantity: input.quantity,
    pricePerToken: input.pricePerToken,
    fee: input.fee ?? '0',
    executedAt: input.executedAt,
  });
  buildPositionFromLedger(toLedger(rows));

  const tx = await db().transaction.create({
    data: {
      assetId,
      type: input.type,
      quantity: input.quantity,
      pricePerToken: input.pricePerToken,
      fee: input.fee ?? '0',
      executedAt: input.executedAt,
      note: input.note ?? null,
    },
  });
  // Observed history (§9.2): current appends bump the revision; backdated
  // entries additionally stamp invalidatedFrom (affected period marker).
  await bumpLedgerRevision(userId, isBackdated(input.executedAt) ? input.executedAt : null);
  return serializeTx(tx);
}

/** Transaction ownership resolves through the parent asset (single check). */
async function getTransactionOrThrow(userId: string, txId: string) {
  const existing = await db().transaction.findFirst({
    where: { id: txId, asset: { userId } },
  });
  if (!existing) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
  return existing;
}

export async function updateTransaction(userId: string, txId: string, input: UpdateTransactionInput) {
  const existing = await getTransactionOrThrow(userId, txId);

  const merged = {
    type: input.type ?? (existing.type as 'BUY' | 'SELL'),
    quantity: input.quantity ?? existing.quantity.toString(),
    pricePerToken: input.pricePerToken ?? existing.pricePerToken.toString(),
    fee: input.fee ?? existing.fee.toString(),
    executedAt: input.executedAt ?? existing.executedAt,
  };
  // Rebuild full ledger with the edited row swapped in — validates the WHOLE
  // history stays consistent in chronological order, not just the edited row.
  const all = await ledgerRows(existing.assetId);
  const rebuilt: LedgerRow[] = all.map((t) =>
    t.id === txId
      ? { id: txId, type: merged.type, quantity: merged.quantity, pricePerToken: merged.pricePerToken, fee: merged.fee, executedAt: merged.executedAt }
      : t,
  );
  buildPositionFromLedger(toLedger(rebuilt));

  const tx = await db().transaction.update({
    where: { id: txId },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.pricePerToken !== undefined ? { pricePerToken: input.pricePerToken } : {}),
      ...(input.fee !== undefined ? { fee: input.fee } : {}),
      ...(input.executedAt !== undefined ? { executedAt: input.executedAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });
  // Any edit rewrites observed history semantics → mark affected period.
  const affectedAt = input.executedAt ?? existing.executedAt;
  await bumpLedgerRevision(userId, affectedAt < tx.executedAt ? affectedAt : tx.executedAt);
  return serializeTx(tx);
}

export async function deleteTransaction(userId: string, txId: string) {
  const existing = await getTransactionOrThrow(userId, txId);

  // Validate remaining ledger still consistent after removal.
  buildPositionFromLedger(toLedger(await ledgerRows(existing.assetId, txId)));

  await db().transaction.delete({ where: { id: txId } });
  // Deletion reshapes the ledger → mark affected period from the removed row.
  await bumpLedgerRevision(userId, existing.executedAt);
  return { deleted: true, id: txId, assetId: existing.assetId };
}

// ---------------------------------------------------------------------------
// Phase 17 — Journal (one row per asset; PUT upsert)
// ---------------------------------------------------------------------------

function serializeJournal<T extends { createdAt: Date; updatedAt: Date }>(
  j: T,
): T & { createdAt: string; updatedAt: string } {
  return { ...j, createdAt: j.createdAt.toISOString(), updatedAt: j.updatedAt.toISOString() };
}

export async function getJournal(userId: string, assetId: string) {
  await getAssetOrThrow(userId, assetId);
  const journal = await db().journal.findUnique({ where: { assetId } });
  // No journal yet is not an error — return null so the UI shows a blank form.
  return journal ? serializeJournal(journal) : null;
}

export async function upsertJournal(userId: string, assetId: string, input: UpsertJournalInput) {
  await getAssetOrThrow(userId, assetId);
  const journal = await db().journal.upsert({
    where: { assetId },
    update: {
      ...(input.thesis !== undefined ? { thesis: input.thesis } : {}),
      ...(input.entryReason !== undefined ? { entryReason: input.entryReason } : {}),
      ...(input.invalidation !== undefined ? { invalidation: input.invalidation } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel } : {}),
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.postTradeReview !== undefined ? { postTradeReview: input.postTradeReview } : {}),
      ...(input.exitReason !== undefined ? { exitReason: input.exitReason } : {}),
    },
    create: {
      assetId,
      thesis: input.thesis ?? null,
      entryReason: input.entryReason ?? null,
      invalidation: input.invalidation ?? null,
      target: input.target ?? null,
      riskLevel: input.riskLevel ?? null,
      strategy: input.strategy ?? null,
      tags: input.tags ?? [],
      postTradeReview: input.postTradeReview ?? null,
      exitReason: input.exitReason ?? null,
    },
  });
  return serializeJournal(journal);
}

export async function listJournals(userId: string) {
  const journals = await db().journal.findMany({
    where: { asset: { userId } },
    include: { asset: { select: { id: true, name: true, symbol: true, chain: true, imageUrl: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  return journals.map((j) => serializeJournal(j));
}

// ---------------------------------------------------------------------------
// Phase 18 — Watchlist (one row per asset; PUT upsert + priced list)
// ---------------------------------------------------------------------------

function serializeWatchlist<T extends { createdAt: Date; updatedAt: Date }>(
  w: T,
): T & { createdAt: string; updatedAt: string } {
  return { ...w, createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString() };
}

export async function getWatchlist(userId: string, assetId: string) {
  await getAssetOrThrow(userId, assetId);
  const entry = await db().watchlist.findUnique({ where: { assetId } });
  return entry ? serializeWatchlist(entry) : null;
}

export async function upsertWatchlist(userId: string, assetId: string, input: UpsertWatchlistInput) {
  const asset = await getAssetOrThrow(userId, assetId);
  // Saving a target promotes ACTIVE assets onto the watchlist so the new row
  // appears on the watchlist page. Existing WATCHLIST/CLOSED rows keep status.
  if (asset.status === 'ACTIVE') {
    await db().asset.update({ where: { id: assetId }, data: { status: 'WATCHLIST' } });
  }
  const entry = await db().watchlist.upsert({
    where: { assetId },
    update: {
      ...(input.targetEntryPrice !== undefined ? { targetEntryPrice: input.targetEntryPrice } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
    create: {
      assetId,
      targetEntryPrice: input.targetEntryPrice ?? null,
      note: input.note ?? null,
    },
  });
  return serializeWatchlist(entry);
}

export async function deleteWatchlist(userId: string, assetId: string) {
  const asset = await getAssetOrThrow(userId, assetId);
  const existing = await db().watchlist.findUnique({ where: { assetId } });
  if (!existing) throw new ApiError(404, 'WATCHLIST_NOT_FOUND', 'Watchlist entry not found.');
  await db().watchlist.delete({ where: { assetId } });
  // Removing from the watchlist restores ACTIVE so the row actually leaves
  // the watchlist page (which lists WATCHLIST-status assets).
  const nextStatus = asset.status === 'WATCHLIST' ? 'ACTIVE' : asset.status;
  if (nextStatus !== asset.status) {
    await db().asset.update({ where: { id: assetId }, data: { status: nextStatus } });
  }
  return { deleted: true, assetId, status: nextStatus };
}
