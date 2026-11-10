-- AlterTable
ALTER TABLE "FlagChangeRequest" ADD COLUMN "pendingSlot" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FlagChangeRequest_pendingSlot_key" ON "FlagChangeRequest"("pendingSlot");

