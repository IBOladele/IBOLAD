CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "PaymentRequestStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'APPROVED', 'REJECTED', 'PAID', 'VOID');
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSED', 'CANCELLED');
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('EARNING', 'DEDUCTION', 'CORRECTION');
CREATE TYPE "ApprovalPolicyScope" AS ENUM ('PAYMENT_REQUEST', 'EXTERNAL_INVOICE', 'INTERNAL_INVOICE', 'PAYROLL_RUN', 'SPEND_ITEM');
CREATE TYPE "ApprovalEntityType" AS ENUM ('PAYMENT_REQUEST', 'EXTERNAL_INVOICE', 'INTERNAL_INVOICE', 'PAYROLL_RUN', 'SPEND_ITEM');
CREATE TYPE "ApprovalInstanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ApprovalStepStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL,
  "full_name" VARCHAR(255) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);

CREATE TABLE "departments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "departments_code_key" UNIQUE ("code")
);

CREATE TABLE "roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roles_code_key" UNIQUE ("code")
);

CREATE TABLE "currencies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" CHAR(3) NOT NULL,
  "name" VARCHAR(64) NOT NULL,
  "symbol" VARCHAR(16),
  "minor_unit" SMALLINT NOT NULL DEFAULT 2,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "currencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "currencies_code_key" UNIQUE ("code")
);

CREATE TABLE "vendors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "legal_name" VARCHAR(255),
  "email" VARCHAR(255),
  "phone" VARCHAR(64),
  "default_currency_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "files" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storage_key" VARCHAR(512) NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(128) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "checksum_sha256" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "files_storage_key_key" UNIQUE ("storage_key")
);

CREATE TABLE "user_departments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_departments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_user_departments_user_department" UNIQUE ("user_id", "department_id")
);

CREATE TABLE "user_roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_user_roles_user_role" UNIQUE ("user_id", "role_id")
);

CREATE TABLE "fx_rates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "base_currency_id" UUID NOT NULL,
  "quote_currency_id" UUID NOT NULL,
  "fx_rate_ppm" BIGINT NOT NULL,
  "effective_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_fx_rates_pair_effective_at" UNIQUE ("base_currency_id", "quote_currency_id", "effective_at")
);

CREATE TABLE "vendor_bank_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "currency_id" UUID NOT NULL,
  "account_name" VARCHAR(255) NOT NULL,
  "account_number" VARCHAR(128) NOT NULL,
  "bank_name" VARCHAR(255) NOT NULL,
  "iban" VARCHAR(64),
  "swift_code" VARCHAR(32),
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_bank_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_vendor_bank_accounts_vendor_account_bank" UNIQUE ("vendor_id", "account_number", "bank_name")
);

CREATE TABLE "spend_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendor_id" UUID,
  "department_id" UUID,
  "currency_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "description" TEXT NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "incurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spend_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spend_item_files" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "spend_item_id" UUID NOT NULL,
  "file_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spend_item_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_spend_item_files_item_file" UNIQUE ("spend_item_id", "file_id")
);

CREATE TABLE "payment_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_number" VARCHAR(64) NOT NULL,
  "spend_item_id" UUID,
  "vendor_id" UUID,
  "department_id" UUID,
  "currency_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "requested_amount_minor" BIGINT NOT NULL,
  "approved_amount_minor" BIGINT,
  "status" "PaymentRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_requests_request_number_key" UNIQUE ("request_number")
);

CREATE TABLE "external_invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_request_id" UUID,
  "vendor_id" UUID NOT NULL,
  "currency_id" UUID NOT NULL,
  "invoice_number" VARCHAR(128) NOT NULL,
  "invoice_date" DATE NOT NULL,
  "due_date" DATE,
  "subtotal_amount_minor" BIGINT,
  "tax_amount_minor" BIGINT,
  "total_amount_minor" BIGINT NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "received_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_external_invoices_vendor_invoice_number" UNIQUE ("vendor_id", "invoice_number")
);

CREATE TABLE "internal_invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_request_id" UUID,
  "vendor_id" UUID,
  "department_id" UUID,
  "currency_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "invoice_number" VARCHAR(128) NOT NULL,
  "invoice_date" DATE NOT NULL,
  "due_date" DATE,
  "total_amount_minor" BIGINT NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_internal_invoices_vendor_invoice_number" UNIQUE ("vendor_id", "invoice_number")
);

