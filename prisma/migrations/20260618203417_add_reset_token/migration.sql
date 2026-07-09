-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetToken" VARCHAR(64),
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3);
