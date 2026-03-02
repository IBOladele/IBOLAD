ALTER TYPE "SpendItemStatus" ADD VALUE IF NOT EXISTS 'PAID';

ALTER TABLE "spend_items"
  ADD COLUMN "payment_reference" VARCHAR(255),
  ADD COLUMN "paid_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_spend_items_paid_at" ON "spend_items"("paid_at");
