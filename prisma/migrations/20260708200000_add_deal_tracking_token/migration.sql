-- Step 1: Add column as nullable
ALTER TABLE "Deal" ADD COLUMN "trackingToken" TEXT;

-- Step 2: Backfill existing rows with unique cuid-like values
UPDATE "Deal" SET "trackingToken" = gen_random_uuid()::text WHERE "trackingToken" IS NULL;

-- Step 3: Make column required and add unique constraint
ALTER TABLE "Deal" ALTER COLUMN "trackingToken" SET NOT NULL;
ALTER TABLE "Deal" ALTER COLUMN "trackingToken" SET DEFAULT gen_random_uuid()::text;
CREATE UNIQUE INDEX "Deal_trackingToken_key" ON "Deal"("trackingToken");
