-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('INTAKE', 'AWAITING_PARTS', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'APPROVED', 'COMPLETED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('MAINTENANCE', 'REPAIR', 'PDI', 'RECONDITIONING', 'RECALL', 'WARRANTY');

-- CreateEnum
CREATE TYPE "ServiceLineType" AS ENUM ('LABOR', 'PART', 'CONSUMABLE', 'SUBLET');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('IN_TRANSIT', 'AT_PORT', 'CUSTOMS_CLEARANCE', 'CLEARED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "FloorPlanStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'POSTED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "whtAmount" DECIMAL(14,2),
ADD COLUMN     "whtCategoryId" TEXT;

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT,
    "locationId" TEXT NOT NULL,
    "technicianId" TEXT,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'INTAKE',
    "type" "ServiceType" NOT NULL DEFAULT 'MAINTENANCE',
    "mileageIn" INTEGER,
    "mileageOut" INTEGER,
    "description" TEXT,
    "internalNotes" TEXT,
    "laborTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "partsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderLine" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "type" "ServiceLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "partId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "oemNumber" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'PCS',
    "costPrice" DECIMAL(14,2) NOT NULL,
    "salePrice" DECIMAL(14,2) NOT NULL,
    "onHand" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "locationId" TEXT NOT NULL,
    "supplierId" TEXT,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "targetUnits" INTEGER NOT NULL DEFAULT 0,
    "targetRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "customerId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "status" "WhatsAppStatus" NOT NULL DEFAULT 'SENT',
    "externalId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportShipment" (
    "id" TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "supplier" TEXT,
    "origin" TEXT,
    "shipDate" TIMESTAMP(3),
    "arrivalDate" TIMESTAMP(3),
    "clearanceDate" TIMESTAMP(3),
    "portFees" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shippingCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "clearanceAgentFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherCosts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportShipmentVehicle" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customsDuty" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedLanded" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalLandedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ImportShipmentVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashFund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "custodianId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashVoucher" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "receiptUrl" TEXT,
    "submittedBy" TEXT NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "journalEntryId" TEXT,
    "voucherDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PettyCashVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlanNote" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "principalAmount" DECIMAL(14,2) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "status" "FloorPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "paidOffDate" TIMESTAMP(3),
    "paidOffAmount" DECIMAL(14,2),
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlanNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhtCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "description" TEXT,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhtCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_orderNumber_key" ON "ServiceOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "ServiceOrder_locationId_status_idx" ON "ServiceOrder"("locationId", "status");

-- CreateIndex
CREATE INDEX "ServiceOrder_vehicleId_idx" ON "ServiceOrder"("vehicleId");

-- CreateIndex
CREATE INDEX "ServiceOrder_customerId_idx" ON "ServiceOrder"("customerId");

-- CreateIndex
CREATE INDEX "ServiceOrderLine_serviceOrderId_idx" ON "ServiceOrderLine"("serviceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Part_partNumber_key" ON "Part"("partNumber");

-- CreateIndex
CREATE INDEX "Part_locationId_idx" ON "Part"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_userId_locationId_period_key" ON "SalesTarget"("userId", "locationId", "period");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_leadId_idx" ON "WhatsAppMessage"("leadId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_customerId_idx" ON "WhatsAppMessage"("customerId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_phone_idx" ON "WhatsAppMessage"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "ImportShipment_shipmentNumber_key" ON "ImportShipment"("shipmentNumber");

-- CreateIndex
CREATE INDEX "ImportShipment_locationId_status_idx" ON "ImportShipment"("locationId", "status");

-- CreateIndex
CREATE INDEX "ImportShipmentVehicle_shipmentId_idx" ON "ImportShipmentVehicle"("shipmentId");

-- CreateIndex
CREATE INDEX "ImportShipmentVehicle_vehicleId_idx" ON "ImportShipmentVehicle"("vehicleId");

-- CreateIndex
CREATE INDEX "PettyCashFund_locationId_idx" ON "PettyCashFund"("locationId");

-- CreateIndex
CREATE INDEX "PettyCashVoucher_fundId_idx" ON "PettyCashVoucher"("fundId");

-- CreateIndex
CREATE INDEX "PettyCashVoucher_status_idx" ON "PettyCashVoucher"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlanNote_vehicleId_key" ON "FloorPlanNote"("vehicleId");

-- CreateIndex
CREATE INDEX "FloorPlanNote_locationId_status_idx" ON "FloorPlanNote"("locationId", "status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_whtCategoryId_fkey" FOREIGN KEY ("whtCategoryId") REFERENCES "WhtCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderLine" ADD CONSTRAINT "ServiceOrderLine_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderLine" ADD CONSTRAINT "ServiceOrderLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportShipment" ADD CONSTRAINT "ImportShipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportShipmentVehicle" ADD CONSTRAINT "ImportShipmentVehicle_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "ImportShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportShipmentVehicle" ADD CONSTRAINT "ImportShipmentVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashVoucher" ADD CONSTRAINT "PettyCashVoucher_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "PettyCashFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashVoucher" ADD CONSTRAINT "PettyCashVoucher_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashVoucher" ADD CONSTRAINT "PettyCashVoucher_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashVoucher" ADD CONSTRAINT "PettyCashVoucher_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlanNote" ADD CONSTRAINT "FloorPlanNote_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlanNote" ADD CONSTRAINT "FloorPlanNote_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
