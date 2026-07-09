-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_identifier_attemptedAt_idx" ON "LoginAttempt"("identifier", "attemptedAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_attemptedAt_idx" ON "LoginAttempt"("ip", "attemptedAt");
