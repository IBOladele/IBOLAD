ALTER TYPE "SpendItemType" ADD VALUE IF NOT EXISTS 'PAYROLL_RUN';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeStatus') THEN
    CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;
END $$;

ALTER TABLE "employees"
  ADD COLUMN "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "bank_details_encrypted" TEXT;

UPDATE "employees"
SET "status" = CASE WHEN "is_active" THEN 'ACTIVE'::"EmployeeStatus" ELSE 'INACTIVE'::"EmployeeStatus" END
WHERE "status" IS DISTINCT FROM CASE WHEN "is_active" THEN 'ACTIVE'::"EmployeeStatus" ELSE 'INACTIVE'::"EmployeeStatus" END;

ALTER TABLE "payroll_runs"
  ADD COLUMN "spend_item_id" UUID,
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN "payment_reference" VARCHAR(255),
  ADD COLUMN "paid_at" TIMESTAMPTZ(6);

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_spend_item_id_fkey"
  FOREIGN KEY ("spend_item_id") REFERENCES "spend_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_payroll_runs_spend_item_id" ON "payroll_runs"("spend_item_id");
