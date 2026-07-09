-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "adminFeeBoundsPercent" DECIMAL(5,2) DEFAULT 20,
ADD COLUMN     "insuranceFeeBoundsPercent" DECIMAL(5,2) DEFAULT 20;
