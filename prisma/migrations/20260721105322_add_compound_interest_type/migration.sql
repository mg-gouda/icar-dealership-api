-- AlterEnum
ALTER TYPE "InstallmentCalculationMethod" ADD VALUE 'COMPOUND';

-- AlterTable
ALTER TABLE "FinanceApplication" ADD COLUMN     "interestType" "InstallmentCalculationMethod";
