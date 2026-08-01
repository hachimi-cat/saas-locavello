-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountId" TEXT,
    "aggregateId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flag_audits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actor" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,

    CONSTRAINT "feature_flag_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_outbox_unpublished" ON "outbox_events"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_accountId_type_idx" ON "outbox_events"("accountId", "type");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateId_type_idx" ON "outbox_events"("aggregateId", "type");

-- CreateIndex
CREATE INDEX "feature_flag_audits_key_at_idx" ON "feature_flag_audits"("key", "at");
