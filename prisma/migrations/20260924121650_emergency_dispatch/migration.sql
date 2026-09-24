-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LeakReport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "location" TEXT,
    "occurredAt" TEXT,
    "damageScope" TEXT,
    "description" TEXT,
    "urgency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '접수완료',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_LeakReport" ("address", "createdAt", "damageScope", "id", "location", "name", "occurredAt", "phone", "status", "urgency") SELECT "address", "createdAt", "damageScope", "id", "location", "name", "occurredAt", "phone", "status", "urgency" FROM "LeakReport";
DROP TABLE "LeakReport";
ALTER TABLE "new_LeakReport" RENAME TO "LeakReport";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
