ALTER TYPE "PaymentRequestStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';

ALTER TABLE "payment_requests"
  ADD COLUMN "base_currency_id" UUID,
  ADD COLUMN "base_amount_minor" BIGINT,
  ADD COLUMN "fx_rate_ppm" BIGINT,
  ADD COLUMN "fx_rate_locked_at" TIMESTAMPTZ(6),
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_payment_requests_base_currency_id" ON "payment_requests"("base_currency_id");
CREATE INDEX "idx_payment_requests_status" ON "payment_requests"("status");
CREATE INDEX "idx_payment_requests_submitted_at" ON "payment_requests"("submitted_at");

ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_base_currency_id_fkey"
  FOREIGN KEY ("base_currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
