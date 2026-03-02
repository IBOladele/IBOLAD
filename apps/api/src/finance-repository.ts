import {
  Prisma,
  PrismaClient,
  type ApprovalInstanceStatus,
  type ApprovalStepStatus,
  type EmployeeStatus,
  type InvoiceStatus,
  type PayrollAdjustmentType,
  type PayrollRunStatus,
  type PaymentRequestStatus,
  type SpendItemStatus,
} from '@prisma/client';
import { selectThresholdRule } from './approval-engine.js';

export type FxRateSnapshot = {
  id: string;
  base_currency_id: string;
  quote_currency_id: string;
  fx_rate_ppm: bigint;
  effective_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type DepartmentRecord = {
  id: string;
  code: string;
  name: string;
};

export type CurrencyRecord = {
  id: string;
  code: string;
};

export type CreateFxRateSnapshotInput = {
  base_currency_id: string;
  quote_currency_id: string;
  fx_rate_ppm: bigint;
  effective_at: Date;
};

export type SpendItemRecord = {
  id: string;
  vendor_id: string | null;
  department_id: string | null;
  currency_id: string;
  base_currency_id: string | null;
  created_by_user_id: string | null;
  spend_item_type: 'GENERAL' | 'EXTERNAL_INVOICE' | 'INTERNAL_INVOICE' | 'PAYROLL_RUN';
  description: string;
  amount_minor: bigint;
  base_amount_minor: bigint | null;
  status: SpendItemStatus;
  incurred_at: Date;
  submitted_at: Date | null;
  approved_at: Date | null;
  payment_reference: string | null;
  paid_at: Date | null;
  fx_rate_ppm: bigint | null;
  fx_rate_locked_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateSpendItemInput = {
  vendor_id?: string | null;
  department_id?: string | null;
  currency_id: string;
  base_currency_id?: string | null;
  created_by_user_id?: string | null;
  spend_item_type?: 'GENERAL' | 'EXTERNAL_INVOICE' | 'INTERNAL_INVOICE' | 'PAYROLL_RUN';
  description: string;
  amount_minor: bigint;
  base_amount_minor?: bigint | null;
  status?: SpendItemStatus;
  incurred_at: Date;
  fx_rate_ppm?: bigint | null;
  fx_rate_locked_at?: Date | null;
  approved_at?: Date | null;
  payment_reference?: string | null;
  paid_at?: Date | null;
};

export type LockSpendItemFxInput = {
  spend_item_id: string;
  fx_rate_ppm: bigint;
  locked_at: Date;
};

export type PaymentRequestRecord = {
  id: string;
  request_number: string;
  spend_item_id: string | null;
  vendor_id: string | null;
  department_id: string | null;
  currency_id: string;
  base_currency_id: string | null;
  requested_by_user_id: string;
  requested_amount_minor: bigint;
  approved_amount_minor: bigint | null;
  base_amount_minor: bigint | null;
  fx_rate_ppm: bigint | null;
  fx_rate_locked_at: Date | null;
  status: PaymentRequestStatus;
  requested_at: Date;
  due_at: Date | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CreatePaymentRequestDraftInput = {
  request_number: string;
  spend_item_id: string;
  vendor_id?: string | null;
  department_id: string;
  currency_id: string;
  requested_by_user_id: string;
  requested_amount_minor: bigint;
  due_at?: Date | null;
};

export type UpdatePaymentRequestInput = {
  vendor_id?: string | null;
  department_id?: string;
  requested_amount_minor?: bigint;
  due_at?: Date | null;
  base_currency_id?: string | null;
  base_amount_minor?: bigint | null;
  fx_rate_ppm?: bigint | null;
  fx_rate_locked_at?: Date | null;
  submitted_at?: Date | null;
  status?: PaymentRequestStatus;
};

export type ListPaymentRequestsFilters = {
  status?: PaymentRequestStatus;
  department_id?: string;
  requested_by_user_id?: string;
  currency_id?: string;
};

export type ListPaymentRequestsPagination = {
  page: number;
  page_size: number;
};

export type FileRecord = {
  id: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: bigint;
  checksum_sha256: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateFileInput = {
  storage_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: bigint;
  checksum_sha256?: string | null;
};

export type ExternalInvoiceRecord = {
  id: string;
  payment_request_id: string | null;
  spend_item_id: string | null;
  vendor_id: string;
  currency_id: string;
  invoice_number: string;
  invoice_date: Date;
  due_date: Date | null;
  subtotal_amount_minor: bigint | null;
  tax_amount_minor: bigint | null;
  total_amount_minor: bigint;
  status: InvoiceStatus;
  received_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateExternalInvoiceInput = {
  payment_request_id?: string | null;
  spend_item_id?: string | null;
  vendor_id: string;
  currency_id: string;
  invoice_number: string;
  invoice_date: Date;
  due_date?: Date | null;
  subtotal_amount_minor?: bigint | null;
  tax_amount_minor?: bigint | null;
  total_amount_minor: bigint;
  status?: InvoiceStatus;
  received_at?: Date | null;
};

export type ListExternalInvoicesFilters = {
  vendor_id?: string;
  currency_id?: string;
  spend_item_id?: string;
  invoice_number?: string;
  status?: InvoiceStatus;
};

export type ListExternalInvoicesPagination = {
  page: number;
  page_size: number;
};

export type InternalInvoiceRecord = {
  id: string;
  payment_request_id: string | null;
  spend_item_id: string | null;
  vendor_id: string | null;
  from_department_id: string | null;
  to_department_id: string | null;
  currency_id: string;
  created_by_user_id: string | null;
  invoice_number: string;
  invoice_date: Date;
  due_date: Date | null;
  total_amount_minor: bigint;
  status: InvoiceStatus;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type InternalInvoiceLineItemRecord = {
  id: string;
  internal_invoice_id: string;
  department_id: string | null;
  description: string;
  quantity: Prisma.Decimal;
  unit_amount_minor: bigint;
  line_amount_minor: bigint;
  created_at: Date;
  updated_at: Date;
};

export type CreateInternalInvoiceLineItemInput = {
  department_id?: string | null;
  description: string;
  quantity?: number;
  unit_amount_minor: bigint;
  line_amount_minor: bigint;
};

export type CreateInternalInvoiceInput = {
  spend_item_id: string;
  from_department_id: string;
  to_department_id: string;
  currency_id: string;
  created_by_user_id?: string | null;
  invoice_number: string;
  invoice_date: Date;
  due_date?: Date | null;
  total_amount_minor: bigint;
  status?: InvoiceStatus;
};

export type UpdateInternalInvoiceInput = {
  status?: InvoiceStatus;
  submitted_at?: Date | null;
};

export type ListInternalInvoicesFilters = {
  status?: InvoiceStatus;
  from_department_id?: string;
  to_department_id?: string;
  currency_id?: string;
  created_by_user_id?: string;
};

export type ListInternalInvoicesPagination = {
  page: number;
  page_size: number;
};

export type EmployeeRecord = {
  id: string;
  user_id: string;
  department_id: string | null;
  salary_currency_id: string | null;
  employee_number: string;
  legal_name: string;
  hire_date: Date;
  termination_date: Date | null;
  base_salary_minor: bigint | null;
  is_active: boolean;
  status: EmployeeStatus;
  bank_details_encrypted: string | null;
  created_at: Date;
  updated_at: Date;
  email: string;
};

export type CreateEmployeeInput = {
  name: string;
  email: string;
  department_id?: string | null;
  currency_id: string;
  salary_minor: bigint;
  bank_details_encrypted: string;
  status?: EmployeeStatus;
};

export type UpdateEmployeeInput = {
  name?: string;
  email?: string;
  department_id?: string | null;
  currency_id?: string;
  salary_minor?: bigint;
  bank_details_encrypted?: string;
  status?: EmployeeStatus;
};

export type ListEmployeesFilters = {
  department_id?: string;
  currency_id?: string;
  status?: EmployeeStatus;
};

export type ListEmployeesPagination = {
  page: number;
  page_size: number;
};

export type PayrollRunRecord = {
  id: string;
  run_number: string;
  period_start: Date | null;
  period_end: Date | null;
  pay_date: Date | null;
  currency_id: string;
  spend_item_id: string | null;
  created_by_user_id: string | null;
  status: PayrollRunStatus;
  total_gross_minor: bigint | null;
  total_net_minor: bigint | null;
  submitted_at: Date | null;
  payment_reference: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CreatePayrollRunInput = {
  run_number: string;
  period_start: Date;
  period_end: Date;
  pay_date?: Date | null;
  currency_id: string;
  created_by_user_id?: string | null;
};

export type UpdatePayrollRunInput = {
  spend_item_id?: string | null;
  status?: PayrollRunStatus;
  total_gross_minor?: bigint | null;
  total_net_minor?: bigint | null;
  submitted_at?: Date | null;
  payment_reference?: string | null;
  paid_at?: Date | null;
};

export type PayrollRunItemRecord = {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  currency_id: string;
  gross_pay_minor: bigint;
  deductions_minor: bigint;
  net_pay_minor: bigint;
  created_at: Date;
  updated_at: Date;
};

export type PayrollRunItemDetailRecord = PayrollRunItemRecord & {
  employee_legal_name: string;
  employee_email: string;
};

export type PayrollAdjustmentRecord = {
  id: string;
  payroll_run_id: string | null;
  payroll_run_item_id: string | null;
  employee_id: string;
  currency_id: string;
  created_by_user_id: string | null;
  adjustment_type: PayrollAdjustmentType;
  amount_minor: bigint;
  reason: string;
  effective_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type CreatePayrollAdjustmentInput = {
  employee_id: string;
  adjustment_type: PayrollAdjustmentType;
  amount_minor: bigint;
  reason: string;
  created_by_user_id?: string | null;
};

export type ApprovalInstanceRecord = {
  id: string;
  approval_policy_id: string | null;
  entity_type: 'PAYMENT_REQUEST' | 'EXTERNAL_INVOICE' | 'INTERNAL_INVOICE' | 'PAYROLL_RUN' | 'SPEND_ITEM';
  entity_id: string;
  status: ApprovalInstanceStatus;
  requested_by_user_id: string;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ApprovalStepRecord = {
  id: string;
  approval_instance_id: string;
  step_order: number;
  role_id: string | null;
  assigned_user_id: string | null;
  status: ApprovalStepStatus;
  acted_by_user_id: string | null;
  acted_at: Date | null;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SpendItemApprovalStepTemplate = {
  step_order: number;
  role_code?: string;
  assigned_user_id?: string;
};

export type ResolvedSpendItemApprovalPolicy = {
  approval_policy_id: string;
  approval_policy_code: string;
  approval_policy_rule_id: string;
  min_amount_minor: bigint | null;
  max_amount_minor: bigint | null;
  steps: SpendItemApprovalStepTemplate[];
};

export type CreateSpendItemApprovalInstanceInput = {
  spend_item_id: string;
  requested_by_user_id: string;
  approval_policy_id: string;
  steps: SpendItemApprovalStepTemplate[];
};

export type SpendItemApprovalQueueItem = {
  spend_item_id: string;
  spend_item_status: SpendItemStatus;
  spend_item_type: 'GENERAL' | 'EXTERNAL_INVOICE' | 'INTERNAL_INVOICE' | 'PAYROLL_RUN';
  spend_item_amount_minor: bigint;
  spend_item_base_amount_minor: bigint | null;
  spend_item_currency_id: string;
  spend_item_base_currency_id: string | null;
  spend_item_created_by_user_id: string | null;
  approval_instance_id: string;
  approval_instance_status: ApprovalInstanceStatus;
  approval_step_id: string;
  approval_step_order: number;
  approval_step_role_id: string | null;
  approval_step_assigned_user_id: string | null;
  requested_by_user_id: string;
  requested_at: Date;
};

export type UpdateSpendItemApprovalStateInput = {
  status?: SpendItemStatus;
  submitted_at?: Date | null;
  approved_at?: Date | null;
  payment_reference?: string | null;
  paid_at?: Date | null;
  base_currency_id?: string | null;
  base_amount_minor?: bigint | null;
  fx_rate_ppm?: bigint | null;
  fx_rate_locked_at?: Date | null;
};

export type ListPendingPaymentSpendItemsFilters = {
  department_id?: string;
  currency_id?: string;
  spend_item_type?: SpendItemRecord['spend_item_type'];
};

export type ListPendingPaymentSpendItemsPagination = {
  page: number;
  page_size: number;
};

export type ListSpendItemsFilters = {
  status?: SpendItemStatus;
  department_id?: string;
  currency_id?: string;
  spend_item_type?: SpendItemRecord['spend_item_type'];
  created_by_user_id?: string;
  incurred_from?: Date;
  incurred_to?: Date;
  submitted_from?: Date;
  submitted_to?: Date;
};

export type AuditEventRecord = {
  id: string;
  actor_user_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: unknown;
  occurred_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type CreateAuditEventInput = {
  actor_user_id?: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload?: unknown;
  occurred_at?: Date;
};

export interface FinanceRepository {
  getUserRoleCodes(userId: string): Promise<string[]>;
  getUserDepartmentIds(userId: string): Promise<string[]>;
  findDepartmentById(id: string): Promise<DepartmentRecord | null>;
  findCurrencyByCode(code: string): Promise<CurrencyRecord | null>;

  createFxRateSnapshot(input: CreateFxRateSnapshotInput): Promise<FxRateSnapshot>;
  findLatestFxRate(baseCurrencyId: string, quoteCurrencyId: string): Promise<FxRateSnapshot | null>;

  createSpendItem(input: CreateSpendItemInput): Promise<SpendItemRecord>;
  findSpendItemById(id: string): Promise<SpendItemRecord | null>;
  lockSpendItemFx(input: LockSpendItemFxInput): Promise<SpendItemRecord>;
  updateSpendItemApprovalState(id: string, input: UpdateSpendItemApprovalStateInput): Promise<SpendItemRecord>;
  findApplicableSpendItemApprovalPolicy(
    spendItemType: SpendItemRecord['spend_item_type'],
    departmentId: string | null,
    baseCurrencyId: string,
    amountMinor: bigint,
  ): Promise<ResolvedSpendItemApprovalPolicy | null>;
  createApprovalInstanceForSpendItem(
    input: CreateSpendItemApprovalInstanceInput,
  ): Promise<{ approval_instance: ApprovalInstanceRecord; approval_steps: ApprovalStepRecord[] }>;
  findPendingApprovalInstanceForSpendItem(spendItemId: string): Promise<ApprovalInstanceRecord | null>;
  listApprovalStepsForInstance(approvalInstanceId: string): Promise<ApprovalStepRecord[]>;
  updateApprovalStep(
    stepId: string,
    input: {
      status: ApprovalStepStatus;
      acted_by_user_id: string;
      acted_at: Date;
      comment: string;
    },
  ): Promise<ApprovalStepRecord>;
  updateApprovalInstance(
    approvalInstanceId: string,
    input: {
      status: ApprovalInstanceStatus;
      completed_at?: Date | null;
    },
  ): Promise<ApprovalInstanceRecord>;
  listSpendItemApprovalQueue(userId: string, roleCodes: string[]): Promise<SpendItemApprovalQueueItem[]>;
  findFinalApproverForSpendItem(spendItemId: string): Promise<string | null>;
  listPendingPaymentSpendItems(
    filters: ListPendingPaymentSpendItemsFilters,
    pagination: ListPendingPaymentSpendItemsPagination,
  ): Promise<{ items: SpendItemRecord[]; total: number }>;
  listSpendItems(filters: ListSpendItemsFilters): Promise<SpendItemRecord[]>;
  listSpendItemFiles(spendItemId: string): Promise<FileRecord[]>;

  createFile(input: CreateFileInput): Promise<FileRecord>;
  createPaymentRequestDraft(input: CreatePaymentRequestDraftInput): Promise<PaymentRequestRecord>;
  findPaymentRequestById(id: string): Promise<PaymentRequestRecord | null>;
  updatePaymentRequest(id: string, input: UpdatePaymentRequestInput): Promise<PaymentRequestRecord>;
  listPaymentRequests(
    filters: ListPaymentRequestsFilters,
    pagination: ListPaymentRequestsPagination,
  ): Promise<{ items: PaymentRequestRecord[]; total: number }>;

  fileExists(fileId: string): Promise<boolean>;
  attachFileToSpendItem(spendItemId: string, fileId: string): Promise<{ created: boolean }>;
  attachFileToPaymentRequest(paymentRequestId: string, fileId: string): Promise<{ created: boolean }>;
  listPaymentRequestFiles(paymentRequestId: string): Promise<FileRecord[]>;

  createExternalInvoice(input: CreateExternalInvoiceInput): Promise<ExternalInvoiceRecord>;
  findExternalInvoiceById(id: string): Promise<ExternalInvoiceRecord | null>;
  findExternalInvoiceByVendorInvoice(vendorId: string, invoiceNumber: string): Promise<ExternalInvoiceRecord | null>;
  listExternalInvoices(
    filters: ListExternalInvoicesFilters,
    pagination: ListExternalInvoicesPagination,
  ): Promise<{ items: ExternalInvoiceRecord[]; total: number }>;

  createInternalInvoice(
    invoice: CreateInternalInvoiceInput,
    lineItems: CreateInternalInvoiceLineItemInput[],
  ): Promise<{ invoice: InternalInvoiceRecord; line_items: InternalInvoiceLineItemRecord[] }>;
  findInternalInvoiceById(id: string): Promise<InternalInvoiceRecord | null>;
  listInternalInvoices(
    filters: ListInternalInvoicesFilters,
    pagination: ListInternalInvoicesPagination,
  ): Promise<{ items: InternalInvoiceRecord[]; total: number }>;
  listInternalInvoiceLineItems(internalInvoiceId: string): Promise<InternalInvoiceLineItemRecord[]>;
  updateInternalInvoice(id: string, input: UpdateInternalInvoiceInput): Promise<InternalInvoiceRecord>;

  createEmployee(input: CreateEmployeeInput): Promise<EmployeeRecord>;
  findEmployeeById(id: string): Promise<EmployeeRecord | null>;
  updateEmployee(id: string, input: UpdateEmployeeInput): Promise<EmployeeRecord>;
  deleteEmployee(id: string): Promise<void>;
  listEmployees(
    filters: ListEmployeesFilters,
    pagination: ListEmployeesPagination,
  ): Promise<{ items: EmployeeRecord[]; total: number }>;
  findActiveEmployeesForPayrollCurrency(currencyId: string): Promise<EmployeeRecord[]>;

  createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollRunRecord>;
  findPayrollRunById(id: string): Promise<PayrollRunRecord | null>;
  findPayrollRunBySpendItemId(spendItemId: string): Promise<PayrollRunRecord | null>;
  updatePayrollRun(id: string, input: UpdatePayrollRunInput): Promise<PayrollRunRecord>;
  listPayrollRuns(
    pagination: {
      page: number;
      page_size: number;
    },
  ): Promise<{ items: PayrollRunRecord[]; total: number }>;
  replacePayrollRunItemsWithEmployeeSnapshots(
    payrollRunId: string,
    employeeSnapshots: Array<{
      employee_id: string;
      currency_id: string;
      gross_pay_minor: bigint;
      deductions_minor: bigint;
      net_pay_minor: bigint;
    }>,
  ): Promise<PayrollRunItemRecord[]>;
  listPayrollRunItems(payrollRunId: string): Promise<PayrollRunItemDetailRecord[]>;
  findPayrollRunItemByRunEmployee(
    payrollRunId: string,
    employeeId: string,
  ): Promise<PayrollRunItemRecord | null>;
  updatePayrollRunItem(
    payrollRunItemId: string,
    input: {
      gross_pay_minor?: bigint;
      deductions_minor?: bigint;
      net_pay_minor?: bigint;
    },
  ): Promise<PayrollRunItemRecord>;
  createPayrollAdjustment(input: CreatePayrollAdjustmentInput & {
    payroll_run_id: string;
    payroll_run_item_id: string;
    currency_id: string;
  }): Promise<PayrollAdjustmentRecord>;
  listPayrollAdjustments(payrollRunId: string): Promise<PayrollAdjustmentRecord[]>;
  listApprovalInstancesForSpendItem(spendItemId: string): Promise<ApprovalInstanceRecord[]>;

  createApprovalInstanceForPaymentRequest(
    paymentRequestId: string,
    requestedByUserId: string,
  ): Promise<ApprovalInstanceRecord>;
  createApprovalInstanceForInternalInvoice(
    internalInvoiceId: string,
    requestedByUserId: string,
  ): Promise<ApprovalInstanceRecord>;
  listApprovalInstancesForPaymentRequest(paymentRequestId: string): Promise<ApprovalInstanceRecord[]>;
  listApprovalInstancesForInternalInvoice(internalInvoiceId: string): Promise<ApprovalInstanceRecord[]>;

  createAuditEvent(input: CreateAuditEventInput): Promise<AuditEventRecord>;
  listAuditEvents(entityType: string, entityId: string): Promise<AuditEventRecord[]>;
}

class PrismaFinanceRepository implements FinanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getUserRoleCodes(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { user_id: userId },
      select: { role: { select: { code: true } } },
    });

    return userRoles.map((userRole) => userRole.role.code);
  }

  async getUserDepartmentIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.userDepartment.findMany({
      where: { user_id: userId },
      select: { department_id: true },
    });

    return memberships.map((membership) => membership.department_id);
  }

  async findDepartmentById(id: string): Promise<DepartmentRecord | null> {
    return this.prisma.department.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }

  async findCurrencyByCode(code: string): Promise<CurrencyRecord | null> {
    return this.prisma.currency.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
      },
    });
  }

  async createFxRateSnapshot(input: CreateFxRateSnapshotInput): Promise<FxRateSnapshot> {
    return this.prisma.fxRate.create({ data: input });
  }

  async findLatestFxRate(baseCurrencyId: string, quoteCurrencyId: string): Promise<FxRateSnapshot | null> {
    return this.prisma.fxRate.findFirst({
      where: {
        base_currency_id: baseCurrencyId,
        quote_currency_id: quoteCurrencyId,
      },
      orderBy: [{ effective_at: 'desc' }, { created_at: 'desc' }],
    });
  }

  async createSpendItem(input: CreateSpendItemInput): Promise<SpendItemRecord> {
    return this.prisma.spendItem.create({
      data: {
        vendor_id: input.vendor_id ?? null,
        department_id: input.department_id ?? null,
        currency_id: input.currency_id,
        base_currency_id: input.base_currency_id ?? null,
        created_by_user_id: input.created_by_user_id ?? null,
        spend_item_type: input.spend_item_type ?? 'GENERAL',
        description: input.description,
        amount_minor: input.amount_minor,
        base_amount_minor: input.base_amount_minor ?? null,
        status: input.status ?? 'DRAFT',
        incurred_at: input.incurred_at,
        fx_rate_ppm: input.fx_rate_ppm ?? null,
        fx_rate_locked_at: input.fx_rate_locked_at ?? null,
        approved_at: input.approved_at ?? null,
        payment_reference: input.payment_reference ?? null,
        paid_at: input.paid_at ?? null,
      },
    });
  }

  async findSpendItemById(id: string): Promise<SpendItemRecord | null> {
    return this.prisma.spendItem.findUnique({
      where: { id },
    });
  }

  async lockSpendItemFx(input: LockSpendItemFxInput): Promise<SpendItemRecord> {
    return this.prisma.spendItem.update({
      where: { id: input.spend_item_id },
      data: {
        fx_rate_ppm: input.fx_rate_ppm,
        fx_rate_locked_at: input.locked_at,
        submitted_at: input.locked_at,
      },
    });
  }

  async updateSpendItemApprovalState(
    id: string,
    input: UpdateSpendItemApprovalStateInput,
  ): Promise<SpendItemRecord> {
    return this.prisma.spendItem.update({
      where: { id },
      data: {
        status: input.status,
        submitted_at: input.submitted_at,
        approved_at: input.approved_at,
        payment_reference: input.payment_reference,
        paid_at: input.paid_at,
        base_currency_id: input.base_currency_id,
        base_amount_minor: input.base_amount_minor,
        fx_rate_ppm: input.fx_rate_ppm,
        fx_rate_locked_at: input.fx_rate_locked_at,
      },
    });
  }

  async findApplicableSpendItemApprovalPolicy(
    spendItemType: SpendItemRecord['spend_item_type'],
    departmentId: string | null,
    baseCurrencyId: string,
    amountMinor: bigint,
  ): Promise<ResolvedSpendItemApprovalPolicy | null> {
    const departmentClause =
      departmentId === null
        ? { department_id: null }
        : {
            OR: [{ department_id: departmentId }, { department_id: null }],
          };
    const policies = await this.prisma.approvalPolicy.findMany({
      where: {
        scope: 'SPEND_ITEM',
        is_active: true,
        spend_item_type: spendItemType,
        base_currency_id: baseCurrencyId,
        ...departmentClause,
      },
      include: {
        approval_policy_rules: true,
      },
      orderBy: [{ created_at: 'asc' }],
    });

    const sortedPolicies = policies.sort((left, right) => {
      const leftOverride = left.department_id !== null && left.department_id === departmentId ? 1 : 0;
      const rightOverride = right.department_id !== null && right.department_id === departmentId ? 1 : 0;
      if (leftOverride !== rightOverride) {
        return rightOverride - leftOverride;
      }
      return left.created_at.getTime() - right.created_at.getTime();
    });

    for (const policy of sortedPolicies) {
      const sortedRules = [...policy.approval_policy_rules].sort((left, right) => left.step_order - right.step_order);
      const selectedRule = selectThresholdRule(
        sortedRules.map((rule) => ({
          id: rule.id,
          min_amount_minor: rule.min_amount_minor,
          max_amount_minor: rule.max_amount_minor,
          steps: this.parseStepsJson(rule.steps_json),
        })),
        amountMinor,
      );
      if (selectedRule && selectedRule.steps.length > 0) {
        return {
          approval_policy_id: policy.id,
          approval_policy_code: policy.code,
          approval_policy_rule_id: selectedRule.id,
          min_amount_minor: selectedRule.min_amount_minor,
          max_amount_minor: selectedRule.max_amount_minor,
          steps: selectedRule.steps,
        };
      }
    }

    return null;
  }

  async createApprovalInstanceForSpendItem(
    input: CreateSpendItemApprovalInstanceInput,
  ): Promise<{ approval_instance: ApprovalInstanceRecord; approval_steps: ApprovalStepRecord[] }> {
    if (input.steps.length === 0) {
      throw new Error('Approval steps are required');
    }

    const uniqueRoleCodes = [...new Set(input.steps.map((step) => step.role_code).filter((code): code is string => code !== undefined))];
    const roles = uniqueRoleCodes.length
      ? await this.prisma.role.findMany({
          where: { code: { in: uniqueRoleCodes } },
          select: { id: true, code: true },
        })
      : [];
    const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));

    return this.prisma.$transaction(async (tx) => {
      const approvalInstance = await tx.approvalInstance.create({
        data: {
          approval_policy_id: input.approval_policy_id,
          entity_type: 'SPEND_ITEM',
          entity_id: input.spend_item_id,
          requested_by_user_id: input.requested_by_user_id,
          status: 'PENDING',
        },
      });

      const approvalSteps: ApprovalStepRecord[] = [];
      for (const step of input.steps) {
        const resolvedRoleId = step.role_code ? roleIdByCode.get(step.role_code) : undefined;
        if (step.role_code && !resolvedRoleId) {
          throw new Error(`Unknown role code in steps_json: ${step.role_code}`);
        }

        const createdStep = await tx.approvalStep.create({
          data: {
            approval_instance_id: approvalInstance.id,
            step_order: step.step_order,
            role_id: resolvedRoleId ?? null,
            assigned_user_id: step.assigned_user_id ?? null,
            status: 'PENDING',
          },
        });
        approvalSteps.push(createdStep);
      }

      return {
        approval_instance: approvalInstance,
        approval_steps: approvalSteps,
      };
    });
  }

  async findPendingApprovalInstanceForSpendItem(spendItemId: string): Promise<ApprovalInstanceRecord | null> {
    return this.prisma.approvalInstance.findFirst({
      where: {
        entity_type: 'SPEND_ITEM',
        entity_id: spendItemId,
        status: 'PENDING',
      },
      orderBy: [{ created_at: 'desc' }],
    });
  }

  async listApprovalStepsForInstance(approvalInstanceId: string): Promise<ApprovalStepRecord[]> {
    return this.prisma.approvalStep.findMany({
      where: { approval_instance_id: approvalInstanceId },
      orderBy: [{ step_order: 'asc' }, { created_at: 'asc' }],
    });
  }

  async updateApprovalStep(
    stepId: string,
    input: {
      status: ApprovalStepStatus;
      acted_by_user_id: string;
      acted_at: Date;
      comment: string;
    },
  ): Promise<ApprovalStepRecord> {
    return this.prisma.approvalStep.update({
      where: { id: stepId },
      data: {
        status: input.status,
        acted_by_user_id: input.acted_by_user_id,
        acted_at: input.acted_at,
        comment: input.comment,
      },
    });
  }

  async updateApprovalInstance(
    approvalInstanceId: string,
    input: {
      status: ApprovalInstanceStatus;
      completed_at?: Date | null;
    },
  ): Promise<ApprovalInstanceRecord> {
    return this.prisma.approvalInstance.update({
      where: { id: approvalInstanceId },
      data: {
        status: input.status,
        completed_at: input.completed_at,
      },
    });
  }

  async listSpendItemApprovalQueue(userId: string, roleCodes: string[]): Promise<SpendItemApprovalQueueItem[]> {
    const pendingSteps = await this.prisma.approvalStep.findMany({
      where: {
        status: 'PENDING',
        approval_instance: {
          entity_type: 'SPEND_ITEM',
          status: 'PENDING',
        },
      },
      include: {
        approval_instance: true,
        role: {
          select: {
            code: true,
          },
        },
      },
      orderBy: [{ approval_instance: { started_at: 'asc' } }, { step_order: 'asc' }],
    });

    if (pendingSteps.length === 0) {
      return [];
    }

    const firstPendingStepByInstance = new Map<string, (typeof pendingSteps)[number]>();
    for (const pendingStep of pendingSteps) {
      if (!firstPendingStepByInstance.has(pendingStep.approval_instance_id)) {
        firstPendingStepByInstance.set(pendingStep.approval_instance_id, pendingStep);
      }
    }

    const actionableSteps = [...firstPendingStepByInstance.values()].filter((step) => {
      const isAssigned = step.assigned_user_id !== null && step.assigned_user_id === userId;
      const hasMatchingRole =
        step.role?.code !== undefined && step.role?.code !== null && roleCodes.includes(step.role.code);
      return isAssigned || hasMatchingRole;
    });

    if (actionableSteps.length === 0) {
      return [];
    }

    const spendItemIds = [...new Set(actionableSteps.map((step) => step.approval_instance.entity_id))];
    const spendItems = await this.prisma.spendItem.findMany({
      where: {
        id: { in: spendItemIds },
      },
    });
    const spendItemById = new Map(spendItems.map((item) => [item.id, item]));

    return actionableSteps
      .map((step) => {
        const spendItem = spendItemById.get(step.approval_instance.entity_id);
        if (!spendItem) {
          return null;
        }

        if (spendItem.created_by_user_id !== null && spendItem.created_by_user_id === userId) {
          return null;
        }

        if (!['SUBMITTED', 'UNDER_REVIEW'].includes(spendItem.status)) {
          return null;
        }

        return {
          spend_item_id: spendItem.id,
          spend_item_status: spendItem.status,
          spend_item_type: spendItem.spend_item_type,
          spend_item_amount_minor: spendItem.amount_minor,
          spend_item_base_amount_minor: spendItem.base_amount_minor,
          spend_item_currency_id: spendItem.currency_id,
          spend_item_base_currency_id: spendItem.base_currency_id,
          spend_item_created_by_user_id: spendItem.created_by_user_id,
          approval_instance_id: step.approval_instance.id,
          approval_instance_status: step.approval_instance.status,
          approval_step_id: step.id,
          approval_step_order: step.step_order,
          approval_step_role_id: step.role_id,
          approval_step_assigned_user_id: step.assigned_user_id,
          requested_by_user_id: step.approval_instance.requested_by_user_id,
          requested_at: step.approval_instance.started_at,
        } satisfies SpendItemApprovalQueueItem;
      })
      .filter((item): item is SpendItemApprovalQueueItem => item !== null);
  }

  async findFinalApproverForSpendItem(spendItemId: string): Promise<string | null> {
    const approvalInstance = await this.prisma.approvalInstance.findFirst({
      where: {
        entity_type: 'SPEND_ITEM',
        entity_id: spendItemId,
        status: 'APPROVED',
      },
      orderBy: [{ completed_at: 'desc' }, { created_at: 'desc' }],
    });

    if (approvalInstance === null) {
      return null;
    }

    const finalStep = await this.prisma.approvalStep.findFirst({
      where: {
        approval_instance_id: approvalInstance.id,
        status: 'APPROVED',
      },
      orderBy: [{ step_order: 'desc' }, { acted_at: 'desc' }],
      select: { acted_by_user_id: true },
    });

    return finalStep?.acted_by_user_id ?? null;
  }

  async listPendingPaymentSpendItems(
    filters: ListPendingPaymentSpendItemsFilters,
    pagination: ListPendingPaymentSpendItemsPagination,
  ): Promise<{ items: SpendItemRecord[]; total: number }> {
    const where: Prisma.SpendItemWhereInput = {
      status: 'APPROVED',
      department_id: filters.department_id,
      currency_id: filters.currency_id,
      spend_item_type: filters.spend_item_type,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.spendItem.findMany({
        where,
        skip: (pagination.page - 1) * pagination.page_size,
        take: pagination.page_size,
        orderBy: [{ approved_at: 'asc' }, { created_at: 'asc' }],
      }),
      this.prisma.spendItem.count({ where }),
    ]);

    return { items, total };
  }

  async listSpendItems(filters: ListSpendItemsFilters): Promise<SpendItemRecord[]> {
    const where: Prisma.SpendItemWhereInput = {
      status: filters.status,
      department_id: filters.department_id,
      currency_id: filters.currency_id,
      spend_item_type: filters.spend_item_type,
      created_by_user_id: filters.created_by_user_id,
      incurred_at:
        filters.incurred_from || filters.incurred_to
          ? {
              gte: filters.incurred_from,
              lte: filters.incurred_to,
            }
          : undefined,
      submitted_at:
        filters.submitted_from || filters.submitted_to
          ? {
              gte: filters.submitted_from,
              lte: filters.submitted_to,
            }
          : undefined,
    };

    return this.prisma.spendItem.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
  }

  private mapEmployeeRecord(
    employee: Prisma.EmployeeGetPayload<{
      include: { user: { select: { email: true } } };
    }>,
  ): EmployeeRecord {
    return {
      id: employee.id,
      user_id: employee.user_id,
      department_id: employee.department_id,
      salary_currency_id: employee.salary_currency_id,
      employee_number: employee.employee_number,
      legal_name: employee.legal_name,
      hire_date: employee.hire_date,
      termination_date: employee.termination_date,
      base_salary_minor: employee.base_salary_minor,
      is_active: employee.is_active,
      status: employee.status,
      bank_details_encrypted: employee.bank_details_encrypted,
      created_at: employee.created_at,
      updated_at: employee.updated_at,
      email: employee.user.email,
    };
  }

  private generateEmployeeNumber(): string {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const suffix = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    return `EMP-${timestamp}-${suffix}`;
  }

  private parseStepsJson(input: Prisma.JsonValue): SpendItemApprovalStepTemplate[] {
    if (!Array.isArray(input)) {
      return [];
    }

    const parsedSteps: SpendItemApprovalStepTemplate[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const candidate = input[index];
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        continue;
      }

      const record = candidate as Record<string, unknown>;
      const stepOrder =
        typeof record.step_order === 'number' && Number.isInteger(record.step_order)
          ? record.step_order
          : index + 1;
      const roleCode = typeof record.role_code === 'string' ? record.role_code.trim() : undefined;
      const assignedUserId =
        typeof record.assigned_user_id === 'string' ? record.assigned_user_id : undefined;

      if (!roleCode && !assignedUserId) {
        continue;
      }

      parsedSteps.push({
        step_order: stepOrder,
        role_code: roleCode && roleCode.length > 0 ? roleCode : undefined,
        assigned_user_id: assignedUserId,
      });
    }

    return parsedSteps
      .sort((left, right) => left.step_order - right.step_order)
      .map((step, index) => ({
        ...step,
        step_order: index + 1,
      }));
  }

  async listSpendItemFiles(spendItemId: string): Promise<FileRecord[]> {
    const links = await this.prisma.spendItemFile.findMany({
      where: { spend_item_id: spendItemId },
      include: { file: true },
      orderBy: [{ created_at: 'asc' }],
    });

    return links.map((link) => link.file);
  }

  async createFile(input: CreateFileInput): Promise<FileRecord> {
    return this.prisma.file.create({
      data: {
        storage_key: input.storage_key,
        file_name: input.file_name,
        mime_type: input.mime_type,
        size_bytes: input.size_bytes,
        checksum_sha256: input.checksum_sha256 ?? null,
      },
    });
  }

  async createPaymentRequestDraft(input: CreatePaymentRequestDraftInput): Promise<PaymentRequestRecord> {
    return this.prisma.paymentRequest.create({
      data: {
        request_number: input.request_number,
        spend_item_id: input.spend_item_id,
        vendor_id: input.vendor_id ?? null,
        department_id: input.department_id,
        currency_id: input.currency_id,
        requested_by_user_id: input.requested_by_user_id,
        requested_amount_minor: input.requested_amount_minor,
        due_at: input.due_at ?? null,
        status: 'DRAFT',
      },
    });
  }

  async findPaymentRequestById(id: string): Promise<PaymentRequestRecord | null> {
    return this.prisma.paymentRequest.findUnique({
      where: { id },
    });
  }

  async updatePaymentRequest(id: string, input: UpdatePaymentRequestInput): Promise<PaymentRequestRecord> {
    return this.prisma.paymentRequest.update({
      where: { id },
      data: {
        vendor_id: input.vendor_id,
        department_id: input.department_id,
        requested_amount_minor: input.requested_amount_minor,
        due_at: input.due_at,
        base_currency_id: input.base_currency_id,
        base_amount_minor: input.base_amount_minor,
        fx_rate_ppm: input.fx_rate_ppm,
        fx_rate_locked_at: input.fx_rate_locked_at,
        submitted_at: input.submitted_at,
        status: input.status,
      },
    });
  }

  async listPaymentRequests(
    filters: ListPaymentRequestsFilters,
    pagination: ListPaymentRequestsPagination,
  ): Promise<{ items: PaymentRequestRecord[]; total: number }> {
    const where = {
      status: filters.status,
      department_id: filters.department_id,
      requested_by_user_id: filters.requested_by_user_id,
      currency_id: filters.currency_id,
    };

    const skip = (pagination.page - 1) * pagination.page_size;
    const take = pagination.page_size;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.paymentRequest.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.paymentRequest.count({ where }),
    ]);

    return { items, total };
  }

  async fileExists(fileId: string): Promise<boolean> {
    const count = await this.prisma.file.count({ where: { id: fileId } });
    return count > 0;
  }

  async attachFileToSpendItem(spendItemId: string, fileId: string): Promise<{ created: boolean }> {
    try {
      await this.prisma.spendItemFile.create({
        data: {
          spend_item_id: spendItemId,
          file_id: fileId,
        },
      });
      return { created: true };
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string' &&
        (error as { code: string }).code === 'P2002'
      ) {
        return { created: false };
      }

      throw error;
    }
  }

  async attachFileToPaymentRequest(paymentRequestId: string, fileId: string): Promise<{ created: boolean }> {
    const paymentRequest = await this.prisma.paymentRequest.findUnique({
      where: { id: paymentRequestId },
      select: { spend_item_id: true },
    });

    if (paymentRequest === null || paymentRequest.spend_item_id === null) {
      throw new Error('Payment request has no linked spend item');
    }

    return this.attachFileToSpendItem(paymentRequest.spend_item_id, fileId);
  }

  async listPaymentRequestFiles(paymentRequestId: string): Promise<FileRecord[]> {
    const paymentRequest = await this.prisma.paymentRequest.findUnique({
      where: { id: paymentRequestId },
      select: {
        spend_item_id: true,
      },
    });

    if (paymentRequest === null || paymentRequest.spend_item_id === null) {
      return [];
    }

    return this.listSpendItemFiles(paymentRequest.spend_item_id);
  }

  async createExternalInvoice(input: CreateExternalInvoiceInput): Promise<ExternalInvoiceRecord> {
    return this.prisma.externalInvoice.create({
      data: {
        payment_request_id: input.payment_request_id ?? null,
        spend_item_id: input.spend_item_id ?? null,
        vendor_id: input.vendor_id,
        currency_id: input.currency_id,
        invoice_number: input.invoice_number,
        invoice_date: input.invoice_date,
        due_date: input.due_date ?? null,
        subtotal_amount_minor: input.subtotal_amount_minor ?? null,
        tax_amount_minor: input.tax_amount_minor ?? null,
        total_amount_minor: input.total_amount_minor,
        status: input.status ?? 'OPEN',
        received_at: input.received_at ?? null,
      },
    });
  }

  async findExternalInvoiceById(id: string): Promise<ExternalInvoiceRecord | null> {
    return this.prisma.externalInvoice.findUnique({
      where: { id },
    });
  }

  async findExternalInvoiceByVendorInvoice(
    vendorId: string,
    invoiceNumber: string,
  ): Promise<ExternalInvoiceRecord | null> {
    return this.prisma.externalInvoice.findFirst({
      where: {
        vendor_id: vendorId,
        invoice_number: invoiceNumber,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
  }

  async listExternalInvoices(
    filters: ListExternalInvoicesFilters,
    pagination: ListExternalInvoicesPagination,
  ): Promise<{ items: ExternalInvoiceRecord[]; total: number }> {
    const where = {
      vendor_id: filters.vendor_id,
      currency_id: filters.currency_id,
      spend_item_id: filters.spend_item_id,
      invoice_number: filters.invoice_number,
      status: filters.status,
    };

    const skip = (pagination.page - 1) * pagination.page_size;
    const take = pagination.page_size;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.externalInvoice.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.externalInvoice.count({ where }),
    ]);

    return { items, total };
  }

  async createInternalInvoice(
    invoice: CreateInternalInvoiceInput,
    lineItems: CreateInternalInvoiceLineItemInput[],
  ): Promise<{ invoice: InternalInvoiceRecord; line_items: InternalInvoiceLineItemRecord[] }> {
    return this.prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.internalInvoice.create({
        data: {
          spend_item_id: invoice.spend_item_id,
          from_department_id: invoice.from_department_id,
          to_department_id: invoice.to_department_id,
          currency_id: invoice.currency_id,
          created_by_user_id: invoice.created_by_user_id ?? null,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date ?? null,
          total_amount_minor: invoice.total_amount_minor,
          status: invoice.status ?? 'DRAFT',
        },
      });

      const createdLineItems: InternalInvoiceLineItemRecord[] = [];
      for (const lineItem of lineItems) {
        const createdLineItem = await tx.internalInvoiceLineItem.create({
          data: {
            internal_invoice_id: createdInvoice.id,
            department_id: lineItem.department_id ?? null,
            description: lineItem.description,
            quantity: new Prisma.Decimal(lineItem.quantity ?? 1),
            unit_amount_minor: lineItem.unit_amount_minor,
            line_amount_minor: lineItem.line_amount_minor,
          },
        });
        createdLineItems.push(createdLineItem);
      }

      return {
        invoice: createdInvoice,
        line_items: createdLineItems,
      };
    });
  }

  async findInternalInvoiceById(id: string): Promise<InternalInvoiceRecord | null> {
    return this.prisma.internalInvoice.findUnique({
      where: { id },
    });
  }

  async listInternalInvoices(
    filters: ListInternalInvoicesFilters,
    pagination: ListInternalInvoicesPagination,
  ): Promise<{ items: InternalInvoiceRecord[]; total: number }> {
    const where = {
      status: filters.status,
      from_department_id: filters.from_department_id,
      to_department_id: filters.to_department_id,
      currency_id: filters.currency_id,
      created_by_user_id: filters.created_by_user_id,
    };

    const skip = (pagination.page - 1) * pagination.page_size;
    const take = pagination.page_size;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.internalInvoice.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.internalInvoice.count({ where }),
    ]);

    return { items, total };
  }

  async listInternalInvoiceLineItems(internalInvoiceId: string): Promise<InternalInvoiceLineItemRecord[]> {
    return this.prisma.internalInvoiceLineItem.findMany({
      where: { internal_invoice_id: internalInvoiceId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  }

  async updateInternalInvoice(id: string, input: UpdateInternalInvoiceInput): Promise<InternalInvoiceRecord> {
    return this.prisma.internalInvoice.update({
      where: { id },
      data: {
        status: input.status,
        submitted_at: input.submitted_at,
      },
    });
  }

  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeRecord> {
    const upsertedUser = await this.prisma.user.upsert({
      where: { email: input.email },
      update: {
        full_name: input.name,
        is_active: input.status !== 'INACTIVE',
      },
      create: {
        email: input.email,
        full_name: input.name,
        is_active: input.status !== 'INACTIVE',
      },
    });

    const created = await this.prisma.employee.create({
      data: {
        user_id: upsertedUser.id,
        department_id: input.department_id ?? null,
        salary_currency_id: input.currency_id,
        employee_number: this.generateEmployeeNumber(),
        legal_name: input.name,
        hire_date: new Date(),
        termination_date: null,
        base_salary_minor: input.salary_minor,
        is_active: input.status !== 'INACTIVE',
        status: input.status ?? 'ACTIVE',
        bank_details_encrypted: input.bank_details_encrypted,
      },
      include: {
        user: {
          select: { email: true },
        },
      },
    });

    return this.mapEmployeeRecord(created);
  }

  async findEmployeeById(id: string): Promise<EmployeeRecord | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true },
        },
      },
    });

    return employee ? this.mapEmployeeRecord(employee) : null;
  }

  async updateEmployee(id: string, input: UpdateEmployeeInput): Promise<EmployeeRecord> {
    const existing = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
    if (existing === null) {
      throw new Error('Employee not found');
    }

    if (input.email !== undefined || input.name !== undefined || input.status !== undefined) {
      await this.prisma.user.update({
        where: { id: existing.user_id },
        data: {
          email: input.email,
          full_name: input.name,
          is_active: input.status !== undefined ? input.status !== 'INACTIVE' : undefined,
        },
      });
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        department_id: input.department_id,
        salary_currency_id: input.currency_id,
        legal_name: input.name,
        base_salary_minor: input.salary_minor,
        status: input.status,
        is_active: input.status !== undefined ? input.status !== 'INACTIVE' : undefined,
        bank_details_encrypted: input.bank_details_encrypted,
      },
      include: {
        user: {
          select: { email: true },
        },
      },
    });

    return this.mapEmployeeRecord(updated);
  }

  async deleteEmployee(id: string): Promise<void> {
    await this.prisma.employee.delete({ where: { id } });
  }

  async listEmployees(
    filters: ListEmployeesFilters,
    pagination: ListEmployeesPagination,
  ): Promise<{ items: EmployeeRecord[]; total: number }> {
    const where = {
      department_id: filters.department_id,
      salary_currency_id: filters.currency_id,
      status: filters.status,
    };

    const skip = (pagination.page - 1) * pagination.page_size;
    const take = pagination.page_size;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include: {
          user: {
            select: { email: true },
          },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      items: items.map((employee) => this.mapEmployeeRecord(employee)),
      total,
    };
  }

  async findActiveEmployeesForPayrollCurrency(currencyId: string): Promise<EmployeeRecord[]> {
    const employees = await this.prisma.employee.findMany({
      where: {
        salary_currency_id: currencyId,
        status: 'ACTIVE',
        is_active: true,
      },
      include: {
        user: {
          select: { email: true },
        },
      },
      orderBy: [{ legal_name: 'asc' }, { id: 'asc' }],
    });

    return employees.map((employee) => this.mapEmployeeRecord(employee));
  }

  async createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollRunRecord> {
    return this.prisma.payrollRun.create({
      data: {
        run_number: input.run_number,
        period_start: input.period_start,
        period_end: input.period_end,
        pay_date: input.pay_date ?? null,
        currency_id: input.currency_id,
        created_by_user_id: input.created_by_user_id ?? null,
        status: 'DRAFT',
      },
    });
  }

  async findPayrollRunById(id: string): Promise<PayrollRunRecord | null> {
    return this.prisma.payrollRun.findUnique({
      where: { id },
    });
  }

  async findPayrollRunBySpendItemId(spendItemId: string): Promise<PayrollRunRecord | null> {
    return this.prisma.payrollRun.findFirst({
      where: { spend_item_id: spendItemId },
      orderBy: [{ created_at: 'desc' }],
    });
  }

  async updatePayrollRun(id: string, input: UpdatePayrollRunInput): Promise<PayrollRunRecord> {
    return this.prisma.payrollRun.update({
      where: { id },
      data: {
        spend_item_id: input.spend_item_id,
        status: input.status,
        total_gross_minor: input.total_gross_minor,
        total_net_minor: input.total_net_minor,
        submitted_at: input.submitted_at,
        payment_reference: input.payment_reference,
        paid_at: input.paid_at,
      },
    });
  }

  async listPayrollRuns(
    pagination: {
      page: number;
      page_size: number;
    },
  ): Promise<{ items: PayrollRunRecord[]; total: number }> {
    const skip = (pagination.page - 1) * pagination.page_size;
    const take = pagination.page_size;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payrollRun.findMany({
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.payrollRun.count(),
    ]);

    return { items, total };
  }

  async replacePayrollRunItemsWithEmployeeSnapshots(
    payrollRunId: string,
    employeeSnapshots: Array<{
      employee_id: string;
      currency_id: string;
      gross_pay_minor: bigint;
      deductions_minor: bigint;
      net_pay_minor: bigint;
    }>,
  ): Promise<PayrollRunItemRecord[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.payrollRunItem.deleteMany({
        where: { payroll_run_id: payrollRunId },
      });

      const items: PayrollRunItemRecord[] = [];
      for (const snapshot of employeeSnapshots) {
        const created = await tx.payrollRunItem.create({
          data: {
            payroll_run_id: payrollRunId,
            employee_id: snapshot.employee_id,
            currency_id: snapshot.currency_id,
            gross_pay_minor: snapshot.gross_pay_minor,
            deductions_minor: snapshot.deductions_minor,
            net_pay_minor: snapshot.net_pay_minor,
          },
        });
        items.push(created);
      }
      return items;
    });
  }

  async listPayrollRunItems(payrollRunId: string): Promise<PayrollRunItemDetailRecord[]> {
    const items = await this.prisma.payrollRunItem.findMany({
      where: { payroll_run_id: payrollRunId },
      include: {
        employee: {
          include: {
            user: {
              select: { email: true },
            },
          },
        },
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    return items.map((item) => ({
      id: item.id,
      payroll_run_id: item.payroll_run_id,
      employee_id: item.employee_id,
      currency_id: item.currency_id,
      gross_pay_minor: item.gross_pay_minor,
      deductions_minor: item.deductions_minor,
      net_pay_minor: item.net_pay_minor,
      created_at: item.created_at,
      updated_at: item.updated_at,
      employee_legal_name: item.employee.legal_name,
      employee_email: item.employee.user.email,
    }));
  }

  async findPayrollRunItemByRunEmployee(
    payrollRunId: string,
    employeeId: string,
  ): Promise<PayrollRunItemRecord | null> {
    return this.prisma.payrollRunItem.findFirst({
      where: {
        payroll_run_id: payrollRunId,
        employee_id: employeeId,
      },
    });
  }

  async updatePayrollRunItem(
    payrollRunItemId: string,
    input: {
      gross_pay_minor?: bigint;
      deductions_minor?: bigint;
      net_pay_minor?: bigint;
    },
  ): Promise<PayrollRunItemRecord> {
    return this.prisma.payrollRunItem.update({
      where: { id: payrollRunItemId },
      data: {
        gross_pay_minor: input.gross_pay_minor,
        deductions_minor: input.deductions_minor,
        net_pay_minor: input.net_pay_minor,
      },
    });
  }

  async createPayrollAdjustment(input: CreatePayrollAdjustmentInput & {
    payroll_run_id: string;
    payroll_run_item_id: string;
    currency_id: string;
  }): Promise<PayrollAdjustmentRecord> {
    return this.prisma.payrollAdjustment.create({
      data: {
        payroll_run_id: input.payroll_run_id,
        payroll_run_item_id: input.payroll_run_item_id,
        employee_id: input.employee_id,
        currency_id: input.currency_id,
        created_by_user_id: input.created_by_user_id ?? null,
        adjustment_type: input.adjustment_type,
        amount_minor: input.amount_minor,
        reason: input.reason,
      },
    });
  }

  async listPayrollAdjustments(payrollRunId: string): Promise<PayrollAdjustmentRecord[]> {
    return this.prisma.payrollAdjustment.findMany({
      where: { payroll_run_id: payrollRunId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  }

  async listApprovalInstancesForSpendItem(spendItemId: string): Promise<ApprovalInstanceRecord[]> {
    return this.prisma.approvalInstance.findMany({
      where: {
        entity_type: 'SPEND_ITEM',
        entity_id: spendItemId,
      },
      orderBy: [{ created_at: 'asc' }],
    });
  }

  async createApprovalInstanceForPaymentRequest(
    paymentRequestId: string,
    requestedByUserId: string,
  ): Promise<ApprovalInstanceRecord> {
    return this.prisma.approvalInstance.create({
      data: {
        entity_type: 'PAYMENT_REQUEST',
        entity_id: paymentRequestId,
        requested_by_user_id: requestedByUserId,
        status: 'PENDING',
      },
    });
  }

  async createApprovalInstanceForInternalInvoice(
    internalInvoiceId: string,
    requestedByUserId: string,
  ): Promise<ApprovalInstanceRecord> {
    return this.prisma.approvalInstance.create({
      data: {
        entity_type: 'INTERNAL_INVOICE',
        entity_id: internalInvoiceId,
        requested_by_user_id: requestedByUserId,
        status: 'PENDING',
      },
    });
  }

  async listApprovalInstancesForPaymentRequest(
    paymentRequestId: string,
  ): Promise<ApprovalInstanceRecord[]> {
    return this.prisma.approvalInstance.findMany({
      where: {
        entity_type: 'PAYMENT_REQUEST',
        entity_id: paymentRequestId,
      },
      orderBy: [{ created_at: 'asc' }],
    });
  }

  async listApprovalInstancesForInternalInvoice(
    internalInvoiceId: string,
  ): Promise<ApprovalInstanceRecord[]> {
    return this.prisma.approvalInstance.findMany({
      where: {
        entity_type: 'INTERNAL_INVOICE',
        entity_id: internalInvoiceId,
      },
      orderBy: [{ created_at: 'asc' }],
    });
  }

  async createAuditEvent(input: CreateAuditEventInput): Promise<AuditEventRecord> {
    let payload: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;
    if (input.payload !== undefined) {
      payload = input.payload === null ? Prisma.JsonNull : (input.payload as Prisma.InputJsonValue);
    }

    return this.prisma.auditEvent.create({
      data: {
        actor_user_id: input.actor_user_id ?? null,
        event_type: input.event_type,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        payload,
        occurred_at: input.occurred_at ?? new Date(),
      },
    });
  }

  async listAuditEvents(entityType: string, entityId: string): Promise<AuditEventRecord[]> {
    return this.prisma.auditEvent.findMany({
      where: {
        entity_type: entityType,
        entity_id: entityId,
      },
      orderBy: [{ occurred_at: 'asc' }, { created_at: 'asc' }],
    });
  }
}

export function createPrismaFinanceRepository(prismaClient?: PrismaClient): FinanceRepository {
  return new PrismaFinanceRepository(prismaClient ?? new PrismaClient());
}
