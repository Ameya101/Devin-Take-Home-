/*
  Warnings:

  - A unique constraint covering the columns `[prevHash]` on the table `AuditEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_prevHash_key" ON "AuditEvent"("prevHash");
