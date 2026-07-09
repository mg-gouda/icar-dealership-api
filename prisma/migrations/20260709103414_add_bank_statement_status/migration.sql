-- AlterTable
ALTER TABLE "BankStatement" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "Deal" ALTER COLUMN "trackingToken" DROP DEFAULT;
