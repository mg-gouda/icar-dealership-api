-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "accreditedDealerId" TEXT;

-- CreateIndex
CREATE INDEX "Vehicle_accreditedDealerId_idx" ON "Vehicle"("accreditedDealerId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_accreditedDealerId_fkey" FOREIGN KEY ("accreditedDealerId") REFERENCES "AccreditedDealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
