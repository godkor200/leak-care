-- CreateTable
CREATE TABLE "LeakReport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "occurredAt" TEXT NOT NULL,
    "damageScope" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '접수완료',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LeakReportFile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leakReportId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeakReportFile_leakReportId_fkey" FOREIGN KEY ("leakReportId") REFERENCES "LeakReport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
