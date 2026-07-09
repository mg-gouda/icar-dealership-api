-- CreateTable
CREATE TABLE "LookupItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookupItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LookupItem_companyId_category_active_idx" ON "LookupItem"("companyId", "category", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LookupItem_companyId_category_value_key" ON "LookupItem"("companyId", "category", "value");

-- AddForeignKey
ALTER TABLE "LookupItem" ADD CONSTRAINT "LookupItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
