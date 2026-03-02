ALTER TABLE "spend_items"
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN "fx_rate_ppm" BIGINT,
  ADD COLUMN "fx_rate_locked_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_spend_items_submitted_at" ON "spend_items"("submitted_at");
