-- DropForeignKey
ALTER TABLE "ServiceOrder" DROP CONSTRAINT "ServiceOrder_vehicleId_fkey";

-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "externalVehicleId" TEXT,
ADD COLUMN     "walkInCustomerName" TEXT,
ADD COLUMN     "walkInCustomerPhone" TEXT,
ALTER COLUMN "vehicleId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ExternalVehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT,
    "year" INTEGER,
    "regNumber" TEXT,
    "ownerName" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalVehicle_companyId_idx" ON "ExternalVehicle"("companyId");

-- CreateIndex
CREATE INDEX "ExternalVehicle_ownerPhone_idx" ON "ExternalVehicle"("ownerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalVehicle_companyId_licensePlate_key" ON "ExternalVehicle"("companyId", "licensePlate");

-- CreateIndex
CREATE INDEX "ServiceOrder_externalVehicleId_idx" ON "ServiceOrder"("externalVehicleId");

-- AddForeignKey
ALTER TABLE "ExternalVehicle" ADD CONSTRAINT "ExternalVehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_externalVehicleId_fkey" FOREIGN KEY ("externalVehicleId") REFERENCES "ExternalVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
