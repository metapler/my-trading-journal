export type HealthResponse = { status: string }

/** Normalized price shape — mirrors backend CurrentPrice + cache flags. */
export interface PriceResponse {
  priceUsd: string
  source: string
  fetchedAt: string
  chain?: string | null
  pairAddress?: string | null
  liquidityUsd?: string | null
  volume24hUsd?: string | null
  marketCapUsd?: string | null
  fdvUsd?: string | null
  cached: boolean
  stale: boolean
  ageMs: number
}

/** Mirrors backend PositionResponse — all decimals arrive as strings. */
export interface Position {
  assetId: string
  symbol: string
  name: string
  chain: string
  status: string
  remainingQuantity: string
  averageBuy: string
  remainingCostBasis: string
  realizedPnL: string
  currentPrice: string | null
  currentValue: string | null
  unrealizedPnL: string | null
  unrealizedPnLPercent: string | null
  bepPrice: string | null
  recoveryToBepPercent: string | null
  priceSource: string | null
  priceFetchedAt: string | null
  priceStale: boolean
  priceCached: boolean
}

/** Mirrors backend PortfolioSummary. */
export interface PortfolioSummary {
  totalCostBasis: string
  portfolioValue: string
  unrealizedPnL: string
  unrealizedPnLPercent: string | null
  realizedPnL: string
  openPositions: number
  closedPositions: number
  priceCoverage: { withPrice: number; withoutPrice: number }
}

/** One selectable candidate from asset search (one row per pair). */
export interface AssetSearchResult {
  provider: 'dexscreener' | 'coinmarketcap'
  name: string
  symbol: string
  chain: string
  contractAddress: string | null
  providerAssetId: string | null
  pairAddress: string | null
  dexId: string | null
  quoteSymbol: string | null
  priceUsd: string | null
  liquidityUsd: string | null
  volume24hUsd: string | null
  marketCapUsd: string | null
  fdvUsd: string | null
  imageUrl: string | null
  dexUrl: string | null
  exactContractMatch: boolean
}

/** Stored asset row. */
export interface Asset {
  id: string
  name: string
  symbol: string
  chain: string
  contractAddress: string | null
  provider: string | null
  providerAssetId: string | null
  preferredPriceProvider: string | null
  dexId: string | null
  pairAddress: string | null
  quoteSymbol: string | null
  imageUrl: string | null
  status: 'ACTIVE' | 'CLOSED' | 'WATCHLIST'
  createdAt: string
  updatedAt: string
}

export interface CreateAssetPayload {
  name: string
  symbol: string
  chain: string
  contractAddress?: string | null
  provider?: string | null
  providerAssetId?: string | null
  preferredPriceProvider?: 'dexscreener' | 'coinmarketcap' | null
  dexId?: string | null
  pairAddress?: string | null
  quoteSymbol?: string | null
  imageUrl?: string | null
  status?: 'ACTIVE' | 'CLOSED' | 'WATCHLIST'
}

/** Ledger transaction row. */
export interface Transaction {
  id: string
  assetId: string
  type: 'BUY' | 'SELL'
  quantity: string
  pricePerToken: string
  fee: string
  executedAt: string
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTransactionPayload {
  type: 'BUY' | 'SELL'
  quantity: string
  pricePerToken: string
  fee?: string
  executedAt: string
  note?: string | null
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, message: string, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const err = (body ?? {}) as { error?: { code?: string; message?: string } }
    throw new ApiError(res.status, err.error?.message ?? `Request failed: ${res.status}`, err.error?.code ?? null)
  }
  return body as T
}

/**
 * Session auth (PLAN §21): the HTTP-only cookie carries the session, so all
 * same-origin requests must send credentials. Mutations additionally send
 * the CSRF header from the in-memory token (never localStorage).
 */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

