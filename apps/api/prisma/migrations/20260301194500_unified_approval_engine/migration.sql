ALTER TYPE "ApprovalInstanceStatus" ADD VALUE IF NOT EXISTS 'NEEDS_INFO';
ALTER TYPE "ApprovalStepStatus" ADD VALUE IF NOT EXISTS 'REQUESTED_INFO';

CREATE TYPE "SpendItemStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFO');

ALTER TABLE "spend_items"
  ADD COLUMN "status" "SpendItemStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "approved_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_spend_items_status" ON "spend_items"("status");
CREATE INDEX "idx_spend_items_approved_at" ON "spend_items"("approved_at");

ALTER TABLE "approval_policies"
  ADD COLUMN "spend_item_type" "SpendItemType",
  ADD COLUMN "base_currency_id" UUID;

CREATE INDEX "idx_approval_policies_spend_item_type"
  ON "approval_policies"("spend_item_type");

CREATE INDEX "idx_approval_policies_base_currency_id"
  ON "approval_policies"("base_currency_id");

ALTER TABLE "approval_policies"
  ADD CONSTRAINT "approval_policies_base_currency_id_fkey"
  FOREIGN KEY ("base_currency_id") REFERENCES "currencies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_policy_rules"
  ADD COLUMN "steps_json" JSONB NOT NULL DEFAULT '[]'::jsonb;
