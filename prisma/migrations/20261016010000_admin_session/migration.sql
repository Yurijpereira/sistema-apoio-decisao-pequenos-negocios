CREATE TABLE "AdminSession" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "tokenHash" CHAR(64) NOT NULL,
  "credentialFingerprint" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminSession_single_account" CHECK ("id" = 1),
  CONSTRAINT "AdminSession_hashes" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$' AND "credentialFingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "AdminSession_dates" CHECK ("expiresAt" > "createdAt")
);
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE TABLE "AdminLoginLimit" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "windowEndsAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AdminLoginLimit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminLoginLimit_single_account" CHECK ("id" = 1),
  CONSTRAINT "AdminLoginLimit_attempts" CHECK ("attempts" >= 1 AND "attempts" <= 6)
);
