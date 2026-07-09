-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "dealId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceOrder_dealId_idx" ON "ServiceOrder"("dealId");

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
