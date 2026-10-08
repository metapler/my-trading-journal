-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'CLOSED', 'WATCHLIST');

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "contractAddress" TEXT,
    "provider" TEXT,
    "providerAssetId" TEXT,
    "preferredPriceProvider" TEXT,
    "dexId" TEXT,
    "pairAddress" TEXT,
    "quoteSymbol" TEXT,
    "imageUrl" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "quantity" DECIMAL(36,18) NOT NULL,
    "pricePerToken" DECIMAL(36,18) NOT NULL,
    "fee" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "thesis" TEXT,
    "entryReason" TEXT,
    "invalidation" TEXT,
    "target" TEXT,
    "riskLevel" TEXT,
    "strategy" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postTradeReview" TEXT,
    "exitReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlists" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "targetEntryPrice" DECIMAL(36,18),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "price" DECIMAL(36,18) NOT NULL,
    "marketCap" DECIMAL(36,2),
    "fdv" DECIMAL(36,2),
    "liquidity" DECIMAL(36,2),
    "volume24h" DECIMAL(36,2),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_symbol_idx" ON "assets"("symbol");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_provider_providerAssetId_idx" ON "assets"("provider", "providerAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_chain_contractAddress_key" ON "assets"("chain", "contractAddress");

-- CreateIndex
CREATE INDEX "transactions_assetId_idx" ON "transactions"("assetId");

-- CreateIndex
CREATE INDEX "transactions_assetId_executedAt_idx" ON "transactions"("assetId", "executedAt");

-- CreateIndex
CREATE INDEX "transactions_executedAt_idx" ON "transactions"("executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "journals_assetId_key" ON "journals"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "watchlists_assetId_key" ON "watchlists"("assetId");

-- CreateIndex
CREATE INDEX "price_snapshots_assetId_idx" ON "price_snapshots"("assetId");

-- CreateIndex
CREATE INDEX "price_snapshots_assetId_capturedAt_idx" ON "price_snapshots"("assetId", "capturedAt");

-- CreateIndex
CREATE INDEX "price_snapshots_capturedAt_idx" ON "price_snapshots"("capturedAt");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
