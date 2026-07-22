-- CreateTable
CREATE TABLE "VehiclePriceLog" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "oldPrice" DECIMAL(14,2) NOT NULL,
    "newPrice" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "changedByName" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehiclePriceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehiclePriceLog_vehicleId_idx" ON "VehiclePriceLog"("vehicleId");

-- AddForeignKey
ALTER TABLE "VehiclePriceLog" ADD CONSTRAINT "VehiclePriceLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
