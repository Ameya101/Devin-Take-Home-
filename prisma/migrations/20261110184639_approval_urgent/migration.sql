-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "decisionNote" TEXT,
    CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalRequest" ("decidedAt", "decidedById", "decisionNote", "id", "payload", "requestedAt", "requestedById", "status", "type") SELECT "decidedAt", "decidedById", "decisionNote", "id", "payload", "requestedAt", "requestedById", "status", "type" FROM "ApprovalRequest";
DROP TABLE "ApprovalRequest";
ALTER TABLE "new_ApprovalRequest" RENAME TO "ApprovalRequest";
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");
CREATE INDEX "ApprovalRequest_status_urgent_idx" ON "ApprovalRequest"("status", "urgent");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
