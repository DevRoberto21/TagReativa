-- AlterTable
ALTER TABLE "ScanLog" ADD COLUMN     "alertSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deviceId" TEXT;

-- CreateIndex
CREATE INDEX "ScanLog_petId_timestamp_idx" ON "ScanLog"("petId", "timestamp");