CREATE TABLE "internal_invoice_line_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "internal_invoice_id" UUID NOT NULL,
  "department_id" UUID,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "unit_amount_minor" BIGINT NOT NULL,
  "line_amount_minor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_invoice_line_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "department_id" UUID,
  "salary_currency_id" UUID,
  "employee_number" VARCHAR(64) NOT NULL,
  "legal_name" VARCHAR(255) NOT NULL,
  "hire_date" DATE NOT NULL,
  "termination_date" DATE,
  "base_salary_minor" BIGINT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employees_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "employees_employee_number_key" UNIQUE ("employee_number")
);

CREATE TABLE "payroll_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_number" VARCHAR(64) NOT NULL,
  "period_start" DATE,
  "period_end" DATE,
  "pay_date" DATE,
  "currency_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
  "total_gross_minor" BIGINT,
  "total_net_minor" BIGINT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_runs_run_number_key" UNIQUE ("run_number"),
  CONSTRAINT "uq_payroll_runs_period_currency" UNIQUE ("period_start", "period_end", "currency_id")
);

CREATE TABLE "payroll_run_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payroll_run_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "currency_id" UUID NOT NULL,
  "gross_pay_minor" BIGINT NOT NULL,
  "deductions_minor" BIGINT NOT NULL DEFAULT 0,
  "net_pay_minor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_run_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_payroll_run_items_run_employee" UNIQUE ("payroll_run_id", "employee_id")
);

CREATE TABLE "payroll_adjustments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payroll_run_id" UUID,
  "payroll_run_item_id" UUID,
  "employee_id" UUID NOT NULL,
  "currency_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "adjustment_type" "PayrollAdjustmentType" NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "effective_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "scope" "ApprovalPolicyScope" NOT NULL,
  "department_id" UUID,
  "created_by_user_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_policies_code_key" UNIQUE ("code")
);

CREATE TABLE "approval_policy_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "approval_policy_id" UUID NOT NULL,
  "step_order" INTEGER NOT NULL,
  "role_id" UUID,
  "user_id" UUID,
  "department_id" UUID,
  "min_amount_minor" BIGINT,
  "max_amount_minor" BIGINT,
  "requires_all" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_policy_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_approval_policy_rules_policy_order" UNIQUE ("approval_policy_id", "step_order")
);

CREATE TABLE "approval_instances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "approval_policy_id" UUID,
  "entity_type" "ApprovalEntityType" NOT NULL,
  "entity_id" UUID NOT NULL,
  "status" "ApprovalInstanceStatus" NOT NULL DEFAULT 'PENDING',
  "requested_by_user_id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_steps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "approval_instance_id" UUID NOT NULL,
  "step_order" INTEGER NOT NULL,
  "role_id" UUID,
  "assigned_user_id" UUID,
  "status" "ApprovalStepStatus" NOT NULL DEFAULT 'PENDING',
  "acted_by_user_id" UUID,
  "acted_at" TIMESTAMPTZ(6),
  "comment" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_approval_steps_instance_order" UNIQUE ("approval_instance_id", "step_order")
);

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" UUID,
  "event_type" VARCHAR(128) NOT NULL,
  "entity_type" VARCHAR(128) NOT NULL,
  "entity_id" UUID NOT NULL,
  "payload" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_vendors_default_currency_id" ON "vendors"("default_currency_id");
