-- CreateEnum
CREATE TYPE "ChequeDirection" AS ENUM ('OUTGOING', 'INCOMING');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('ISSUED', 'CLEARED', 'BOUNCED', 'CANCELLED');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "depositRequired" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "Cheque" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "chequeNumber" TEXT NOT NULL,
    "direction" "ChequeDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "bankAccountId" TEXT NOT NULL,
    "partnerId" TEXT,
    "payeePayor" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "clearedDate" TIMESTAMP(3),
    "status" "ChequeStatus" NOT NULL DEFAULT 'ISSUED',
    "memo" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChequeAllocation" (
    "id" TEXT NOT NULL,
    "chequeId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "purchaseOrderId" TEXT,
    "invoiceId" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChequeAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_journalEntryId_key" ON "Cheque"("journalEntryId");

-- CreateIndex
CREATE INDEX "Cheque_companyId_status_idx" ON "Cheque"("companyId", "status");

-- CreateIndex
CREATE INDEX "Cheque_companyId_chequeNumber_idx" ON "Cheque"("companyId", "chequeNumber");

-- CreateIndex
CREATE INDEX "Cheque_locationId_idx" ON "Cheque"("locationId");

-- CreateIndex
CREATE INDEX "Cheque_partnerId_idx" ON "Cheque"("partnerId");

-- CreateIndex
CREATE INDEX "ChequeAllocation_chequeId_idx" ON "ChequeAllocation"("chequeId");

-- CreateIndex
CREATE INDEX "ChequeAllocation_purchaseOrderId_idx" ON "ChequeAllocation"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "ChequeAllocation_invoiceId_idx" ON "ChequeAllocation"("invoiceId");

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeAllocation" ADD CONSTRAINT "ChequeAllocation_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "Cheque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeAllocation" ADD CONSTRAINT "ChequeAllocation_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeAllocation" ADD CONSTRAINT "ChequeAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
