-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceLocale" TEXT NOT NULL DEFAULT 'en',
    "mode" TEXT NOT NULL DEFAULT 'sdk',
    "siteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_locales" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "fallback" TEXT,
    "rtl" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "project_locales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "namespaces" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reviewPolicy" TEXT NOT NULL DEFAULT 'standard',

    CONSTRAINT "namespaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keys" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "namespaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "description" TEXT,
    "screenshotUrl" TEXT,
    "maxLength" INTEGER,
    "placeholders" JSONB NOT NULL DEFAULT '[]',
    "context" JSONB NOT NULL DEFAULT '{}',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'machine',
    "author" TEXT,
    "reviewedBy" TEXT,
    "rejectedReason" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "catalog" JSONB NOT NULL,
    "keyCount" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glossary_terms" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT,
    "term" TEXT NOT NULL,
    "locale" TEXT,
    "translation" TEXT,
    "note" TEXT,

    CONSTRAINT "glossary_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_entries" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceLocale" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "targetText" TEXT NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_pages" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "keyCount" INTEGER NOT NULL DEFAULT 0,
    "lastCrawledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_jobs" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT,
    "locale" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_usage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT,
    "jobId" TEXT,
    "words" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_accountId_idx" ON "projects"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_accountId_slug_key" ON "projects"("accountId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "project_locales_projectId_tag_key" ON "project_locales"("projectId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "namespaces_projectId_name_key" ON "namespaces"("projectId", "name");

-- CreateIndex
CREATE INDEX "keys_projectId_archived_idx" ON "keys"("projectId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "keys_projectId_namespaceId_name_key" ON "keys"("projectId", "namespaceId", "name");

-- CreateIndex
CREATE INDEX "translations_locale_status_idx" ON "translations"("locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "translations_keyId_locale_key" ON "translations"("keyId", "locale");

-- CreateIndex
CREATE INDEX "releases_projectId_locale_createdAt_idx" ON "releases"("projectId", "locale", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "releases_projectId_locale_contentHash_key" ON "releases"("projectId", "locale", "contentHash");

-- CreateIndex
CREATE INDEX "glossary_terms_accountId_idx" ON "glossary_terms"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "glossary_terms_accountId_projectId_term_locale_key" ON "glossary_terms"("accountId", "projectId", "term", "locale");

-- CreateIndex
CREATE INDEX "tm_entries_accountId_sourceHash_targetLocale_idx" ON "tm_entries"("accountId", "sourceHash", "targetLocale");

-- CreateIndex
CREATE INDEX "tm_entries_accountId_sourceLocale_targetLocale_idx" ON "tm_entries"("accountId", "sourceLocale", "targetLocale");

-- CreateIndex
CREATE UNIQUE INDEX "site_pages_projectId_path_key" ON "site_pages"("projectId", "path");

-- CreateIndex
CREATE INDEX "translation_jobs_accountId_status_createdAt_idx" ON "translation_jobs"("accountId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_accountId_idx" ON "api_keys"("accountId");

-- CreateIndex
CREATE INDEX "agent_usage_accountId_createdAt_idx" ON "agent_usage"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "project_locales" ADD CONSTRAINT "project_locales_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "namespaces" ADD CONSTRAINT "namespaces_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keys" ADD CONSTRAINT "keys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keys" ADD CONSTRAINT "keys_namespaceId_fkey" FOREIGN KEY ("namespaceId") REFERENCES "namespaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
