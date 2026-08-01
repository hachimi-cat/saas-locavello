-- CreateTable
CREATE TABLE "roster_identities" (
    "id" TEXT NOT NULL,
    "huudisSub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_memberships" (
    "id" TEXT NOT NULL,
    "huudisSub" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roster_identities_huudisSub_key" ON "roster_identities"("huudisSub");

-- CreateIndex
CREATE INDEX "roster_memberships_accountId_idx" ON "roster_memberships"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_memberships_huudisSub_accountId_key" ON "roster_memberships"("huudisSub", "accountId");

-- AddForeignKey
ALTER TABLE "roster_memberships" ADD CONSTRAINT "roster_memberships_huudisSub_fkey" FOREIGN KEY ("huudisSub") REFERENCES "roster_identities"("huudisSub") ON DELETE CASCADE ON UPDATE CASCADE;
