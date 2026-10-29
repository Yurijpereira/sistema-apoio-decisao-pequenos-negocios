CREATE TABLE "AdminAccount" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "passwordHash" VARCHAR(180) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminAccount_single_account" CHECK ("id" = 1),
  CONSTRAINT "AdminAccount_password_hash" CHECK (
    "passwordHash" ~ '^scrypt:131072:8:1:[a-f0-9]{32}:[a-f0-9]{128}$'
  )
);
