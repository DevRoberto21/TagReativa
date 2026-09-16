/*
  Warnings:

  - A unique constraint covering the columns `[scanLogId,channel]` on the table `Notification` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Notification_scanLogId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Notification_scanLogId_channel_key" ON "Notification"("scanLogId", "channel");
