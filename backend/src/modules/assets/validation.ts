import { z } from 'zod';

/** Decimal-as-string: canonical math crosses boundaries as strings, never floats. */
export const decimalString = (field: string, opts: { allowZero?: boolean } = {}) =>
  z
    .union([z.string(), z.number()])
    .refine(
      (v) => {
        const s = String(v).trim();
        if (s === '') return false;
        // Reject float-form nonsense early; Decimal validates the rest.
        if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return false;
        const n = Number(s);
        if (!Number.isFinite(n)) return false;
        return opts.allowZero ? n >= 0 : n > 0;
      },
      { message: `${field} must be ${opts.allowZero ? '>= 0' : '> 0'}.` },
    )
    .transform((v) => String(v).trim());

export const feeString = decimalString('fee', { allowZero: true });

const nullableTrimmed = z
  .string()
  .trim()
  .max(500)
  .transform((s) => (s === '' ? null : s))
  .nullable()
  .optional();

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Must not be empty.')
    .max(max)
    .optional();

export const assetStatusSchema = z.enum(['ACTIVE', 'CLOSED', 'WATCHLIST']);

export const createAssetSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(200),
    symbol: z.string().trim().min(1, 'Symbol is required.').max(50),
    chain: z.string().trim().min(1, 'Chain is required.').max(100),
    contractAddress: nullableTrimmed,
    provider: nullableTrimmed,
    providerAssetId: nullableTrimmed,
    preferredPriceProvider: z.enum(['dexscreener', 'coinmarketcap']).nullable().optional(),
    dexId: nullableTrimmed,
    pairAddress: nullableTrimmed,
    quoteSymbol: nullableTrimmed,
    imageUrl: nullableTrimmed,
    status: assetStatusSchema.optional(),
  })
  .superRefine((v, ctx) => {
    // Identity rule (PLAN §3.2): DEX assets need chain+contract; provider
    // assets need provider+providerAssetId. Ticker alone is never identity.
    const hasContract = (v.contractAddress ?? null) !== null;
    const hasProviderId = (v.provider ?? null) !== null && (v.providerAssetId ?? null) !== null;
    if (!hasContract && !hasProviderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contractAddress'],
        message: 'Provide chain + contractAddress, or provider + providerAssetId. Ticker alone is not identity.',
      });
    }
    if (v.preferredPriceProvider === 'coinmarketcap' && !hasProviderId && v.providerAssetId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preferredPriceProvider'],
        message: 'coinmarketcap provider requires a providerAssetId.',
      });
    }
  });

export const updateAssetSchema = z
  .object({
    name: optionalTrimmed(200),
    symbol: optionalTrimmed(50),
    dexId: nullableTrimmed,
    pairAddress: nullableTrimmed,
    quoteSymbol: nullableTrimmed,
    imageUrl: nullableTrimmed,
    status: assetStatusSchema.optional(),
    preferredPriceProvider: z.enum(['dexscreener', 'coinmarketcap']).nullable().optional(),
    provider: nullableTrimmed,
    providerAssetId: nullableTrimmed,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'No fields to update.' });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Query must not be empty.').max(200),
  provider: z.enum(['dexscreener', 'coinmarketcap']).optional(),
});

const statusFilterSchema = assetStatusSchema.optional();

export const assetListQuerySchema = z.object({
  status: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(statusFilterSchema)
    .optional(),
});

export const positionListQuerySchema = assetListQuerySchema;

export const batchPricesQuerySchema = z.object({
  assetIds: z
    .string()
    .trim()
    .min(1, 'assetIds is required.')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .refine((ids) => ids.length > 0, 'assetIds is required.')
    .refine((ids) => ids.length <= 50, 'Max 50 assetIds per batch request.'),
});

export const transactionTypeSchema = z.enum(['BUY', 'SELL']);

/** Executed-at must be a real date, not absurdly old, and not in the future (5-min clock-skew tolerance). */
const executedAtSchema = z.coerce
  .date({ invalid_type_error: 'executedAt must be a valid date.' })
  .refine((d) => !Number.isNaN(d.getTime()), 'executedAt must be a valid date.')
  .refine((d) => d.getFullYear() >= 2009, 'executedAt looks too far in the past.')
  .refine((d) => d.getTime() <= Date.now() + 5 * 60_000, 'executedAt must not be in the future.');

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  quantity: decimalString('quantity'),
  pricePerToken: decimalString('pricePerToken'),
  fee: feeString.optional().default('0'),
  executedAt: executedAtSchema,
  note: z.string().trim().max(2000).nullable().optional(),
});

export const updateTransactionSchema = z
  .object({
    type: transactionTypeSchema.optional(),
    quantity: decimalString('quantity').optional(),
    pricePerToken: decimalString('pricePerToken').optional(),
    fee: feeString.optional(),
    executedAt: executedAtSchema.optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'No fields to update.' });

export const dcaSimulateSchema = z.object({
  assetId: z.string().trim().min(1, 'assetId is required.'),
  additionalCapital: decimalString('additionalCapital'),
  buyPrice: decimalString('buyPrice').optional(),
  fee: feeString.optional().default('0'),
});

// ---------------------------------------------------------------------------
// Phase 17 — Journal (one row per asset; PUT upsert, all fields optional)
// ---------------------------------------------------------------------------

const journalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional();

export const upsertJournalSchema = z
  .object({
    thesis: journalText(5000),
    entryReason: journalText(5000),
    invalidation: journalText(5000),
    target: journalText(500),
    riskLevel: journalText(50),
    strategy: journalText(100),
    tags: z
      .array(z.string().trim().min(1).max(50))
      .max(20, 'Max 20 tags.')
      .optional(),
    postTradeReview: journalText(5000),
    exitReason: journalText(5000),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'No fields to update.' });

// ---------------------------------------------------------------------------
// Phase 18 — Watchlist (one row per asset; PUT upsert)
// ---------------------------------------------------------------------------

export const upsertWatchlistSchema = z
  .object({
    targetEntryPrice: decimalString('targetEntryPrice').nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'No fields to update.' });

// ---------------------------------------------------------------------------
// Phase 2 (REDESIGN §9.3) — portfolio history range enum
// ---------------------------------------------------------------------------

export const portfolioHistoryQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).optional().default('30d'),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type DcaSimulateInput = z.infer<typeof dcaSimulateSchema>;
export type UpsertJournalInput = z.infer<typeof upsertJournalSchema>;
export type UpsertWatchlistInput = z.infer<typeof upsertWatchlistSchema>;