function withCsrf(headers: Record<string, string>): Record<string, string> {
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  return headers;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, credentials: 'include', headers: { Accept: 'application/json' } })
  return parseJson<T>(res)
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    signal,
    credentials: 'include',
    headers: withCsrf({ Accept: 'application/json', 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  return parseJson<T>(res)
}

async function putJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    signal,
    credentials: 'include',
    headers: withCsrf({ Accept: 'application/json', 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  return parseJson<T>(res)
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health', signal)
}

export async function getAssetPrice(assetId: string, signal?: AbortSignal): Promise<PriceResponse> {
  return getJson<PriceResponse>(`/api/assets/${encodeURIComponent(assetId)}/price`, signal)
}

export async function getBatchPrices(assetIds: string[], signal?: AbortSignal): Promise<Record<string, PriceResponse | null>> {
  const qs = assetIds.map((id) => encodeURIComponent(id)).join(',')
  return getJson<Record<string, PriceResponse | null>>(`/api/prices?assetIds=${qs}`, signal)
}

export async function getPositions(signal?: AbortSignal): Promise<Position[]> {
  const body = await getJson<{ positions: Position[] }>('/api/positions', signal)
  return body.positions
}

export async function getPosition(assetId: string, signal?: AbortSignal): Promise<Position> {
  const body = await getJson<{ position: Position }>(`/api/positions/${encodeURIComponent(assetId)}`, signal)
  return body.position
}

export async function getAsset(assetId: string, signal?: AbortSignal): Promise<Asset> {
  const body = await getJson<{ asset: Asset }>(`/api/assets/${encodeURIComponent(assetId)}`, signal)
  return body.asset
}

export async function getPortfolioSummary(signal?: AbortSignal): Promise<PortfolioSummary> {
  const body = await getJson<{ summary: PortfolioSummary }>('/api/portfolio/summary', signal)
  return body.summary
}

/** Mirrors backend AnalyticsResponse — all decimals arrive as strings. */
export interface StrategyPerformance {
  strategy: string
  closedPositions: number
  realizedPnL: string
  winRate: string | null
}

export interface Analytics {
  totalRealizedPnL: string
  totalUnrealizedPnL: string
  closedPositions: number
  winningPositions: number
  losingPositions: number
  winRate: string | null
  averageWinner: string | null
  averageLoser: string | null
  largestRealizedWinner: { assetId: string; symbol: string; realizedPnL: string } | null
  largestRealizedLoser: { assetId: string; symbol: string; realizedPnL: string } | null
  performanceByStrategy: StrategyPerformance[]
  hasEnoughData: boolean
  priceCoverage: { withPrice: number; withoutPrice: number }
}

export async function getAnalytics(signal?: AbortSignal): Promise<Analytics> {
  const body = await getJson<{ analytics: Analytics }>('/api/portfolio/analytics', signal)
  return body.analytics
}

/** Mirrors backend PortfolioHistory — observed snapshots, decimal strings (§9.3). */
export type HistoryRange = '24h' | '7d' | '30d' | '90d' | 'all'
export type HistoryQuality = 'complete' | 'stale' | 'partial' | 'unavailable'

export interface HistoryPoint {
  capturedAt: string
  valueUsd: string | null
  activeCostBasisUsd: string | null
  quality: HistoryQuality
}

export interface PortfolioHistory {
  currency: 'USD'
  metric: 'active_positions_value'
  source: 'observed_snapshots'
  requestedRange: HistoryRange
  requestedFrom: string | null
  availableFrom: string | null
  availableTo: string | null
  generatedAt: string
  intervalSeconds: number
  coverage: 'full' | 'limited' | 'none'
  invalidatedFrom: string | null
  points: HistoryPoint[]
}

export async function getPortfolioHistory(range: HistoryRange, signal?: AbortSignal): Promise<PortfolioHistory> {
  const body = await getJson<{ history: PortfolioHistory }>(
    `/api/portfolio/history?range=${encodeURIComponent(range)}`,
    signal,
  )
  return body.history
}

export async function searchAssets(query: string, signal?: AbortSignal): Promise<AssetSearchResult[]> {
  const body = await getJson<{ query: string; count: number; results: AssetSearchResult[] }>(
    `/api/assets/search?q=${encodeURIComponent(query)}`,
    signal,
  )
  return body.results
}

export async function getAssets(signal?: AbortSignal): Promise<Asset[]> {
  const body = await getJson<{ assets: Asset[] }>('/api/assets', signal)
  return body.assets
}

export async function createAsset(payload: CreateAssetPayload, signal?: AbortSignal): Promise<Asset> {
  const body = await postJson<{ asset: Asset }>('/api/assets', payload, signal)
  return body.asset
}

export async function getAssetTransactions(assetId: string, signal?: AbortSignal): Promise<Transaction[]> {
  const body = await getJson<{ assetId: string; transactions: Transaction[] }>(
    `/api/assets/${encodeURIComponent(assetId)}/transactions`,
    signal,
  )
  return body.transactions
}

export async function createTransaction(
  assetId: string,
  payload: CreateTransactionPayload,
  signal?: AbortSignal,
): Promise<Transaction> {
  const body = await postJson<{ transaction: Transaction }>(
    `/api/assets/${encodeURIComponent(assetId)}/transactions`,
    payload,
    signal,
  )
  return body.transaction
}

/** Mirrors backend DcaSimulateResponse — pure projection, never persisted. */
export interface DcaSimulation {
  assetId: string
  currentAverageBuy: string
  projectedAverageBuy: string
  currentBep: string | null
  projectedBep: string | null
  currentQuantity: string
  projectedQuantity: string
  additionalQuantity: string
  currentRecoveryToBepPercent: string | null
  projectedRecoveryToBepPercent: string | null
  projectedTotalExposure: string
  buyPriceUsed: string
  currentPrice: string | null
}

export interface SimulateDcaPayload {
  assetId: string
  additionalCapital: string
  buyPrice?: string
  fee?: string
}

export async function simulateDca(payload: SimulateDcaPayload, signal?: AbortSignal): Promise<DcaSimulation> {
  const body = await postJson<{ simulation: DcaSimulation }>('/api/dca/simulate', payload, signal)
  return body.simulation
}

/** Mirrors backend Journal row — all fields nullable, tags is string[]. */
export interface Journal {
  id: string
  assetId: string
  thesis: string | null
  entryReason: string | null
  invalidation: string | null
  target: string | null
  riskLevel: string | null
  strategy: string | null
  tags: string[]
  postTradeReview: string | null
  exitReason: string | null
  createdAt: string
  updatedAt: string
}

export interface JournalWithAsset extends Journal {
  asset: { id: string; name: string; symbol: string; chain: string; imageUrl: string | null }
}

export interface UpsertJournalPayload {
  thesis?: string | null
  entryReason?: string | null
  invalidation?: string | null
  target?: string | null
  riskLevel?: string | null
  strategy?: string | null
  tags?: string[]
  postTradeReview?: string | null
  exitReason?: string | null
}

export async function getJournal(assetId: string, signal?: AbortSignal): Promise<Journal | null> {
  const body = await getJson<{ assetId: string; journal: Journal | null }>(
    `/api/journal/${encodeURIComponent(assetId)}`,
    signal,
  )
  return body.journal
}

export async function listJournals(signal?: AbortSignal): Promise<JournalWithAsset[]> {
  const body = await getJson<{ journals: JournalWithAsset[] }>('/api/journal', signal)
  return body.journals
}

export async function putJournal(
  assetId: string,
  payload: UpsertJournalPayload,
  signal?: AbortSignal,
): Promise<Journal> {
  const body = await putJson<{ journal: Journal }>(
    `/api/journal/${encodeURIComponent(assetId)}`,
    payload,
    signal,
  )
  return body.journal
}

/** Priced watchlist row — mirrors backend WatchlistRow. */
export interface WatchlistRow {
  assetId: string
  symbol: string
  name: string
  chain: string
  imageUrl: string | null
  currentPrice: string | null
  targetEntryPrice: string | null
  distanceToTargetPercent: string | null
  targetDirection: 'above' | 'below' | 'at' | null
  note: string | null
  priceSource: string | null
  priceFetchedAt: string | null
  priceStale: boolean
  updatedAt: string
}

export interface UpsertWatchlistPayload {
  targetEntryPrice?: string | null
  note?: string | null
}

export async function listWatchlist(signal?: AbortSignal): Promise<WatchlistRow[]> {
  const body = await getJson<{ watchlist: WatchlistRow[] }>('/api/watchlist', signal)
  return body.watchlist
}

export async function putWatchlist(
  assetId: string,
  payload: UpsertWatchlistPayload,
  signal?: AbortSignal,
): Promise<void> {
  await putJson(`/api/watchlist/${encodeURIComponent(assetId)}`, payload, signal)
}

export async function removeWatchlist(assetId: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`/api/watchlist/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
    signal,
    credentials: 'include',
    headers: withCsrf({ Accept: 'application/json' }),
  })
  await parseJson<unknown>(res)
}

/** Auth (PLAN §21): session cookie is HTTP-only; CSRF token stays in memory. */
export interface AuthUser {
  id: string
  email: string
  createdAt: string
}

export async function register(payload: { email: string; password: string }): Promise<{ user: AuthUser; csrfToken: string }> {
  const body = await postJson<{ user: AuthUser; csrfToken: string }>('/api/auth/register', payload)
  setCsrfToken(body.csrfToken)
  return body
}

export async function login(payload: { email: string; password: string }): Promise<{ user: AuthUser; csrfToken: string }> {
  const body = await postJson<{ user: AuthUser; csrfToken: string }>('/api/auth/login', payload)
  setCsrfToken(body.csrfToken)
  return body
}

export async function logout(signal?: AbortSignal): Promise<void> {
  await postJson<{ ok: boolean }>('/api/auth/logout', {}, signal)
  setCsrfToken(null)
}

export async function getMe(signal?: AbortSignal): Promise<AuthUser> {
  const body = await getJson<{ user: AuthUser }>('/api/auth/me', signal)
  return body.user
}
