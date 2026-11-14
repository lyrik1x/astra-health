-- CreateTable
CREATE TABLE "MissionClock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "simEpoch" DATETIME NOT NULL,
    "realEpoch" DATETIME NOT NULL,
    "factor" REAL NOT NULL,
    "clockVersion" INTEGER NOT NULL
);
