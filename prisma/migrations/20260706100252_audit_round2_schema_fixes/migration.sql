-- AlterEnum
ALTER TYPE "CommissionStatus" ADD VALUE 'PENDING';

-- DropForeignKey
ALTER TABLE "BankStatementLine" DROP CONSTRAINT "BankStatementLine_bankStatementId_fkey";

-- DropForeignKey
ALTER TABLE "CommissionTier" DROP CONSTRAINT "CommissionTier_commissionPlanId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentTermLine" DROP CONSTRAINT "PaymentTermLine_paymentTermId_fkey";

-- DropForeignKey
ALTER TABLE "RecurringJournalEntryTemplateLine" DROP CONSTRAINT "RecurringJournalEntryTemplateLine_templateId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleFeature" DROP CONSTRAINT "VehicleFeature_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleImage" DROP CONSTRAINT "VehicleImage_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "WorkingHours" DROP CONSTRAINT "WorkingHours_userId_fkey";

-- AlterTable
ALTER TABLE "CommissionPlan" ALTER COLUMN "flatAmount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "CommissionTier" ALTER COLUMN "rateValue" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Deal" ALTER COLUMN "tradeInValue" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "salePrice" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "adminFee" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "insuranceFee" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "FinanceApplication" ALTER COLUMN "monthlyPayment" SET DATA TYPE DECIMAL(14,2);

-- AlterTable: FiscalYear — backfill updatedAt for existing rows before making NOT NULL
ALTER TABLE "FiscalYear" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FiscalYear" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "FiscalYear" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "FiscalYear" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "number" TEXT;

-- AlterTable
ALTER TABLE "Location" ALTER COLUMN "defaultAdminFee" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "defaultInsuranceFee" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "number" TEXT;

-- AlterTable
ALTER TABLE "Tax" ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Vehicle" ALTER COLUMN "price" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "cost" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "adminFeeOverride" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "insuranceFeeOverride" SET DATA TYPE DECIMAL(14,2);

-- CreateIndex
CREATE INDEX "BankStatement_bankAccountId_idx" ON "BankStatement"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankStatementLine_bankStatementId_idx" ON "BankStatementLine"("bankStatementId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_companyId_name_key" ON "FiscalYear"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_journalId_idx" ON "Invoice"("journalId");

-- CreateIndex
CREATE INDEX "Invoice_date_idx" ON "Invoice"("date");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_number_key" ON "Payment"("number");

-- CreateIndex
CREATE INDEX "Payment_journalId_idx" ON "Payment"("journalId");

-- CreateIndex
CREATE INDEX "Payment_date_idx" ON "Payment"("date");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_partnerId_idx" ON "PurchaseOrder"("partnerId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_locationId_idx" ON "PurchaseOrder"("locationId");

-- CreateIndex
CREATE INDEX "Receipt_purchaseOrderId_idx" ON "Receipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "ReceiptLine_receiptId_idx" ON "ReceiptLine"("receiptId");

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleImage" ADD CONSTRAINT "VehicleImage_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleFeature" ADD CONSTRAINT "VehicleFeature_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTermLine" ADD CONSTRAINT "PaymentTermLine_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bankStatementId_fkey" FOREIGN KEY ("bankStatementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJournalEntryTemplateLine" ADD CONSTRAINT "RecurringJournalEntryTemplateLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringJournalEntryTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionTier" ADD CONSTRAINT "CommissionTier_commissionPlanId_fkey" FOREIGN KEY ("commissionPlanId") REFERENCES "CommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportShipment" ADD CONSTRAINT "ImportShipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashVoucher" ADD CONSTRAINT "PettyCashVoucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlanNote" ADD CONSTRAINT "FloorPlanNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhtCategory" ADD CONSTRAINT "WhtCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
