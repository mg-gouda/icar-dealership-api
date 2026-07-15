-- Add IN_RMA to InventoryReturnStatus enum
ALTER TYPE "InventoryReturnStatus" ADD VALUE IF NOT EXISTS 'IN_RMA';

-- Replace duplicate index with unique constraint on RMALine.partReturnId
DROP INDEX IF EXISTS "RMALine_partReturnId_idx";
ALTER TABLE "RMALine" ADD CONSTRAINT "RMALine_partReturnId_key" UNIQUE ("partReturnId");
