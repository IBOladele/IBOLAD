ALTER TYPE "SpendItemType" ADD VALUE IF NOT EXISTS 'INTERNAL_INVOICE';

ALTER TABLE "spend_items"
  ADD COLUMN "base_currency_id" UUID,
  ADD COLUMN "base_amount_minor" BIGINT;

CREATE INDEX "idx_spend_items_base_currency_id"
  ON "spend_items"("base_currency_id");

ALTER TABLE "spend_items"
  ADD CONSTRAINT "spend_items_base_currency_id_fkey"
  FOREIGN KEY ("base_currency_id") REFERENCES "currencies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_invoices"
  ADD COLUMN "spend_item_id" UUID,
  ADD COLUMN "to_department_id" UUID,
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_internal_invoices_spend_item_id"
  ON "internal_invoices"("spend_item_id");

CREATE INDEX "idx_internal_invoices_to_department_id"
  ON "internal_invoices"("to_department_id");

ALTER TABLE "internal_invoices"
  ADD CONSTRAINT "internal_invoices_spend_item_id_fkey"
  FOREIGN KEY ("spend_item_id") REFERENCES "spend_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_invoices"
  ADD CONSTRAINT "internal_invoices_to_department_id_fkey"
  FOREIGN KEY ("to_department_id") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