CREATE INDEX "idx_user_departments_user_id" ON "user_departments"("user_id");
CREATE INDEX "idx_user_departments_department_id" ON "user_departments"("department_id");
CREATE INDEX "idx_user_roles_user_id" ON "user_roles"("user_id");
CREATE INDEX "idx_user_roles_role_id" ON "user_roles"("role_id");
CREATE INDEX "idx_fx_rates_base_currency_id" ON "fx_rates"("base_currency_id");
CREATE INDEX "idx_fx_rates_quote_currency_id" ON "fx_rates"("quote_currency_id");
CREATE INDEX "idx_vendor_bank_accounts_vendor_id" ON "vendor_bank_accounts"("vendor_id");
CREATE INDEX "idx_vendor_bank_accounts_currency_id" ON "vendor_bank_accounts"("currency_id");
CREATE INDEX "idx_spend_items_vendor_id" ON "spend_items"("vendor_id");
CREATE INDEX "idx_spend_items_department_id" ON "spend_items"("department_id");
CREATE INDEX "idx_spend_items_currency_id" ON "spend_items"("currency_id");
CREATE INDEX "idx_spend_items_created_by_user_id" ON "spend_items"("created_by_user_id");
CREATE INDEX "idx_spend_item_files_spend_item_id" ON "spend_item_files"("spend_item_id");
CREATE INDEX "idx_spend_item_files_file_id" ON "spend_item_files"("file_id");
CREATE INDEX "idx_payment_requests_spend_item_id" ON "payment_requests"("spend_item_id");
CREATE INDEX "idx_payment_requests_vendor_id" ON "payment_requests"("vendor_id");
CREATE INDEX "idx_payment_requests_department_id" ON "payment_requests"("department_id");
CREATE INDEX "idx_payment_requests_currency_id" ON "payment_requests"("currency_id");
CREATE INDEX "idx_payment_requests_requested_by_user_id" ON "payment_requests"("requested_by_user_id");
CREATE INDEX "idx_external_invoices_payment_request_id" ON "external_invoices"("payment_request_id");
CREATE INDEX "idx_external_invoices_vendor_id" ON "external_invoices"("vendor_id");
CREATE INDEX "idx_external_invoices_currency_id" ON "external_invoices"("currency_id");
CREATE INDEX "idx_internal_invoices_payment_request_id" ON "internal_invoices"("payment_request_id");
CREATE INDEX "idx_internal_invoices_vendor_id" ON "internal_invoices"("vendor_id");
CREATE INDEX "idx_internal_invoices_department_id" ON "internal_invoices"("department_id");
CREATE INDEX "idx_internal_invoices_currency_id" ON "internal_invoices"("currency_id");
CREATE INDEX "idx_internal_invoices_created_by_user_id" ON "internal_invoices"("created_by_user_id");
CREATE INDEX "idx_internal_invoice_line_items_internal_invoice_id" ON "internal_invoice_line_items"("internal_invoice_id");
CREATE INDEX "idx_internal_invoice_line_items_department_id" ON "internal_invoice_line_items"("department_id");
CREATE INDEX "idx_employees_department_id" ON "employees"("department_id");
CREATE INDEX "idx_employees_salary_currency_id" ON "employees"("salary_currency_id");
CREATE INDEX "idx_payroll_runs_currency_id" ON "payroll_runs"("currency_id");
CREATE INDEX "idx_payroll_runs_created_by_user_id" ON "payroll_runs"("created_by_user_id");
CREATE INDEX "idx_payroll_run_items_payroll_run_id" ON "payroll_run_items"("payroll_run_id");
CREATE INDEX "idx_payroll_run_items_employee_id" ON "payroll_run_items"("employee_id");
CREATE INDEX "idx_payroll_run_items_currency_id" ON "payroll_run_items"("currency_id");
CREATE INDEX "idx_payroll_adjustments_payroll_run_id" ON "payroll_adjustments"("payroll_run_id");
CREATE INDEX "idx_payroll_adjustments_payroll_run_item_id" ON "payroll_adjustments"("payroll_run_item_id");
CREATE INDEX "idx_payroll_adjustments_employee_id" ON "payroll_adjustments"("employee_id");
CREATE INDEX "idx_payroll_adjustments_currency_id" ON "payroll_adjustments"("currency_id");
CREATE INDEX "idx_payroll_adjustments_created_by_user_id" ON "payroll_adjustments"("created_by_user_id");
CREATE INDEX "idx_approval_policies_department_id" ON "approval_policies"("department_id");
CREATE INDEX "idx_approval_policies_created_by_user_id" ON "approval_policies"("created_by_user_id");
CREATE INDEX "idx_approval_policy_rules_policy_id" ON "approval_policy_rules"("approval_policy_id");
CREATE INDEX "idx_approval_policy_rules_role_id" ON "approval_policy_rules"("role_id");
CREATE INDEX "idx_approval_policy_rules_user_id" ON "approval_policy_rules"("user_id");
CREATE INDEX "idx_approval_policy_rules_department_id" ON "approval_policy_rules"("department_id");
CREATE INDEX "idx_approval_instances_policy_id" ON "approval_instances"("approval_policy_id");
CREATE INDEX "idx_approval_instances_requested_by_user_id" ON "approval_instances"("requested_by_user_id");
CREATE INDEX "idx_approval_instances_entity" ON "approval_instances"("entity_type", "entity_id");
CREATE INDEX "idx_approval_steps_instance_id" ON "approval_steps"("approval_instance_id");
CREATE INDEX "idx_approval_steps_role_id" ON "approval_steps"("role_id");
CREATE INDEX "idx_approval_steps_assigned_user_id" ON "approval_steps"("assigned_user_id");
CREATE INDEX "idx_approval_steps_acted_by_user_id" ON "approval_steps"("acted_by_user_id");
CREATE INDEX "idx_audit_events_actor_user_id" ON "audit_events"("actor_user_id");
CREATE INDEX "idx_audit_events_entity" ON "audit_events"("entity_type", "entity_id");

