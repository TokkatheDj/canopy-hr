-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN "resumeName" TEXT,
ADD COLUMN "resumeType" TEXT,
ADD COLUMN "resumeData" BYTEA;

-- AlterTable
ALTER TABLE "OfferLetter" ADD COLUMN "signToken" TEXT,
ADD COLUMN "signedName" TEXT,
ADD COLUMN "signedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "OfferLetter_signToken_key" ON "OfferLetter"("signToken");

-- Backfill clock times for demo entries that were seeded with hours only,
-- so the timesheet's In/Out columns aren't blank for historical data.
UPDATE "TimesheetEntry"
SET "clockIn"  = "date" + interval '9 hours',
    "clockOut" = "date" + interval '9 hours' + ("hours" * interval '1 hour')
WHERE "clockIn" IS NULL
  AND "clockOut" IS NULL
  AND "hours" > 0;
