-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "salePriceCents" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_createdAt_id_idx" ON "Product"("createdAt", "id");

-- Defesa adicional contra escrita fora da API.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_salePriceCents_nonnegative" CHECK ("salePriceCents" >= 0),
  ADD CONSTRAINT "Product_unitCostCents_nonnegative" CHECK ("unitCostCents" >= 0),
  ADD CONSTRAINT "Product_name_valid" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120 AND "name" !~ '[[:cntrl:]]');
