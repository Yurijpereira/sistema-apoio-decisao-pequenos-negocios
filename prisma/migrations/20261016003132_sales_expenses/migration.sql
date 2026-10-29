-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productNameSnapshot" VARCHAR(120) NOT NULL,
    "date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_date_id_idx" ON "Sale"("date", "id");

-- CreateIndex
CREATE INDEX "Sale_productId_idx" ON "Sale"("productId");

-- CreateIndex
CREATE INDEX "Expense_date_id_idx" ON "Expense"("date", "id");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_quantity_valid" CHECK ("quantity" BETWEEN 1 AND 1000000),
  ADD CONSTRAINT "Sale_unitPriceCents_nonnegative" CHECK ("unitPriceCents" >= 0),
  ADD CONSTRAINT "Sale_unitCostCents_nonnegative" CHECK ("unitCostCents" >= 0),
  ADD CONSTRAINT "Sale_name_valid" CHECK (char_length(btrim("productNameSnapshot")) BETWEEN 1 AND 120 AND "productNameSnapshot" !~ '[[:cntrl:]]'),
  ADD CONSTRAINT "Sale_date_valid" CHECK ("date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_amountCents_nonnegative" CHECK ("amountCents" >= 0),
  ADD CONSTRAINT "Expense_category_valid" CHECK (char_length(btrim("category")) BETWEEN 1 AND 80 AND "category" !~ '[[:cntrl:]]'),
  ADD CONSTRAINT "Expense_description_valid" CHECK ("description" IS NULL OR "description" !~ '[[:cntrl:]]'),
  ADD CONSTRAINT "Expense_date_valid" CHECK ("date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');
