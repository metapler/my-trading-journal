-- Phase 21: multi-user foundation + full auth.
-- Users own assets; token identities become per-user unique.
-- Pre-auth rows are preserved under a legacy owner with an unusable hash.

-- CreateTable users
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable sessions
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex users.email
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- CreateIndex sessions.tokenHash / csrfToken / userId / expiresAt
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_tokenHash_key" ON "sessions"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_csrfToken_key" ON "sessions"("csrfToken");
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX IF NOT EXISTS "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- AddForeignKey sessions.userId
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_userId_fkey') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill owner for pre-auth rows (unusable hash: bcrypt.compare always fails).
INSERT INTO "users" ("id", "email", "passwordHash", "createdAt", "updatedAt")
VALUES ('legacy-owner', 'legacy@localhost', 'MIGRATED_NO_LOGIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- AddColumn assets.userId (nullable first for backfill)
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "assets" SET "userId" = 'legacy-owner' WHERE "userId" IS NULL;

ALTER TABLE "assets" ALTER COLUMN "userId" SET NOT NULL;

-- Drop global identity uniques (now per-user)
DROP INDEX IF EXISTS "assets_chain_contractAddress_key";
DROP INDEX IF EXISTS "assets_provider_providerAssetId_key";

-- Per-user identity uniques
CREATE UNIQUE INDEX IF NOT EXISTS "assets_userId_chain_contractAddress_key" ON "assets"("userId", "chain", "contractAddress");
CREATE UNIQUE INDEX IF NOT EXISTS "assets_userId_provider_providerAssetId_key" ON "assets"("userId", "provider", "providerAssetId");
CREATE INDEX IF NOT EXISTS "assets_userId_idx" ON "assets"("userId");

-- AddForeignKey assets.userId
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_userId_fkey') THEN
    ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