ALTER TABLE "vendors"
  ADD CONSTRAINT "vendors_default_currency_id_fkey"
  FOREIGN KEY ("default_currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_departments"
  ADD CONSTRAINT "user_departments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_departments"
  ADD CONSTRAINT "user_departments_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fx_rates"
  ADD CONSTRAINT "fx_rates_base_currency_id_fkey"
  FOREIGN KEY ("base_currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fx_rates"
  ADD CONSTRAINT "fx_rates_quote_currency_id_fkey"
  FOREIGN KEY ("quote_currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_bank_accounts"
  ADD CONSTRAINT "vendor_bank_accounts_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_bank_accounts"
  ADD CONSTRAINT "vendor_bank_accounts_currency_id_fkey"
  FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "spend_items"
  ADD CONSTRAINT "spend_items_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "spend_items"
  ADD CONSTRAINT "spend_items_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "spend_items"
  ADD CONSTRAINT "spend_items_currency_id_fkey"
  FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "spend_items"
  ADD CONSTRAINT "spend_items_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "spend_item_files"
  ADD CONSTRAINT "spend_item_files_spend_item_id_fkey"
  FOREIGN KEY ("spend_item_id") REFERENCES "spend_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spend_item_files"
  ADD CONSTRAINT "spend_item_files_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_spend_item_id_fkey"
  FOREIGN KEY ("spend_item_id") REFERENCES "spend_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_currency_id_fkey"
  FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_invoices"
  ADD CONSTRAINT "external_invoices_payment_request_id_fkey"
  FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "external_invoices"
  ADD CONSTRAINT "external_invoices_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_invoices"
  ADD CONSTRAINT "external_invoices_currency_id_fkey"
  FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_invoices"
  ADD CONSTRAINT "internal_invoices_payment_request_id_fkey"
  FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_invoices"
  ADD CONSTRAINT "internal_invoices_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_invoices"
  ADD CONSTRAINT "internal_invoices_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_invoices"
  ADD CONSTRAINT "internal_invoices_currency_id_fkey"
  FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_invoices"
  ADD CONSTRAINT "internal_invoices_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_invoice_line_items"
  ADD CONSTRAINT "internal_invoice_line_items_internal_invoice_id_fkey"
  FOREIGN KEY ("internal_invoice_id") REFERENCES "internal_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "internal_invoice_line_items"
  ADD CONSTRAINT "internal_invoice_line_items_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_salary_currency_id_fkey"
  FOREIGN KEY ("salary_currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_currency_id_fkey"
  FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payroll_run_items"
  ADD CONSTRAINT "payroll_run_items_payroll_run_id_fkey"
  FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_run_items"
  ADD CONSTRAINT "payroll_run_items_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_run_items"
  ADD CONSTRAINT "payroll_run_items_currency_id_fkey"
  FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_adjustments"
  ADD CONSTRAINT "payroll_adjustments_payroll_run_id_fkey"
  FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payroll_adjustments"
  ADD CONSTRAINT "payroll_adjustments_payroll_run_item_id_fkey"
  FOREIGN KEY ("payroll_run_item_id") REFERENCES "payroll_run_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payroll_adjustments"
  ADD CONSTRAINT "payroll_adjustments_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_adjustments"
  ADD CONSTRAINT "payroll_adjustments_currency_id_fkey"
  FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_adjustments"
  ADD CONSTRAINT "payroll_adjustments_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_policies"
  ADD CONSTRAINT "approval_policies_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_policies"
  ADD CONSTRAINT "approval_policies_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_policy_rules"
  ADD CONSTRAINT "approval_policy_rules_approval_policy_id_fkey"
  FOREIGN KEY ("approval_policy_id") REFERENCES "approval_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_policy_rules"
  ADD CONSTRAINT "approval_policy_rules_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_policy_rules"
  ADD CONSTRAINT "approval_policy_rules_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_policy_rules"
  ADD CONSTRAINT "approval_policy_rules_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_instances"
  ADD CONSTRAINT "approval_instances_approval_policy_id_fkey"
  FOREIGN KEY ("approval_policy_id") REFERENCES "approval_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_instances"
  ADD CONSTRAINT "approval_instances_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_steps"
  ADD CONSTRAINT "approval_steps_approval_instance_id_fkey"
  FOREIGN KEY ("approval_instance_id") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_steps"
  ADD CONSTRAINT "approval_steps_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_steps"
  ADD CONSTRAINT "approval_steps_assigned_user_id_fkey"
  FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_steps"
  ADD CONSTRAINT "approval_steps_acted_by_user_id_fkey"
  FOREIGN KEY ("acted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
