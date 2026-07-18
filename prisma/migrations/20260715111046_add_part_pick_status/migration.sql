-- CreateEnum
CREATE TYPE "PartPickStatus" AS ENUM ('PENDING', 'PICKED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ServiceOrderLine" ADD COLUMN     "partPickStatus" "PartPickStatus",
ADD COLUMN     "partPickedAt" TIMESTAMP(3),
ADD COLUMN     "partPickedById" TEXT;

-- CreateIndex
CREATE INDEX "ServiceOrderLine_partPickStatus_idx" ON "ServiceOrderLine"("partPickStatus");

-- AddForeignKey
ALTER TABLE "ServiceOrderLine" ADD CONSTRAINT "ServiceOrderLine_partPickedById_fkey" FOREIGN KEY ("partPickedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
