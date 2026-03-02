CREATE TYPE "SpendItemType" AS ENUM ('GENERAL', 'EXTERNAL_INVOICE');

ALTER TABLE "spend_items"
  ADD COLUMN "spend_item_type" "SpendItemType" NOT NULL DEFAULT 'GENERAL';

ALTER TABLE "external_invoices"
  ADD COLUMN "spend_item_id" UUID;

ALTER TABLE "external_invoices"
  DROP CONSTRAINT "uq_external_invoices_vendor_invoice_number";

CREATE INDEX "idx_external_invoices_spend_item_id"
  ON "external_invoices"("spend_item_id");

CREATE INDEX "idx_external_invoices_vendor_invoice_number"
  ON "external_invoices"("vendor_id", "invoice_number");

ALTER TABLE "external_invoices"
  ADD CONSTRAINT "external_invoices_spend_item_id_fkey"
  FOREIGN KEY ("spend_item_id") REFERENCES "spend_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
