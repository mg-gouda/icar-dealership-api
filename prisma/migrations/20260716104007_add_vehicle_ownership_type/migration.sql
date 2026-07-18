-- CreateEnum
CREATE TYPE "VehicleOwnershipType" AS ENUM ('OWNED', 'CONSIGNMENT');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "ownershipType" "VehicleOwnershipType" NOT NULL DEFAULT 'OWNED';
