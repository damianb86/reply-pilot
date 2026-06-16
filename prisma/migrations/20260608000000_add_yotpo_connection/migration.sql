CREATE TABLE "YotpoConnection" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "encryptedApiSecret" TEXT NOT NULL,
    "secretMask" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "reviewCount" INTEGER,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "accountJson" TEXT,
    "sampleReviewsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YotpoConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "YotpoConnection_shop_key" ON "YotpoConnection"("shop");
CREATE INDEX "YotpoConnection_shop_status_idx" ON "YotpoConnection"("shop", "status");
