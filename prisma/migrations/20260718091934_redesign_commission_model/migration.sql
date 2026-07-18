-- AlterTable
ALTER TABLE "AccreditedDealer" ADD COLUMN     "agentCommissionOverride" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "DealCommission" ADD COLUMN     "tierPctApplied" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "CommissionConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionConfigTier" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "minTargetPct" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "label" TEXT,

    CONSTRAINT "CommissionConfigTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionConfig_companyId_key" ON "CommissionConfig"("companyId");

-- CreateIndex
CREATE INDEX "CommissionConfigTier_configId_minTargetPct_idx" ON "CommissionConfigTier"("configId", "minTargetPct");

-- AddForeignKey
ALTER TABLE "CommissionConfig" ADD CONSTRAINT "CommissionConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionConfigTier" ADD CONSTRAINT "CommissionConfigTier_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CommissionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
