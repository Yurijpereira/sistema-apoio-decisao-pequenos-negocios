ALTER TABLE "AdminAccount" ADD COLUMN "environmentFingerprint" CHAR(64);
ALTER TABLE "AdminAccount" ADD CONSTRAINT "AdminAccount_environment_fingerprint"
  CHECK ("environmentFingerprint" IS NULL OR "environmentFingerprint" ~ '^[a-f0-9]{64}$');
