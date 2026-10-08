-- CreateEnum
CREATE TYPE "SnapshotQuality" AS ENUM ('complete', 'stale', 'partial', 'unavailable');

-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "portfolioValueUsd" DECIMAL(36,2),
    "knownValueUsd" DECIMAL(36,2) NOT NULL,
    "activeCostBasisUsd" DECIMAL(36,2) NOT NULL,
    "quality" "SnapshotQuality" NOT NULL,
    "pricedAssetCount" INTEGER NOT NULL,
    "totalAssetCount" INTEGER NOT NULL,
    "oldestPriceAt" TIMESTAMP(3),
    "ledgerRevision" INTEGER NOT NULL,

    CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_history_state" (
    "userId" TEXT NOT NULL,
    "ledgerRevision" INTEGER NOT NULL DEFAULT 0,
    "invalidatedFrom" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_history_state_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "portfolio_snapshots_userId_capturedAt_idx" ON "portfolio_snapshots"("userId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_snapshots_userId_bucketStart_key" ON "portfolio_snapshots"("userId", "bucketStart");

-- AddForeignKey
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_history_state" ADD CONSTRAINT "portfolio_history_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
