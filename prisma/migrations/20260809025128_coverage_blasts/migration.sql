-- CreateEnum
CREATE TYPE "CoverageStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CoverageResponse" AS ENUM ('AVAILABLE', 'DECLINED');

-- CreateTable
CREATE TABLE "CoverageRequest" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "locationId" TEXT,
    "role" TEXT,
    "notes" TEXT,
    "status" "CoverageStatus" NOT NULL DEFAULT 'OPEN',
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "absentId" TEXT,
    "filledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageRecipient" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response" "CoverageResponse",
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "CoverageRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoverageRequest_status_date_idx" ON "CoverageRequest"("status", "date");

-- CreateIndex
CREATE INDEX "CoverageRecipient_employeeId_idx" ON "CoverageRecipient"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "CoverageRecipient_requestId_employeeId_key" ON "CoverageRecipient"("requestId", "employeeId");

-- AddForeignKey
ALTER TABLE "CoverageRequest" ADD CONSTRAINT "CoverageRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRequest" ADD CONSTRAINT "CoverageRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRequest" ADD CONSTRAINT "CoverageRequest_absentId_fkey" FOREIGN KEY ("absentId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRequest" ADD CONSTRAINT "CoverageRequest_filledById_fkey" FOREIGN KEY ("filledById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRecipient" ADD CONSTRAINT "CoverageRecipient_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CoverageRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRecipient" ADD CONSTRAINT "CoverageRecipient_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
