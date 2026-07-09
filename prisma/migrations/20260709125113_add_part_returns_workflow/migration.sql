-- CreateEnum
CREATE TYPE "PartReturnReason" AS ENUM ('WARRANTY', 'DEFECTIVE', 'WRONG_PART', 'CHANGE_OF_MIND', 'DAMAGED_IN_TRANSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PartReturnStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PartRefundMethod" AS ENUM ('CASH', 'REPLACEMENT', 'CC_REFUND', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "InventoryReturnStatus" AS ENUM ('RETURNED_TO_STOCK', 'QUARANTINE');

-- CreateEnum
CREATE TYPE "RMAStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SENT_WITH_ORDER', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RMAResolutionType" AS ENUM ('CASH_REFUND', 'CREDIT_NOTE');

-- CreateTable
CREATE TABLE "PartReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "reason" "PartReturnReason" NOT NULL,
    "refundMethod" "PartRefundMethod" NOT NULL,
    "status" "PartReturnStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "inventoryStatus" "InventoryReturnStatus",
    "customerName" TEXT,
    "customerPhone" TEXT,
    "saleRef" TEXT,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturerRMA" (
    "id" TEXT NOT NULL,
    "rmaNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "RMAStatus" NOT NULL DEFAULT 'DRAFT',
    "resolutionType" "RMAResolutionType",
    "resolutionAmount" DECIMAL(14,2),
    "creditNoteRef" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturerRMA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RMALine" (
    "id" TEXT NOT NULL,
    "rmaId" TEXT NOT NULL,
    "partReturnId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RMALine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCreditNote" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rmaId" TEXT NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "usedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteUsage" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "purchaseOrderRef" TEXT,
    "amountUsed" DECIMAL(14,2) NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "CreditNoteUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartReturn_returnNumber_key" ON "PartReturn"("returnNumber");

-- CreateIndex
CREATE INDEX "PartReturn_partId_idx" ON "PartReturn"("partId");

-- CreateIndex
CREATE INDEX "PartReturn_status_idx" ON "PartReturn"("status");

-- CreateIndex
CREATE INDEX "PartReturn_locationId_idx" ON "PartReturn"("locationId");

-- CreateIndex
CREATE INDEX "PartReturn_companyId_idx" ON "PartReturn"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturerRMA_rmaNumber_key" ON "ManufacturerRMA"("rmaNumber");

-- CreateIndex
CREATE INDEX "ManufacturerRMA_supplierId_idx" ON "ManufacturerRMA"("supplierId");

-- CreateIndex
CREATE INDEX "ManufacturerRMA_status_idx" ON "ManufacturerRMA"("status");

-- CreateIndex
CREATE INDEX "ManufacturerRMA_companyId_idx" ON "ManufacturerRMA"("companyId");

-- CreateIndex
CREATE INDEX "RMALine_rmaId_idx" ON "RMALine"("rmaId");

-- CreateIndex
CREATE INDEX "RMALine_partReturnId_idx" ON "RMALine"("partReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditNote_creditNoteNumber_key" ON "SupplierCreditNote"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "SupplierCreditNote_supplierId_idx" ON "SupplierCreditNote"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierCreditNote_companyId_idx" ON "SupplierCreditNote"("companyId");

-- CreateIndex
CREATE INDEX "CreditNoteUsage_creditNoteId_idx" ON "CreditNoteUsage"("creditNoteId");

-- AddForeignKey
ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturerRMA" ADD CONSTRAINT "ManufacturerRMA_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturerRMA" ADD CONSTRAINT "ManufacturerRMA_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturerRMA" ADD CONSTRAINT "ManufacturerRMA_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMALine" ADD CONSTRAINT "RMALine_rmaId_fkey" FOREIGN KEY ("rmaId") REFERENCES "ManufacturerRMA"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMALine" ADD CONSTRAINT "RMALine_partReturnId_fkey" FOREIGN KEY ("partReturnId") REFERENCES "PartReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMALine" ADD CONSTRAINT "RMALine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_rmaId_fkey" FOREIGN KEY ("rmaId") REFERENCES "ManufacturerRMA"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteUsage" ADD CONSTRAINT "CreditNoteUsage_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "SupplierCreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
