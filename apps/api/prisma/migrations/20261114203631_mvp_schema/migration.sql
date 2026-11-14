-- CreateTable
CREATE TABLE "Astronaut" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "EnvironmentProfile" (
    "profile" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "oneWayDelayMinutesSim" INTEGER NOT NULL,
    "delaySource" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    PRIMARY KEY ("profile", "version")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "astronautId" TEXT NOT NULL,
    "indicator" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "capturedAtReal" DATETIME NOT NULL,
    "capturedAtSim" DATETIME NOT NULL,
    "payloadCanonical" TEXT NOT NULL,
    "transmissionId" TEXT NOT NULL,
    CONSTRAINT "Measurement_astronautId_fkey" FOREIGN KEY ("astronautId") REFERENCES "Astronaut" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Measurement_transmissionId_fkey" FOREIGN KEY ("transmissionId") REFERENCES "Transmission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncidentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "sequence" INTEGER,
    "createdAtReal" DATETIME NOT NULL,
    "createdAtSim" DATETIME NOT NULL,
    "payloadCanonical" TEXT NOT NULL,
    "transmissionId" TEXT NOT NULL,
    CONSTRAINT "IncidentEvent_astronautId_fkey" FOREIGN KEY ("astronautId") REFERENCES "Astronaut" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IncidentEvent_transmissionId_fkey" FOREIGN KEY ("transmissionId") REFERENCES "Transmission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "astronautId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "createdAtReal" DATETIME NOT NULL,
    "createdAtSim" DATETIME NOT NULL,
    "payloadCanonical" TEXT NOT NULL,
    "transmissionId" TEXT NOT NULL,
    CONSTRAINT "Message_astronautId_fkey" FOREIGN KEY ("astronautId") REFERENCES "Astronaut" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_transmissionId_fkey" FOREIGN KEY ("transmissionId") REFERENCES "Transmission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "direction" TEXT NOT NULL,
    "contentKind" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "acceptedAtReal" DATETIME NOT NULL,
    "acceptedAtSim" DATETIME NOT NULL,
    "deliverAt" DATETIME NOT NULL,
    "envProfile" TEXT NOT NULL,
    "envVersion" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_transmissionId_key" ON "Measurement"("transmissionId");

-- CreateIndex
CREATE INDEX "Measurement_astronautId_capturedAtSim_idx" ON "Measurement"("astronautId", "capturedAtSim");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentEvent_transmissionId_key" ON "IncidentEvent"("transmissionId");

-- CreateIndex
CREATE INDEX "IncidentEvent_astronautId_idx" ON "IncidentEvent"("astronautId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentEvent_incidentId_sequence_key" ON "IncidentEvent"("incidentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Message_transmissionId_key" ON "Message"("transmissionId");

-- CreateIndex
CREATE INDEX "Message_astronautId_createdAtSim_idx" ON "Message"("astronautId", "createdAtSim");

-- CreateIndex
CREATE INDEX "Transmission_deliverAt_idx" ON "Transmission"("deliverAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transmission_contentKind_contentId_key" ON "Transmission"("contentKind", "contentId");
