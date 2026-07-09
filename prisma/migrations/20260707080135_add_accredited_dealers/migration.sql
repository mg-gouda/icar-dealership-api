-- CreateTable
CREATE TABLE "AccreditedDealer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "carMakes" TEXT[],
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 30,
    "monthlyTarget" INTEGER NOT NULL DEFAULT 0,
    "minimumMonthly" INTEGER NOT NULL DEFAULT 0,
    "targetBonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "kickbackPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccreditedDealer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccreditedDealer_companyId_active_idx" ON "AccreditedDealer"("companyId", "active");

-- AddForeignKey
ALTER TABLE "AccreditedDealer" ADD CONSTRAINT "AccreditedDealer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
