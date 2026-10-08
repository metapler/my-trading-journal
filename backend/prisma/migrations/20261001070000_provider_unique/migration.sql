-- Drop non-unique provider index, replace with unique constraint
DROP INDEX IF EXISTS "assets_provider_providerAssetId_idx";

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "assets_provider_providerAssetId_key" ON "assets"("provider", "providerAssetId");
