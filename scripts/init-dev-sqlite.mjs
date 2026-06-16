import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function addColumnIfMissing(tableName, columnName, definition) {
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`);
  if (columns.some((column) => column.name === columnName)) return;

  await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definition}`);
}

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "ContactRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
  )
`);

await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "ContactRequest_shop_createdAt_idx"
  ON "ContactRequest"("shop", "createdAt")
`);

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "JudgeMeConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL UNIQUE,
    "shopDomain" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "encryptedApiToken" TEXT NOT NULL,
    "tokenMask" TEXT NOT NULL,
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "shopName" TEXT,
    "shopEmail" TEXT,
    "ownerName" TEXT,
    "plan" TEXT,
    "platform" TEXT,
    "country" TEXT,
    "timezone" TEXT,
    "widgetVersion" TEXT,
    "awesome" BOOLEAN,
    "reviewCount" INTEGER,
    "lastVerifiedAt" DATETIME,
    "lastError" TEXT,
    "accountJson" TEXT,
    "settingsJson" TEXT,
    "sampleReviewsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "JudgeMeConnection_shop_status_idx"
  ON "JudgeMeConnection"("shop", "status")
`);

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "YotpoConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL UNIQUE,
    "storeId" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "encryptedApiSecret" TEXT NOT NULL,
    "secretMask" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "reviewCount" INTEGER,
    "lastVerifiedAt" DATETIME,
    "lastError" TEXT,
    "accountJson" TEXT,
    "sampleReviewsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "YotpoConnection_shop_status_idx"
  ON "YotpoConnection"("shop", "status")
`);

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "ReviewDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'judgeme',
    "sourceReviewId" TEXT NOT NULL,
    "sourceReviewJson" TEXT,
    "customerName" TEXT,
    "customerInitials" TEXT,
    "productTitle" TEXT,
    "productType" TEXT,
    "productTagsJson" TEXT,
    "reviewBody" TEXT NOT NULL,
    "rating" INTEGER,
    "sourceCreatedAt" DATETIME,
    "draft" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "aiModelId" TEXT,
    "aiModelName" TEXT,
    "aiProviderName" TEXT,
    "aiProviderModel" TEXT,
    "draftGeneratedAt" DATETIME,
    "draftEditedAt" DATETIME,
    "draftRevisionCount" INTEGER NOT NULL DEFAULT 0,
    "humanRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" DATETIME,
    "skippedAt" DATETIME,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await prisma.$executeRawUnsafe(`
  CREATE UNIQUE INDEX IF NOT EXISTS "ReviewDraft_shop_source_sourceReviewId_key"
  ON "ReviewDraft"("shop", "source", "sourceReviewId")
`);

await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "ReviewDraft_shop_status_sourceCreatedAt_idx"
  ON "ReviewDraft"("shop", "status", "sourceCreatedAt")
`);

await addColumnIfMissing("ReviewDraft", "productType", "TEXT");
await addColumnIfMissing("ReviewDraft", "productTagsJson", "TEXT");
await addColumnIfMissing("ReviewDraft", "aiModelId", "TEXT");
await addColumnIfMissing("ReviewDraft", "aiModelName", "TEXT");
await addColumnIfMissing("ReviewDraft", "aiProviderName", "TEXT");
await addColumnIfMissing("ReviewDraft", "aiProviderModel", "TEXT");
await addColumnIfMissing("ReviewDraft", "draftGeneratedAt", "DATETIME");
await addColumnIfMissing("ReviewDraft", "draftEditedAt", "DATETIME");
await addColumnIfMissing("ReviewDraft", "draftRevisionCount", "INTEGER NOT NULL DEFAULT 0");

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "BrandVoiceSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL UNIQUE,
    "personality" TEXT NOT NULL,
    "greeting" TEXT NOT NULL,
    "signOff" TEXT NOT NULL,
    "alwaysMentionJson" TEXT NOT NULL,
    "avoidPhrasesJson" TEXT NOT NULL,
    "selectedModel" TEXT NOT NULL,
    "livePreview" TEXT,
    "previewReview" TEXT,
    "previewProductId" TEXT,
    "previewProductTitle" TEXT,
    "previewProductType" TEXT,
    "previewProductTagsJson" TEXT,
    "previewRating" INTEGER NOT NULL DEFAULT 5,
    "personalityStyle" TEXT NOT NULL DEFAULT 'balanced',
    "personalityStrength" TEXT NOT NULL DEFAULT 'balanced',
    "replyLength" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await addColumnIfMissing("BrandVoiceSetting", "personalityStyle", "TEXT NOT NULL DEFAULT 'balanced'");
await addColumnIfMissing("BrandVoiceSetting", "personalityStrength", "TEXT NOT NULL DEFAULT 'balanced'");
await addColumnIfMissing("BrandVoiceSetting", "replyLength", "TEXT NOT NULL DEFAULT 'medium'");
await addColumnIfMissing("BrandVoiceSetting", "previewReview", "TEXT");
await addColumnIfMissing("BrandVoiceSetting", "previewProductId", "TEXT");
await addColumnIfMissing("BrandVoiceSetting", "previewProductTitle", "TEXT");
await addColumnIfMissing("BrandVoiceSetting", "previewProductType", "TEXT");
await addColumnIfMissing("BrandVoiceSetting", "previewProductTagsJson", "TEXT");
await addColumnIfMissing("BrandVoiceSetting", "previewRating", "INTEGER NOT NULL DEFAULT 5");

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "AiProviderDailyState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "currentModelId" TEXT,
    "exhaustedModelsJson" TEXT NOT NULL DEFAULT '[]',
    "lastErrorJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await prisma.$executeRawUnsafe(`
  CREATE UNIQUE INDEX IF NOT EXISTS "AiProviderDailyState_provider_dayKey_key"
  ON "AiProviderDailyState"("provider", "dayKey")
`);

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL UNIQUE,
    "settingsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "CreditAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL UNIQUE,
    "startingCredits" INTEGER NOT NULL DEFAULT 100,
    "purchasedCredits" INTEGER NOT NULL DEFAULT 0,
    "bonusCredits" INTEGER NOT NULL DEFAULT 0,
    "spentCredits" INTEGER NOT NULL DEFAULT 0,
    "refundedCredits" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await addColumnIfMissing("CreditAccount", "bonusCredits", "INTEGER NOT NULL DEFAULT 0");

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "CreditLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "CreditLedgerEntry_shop_createdAt_idx"
  ON "CreditLedgerEntry"("shop", "createdAt")
`);

await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "CreditLedgerEntry_shop_referenceType_referenceId_idx"
  ON "CreditLedgerEntry"("shop", "referenceType", "referenceId")
`);

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "CreditPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "shopifyPurchaseId" TEXT UNIQUE,
    "confirmationUrl" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "CreditPurchase_shop_status_idx"
  ON "CreditPurchase"("shop", "status")
`);

await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "CreditPurchase_shop_createdAt_idx"
  ON "CreditPurchase"("shop", "createdAt")
`);

await prisma.$disconnect();
