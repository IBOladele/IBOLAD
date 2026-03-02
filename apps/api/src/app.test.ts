import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { createApp } from './app.js';
import { selectThresholdRule } from './approval-engine.js';
import type {
  ApprovalInstanceRecord,
  ApprovalStepRecord,
  AuditEventRecord,
  CreateAuditEventInput,
  CreateEmployeeInput,
  CreateExternalInvoiceInput,
  CreateFileInput,
  CreateFxRateSnapshotInput,
  CurrencyRecord,
  DepartmentRecord,
  CreatePayrollAdjustmentInput,
  CreatePayrollRunInput,
  CreateSpendItemApprovalInstanceInput,
  CreateInternalInvoiceInput,
  CreateInternalInvoiceLineItemInput,
  CreatePaymentRequestDraftInput,
  CreateSpendItemInput,
  EmployeeRecord,
  ExternalInvoiceRecord,
  FileRecord,
  FinanceRepository,
  FxRateSnapshot,
  InternalInvoiceLineItemRecord,
  InternalInvoiceRecord,
  ListEmployeesFilters,
  ListEmployeesPagination,
  ListExternalInvoicesFilters,
  ListExternalInvoicesPagination,
  ListInternalInvoicesFilters,
  ListInternalInvoicesPagination,
  ListPendingPaymentSpendItemsFilters,
  ListPendingPaymentSpendItemsPagination,
  ListSpendItemsFilters,
  ListPaymentRequestsFilters,
  ListPaymentRequestsPagination,
  LockSpendItemFxInput,
  PayrollAdjustmentRecord,
  PayrollRunItemDetailRecord,
  PayrollRunItemRecord,
  PayrollRunRecord,
  PaymentRequestRecord,
  ResolvedSpendItemApprovalPolicy,
  SpendItemApprovalQueueItem,
  SpendItemApprovalStepTemplate,
  SpendItemRecord,
  UpdateEmployeeInput,
  UpdatePayrollRunInput,
  UpdateSpendItemApprovalStateInput,
  UpdateInternalInvoiceInput,
  UpdatePaymentRequestInput,
} from './finance-repository.js';

type InMemorySpendItemApprovalRule = {
  id: string;
  step_order: number;
  min_amount_minor: bigint | null;
  max_amount_minor: bigint | null;
  steps: SpendItemApprovalStepTemplate[];
};

type InMemorySpendItemApprovalPolicy = {
  id: string;
  code: string;
  spend_item_type: SpendItemRecord['spend_item_type'];
  base_currency_id: string;
  department_id: string | null;
  is_active: boolean;
  created_at: Date;
  rules: InMemorySpendItemApprovalRule[];
};

class InMemoryFinanceRepository implements FinanceRepository {
  private fxRates: FxRateSnapshot[] = [];
  private spendItems = new Map<string, SpendItemRecord>();
  private paymentRequests = new Map<string, PaymentRequestRecord>();
  private externalInvoices = new Map<string, ExternalInvoiceRecord>();
  private internalInvoices = new Map<string, InternalInvoiceRecord>();
  private internalInvoiceLineItems = new Map<string, InternalInvoiceLineItemRecord>();
  private employees = new Map<string, EmployeeRecord>();
  private payrollRuns = new Map<string, PayrollRunRecord>();
  private payrollRunItems = new Map<string, PayrollRunItemRecord>();
  private payrollAdjustments = new Map<string, PayrollAdjustmentRecord>();
  private files = new Map<string, FileRecord>();
  private spendItemFiles = new Set<string>();
  private approvalInstances: ApprovalInstanceRecord[] = [];
  private approvalSteps: ApprovalStepRecord[] = [];
  private spendItemApprovalPolicies: InMemorySpendItemApprovalPolicy[] = [];
  private auditEvents: AuditEventRecord[] = [];
  private userRoleCodes = new Map<string, string[]>();
  private userDepartmentIds = new Map<string, string[]>();
  private roleIdByCode = new Map<string, string>();
  private departments = new Map<string, DepartmentRecord>();
  private currencies = new Map<string, CurrencyRecord>();
  private idCounter = 1;

  setUserRoleCodes(userId: string, roleCodes: string[]) {
    this.userRoleCodes.set(userId, roleCodes);
    roleCodes.forEach((roleCode) => this.ensureRoleId(roleCode));
  }

  setUserDepartmentIds(userId: string, departmentIds: string[]) {
    this.userDepartmentIds.set(userId, departmentIds);
  }

  setDepartment(input: DepartmentRecord) {
    this.departments.set(input.id, {
      ...input,
    });
  }

  setCurrency(input: CurrencyRecord) {
    this.currencies.set(input.id, {
      ...input,
    });
  }

  seedDefaultSpendItemPolicies(baseCurrencyIds: string[]) {
    const spendItemTypes: SpendItemRecord['spend_item_type'][] = [
      'GENERAL',
      'EXTERNAL_INVOICE',
      'INTERNAL_INVOICE',
      'PAYROLL_RUN',
    ];

    for (const baseCurrencyId of baseCurrencyIds) {
      for (const spendItemType of spendItemTypes) {
        this.addSpendItemApprovalPolicy({
          code: `SPEND_ITEM_${spendItemType}_${baseCurrencyId}_DEFAULT`,
          spend_item_type: spendItemType,
          base_currency_id: baseCurrencyId,
          department_id: null,
          rules: [
            {
              min_amount_minor: null,
              max_amount_minor: 1_000_000n,
              steps: [{ step_order: 1, role_code: 'DEPT_HEAD' }],
            },
            {
              min_amount_minor: 1_000_001n,
              max_amount_minor: null,
              steps: [
                { step_order: 1, role_code: 'DEPT_HEAD' },
                { step_order: 2, role_code: 'FINANCE' },
              ],
            },
          ],
        });
      }
    }
  }

  addSpendItemApprovalPolicy(input: {
    code: string;
    spend_item_type: SpendItemRecord['spend_item_type'];
    base_currency_id: string;
    department_id?: string | null;
    rules: Array<{
      min_amount_minor: bigint | null;
      max_amount_minor: bigint | null;
      steps: SpendItemApprovalStepTemplate[];
    }>;
  }) {
    const createdAt = new Date();
    const policy: InMemorySpendItemApprovalPolicy = {
      id: this.generateUuid(),
      code: input.code,
      spend_item_type: input.spend_item_type,
      base_currency_id: input.base_currency_id,
      department_id: input.department_id ?? null,
      is_active: true,
      created_at: createdAt,
      rules: input.rules.map((rule, index) => {
        rule.steps.forEach((step) => {
          if (step.role_code) {
            this.ensureRoleId(step.role_code);
          }
        });

        return {
          id: this.generateUuid(),
          step_order: index + 1,
          min_amount_minor: rule.min_amount_minor,
          max_amount_minor: rule.max_amount_minor,
          steps: [...rule.steps].sort((left, right) => left.step_order - right.step_order),
        };
      }),
    };

    this.spendItemApprovalPolicies.push(policy);
  }

  addFile(fileId: string) {
    const now = new Date();
    this.files.set(fileId, {
      id: fileId,
      storage_key: `uploads/${fileId}`,
      file_name: `${fileId}.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 1280n,
      checksum_sha256: null,
      created_at: now,
      updated_at: now,
    });
  }

  async getUserRoleCodes(userId: string): Promise<string[]> {
    return this.userRoleCodes.get(userId) ?? [];
  }

  async getUserDepartmentIds(userId: string): Promise<string[]> {
    return this.userDepartmentIds.get(userId) ?? [];
  }

  async findDepartmentById(id: string): Promise<DepartmentRecord | null> {
    return this.departments.get(id) ?? null;
  }

  async findCurrencyByCode(code: string): Promise<CurrencyRecord | null> {
    for (const currency of this.currencies.values()) {
      if (currency.code === code) {
        return currency;
      }
    }
    return null;
  }

  async createFxRateSnapshot(input: CreateFxRateSnapshotInput): Promise<FxRateSnapshot> {
    const now = new Date();
    const fxRate: FxRateSnapshot = {
      id: this.generateUuid(),
      base_currency_id: input.base_currency_id,
      quote_currency_id: input.quote_currency_id,
      fx_rate_ppm: input.fx_rate_ppm,
      effective_at: input.effective_at,
      created_at: now,
      updated_at: now,
    };

    this.fxRates.push(fxRate);
    return fxRate;
  }

  async findLatestFxRate(baseCurrencyId: string, quoteCurrencyId: string): Promise<FxRateSnapshot | null> {
    const snapshots = this.fxRates
      .filter(
        (snapshot) =>
          snapshot.base_currency_id === baseCurrencyId &&
          snapshot.quote_currency_id === quoteCurrencyId,
      )
      .sort((left, right) => {
        const byEffectiveAt = right.effective_at.getTime() - left.effective_at.getTime();
        if (byEffectiveAt !== 0) {
          return byEffectiveAt;
        }
        return right.created_at.getTime() - left.created_at.getTime();
      });

    return snapshots[0] ?? null;
  }

  async createSpendItem(input: CreateSpendItemInput): Promise<SpendItemRecord> {
    const now = new Date();
    const spendItem: SpendItemRecord = {
      id: this.generateUuid(),
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
      submitted_at: null,
      approved_at: input.approved_at ?? null,
      payment_reference: input.payment_reference ?? null,
      paid_at: input.paid_at ?? null,
      fx_rate_ppm: input.fx_rate_ppm ?? null,
      fx_rate_locked_at: input.fx_rate_locked_at ?? null,
      created_at: now,
      updated_at: now,
    };

    this.spendItems.set(spendItem.id, spendItem);
    return spendItem;
  }

  async findSpendItemById(id: string): Promise<SpendItemRecord | null> {
    return this.spendItems.get(id) ?? null;
  }

  async lockSpendItemFx(input: LockSpendItemFxInput): Promise<SpendItemRecord> {
    const spendItem = this.spendItems.get(input.spend_item_id);
    if (!spendItem) {
      throw new Error('Spend item not found');
    }

    const updated: SpendItemRecord = {
      ...spendItem,
      submitted_at: input.locked_at,
      fx_rate_ppm: input.fx_rate_ppm,
      fx_rate_locked_at: input.locked_at,
      updated_at: input.locked_at,
    };
    this.spendItems.set(updated.id, updated);
    return updated;
  }

  async updateSpendItemApprovalState(
    id: string,
    input: UpdateSpendItemApprovalStateInput,
  ): Promise<SpendItemRecord> {
    const spendItem = this.spendItems.get(id);
    if (!spendItem) {
      throw new Error('Spend item not found');
    }

    const updated: SpendItemRecord = {
      ...spendItem,
      updated_at: new Date(),
    };

    if (input.status !== undefined) {
      updated.status = input.status;
    }
    if (input.submitted_at !== undefined) {
      updated.submitted_at = input.submitted_at;
    }
    if (input.approved_at !== undefined) {
      updated.approved_at = input.approved_at;
    }
    if (input.payment_reference !== undefined) {
      updated.payment_reference = input.payment_reference;
    }
    if (input.paid_at !== undefined) {
      updated.paid_at = input.paid_at;
    }
    if (input.base_currency_id !== undefined) {
      updated.base_currency_id = input.base_currency_id;
    }
    if (input.base_amount_minor !== undefined) {
      updated.base_amount_minor = input.base_amount_minor;
    }
    if (input.fx_rate_ppm !== undefined) {
      updated.fx_rate_ppm = input.fx_rate_ppm;
    }
    if (input.fx_rate_locked_at !== undefined) {
      updated.fx_rate_locked_at = input.fx_rate_locked_at;
    }

    this.spendItems.set(updated.id, updated);
    return updated;
  }

  async findApplicableSpendItemApprovalPolicy(
    spendItemType: SpendItemRecord['spend_item_type'],
    departmentId: string | null,
    baseCurrencyId: string,
    amountMinor: bigint,
  ): Promise<ResolvedSpendItemApprovalPolicy | null> {
    const candidates = this.spendItemApprovalPolicies
      .filter(
        (policy) =>
          policy.is_active &&
          policy.spend_item_type === spendItemType &&
          policy.base_currency_id === baseCurrencyId &&
          (policy.department_id === null || policy.department_id === departmentId),
      )
      .sort((left, right) => {
        const leftOverride = left.department_id !== null && left.department_id === departmentId ? 1 : 0;
        const rightOverride = right.department_id !== null && right.department_id === departmentId ? 1 : 0;
        if (leftOverride !== rightOverride) {
          return rightOverride - leftOverride;
        }
        return left.created_at.getTime() - right.created_at.getTime();
      });

    for (const policy of candidates) {
      const matchedRule = selectThresholdRule(
        policy.rules.map((rule) => ({
          id: rule.id,
          min_amount_minor: rule.min_amount_minor,
          max_amount_minor: rule.max_amount_minor,
          steps: rule.steps,
        })),
        amountMinor,
      );

      if (!matchedRule || matchedRule.steps.length === 0) {
        continue;
      }

      return {
        approval_policy_id: policy.id,
        approval_policy_code: policy.code,
        approval_policy_rule_id: matchedRule.id,
        min_amount_minor: matchedRule.min_amount_minor,
        max_amount_minor: matchedRule.max_amount_minor,
        steps: matchedRule.steps,
      };
    }

    return null;
  }

  async createApprovalInstanceForSpendItem(
    input: CreateSpendItemApprovalInstanceInput,
  ): Promise<{ approval_instance: ApprovalInstanceRecord; approval_steps: ApprovalStepRecord[] }> {
    if (input.steps.length === 0) {
      throw new Error('Approval steps are required');
    }

    const now = new Date();
    const instance: ApprovalInstanceRecord = {
      id: this.generateUuid(),
      approval_policy_id: input.approval_policy_id,
      entity_type: 'SPEND_ITEM',
      entity_id: input.spend_item_id,
      status: 'PENDING',
      requested_by_user_id: input.requested_by_user_id,
      started_at: now,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };

    const createdSteps = [...input.steps]
      .sort((left, right) => left.step_order - right.step_order)
      .map((step, index) => {
        const roleId = step.role_code ? this.ensureRoleId(step.role_code) : null;
        const stepRecord: ApprovalStepRecord = {
          id: this.generateUuid(),
          approval_instance_id: instance.id,
          step_order: index + 1,
          role_id: roleId,
          assigned_user_id: step.assigned_user_id ?? null,
          status: 'PENDING',
          acted_by_user_id: null,
          acted_at: null,
          comment: null,
          created_at: now,
          updated_at: now,
        };
        return stepRecord;
      });

    this.approvalInstances.push(instance);
    this.approvalSteps.push(...createdSteps);

    return {
      approval_instance: instance,
      approval_steps: createdSteps,
    };
  }

  async findPendingApprovalInstanceForSpendItem(spendItemId: string): Promise<ApprovalInstanceRecord | null> {
    const pending = this.approvalInstances
      .filter(
        (instance) =>
          instance.entity_type === 'SPEND_ITEM' &&
          instance.entity_id === spendItemId &&
          instance.status === 'PENDING',
      )
      .sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
    return pending[0] ?? null;
  }

  async listApprovalStepsForInstance(approvalInstanceId: string): Promise<ApprovalStepRecord[]> {
    return this.approvalSteps
      .filter((step) => step.approval_instance_id === approvalInstanceId)
      .sort((left, right) => left.step_order - right.step_order);
  }

  async updateApprovalStep(
    stepId: string,
    input: {
      status: ApprovalStepRecord['status'];
      acted_by_user_id: string;
      acted_at: Date;
      comment: string;
    },
  ): Promise<ApprovalStepRecord> {
    const index = this.approvalSteps.findIndex((step) => step.id === stepId);
    if (index < 0) {
      throw new Error('Approval step not found');
    }

    const existing = this.approvalSteps[index];
    if (!existing) {
      throw new Error('Approval step not found');
    }
    const updated: ApprovalStepRecord = {
      ...existing,
      status: input.status,
      acted_by_user_id: input.acted_by_user_id,
      acted_at: input.acted_at,
      comment: input.comment,
      updated_at: new Date(),
    };
    this.approvalSteps[index] = updated;
    return updated;
  }

  async updateApprovalInstance(
    approvalInstanceId: string,
    input: {
      status: ApprovalInstanceRecord['status'];
      completed_at?: Date | null;
    },
  ): Promise<ApprovalInstanceRecord> {
    const index = this.approvalInstances.findIndex((instance) => instance.id === approvalInstanceId);
    if (index < 0) {
      throw new Error('Approval instance not found');
    }

    const existing = this.approvalInstances[index];
    if (!existing) {
      throw new Error('Approval instance not found');
    }
    const updated: ApprovalInstanceRecord = {
      ...existing,
      status: input.status,
      completed_at: input.completed_at ?? existing.completed_at,
      updated_at: new Date(),
    };
    this.approvalInstances[index] = updated;
    return updated;
  }

  async listSpendItemApprovalQueue(userId: string, roleCodes: string[]): Promise<SpendItemApprovalQueueItem[]> {
    const allowedRoleIds = new Set(roleCodes.map((roleCode) => this.ensureRoleId(roleCode)));

    const queueItems: SpendItemApprovalQueueItem[] = [];
    const pendingInstances = this.approvalInstances
      .filter((instance) => instance.entity_type === 'SPEND_ITEM' && instance.status === 'PENDING')
      .sort((left, right) => left.started_at.getTime() - right.started_at.getTime());

    for (const instance of pendingInstances) {
      const spendItem = this.spendItems.get(instance.entity_id);
      if (!spendItem) {
        continue;
      }

      if (!['SUBMITTED', 'UNDER_REVIEW'].includes(spendItem.status)) {
        continue;
      }

      if (spendItem.created_by_user_id !== null && spendItem.created_by_user_id === userId) {
        continue;
      }

      const pendingStep = this.approvalSteps
        .filter((step) => step.approval_instance_id === instance.id && step.status === 'PENDING')
        .sort((left, right) => left.step_order - right.step_order)[0];

      if (!pendingStep) {
        continue;
      }

      const isAssignedUser = pendingStep.assigned_user_id !== null && pendingStep.assigned_user_id === userId;
      const hasEligibleRole = pendingStep.role_id !== null && allowedRoleIds.has(pendingStep.role_id);
      if (!isAssignedUser && !hasEligibleRole) {
        continue;
      }

      queueItems.push({
        spend_item_id: spendItem.id,
        spend_item_status: spendItem.status,
        spend_item_type: spendItem.spend_item_type,
        spend_item_amount_minor: spendItem.amount_minor,
        spend_item_base_amount_minor: spendItem.base_amount_minor,
        spend_item_currency_id: spendItem.currency_id,
        spend_item_base_currency_id: spendItem.base_currency_id,
        spend_item_created_by_user_id: spendItem.created_by_user_id,
        approval_instance_id: instance.id,
        approval_instance_status: instance.status,
        approval_step_id: pendingStep.id,
        approval_step_order: pendingStep.step_order,
        approval_step_role_id: pendingStep.role_id,
        approval_step_assigned_user_id: pendingStep.assigned_user_id,
        requested_by_user_id: instance.requested_by_user_id,
        requested_at: instance.started_at,
      });
    }

    return queueItems.sort((left, right) => {
      const byRequestedAt = left.requested_at.getTime() - right.requested_at.getTime();
      if (byRequestedAt !== 0) {
        return byRequestedAt;
      }
      return left.approval_step_order - right.approval_step_order;
    });
  }

  async findFinalApproverForSpendItem(spendItemId: string): Promise<string | null> {
    const latestApprovedInstance = this.approvalInstances
      .filter(
        (instance) =>
          instance.entity_type === 'SPEND_ITEM' &&
          instance.entity_id === spendItemId &&
          instance.status === 'APPROVED',
      )
      .sort((left, right) => {
        const leftCompletedAt = left.completed_at?.getTime() ?? 0;
        const rightCompletedAt = right.completed_at?.getTime() ?? 0;
        if (leftCompletedAt !== rightCompletedAt) {
          return rightCompletedAt - leftCompletedAt;
        }
        return right.created_at.getTime() - left.created_at.getTime();
      })[0];

    if (!latestApprovedInstance) {
      return null;
    }

    const finalApprovedStep = this.approvalSteps
      .filter(
        (step) =>
          step.approval_instance_id === latestApprovedInstance.id &&
          step.status === 'APPROVED' &&
          step.acted_by_user_id !== null,
      )
      .sort((left, right) => {
        if (left.step_order !== right.step_order) {
          return right.step_order - left.step_order;
        }
        const leftActedAt = left.acted_at?.getTime() ?? 0;
        const rightActedAt = right.acted_at?.getTime() ?? 0;
        return rightActedAt - leftActedAt;
      })[0];

    return finalApprovedStep?.acted_by_user_id ?? null;
  }

  async listPendingPaymentSpendItems(
    filters: ListPendingPaymentSpendItemsFilters,
    pagination: ListPendingPaymentSpendItemsPagination,
  ): Promise<{ items: SpendItemRecord[]; total: number }> {
    let items = [...this.spendItems.values()].filter((spendItem) => spendItem.status === 'APPROVED');

    if (filters.department_id !== undefined) {
      items = items.filter((item) => item.department_id === filters.department_id);
    }
    if (filters.currency_id !== undefined) {
      items = items.filter((item) => item.currency_id === filters.currency_id);
    }
    if (filters.spend_item_type !== undefined) {
      items = items.filter((item) => item.spend_item_type === filters.spend_item_type);
    }

    items.sort((left, right) => {
      const leftApprovedAt = left.approved_at?.getTime() ?? left.created_at.getTime();
      const rightApprovedAt = right.approved_at?.getTime() ?? right.created_at.getTime();
      if (leftApprovedAt !== rightApprovedAt) {
        return leftApprovedAt - rightApprovedAt;
      }
      return left.created_at.getTime() - right.created_at.getTime();
    });

    const total = items.length;
    const offset = (pagination.page - 1) * pagination.page_size;
    const paged = items.slice(offset, offset + pagination.page_size);
    return { items: paged, total };
  }

  async listSpendItems(filters: ListSpendItemsFilters): Promise<SpendItemRecord[]> {
    let items = [...this.spendItems.values()];

    if (filters.status !== undefined) {
      items = items.filter((item) => item.status === filters.status);
    }
    if (filters.department_id !== undefined) {
      items = items.filter((item) => item.department_id === filters.department_id);
    }
    if (filters.currency_id !== undefined) {
      items = items.filter((item) => item.currency_id === filters.currency_id);
    }
    if (filters.spend_item_type !== undefined) {
      items = items.filter((item) => item.spend_item_type === filters.spend_item_type);
    }
    if (filters.created_by_user_id !== undefined) {
      items = items.filter((item) => item.created_by_user_id === filters.created_by_user_id);
    }
    if (filters.incurred_from !== undefined) {
      const incurredFromMs = filters.incurred_from.getTime();
      items = items.filter((item) => item.incurred_at.getTime() >= incurredFromMs);
    }
    if (filters.incurred_to !== undefined) {
      const incurredToMs = filters.incurred_to.getTime();
      items = items.filter((item) => item.incurred_at.getTime() <= incurredToMs);
    }
    if (filters.submitted_from !== undefined) {
      const submittedFromMs = filters.submitted_from.getTime();
      items = items.filter(
        (item) =>
          item.submitted_at !== null &&
          item.submitted_at.getTime() >= submittedFromMs,
      );
    }
    if (filters.submitted_to !== undefined) {
      const submittedToMs = filters.submitted_to.getTime();
      items = items.filter(
        (item) =>
          item.submitted_at !== null &&
          item.submitted_at.getTime() <= submittedToMs,
      );
    }

    return items.sort((left, right) => {
      const byCreatedAt = right.created_at.getTime() - left.created_at.getTime();
      if (byCreatedAt !== 0) {
        return byCreatedAt;
      }
      return right.id.localeCompare(left.id);
    });
  }

  async listSpendItemFiles(spendItemId: string): Promise<FileRecord[]> {
    const prefix = `${spendItemId}:`;
    const fileIds = [...this.spendItemFiles]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));

    return fileIds
      .map((fileId) => this.files.get(fileId))
      .filter((file): file is FileRecord => file !== undefined);
  }

  async createFile(input: CreateFileInput): Promise<FileRecord> {
    const now = new Date();
    const file: FileRecord = {
      id: this.generateUuid(),
      storage_key: input.storage_key,
      file_name: input.file_name,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      checksum_sha256: input.checksum_sha256 ?? null,
      created_at: now,
      updated_at: now,
    };

    const hasStorageKey = [...this.files.values()].some(
      (existing) => existing.storage_key === input.storage_key,
    );
    if (hasStorageKey) {
      throw new Error('Duplicate storage key');
    }

    this.files.set(file.id, file);
    return file;
  }

  async createPaymentRequestDraft(input: CreatePaymentRequestDraftInput): Promise<PaymentRequestRecord> {
    const now = new Date();
    const paymentRequest: PaymentRequestRecord = {
      id: this.generateUuid(),
      request_number: input.request_number,
      spend_item_id: input.spend_item_id,
      vendor_id: input.vendor_id ?? null,
      department_id: input.department_id,
      currency_id: input.currency_id,
      base_currency_id: null,
      requested_by_user_id: input.requested_by_user_id,
      requested_amount_minor: input.requested_amount_minor,
      approved_amount_minor: null,
      base_amount_minor: null,
      fx_rate_ppm: null,
      fx_rate_locked_at: null,
      status: 'DRAFT',
      requested_at: now,
      due_at: input.due_at ?? null,
      submitted_at: null,
      created_at: now,
      updated_at: now,
    };

    this.paymentRequests.set(paymentRequest.id, paymentRequest);
    return paymentRequest;
  }

  async findPaymentRequestById(id: string): Promise<PaymentRequestRecord | null> {
    return this.paymentRequests.get(id) ?? null;
  }

  async updatePaymentRequest(id: string, input: UpdatePaymentRequestInput): Promise<PaymentRequestRecord> {
    const existing = this.paymentRequests.get(id);
    if (!existing) {
      throw new Error('Payment request not found');
    }

    const updated: PaymentRequestRecord = {
      ...existing,
      updated_at: new Date(),
    };

    if (input.vendor_id !== undefined) {
      updated.vendor_id = input.vendor_id;
    }
    if (input.department_id !== undefined) {
      updated.department_id = input.department_id;
    }
    if (input.requested_amount_minor !== undefined) {
      updated.requested_amount_minor = input.requested_amount_minor;
    }
    if (input.due_at !== undefined) {
      updated.due_at = input.due_at;
    }
    if (input.base_currency_id !== undefined) {
      updated.base_currency_id = input.base_currency_id;
    }
    if (input.base_amount_minor !== undefined) {
      updated.base_amount_minor = input.base_amount_minor;
    }
    if (input.fx_rate_ppm !== undefined) {
      updated.fx_rate_ppm = input.fx_rate_ppm;
    }
    if (input.fx_rate_locked_at !== undefined) {
      updated.fx_rate_locked_at = input.fx_rate_locked_at;
    }
    if (input.submitted_at !== undefined) {
      updated.submitted_at = input.submitted_at;
    }
    if (input.status !== undefined) {
      updated.status = input.status;
    }

    this.paymentRequests.set(id, updated);
    return updated;
  }

  async listPaymentRequests(
    filters: ListPaymentRequestsFilters,
    pagination: ListPaymentRequestsPagination,
  ): Promise<{ items: PaymentRequestRecord[]; total: number }> {
    let items = [...this.paymentRequests.values()];

    if (filters.status !== undefined) {
      items = items.filter((item) => item.status === filters.status);
    }
    if (filters.department_id !== undefined) {
      items = items.filter((item) => item.department_id === filters.department_id);
    }
    if (filters.requested_by_user_id !== undefined) {
      items = items.filter((item) => item.requested_by_user_id === filters.requested_by_user_id);
    }
    if (filters.currency_id !== undefined) {
      items = items.filter((item) => item.currency_id === filters.currency_id);
    }

    items.sort((left, right) => {
      const byCreatedAt = right.created_at.getTime() - left.created_at.getTime();
      if (byCreatedAt !== 0) {
        return byCreatedAt;
      }
      return right.id.localeCompare(left.id);
    });

    const total = items.length;
    const offset = (pagination.page - 1) * pagination.page_size;
    const paged = items.slice(offset, offset + pagination.page_size);

    return {
      items: paged,
      total,
    };
  }

  async fileExists(fileId: string): Promise<boolean> {
    return this.files.has(fileId);
  }

  async attachFileToSpendItem(spendItemId: string, fileId: string): Promise<{ created: boolean }> {
    const key = `${spendItemId}:${fileId}`;
    if (this.spendItemFiles.has(key)) {
      return { created: false };
    }

    this.spendItemFiles.add(key);
    return { created: true };
  }

  async attachFileToPaymentRequest(
    paymentRequestId: string,
    fileId: string,
  ): Promise<{ created: boolean }> {
    const paymentRequest = this.paymentRequests.get(paymentRequestId);
    if (!paymentRequest || !paymentRequest.spend_item_id) {
      throw new Error('Payment request has no linked spend item');
    }

    return this.attachFileToSpendItem(paymentRequest.spend_item_id, fileId);
  }

  async listPaymentRequestFiles(paymentRequestId: string): Promise<FileRecord[]> {
    const paymentRequest = this.paymentRequests.get(paymentRequestId);
    if (!paymentRequest || !paymentRequest.spend_item_id) {
      return [];
    }

    return this.listSpendItemFiles(paymentRequest.spend_item_id);
  }

  async createExternalInvoice(input: CreateExternalInvoiceInput): Promise<ExternalInvoiceRecord> {
    const now = new Date();
    const externalInvoice: ExternalInvoiceRecord = {
      id: this.generateUuid(),
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
      created_at: now,
      updated_at: now,
    };

    this.externalInvoices.set(externalInvoice.id, externalInvoice);
    return externalInvoice;
  }

  async findExternalInvoiceById(id: string): Promise<ExternalInvoiceRecord | null> {
    return this.externalInvoices.get(id) ?? null;
  }

  async findExternalInvoiceByVendorInvoice(
    vendorId: string,
    invoiceNumber: string,
  ): Promise<ExternalInvoiceRecord | null> {
    const matches = [...this.externalInvoices.values()]
      .filter((invoice) => invoice.vendor_id === vendorId && invoice.invoice_number === invoiceNumber)
      .sort((left, right) => right.created_at.getTime() - left.created_at.getTime());

    return matches[0] ?? null;
  }

  async listExternalInvoices(
    filters: ListExternalInvoicesFilters,
    pagination: ListExternalInvoicesPagination,
  ): Promise<{ items: ExternalInvoiceRecord[]; total: number }> {
    let items = [...this.externalInvoices.values()];

    if (filters.vendor_id !== undefined) {
      items = items.filter((item) => item.vendor_id === filters.vendor_id);
    }
    if (filters.currency_id !== undefined) {
      items = items.filter((item) => item.currency_id === filters.currency_id);
    }
    if (filters.spend_item_id !== undefined) {
      items = items.filter((item) => item.spend_item_id === filters.spend_item_id);
    }
    if (filters.invoice_number !== undefined) {
      items = items.filter((item) => item.invoice_number === filters.invoice_number);
    }
    if (filters.status !== undefined) {
      items = items.filter((item) => item.status === filters.status);
    }

    items.sort((left, right) => {
      const byCreatedAt = right.created_at.getTime() - left.created_at.getTime();
      if (byCreatedAt !== 0) {
        return byCreatedAt;
      }
      return right.id.localeCompare(left.id);
    });

    const total = items.length;
    const offset = (pagination.page - 1) * pagination.page_size;
    const paged = items.slice(offset, offset + pagination.page_size);

    return {
      items: paged,
      total,
    };
  }

  async createInternalInvoice(
    invoice: CreateInternalInvoiceInput,
    lineItems: CreateInternalInvoiceLineItemInput[],
  ): Promise<{ invoice: InternalInvoiceRecord; line_items: InternalInvoiceLineItemRecord[] }> {
    const now = new Date();
    const internalInvoice: InternalInvoiceRecord = {
      id: this.generateUuid(),
      payment_request_id: null,
      spend_item_id: invoice.spend_item_id,
      vendor_id: null,
      from_department_id: invoice.from_department_id,
      to_department_id: invoice.to_department_id,
      currency_id: invoice.currency_id,
      created_by_user_id: invoice.created_by_user_id ?? null,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date ?? null,
      total_amount_minor: invoice.total_amount_minor,
      status: invoice.status ?? 'DRAFT',
      submitted_at: null,
      created_at: now,
      updated_at: now,
    };

    this.internalInvoices.set(internalInvoice.id, internalInvoice);

    const createdLineItems = lineItems.map((lineItem) => {
      const createdLineItem: InternalInvoiceLineItemRecord = {
        id: this.generateUuid(),
        internal_invoice_id: internalInvoice.id,
        department_id: lineItem.department_id ?? null,
        description: lineItem.description,
        quantity: new Prisma.Decimal(lineItem.quantity ?? 1),
        unit_amount_minor: lineItem.unit_amount_minor,
        line_amount_minor: lineItem.line_amount_minor,
        created_at: now,
        updated_at: now,
      };
      this.internalInvoiceLineItems.set(createdLineItem.id, createdLineItem);
      return createdLineItem;
    });

    return {
      invoice: internalInvoice,
      line_items: createdLineItems,
    };
  }

  async findInternalInvoiceById(id: string): Promise<InternalInvoiceRecord | null> {
    return this.internalInvoices.get(id) ?? null;
  }

  async listInternalInvoices(
    filters: ListInternalInvoicesFilters,
    pagination: ListInternalInvoicesPagination,
  ): Promise<{ items: InternalInvoiceRecord[]; total: number }> {
    let items = [...this.internalInvoices.values()];

    if (filters.from_department_id !== undefined) {
      items = items.filter((item) => item.from_department_id === filters.from_department_id);
    }
    if (filters.to_department_id !== undefined) {
      items = items.filter((item) => item.to_department_id === filters.to_department_id);
    }
    if (filters.currency_id !== undefined) {
      items = items.filter((item) => item.currency_id === filters.currency_id);
    }
    if (filters.created_by_user_id !== undefined) {
      items = items.filter((item) => item.created_by_user_id === filters.created_by_user_id);
    }
    if (filters.status !== undefined) {
      items = items.filter((item) => item.status === filters.status);
    }

    items.sort((left, right) => {
      const byCreatedAt = right.created_at.getTime() - left.created_at.getTime();
      if (byCreatedAt !== 0) {
        return byCreatedAt;
      }
      return right.id.localeCompare(left.id);
    });

    const total = items.length;
    const offset = (pagination.page - 1) * pagination.page_size;
    const paged = items.slice(offset, offset + pagination.page_size);

    return {
      items: paged,
      total,
    };
  }

  async listInternalInvoiceLineItems(internalInvoiceId: string): Promise<InternalInvoiceLineItemRecord[]> {
    return [...this.internalInvoiceLineItems.values()]
      .filter((lineItem) => lineItem.internal_invoice_id === internalInvoiceId)
      .sort((left, right) => left.created_at.getTime() - right.created_at.getTime());
  }

  async updateInternalInvoice(id: string, input: UpdateInternalInvoiceInput): Promise<InternalInvoiceRecord> {
    const existing = this.internalInvoices.get(id);
    if (!existing) {
      throw new Error('Internal invoice not found');
    }

    const updated: InternalInvoiceRecord = {
      ...existing,
      status: input.status ?? existing.status,
      submitted_at: input.submitted_at ?? existing.submitted_at,
      updated_at: new Date(),
    };

    this.internalInvoices.set(id, updated);
    return updated;
  }

  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeRecord> {
    const emailExists = [...this.employees.values()].some((employee) => employee.email === input.email);
    if (emailExists) {
      throw new Error('Employee email conflict');
    }

    const currentTime = new Date();
    const created: EmployeeRecord = {
      id: this.generateUuid(),
      user_id: this.generateUuid(),
      department_id: input.department_id ?? null,
      salary_currency_id: input.currency_id,
      employee_number: `EMP-${Math.floor(Math.random() * 1_000_000)
        .toString()
        .padStart(6, '0')}`,
      legal_name: input.name,
      hire_date: currentTime,
      termination_date: null,
      base_salary_minor: input.salary_minor,
      is_active: input.status !== 'INACTIVE',
      status: input.status ?? 'ACTIVE',
      bank_details_encrypted: input.bank_details_encrypted,
      created_at: currentTime,
      updated_at: currentTime,
      email: input.email,
    };

    this.employees.set(created.id, created);
    return created;
  }

  async findEmployeeById(id: string): Promise<EmployeeRecord | null> {
    return this.employees.get(id) ?? null;
  }

  async updateEmployee(id: string, input: UpdateEmployeeInput): Promise<EmployeeRecord> {
    const existing = this.employees.get(id);
    if (!existing) {
      throw new Error('Employee not found');
    }

    if (input.email !== undefined) {
      const duplicate = [...this.employees.values()].some(
        (employee) => employee.id !== id && employee.email === input.email,
      );
      if (duplicate) {
        throw new Error('Employee email conflict');
      }
    }

    const updated: EmployeeRecord = {
      ...existing,
      legal_name: input.name ?? existing.legal_name,
      email: input.email ?? existing.email,
      department_id: input.department_id ?? existing.department_id,
      salary_currency_id: input.currency_id ?? existing.salary_currency_id,
      base_salary_minor: input.salary_minor ?? existing.base_salary_minor,
      status: input.status ?? existing.status,
      is_active: input.status ? input.status !== 'INACTIVE' : existing.is_active,
      bank_details_encrypted: input.bank_details_encrypted ?? existing.bank_details_encrypted,
      updated_at: new Date(),
    };

    this.employees.set(id, updated);
    return updated;
  }

  async deleteEmployee(id: string): Promise<void> {
    const hasPayrollHistory = [...this.payrollRunItems.values()].some((item) => item.employee_id === id);
    if (hasPayrollHistory) {
      throw new Error('Cannot delete employee with payroll history');
    }
    this.employees.delete(id);
  }

  async listEmployees(
    filters: ListEmployeesFilters,
    pagination: ListEmployeesPagination,
  ): Promise<{ items: EmployeeRecord[]; total: number }> {
    let items = [...this.employees.values()];

    if (filters.department_id !== undefined) {
      items = items.filter((item) => item.department_id === filters.department_id);
    }
    if (filters.currency_id !== undefined) {
      items = items.filter((item) => item.salary_currency_id === filters.currency_id);
    }
    if (filters.status !== undefined) {
      items = items.filter((item) => item.status === filters.status);
    }

    items.sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
    const total = items.length;
    const offset = (pagination.page - 1) * pagination.page_size;
    return { items: items.slice(offset, offset + pagination.page_size), total };
  }

  async findActiveEmployeesForPayrollCurrency(currencyId: string): Promise<EmployeeRecord[]> {
    return [...this.employees.values()]
      .filter(
        (employee) =>
          employee.salary_currency_id === currencyId && employee.status === 'ACTIVE' && employee.is_active,
      )
      .sort((left, right) => left.legal_name.localeCompare(right.legal_name));
  }

  async createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollRunRecord> {
    const duplicate = [...this.payrollRuns.values()].some(
      (run) =>
        run.period_start?.getTime() === input.period_start.getTime() &&
        run.period_end?.getTime() === input.period_end.getTime() &&
        run.currency_id === input.currency_id,
    );
    if (duplicate) {
      throw new Error('Payroll run already exists for period and currency');
    }

    const currentTime = new Date();
    const created: PayrollRunRecord = {
      id: this.generateUuid(),
      run_number: input.run_number,
      period_start: input.period_start,
      period_end: input.period_end,
      pay_date: input.pay_date ?? null,
      currency_id: input.currency_id,
      spend_item_id: null,
      created_by_user_id: input.created_by_user_id ?? null,
      status: 'DRAFT',
      total_gross_minor: null,
      total_net_minor: null,
      submitted_at: null,
      payment_reference: null,
      paid_at: null,
      created_at: currentTime,
      updated_at: currentTime,
    };

    this.payrollRuns.set(created.id, created);
    return created;
  }

  async findPayrollRunById(id: string): Promise<PayrollRunRecord | null> {
    return this.payrollRuns.get(id) ?? null;
  }

  async findPayrollRunBySpendItemId(spendItemId: string): Promise<PayrollRunRecord | null> {
    return (
      [...this.payrollRuns.values()].find((run) => run.spend_item_id !== null && run.spend_item_id === spendItemId) ??
      null
    );
  }

  async updatePayrollRun(id: string, input: UpdatePayrollRunInput): Promise<PayrollRunRecord> {
    const existing = this.payrollRuns.get(id);
    if (!existing) {
      throw new Error('Payroll run not found');
    }

    const updated: PayrollRunRecord = {
      ...existing,
      spend_item_id: input.spend_item_id ?? existing.spend_item_id,
      status: input.status ?? existing.status,
      total_gross_minor: input.total_gross_minor ?? existing.total_gross_minor,
      total_net_minor: input.total_net_minor ?? existing.total_net_minor,
      submitted_at: input.submitted_at ?? existing.submitted_at,
      payment_reference: input.payment_reference ?? existing.payment_reference,
      paid_at: input.paid_at ?? existing.paid_at,
      updated_at: new Date(),
    };

    this.payrollRuns.set(id, updated);
    return updated;
  }

  async listPayrollRuns(
    pagination: {
      page: number;
      page_size: number;
    },
  ): Promise<{ items: PayrollRunRecord[]; total: number }> {
    const all = [...this.payrollRuns.values()].sort(
      (left, right) => right.created_at.getTime() - left.created_at.getTime(),
    );
    const total = all.length;
    const offset = (pagination.page - 1) * pagination.page_size;
    return {
      items: all.slice(offset, offset + pagination.page_size),
      total,
    };
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
    for (const existing of [...this.payrollRunItems.values()]) {
      if (existing.payroll_run_id === payrollRunId) {
        this.payrollRunItems.delete(existing.id);
      }
    }

    const created: PayrollRunItemRecord[] = [];
    for (const snapshot of employeeSnapshots) {
      const item: PayrollRunItemRecord = {
        id: this.generateUuid(),
        payroll_run_id: payrollRunId,
        employee_id: snapshot.employee_id,
        currency_id: snapshot.currency_id,
        gross_pay_minor: snapshot.gross_pay_minor,
        deductions_minor: snapshot.deductions_minor,
        net_pay_minor: snapshot.net_pay_minor,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.payrollRunItems.set(item.id, item);
      created.push(item);
    }

    return created;
  }

  async listPayrollRunItems(payrollRunId: string): Promise<PayrollRunItemDetailRecord[]> {
    return [...this.payrollRunItems.values()]
      .filter((item) => item.payroll_run_id === payrollRunId)
      .sort((left, right) => left.created_at.getTime() - right.created_at.getTime())
      .map((item) => {
        const employee = this.employees.get(item.employee_id);
        return {
          ...item,
          employee_legal_name: employee?.legal_name ?? 'Unknown',
          employee_email: employee?.email ?? 'unknown@example.com',
        };
      });
  }

  async findPayrollRunItemByRunEmployee(
    payrollRunId: string,
    employeeId: string,
  ): Promise<PayrollRunItemRecord | null> {
    return (
      [...this.payrollRunItems.values()].find(
        (item) => item.payroll_run_id === payrollRunId && item.employee_id === employeeId,
      ) ?? null
    );
  }

  async updatePayrollRunItem(
    payrollRunItemId: string,
    input: {
      gross_pay_minor?: bigint;
      deductions_minor?: bigint;
      net_pay_minor?: bigint;
    },
  ): Promise<PayrollRunItemRecord> {
    const existing = this.payrollRunItems.get(payrollRunItemId);
    if (!existing) {
      throw new Error('Payroll run item not found');
    }

    const updated: PayrollRunItemRecord = {
      ...existing,
      gross_pay_minor: input.gross_pay_minor ?? existing.gross_pay_minor,
      deductions_minor: input.deductions_minor ?? existing.deductions_minor,
      net_pay_minor: input.net_pay_minor ?? existing.net_pay_minor,
      updated_at: new Date(),
    };
    this.payrollRunItems.set(payrollRunItemId, updated);
    return updated;
  }

  async createPayrollAdjustment(
    input: CreatePayrollAdjustmentInput & {
      payroll_run_id: string;
      payroll_run_item_id: string;
      currency_id: string;
    },
  ): Promise<PayrollAdjustmentRecord> {
    const currentTime = new Date();
    const adjustment: PayrollAdjustmentRecord = {
      id: this.generateUuid(),
      payroll_run_id: input.payroll_run_id,
      payroll_run_item_id: input.payroll_run_item_id,
      employee_id: input.employee_id,
      currency_id: input.currency_id,
      created_by_user_id: input.created_by_user_id ?? null,
      adjustment_type: input.adjustment_type,
      amount_minor: input.amount_minor,
      reason: input.reason,
      effective_at: currentTime,
      created_at: currentTime,
      updated_at: currentTime,
    };
    this.payrollAdjustments.set(adjustment.id, adjustment);
    return adjustment;
  }

  async listPayrollAdjustments(payrollRunId: string): Promise<PayrollAdjustmentRecord[]> {
    return [...this.payrollAdjustments.values()]
      .filter((adjustment) => adjustment.payroll_run_id === payrollRunId)
      .sort((left, right) => left.created_at.getTime() - right.created_at.getTime());
  }

  async listApprovalInstancesForSpendItem(spendItemId: string): Promise<ApprovalInstanceRecord[]> {
    return this.approvalInstances.filter(
      (instance) => instance.entity_type === 'SPEND_ITEM' && instance.entity_id === spendItemId,
    );
  }

  async createApprovalInstanceForPaymentRequest(
    paymentRequestId: string,
    requestedByUserId: string,
  ): Promise<ApprovalInstanceRecord> {
    const now = new Date();
    const instance: ApprovalInstanceRecord = {
      id: this.generateUuid(),
      approval_policy_id: null,
      entity_type: 'PAYMENT_REQUEST',
      entity_id: paymentRequestId,
      status: 'PENDING',
      requested_by_user_id: requestedByUserId,
      started_at: now,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };

    this.approvalInstances.push(instance);
    return instance;
  }

  async createApprovalInstanceForInternalInvoice(
    internalInvoiceId: string,
    requestedByUserId: string,
  ): Promise<ApprovalInstanceRecord> {
    const now = new Date();
    const instance: ApprovalInstanceRecord = {
      id: this.generateUuid(),
      approval_policy_id: null,
      entity_type: 'INTERNAL_INVOICE',
      entity_id: internalInvoiceId,
      status: 'PENDING',
      requested_by_user_id: requestedByUserId,
      started_at: now,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };

    this.approvalInstances.push(instance);
    return instance;
  }

  async listApprovalInstancesForPaymentRequest(
    paymentRequestId: string,
  ): Promise<ApprovalInstanceRecord[]> {
    return this.approvalInstances.filter(
      (instance) => instance.entity_type === 'PAYMENT_REQUEST' && instance.entity_id === paymentRequestId,
    );
  }

  async listApprovalInstancesForInternalInvoice(
    internalInvoiceId: string,
  ): Promise<ApprovalInstanceRecord[]> {
    return this.approvalInstances.filter(
      (instance) => instance.entity_type === 'INTERNAL_INVOICE' && instance.entity_id === internalInvoiceId,
    );
  }

  async createAuditEvent(input: CreateAuditEventInput): Promise<AuditEventRecord> {
    const currentTime = input.occurred_at ?? new Date();
    const event: AuditEventRecord = {
      id: this.generateUuid(),
      actor_user_id: input.actor_user_id ?? null,
      event_type: input.event_type,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      payload: input.payload ?? null,
      occurred_at: currentTime,
      created_at: currentTime,
      updated_at: currentTime,
    };

    this.auditEvents.push(event);
    return event;
  }

  async listAuditEvents(entityType: string, entityId: string): Promise<AuditEventRecord[]> {
    return this.auditEvents
      .filter((event) => event.entity_type === entityType && event.entity_id === entityId)
      .sort((left, right) => left.occurred_at.getTime() - right.occurred_at.getTime());
  }

  private ensureRoleId(roleCode: string): string {
    const existing = this.roleIdByCode.get(roleCode);
    if (existing) {
      return existing;
    }

    const roleId = this.generateUuid();
    this.roleIdByCode.set(roleCode, roleId);
    return roleId;
  }

  private generateUuid(): string {
    const tail = this.idCounter.toString(16).padStart(12, '0');
    this.idCounter += 1;
    return `00000000-0000-4000-8000-${tail}`;
  }
}

describe('api routes', () => {
  const adminUserId = '11111111-1111-4111-8111-111111111111';
  const financeUserId = '22222222-2222-4222-8222-222222222222';
  const employeeUserId = '33333333-3333-4333-8333-333333333333';
  const deptHeadAUserId = '44444444-4444-4444-8444-444444444444';
  const deptHeadBUserId = '55555555-5555-4555-8555-555555555555';
  const payorUserId = '66666666-6666-4666-8666-666666666666';
  const payrollAdminUserId = '77777777-7777-4777-8777-777777777777';
  const departmentAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const departmentBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ngnCurrencyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const gbpCurrencyId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const vendorAId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const vendorBId = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  const fixedNow = new Date('2026-03-01T10:00:00.000Z');

  function createTestApp() {
    const financeRepository = new InMemoryFinanceRepository();
    financeRepository.setCurrency({ id: ngnCurrencyId, code: 'NGN' });
    financeRepository.setCurrency({ id: gbpCurrencyId, code: 'GBP' });
    financeRepository.setDepartment({
      id: departmentAId,
      code: 'NG-OPS',
      name: 'Nigeria Operations',
    });
    financeRepository.setDepartment({
      id: departmentBId,
      code: 'UK-OPS',
      name: 'UK Operations',
    });
    financeRepository.setUserRoleCodes(adminUserId, ['ADMIN']);
    financeRepository.setUserRoleCodes(financeUserId, ['FINANCE']);
    financeRepository.setUserRoleCodes(employeeUserId, ['EMPLOYEE']);
    financeRepository.setUserRoleCodes(deptHeadAUserId, ['DEPT_HEAD']);
    financeRepository.setUserRoleCodes(deptHeadBUserId, ['DEPT_HEAD']);
    financeRepository.setUserRoleCodes(payorUserId, ['PAYOR', 'DEPT_HEAD']);
    financeRepository.setUserRoleCodes(payrollAdminUserId, ['PAYROLL_ADMIN']);
    financeRepository.setUserDepartmentIds(deptHeadAUserId, [departmentAId]);
    financeRepository.setUserDepartmentIds(deptHeadBUserId, [departmentBId]);
    financeRepository.seedDefaultSpendItemPolicies([ngnCurrencyId, gbpCurrencyId]);

    return {
      app: createApp({
        financeRepository,
        now: () => fixedNow,
      }),
      financeRepository,
    };
  }

  async function createSpendItem(
    app: ReturnType<typeof createTestApp>['app'],
    departmentId = departmentAId,
    vendorId?: string,
    amountMinor = '120000',
    createdByUserId = deptHeadAUserId,
  ) {
    const response = await request(app).post('/spend-items').send({
      vendor_id: vendorId,
      department_id: departmentId,
      currency_id: gbpCurrencyId,
      created_by_user_id: createdByUserId,
      description: 'Cloud hosting invoice',
      amount_minor: amountMinor,
      incurred_at: '2026-03-01T08:00:00.000Z',
    });

    expect(response.status).toBe(201);
    return response.body.spend_item.id as string;
  }

  async function createDraftPaymentRequest(
    app: ReturnType<typeof createTestApp>['app'],
    spendItemId: string,
    userId = deptHeadAUserId,
  ) {
    const response = await request(app)
      .post('/payment-requests')
      .set('x-user-id', userId)
      .send({
        spend_item_id: spendItemId,
      });

    expect(response.status).toBe(201);
    return response.body.payment_request.id as string;
  }

  async function createFxSnapshot(app: ReturnType<typeof createTestApp>['app'], fxRatePpm = '800000') {
    const response = await request(app)
      .post('/fx-rates')
      .set('x-user-id', financeUserId)
      .send({
        base_currency_id: ngnCurrencyId,
        quote_currency_id: gbpCurrencyId,
        fx_rate_ppm: fxRatePpm,
        effective_at: '2026-03-01T09:00:00.000Z',
      });

    expect(response.status).toBe(201);
  }

  async function createInternalInvoice(app: ReturnType<typeof createTestApp>['app'], userId = deptHeadAUserId) {
    const response = await request(app)
      .post('/internal-invoices')
      .set('x-user-id', userId)
      .send({
        from_department_id: departmentAId,
        to_department_id: departmentBId,
        currency_id: gbpCurrencyId,
        base_currency_id: gbpCurrencyId,
        invoice_number: `INT-${Math.floor(Math.random() * 100000)}`,
        invoice_date: '2026-03-01',
        line_items: [
          {
            description: 'Shared infrastructure allocation',
            quantity: 2,
            unit_amount_minor: '50000',
          },
          {
            description: 'People operations allocation',
            quantity: 1,
            unit_amount_minor: '30000',
          },
        ],
        attachments: [
          {
            storage_key: `internal-invoices/${Math.floor(Math.random() * 100000)}-supporting.pdf`,
            file_name: 'supporting.pdf',
            mime_type: 'application/pdf',
            size_bytes: '1024',
          },
        ],
      });

    expect(response.status).toBe(201);
    return response;
  }

  async function createEmployee(
    app: ReturnType<typeof createTestApp>['app'],
    params: {
      name: string;
      email: string;
      department_id?: string;
      currency_id?: string;
      salary_minor?: string;
      status?: 'ACTIVE' | 'INACTIVE';
    },
    userId = payrollAdminUserId,
  ) {
    const response = await request(app)
      .post('/employees')
      .set('x-user-id', userId)
      .send({
        name: params.name,
        email: params.email,
        department_id: params.department_id ?? departmentAId,
        currency_id: params.currency_id ?? gbpCurrencyId,
        salary_minor: params.salary_minor ?? '100000',
        bank_details_json: {
          account_name: params.name,
          bank_name: 'Test Bank',
          account_number: '0001112223',
        },
        status: params.status ?? 'ACTIVE',
      });

    expect(response.status).toBe(201);
    return response.body.employee.id as string;
  }

  async function createPayrollRun(
    app: ReturnType<typeof createTestApp>['app'],
    currencyId = gbpCurrencyId,
    userId = payrollAdminUserId,
  ) {
    const response = await request(app)
      .post('/payroll-runs')
      .set('x-user-id', userId)
      .send({
        period_start: '2026-03-01',
        period_end: '2026-03-31',
        pay_date: '2026-03-31',
        currency_id: currencyId,
      });

    expect(response.status).toBe(201);
    return response.body.payroll_run.id as string;
  }

  it('returns service health', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('accepts and rejects user payloads correctly', async () => {
    const { app } = createTestApp();

    const invalidResponse = await request(app).post('/users').send({ name: '', email: 'not-an-email' });
    expect(invalidResponse.status).toBe(400);

    const validResponse = await request(app)
      .post('/users')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(validResponse.status).toBe(201);
  });

  it('rate limits the users auth endpoint', async () => {
    const { app } = createTestApp();

    for (let index = 0; index < 5; index += 1) {
      const response = await request(app)
        .post('/users')
        .send({ name: `Rate Limited User ${index}`, email: `rate-limited-${index}@example.com` });
      expect(response.status).toBe(201);
    }

    const blocked = await request(app)
      .post('/users')
      .send({ name: 'Blocked User', email: 'rate-limited-blocked@example.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('Too many requests');
  });

  it('allows only Admin/Finance to create FX snapshots and serves latest pair snapshot', async () => {
    const { app } = createTestApp();
    const payload = {
      base_currency_id: ngnCurrencyId,
      quote_currency_id: gbpCurrencyId,
      fx_rate_ppm: '850000',
      effective_at: '2026-03-01T09:00:00.000Z',
    };

    const noUserResponse = await request(app).post('/fx-rates').send(payload);
    expect(noUserResponse.status).toBe(401);

    const employeeResponse = await request(app)
      .post('/fx-rates')
      .set('x-user-id', employeeUserId)
      .send(payload);
    expect(employeeResponse.status).toBe(403);

    const financeResponse = await request(app)
      .post('/fx-rates')
      .set('x-user-id', financeUserId)
      .send(payload);
    expect(financeResponse.status).toBe(201);

    const latestResponse = await request(app).get('/fx-rates/latest').query({
      base_currency_id: ngnCurrencyId,
      quote_currency_id: gbpCurrencyId,
    });
    expect(latestResponse.status).toBe(200);
    expect(latestResponse.body.fx_rate.fx_rate_ppm).toBe('850000');
  });

  it('keeps locked spend item FX unchanged after newer FX snapshots', async () => {
    const { app } = createTestApp();

    await createFxSnapshot(app, '840000');
    const spendItemId = await createSpendItem(app);

    const submitResponse = await request(app)
      .post(`/spend-items/${spendItemId}/submit`)
      .send({
        base_currency_id: ngnCurrencyId,
        quote_currency_id: gbpCurrencyId,
      });
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.spend_item.fx_rate_ppm).toBe('840000');

    await createFxSnapshot(app, '910000');

    const spendItemResponse = await request(app).get(`/spend-items/${spendItemId}`);
    expect(spendItemResponse.status).toBe(200);
    expect(spendItemResponse.body.spend_item.fx_rate_ppm).toBe('840000');
  });

  it('defaults spend item base currency to NGN for Nigeria teams when omitted', async () => {
    const { app } = createTestApp();
    await createFxSnapshot(app, '840000');
    const spendItemId = await createSpendItem(app, departmentAId, undefined, '120000', deptHeadAUserId);

    const submitResponse = await request(app)
      .post(`/spend-items/${spendItemId}/submit`)
      .send({
        quote_currency_id: gbpCurrencyId,
      });

    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.spend_item.base_currency_id).toBe(ngnCurrencyId);
    expect(submitResponse.body.spend_item.fx_rate_ppm).toBe('840000');
  });

  it('defaults spend item base currency to GBP for UK teams when omitted', async () => {
    const { app } = createTestApp();
    const spendItemId = await createSpendItem(app, departmentBId, undefined, '130000', deptHeadBUserId);

    const submitResponse = await request(app)
      .post(`/spend-items/${spendItemId}/submit`)
      .send({
        quote_currency_id: gbpCurrencyId,
      });

    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.spend_item.base_currency_id).toBe(gbpCurrencyId);
    expect(submitResponse.body.spend_item.fx_rate_ppm).toBeNull();
  });

  it('routes approval steps by threshold and completes multi-step approvals', async () => {
    const { app } = createTestApp();
    const highValueSpendItemId = await createSpendItem(
      app,
      departmentAId,
      undefined,
      '1500000',
      deptHeadAUserId,
    );

    const submitResponse = await request(app)
      .post(`/spend-items/${highValueSpendItemId}/submit`)
      .send({
        base_currency_id: gbpCurrencyId,
        quote_currency_id: gbpCurrencyId,
      });

    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.approval_steps).toHaveLength(2);
    expect(submitResponse.body.spend_item.status).toBe('SUBMITTED');

    const deptHeadQueue = await request(app)
      .get('/approvals/queue')
      .set('x-user-id', deptHeadBUserId);
    expect(deptHeadQueue.status).toBe(200);
    const deptHeadQueueItem = deptHeadQueue.body.data.find(
      (item: { spend_item_id: string }) => item.spend_item_id === highValueSpendItemId,
    );
    expect(deptHeadQueueItem).toBeTruthy();
    expect(deptHeadQueueItem.approval_step_order).toBe(1);

    const firstStepApprove = await request(app)
      .post(`/approvals/${highValueSpendItemId}/approve`)
      .set('x-user-id', deptHeadBUserId)
      .send({ comment: 'Department review complete' });
    expect(firstStepApprove.status).toBe(200);
    expect(firstStepApprove.body.spend_item.status).toBe('UNDER_REVIEW');
    expect(firstStepApprove.body.approval_instance.status).toBe('PENDING');

    const financeQueue = await request(app).get('/approvals/queue').set('x-user-id', financeUserId);
    expect(financeQueue.status).toBe(200);
    const financeQueueItem = financeQueue.body.data.find(
      (item: { spend_item_id: string }) => item.spend_item_id === highValueSpendItemId,
    );
    expect(financeQueueItem).toBeTruthy();
    expect(financeQueueItem.approval_step_order).toBe(2);

    const finalApprove = await request(app)
      .post(`/approvals/${highValueSpendItemId}/approve`)
      .set('x-user-id', financeUserId)
      .send({ comment: 'Finance approved' });
    expect(finalApprove.status).toBe(200);
    expect(finalApprove.body.spend_item.status).toBe('APPROVED');
    expect(finalApprove.body.spend_item.approved_at).toBeTruthy();
    expect(finalApprove.body.approval_instance.status).toBe('APPROVED');
  });

  it('enforces separation-of-duties by blocking creator approvals', async () => {
    const { app } = createTestApp();
    const spendItemId = await createSpendItem(app, departmentAId, undefined, '500000', deptHeadAUserId);

    const submitResponse = await request(app)
      .post(`/spend-items/${spendItemId}/submit`)
      .send({
        base_currency_id: gbpCurrencyId,
        quote_currency_id: gbpCurrencyId,
      });
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.approval_steps).toHaveLength(1);

    const creatorApprove = await request(app)
      .post(`/approvals/${spendItemId}/approve`)
      .set('x-user-id', deptHeadAUserId)
      .send({ comment: 'Self-approval attempt' });
    expect(creatorApprove.status).toBe(403);
    expect(creatorApprove.body.error).toBe('created_by user cannot approve their own item');

    const peerApprove = await request(app)
      .post(`/approvals/${spendItemId}/approve`)
      .set('x-user-id', deptHeadBUserId)
      .send({ comment: 'Peer approved' });
    expect(peerApprove.status).toBe(200);
    expect(peerApprove.body.spend_item.status).toBe('APPROVED');
  });

  it('supports reject and request-info approval actions', async () => {
    const { app } = createTestApp();
    const rejectSpendItemId = await createSpendItem(app, departmentAId, undefined, '600000', deptHeadAUserId);
    const infoSpendItemId = await createSpendItem(app, departmentAId, undefined, '700000', deptHeadAUserId);

    await request(app).post(`/spend-items/${rejectSpendItemId}/submit`).send({
      base_currency_id: gbpCurrencyId,
      quote_currency_id: gbpCurrencyId,
    });
    await request(app).post(`/spend-items/${infoSpendItemId}/submit`).send({
      base_currency_id: gbpCurrencyId,
      quote_currency_id: gbpCurrencyId,
    });

    const rejectResponse = await request(app)
      .post(`/approvals/${rejectSpendItemId}/reject`)
      .set('x-user-id', deptHeadBUserId)
      .send({ comment: 'Insufficient justification' });
    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.spend_item.status).toBe('REJECTED');
    expect(rejectResponse.body.approval_instance.status).toBe('REJECTED');
    expect(rejectResponse.body.approval_step.status).toBe('REJECTED');

    const requestInfoResponse = await request(app)
      .post(`/approvals/${infoSpendItemId}/request-info`)
      .set('x-user-id', deptHeadBUserId)
      .send({ comment: 'Provide supporting quote' });
    expect(requestInfoResponse.status).toBe(200);
    expect(requestInfoResponse.body.spend_item.status).toBe('NEEDS_INFO');
    expect(requestInfoResponse.body.approval_instance.status).toBe('NEEDS_INFO');
    expect(requestInfoResponse.body.approval_step.status).toBe('REQUESTED_INFO');
  });

  it('allows only PAYOR/ADMIN to mark approved spend items as PAID and emits PAID audit event', async () => {
    const { app, financeRepository } = createTestApp();
    const spendItemId = await createSpendItem(app, departmentAId, undefined, '500000', deptHeadAUserId);

    await request(app).post(`/spend-items/${spendItemId}/submit`).send({
      base_currency_id: gbpCurrencyId,
      quote_currency_id: gbpCurrencyId,
    });
    await request(app)
      .post(`/approvals/${spendItemId}/approve`)
      .set('x-user-id', deptHeadBUserId)
      .send({ comment: 'Approved for payment' });

    const blockedEmployee = await request(app)
      .post(`/spend-items/${spendItemId}/mark-paid`)
      .set('x-user-id', employeeUserId)
      .send({
        payment_reference: 'PAY-REF-0001',
        paid_at: '2026-03-02T10:00:00.000Z',
      });
    expect(blockedEmployee.status).toBe(403);

    const paidResponse = await request(app)
      .post(`/spend-items/${spendItemId}/mark-paid`)
      .set('x-user-id', payorUserId)
      .send({
        payment_reference: 'PAY-REF-0001',
        paid_at: '2026-03-02T10:00:00.000Z',
      });
    expect(paidResponse.status).toBe(200);
    expect(paidResponse.body.spend_item.status).toBe('PAID');
    expect(paidResponse.body.spend_item.payment_reference).toBe('PAY-REF-0001');
    expect(paidResponse.body.spend_item.paid_at).toBe('2026-03-02T10:00:00.000Z');

    const paidEvents = await financeRepository.listAuditEvents('SPEND_ITEM', spendItemId);
    const latestPaidEvent = [...paidEvents].reverse().find((event) => event.event_type === 'PAID');
    expect(latestPaidEvent?.payload).toMatchObject({
      payment_reference: 'PAY-REF-0001',
    });
  });

  it('blocks mark-paid unless spend item is APPROVED', async () => {
    const { app } = createTestApp();
    const spendItemId = await createSpendItem(app, departmentAId, undefined, '200000', deptHeadAUserId);

    const markPaidBeforeApproval = await request(app)
      .post(`/spend-items/${spendItemId}/mark-paid`)
      .set('x-user-id', payorUserId)
      .send({
        payment_reference: 'PAY-REF-0002',
        paid_at: '2026-03-02T11:00:00.000Z',
      });

    expect(markPaidBeforeApproval.status).toBe(409);
    expect(markPaidBeforeApproval.body.error).toBe('Only APPROVED spend items can be marked as PAID');
  });

  it('prevents PAYOR from paying when they acted in the final approval step', async () => {
    const { app } = createTestApp();
    const spendItemId = await createSpendItem(app, departmentAId, undefined, '300000', deptHeadAUserId);

    await request(app).post(`/spend-items/${spendItemId}/submit`).send({
      base_currency_id: gbpCurrencyId,
      quote_currency_id: gbpCurrencyId,
    });
    const approvalByPayor = await request(app)
      .post(`/approvals/${spendItemId}/approve`)
      .set('x-user-id', payorUserId)
      .send({ comment: 'Final approval as DEPT_HEAD' });
    expect(approvalByPayor.status).toBe(200);
    expect(approvalByPayor.body.spend_item.status).toBe('APPROVED');

    const markPaidBySameUser = await request(app)
      .post(`/spend-items/${spendItemId}/mark-paid`)
      .set('x-user-id', payorUserId)
      .send({
        payment_reference: 'PAY-REF-0003',
        paid_at: '2026-03-02T12:00:00.000Z',
      });
    expect(markPaidBySameUser.status).toBe(403);
    expect(markPaidBySameUser.body.error).toBe(
      'PAYOR cannot be the same user that acted on the final approval step',
    );
  });

  it('lists approved spend items pending payment with pagination', async () => {
    const { app } = createTestApp();
    const pendingA = await createSpendItem(app, departmentAId, undefined, '400000', deptHeadAUserId);
    const pendingB = await createSpendItem(app, departmentAId, undefined, '450000', deptHeadAUserId);
    const toBePaid = await createSpendItem(app, departmentBId, undefined, '500000', deptHeadAUserId);

    for (const spendItemId of [pendingA, pendingB, toBePaid]) {
      await request(app).post(`/spend-items/${spendItemId}/submit`).send({
        base_currency_id: gbpCurrencyId,
        quote_currency_id: gbpCurrencyId,
      });
      await request(app)
        .post(`/approvals/${spendItemId}/approve`)
        .set('x-user-id', deptHeadBUserId)
        .send({ comment: 'Approved' });
    }

    await request(app)
      .post(`/spend-items/${toBePaid}/mark-paid`)
      .set('x-user-id', payorUserId)
      .send({
        payment_reference: 'PAY-REF-0004',
        paid_at: '2026-03-02T13:00:00.000Z',
      });

    const pendingList = await request(app)
      .get('/spend-items/pending-payment')
      .set('x-user-id', payorUserId)
      .query({
        page: 1,
        page_size: 10,
      });
    expect(pendingList.status).toBe(200);
    expect(pendingList.body.pagination.total).toBe(2);
    const listedIds = pendingList.body.data.map((item: { id: string }) => item.id);
    expect(listedIds).toContain(pendingA);
    expect(listedIds).toContain(pendingB);
    expect(listedIds).not.toContain(toBePaid);
  });

  it('exports spend items CSV with filters and writes audit event', async () => {
    const { app, financeRepository } = createTestApp();
    const approvedSpendItemId = await createSpendItem(app, departmentAId, undefined, '410000', deptHeadAUserId);
    const draftSpendItemId = await createSpendItem(app, departmentBId, undefined, '420000', deptHeadBUserId);

    await request(app).post(`/spend-items/${approvedSpendItemId}/submit`).send({
      base_currency_id: gbpCurrencyId,
      quote_currency_id: gbpCurrencyId,
    });
    await request(app)
      .post(`/approvals/${approvedSpendItemId}/approve`)
      .set('x-user-id', deptHeadBUserId)
      .send({ comment: 'Approved for export test' });

    const response = await request(app)
      .get('/exports/spend-items.csv')
      .set('x-user-id', financeUserId)
      .query({
        status: 'APPROVED',
        department_id: departmentAId,
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('spend_item_type,status');
    expect(response.text).toContain(approvedSpendItemId);
    expect(response.text).not.toContain(draftSpendItemId);

    const exportEvents = await financeRepository.listAuditEvents('SPEND_ITEM_EXPORT', 'ALL');
    const latestExportEvent = [...exportEvents].reverse().find((event) => event.event_type === 'spend_item.exported');
    expect(latestExportEvent).toBeTruthy();
    expect(latestExportEvent?.payload).toMatchObject({
      row_count: 1,
      filters: {
        status: 'APPROVED',
        department_id: departmentAId,
      },
    });
  });

  it('supports employee CRUD for ADMIN/PAYROLL_ADMIN and rejects unauthorized users', async () => {
    const { app } = createTestApp();

    const unauthorizedCreate = await request(app)
      .post('/employees')
      .set('x-user-id', employeeUserId)
      .send({
        name: 'Unauthorized Employee',
        email: 'unauthorized.employee@example.com',
        department_id: departmentAId,
        currency_id: gbpCurrencyId,
        salary_minor: '120000',
        bank_details_json: { account_number: '123' },
      });
    expect(unauthorizedCreate.status).toBe(403);

    const employeeId = await createEmployee(app, {
      name: 'Payroll Employee One',
      email: 'payroll.employee.one@example.com',
      department_id: departmentAId,
      currency_id: gbpCurrencyId,
      salary_minor: '150000',
    });

    const detailResponse = await request(app)
      .get(`/employees/${employeeId}`)
      .set('x-user-id', payrollAdminUserId);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.employee.name).toBe('Payroll Employee One');
    expect(detailResponse.body.employee.email).toBe('payroll.employee.one@example.com');
    expect(detailResponse.body.employee.bank_details_json.account_number).toBe('******2223');

    const patchResponse = await request(app)
      .patch(`/employees/${employeeId}`)
      .set('x-user-id', adminUserId)
      .send({
        salary_minor: '175000',
        status: 'INACTIVE',
      });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.employee.salary_minor).toBe('175000');
    expect(patchResponse.body.employee.status).toBe('INACTIVE');

    const listResponse = await request(app)
      .get('/employees')
      .set('x-user-id', payrollAdminUserId)
      .query({
        page: 1,
        page_size: 10,
      });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.pagination.total).toBeGreaterThanOrEqual(1);

    const deleteResponse = await request(app)
      .delete(`/employees/${employeeId}`)
      .set('x-user-id', adminUserId);
    expect(deleteResponse.status).toBe(204);
  });

  it('stores employee bank details encrypted at rest', async () => {
    const { app, financeRepository } = createTestApp();
    const employeeId = await createEmployee(app, {
      name: 'Encrypted Employee',
      email: 'encrypted.employee@example.com',
      department_id: departmentAId,
      currency_id: gbpCurrencyId,
      salary_minor: '165000',
    });

    const stored = await financeRepository.findEmployeeById(employeeId);
    expect(stored).not.toBeNull();
    expect(stored?.bank_details_encrypted).toBeTruthy();
    expect(stored?.bank_details_encrypted).not.toContain('account_number');
    expect(stored?.bank_details_encrypted).not.toContain('0001112223');
  });

  it('reveals full employee bank details only for PAYOR role', async () => {
    const { app } = createTestApp();
    const employeeId = await createEmployee(app, {
      name: 'Boundary Employee',
      email: 'boundary.employee@example.com',
      department_id: departmentAId,
      currency_id: gbpCurrencyId,
      salary_minor: '155000',
    });

    const maskedForPayrollAdmin = await request(app)
      .get(`/employees/${employeeId}`)
      .set('x-user-id', payrollAdminUserId);
    expect(maskedForPayrollAdmin.status).toBe(200);
    expect(maskedForPayrollAdmin.body.employee.bank_details_json.account_number).toBe('******2223');

    const fullForPayor = await request(app)
      .get(`/employees/${employeeId}`)
      .set('x-user-id', payorUserId);
    expect(fullForPayor.status).toBe(200);
    expect(fullForPayor.body.employee.bank_details_json.account_number).toBe('0001112223');

    const blockedForFinance = await request(app)
      .get(`/employees/${employeeId}`)
      .set('x-user-id', financeUserId);
    expect(blockedForFinance.status).toBe(403);
  });

  it('enforces payroll run single-currency snapshots and immutability after submission', async () => {
    const { app } = createTestApp();

    const gbpEmployeeId = await createEmployee(app, {
      name: 'GBP Employee',
      email: 'gbp.employee@example.com',
      department_id: departmentAId,
      currency_id: gbpCurrencyId,
      salary_minor: '200000',
    });
    await createEmployee(app, {
      name: 'NGN Employee',
      email: 'ngn.employee@example.com',
      department_id: departmentAId,
      currency_id: ngnCurrencyId,
      salary_minor: '300000',
    });

    const payrollRunId = await createPayrollRun(app, gbpCurrencyId);

    const loadEmployeesResponse = await request(app)
      .post(`/payroll-runs/${payrollRunId}/load-employees`)
      .set('x-user-id', payrollAdminUserId)
      .send({});
    expect(loadEmployeesResponse.status).toBe(200);
    expect(loadEmployeesResponse.body.payroll_run_items.length).toBe(1);
    expect(loadEmployeesResponse.body.payroll_run_items[0].employee_id).toBe(gbpEmployeeId);
    expect(loadEmployeesResponse.body.payroll_run_items[0].currency_id).toBe(gbpCurrencyId);

    const addAdjustmentResponse = await request(app)
      .post(`/payroll-runs/${payrollRunId}/adjustments`)
      .set('x-user-id', payrollAdminUserId)
      .send({
        employee_id: gbpEmployeeId,
        adjustment_type: 'EARNING',
        amount_minor: '5000',
        notes: 'Performance bonus',
      });
    expect(addAdjustmentResponse.status).toBe(201);
    expect(addAdjustmentResponse.body.payroll_run_item.net_pay_minor).toBe('205000');

    const submitResponse = await request(app)
      .post(`/payroll-runs/${payrollRunId}/submit`)
      .set('x-user-id', payrollAdminUserId)
      .send({});
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.payroll_run.status).toBe('PENDING_APPROVAL');
    expect(submitResponse.body.spend_item.spend_item_type).toBe('PAYROLL_RUN');
    expect(submitResponse.body.spend_item.currency_id).toBe(gbpCurrencyId);
    expect(submitResponse.body.spend_item.base_currency_id).toBe(gbpCurrencyId);
    expect(submitResponse.body.spend_item.amount_minor).toBe(submitResponse.body.spend_item.base_amount_minor);

    const loadAfterSubmit = await request(app)
      .post(`/payroll-runs/${payrollRunId}/load-employees`)
      .set('x-user-id', payrollAdminUserId)
      .send({});
    expect(loadAfterSubmit.status).toBe(409);
    expect(loadAfterSubmit.body.error).toBe('Payroll run is immutable after submission');

    const adjustAfterSubmit = await request(app)
      .post(`/payroll-runs/${payrollRunId}/adjustments`)
      .set('x-user-id', payrollAdminUserId)
      .send({
        employee_id: gbpEmployeeId,
        adjustment_type: 'DEDUCTION',
        amount_minor: '1000',
        notes: 'Late penalty',
      });
    expect(adjustAfterSubmit.status).toBe(409);
    expect(adjustAfterSubmit.body.error).toBe('Payroll run is immutable after submission');

    const spendItemId = submitResponse.body.spend_item.id as string;
    const approvalResponse = await request(app)
      .post(`/approvals/${spendItemId}/approve`)
      .set('x-user-id', deptHeadBUserId)
      .send({ comment: 'Payroll approved' });
    expect(approvalResponse.status).toBe(200);
    expect(approvalResponse.body.spend_item.status).toBe('APPROVED');

    const markPaidResponse = await request(app)
      .post(`/payroll-runs/${payrollRunId}/mark-paid`)
      .set('x-user-id', payorUserId)
      .send({
        payment_reference: 'PAYROLL-PAY-0001',
        paid_at: '2026-03-31T12:00:00.000Z',
      });
    expect(markPaidResponse.status).toBe(200);
    expect(markPaidResponse.body.payroll_run.status).toBe('PROCESSED');
    expect(markPaidResponse.body.spend_item.status).toBe('PAID');

    const detailResponse = await request(app)
      .get(`/payroll-runs/${payrollRunId}`)
      .set('x-user-id', payrollAdminUserId);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.payroll_run_items.length).toBe(1);
    expect(detailResponse.body.approval_instances.length).toBeGreaterThanOrEqual(1);
    expect(detailResponse.body.audit_events.length).toBeGreaterThanOrEqual(3);
  });

  it('exports payroll run CSV with masked bank details and audit event', async () => {
    const { app, financeRepository } = createTestApp();
    await createEmployee(app, {
      name: 'Masked Export Employee',
      email: 'masked.export@example.com',
      department_id: departmentAId,
      currency_id: gbpCurrencyId,
      salary_minor: '130000',
    });
    const payrollRunId = await createPayrollRun(app, gbpCurrencyId);

    const loadResponse = await request(app)
      .post(`/payroll-runs/${payrollRunId}/load-employees`)
      .set('x-user-id', payrollAdminUserId)
      .send({});
    expect(loadResponse.status).toBe(200);

    const exportResponse = await request(app)
      .get(`/payroll-runs/${payrollRunId}/export.csv`)
      .set('x-user-id', payrollAdminUserId);

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers['content-type']).toContain('text/csv');
    expect(exportResponse.text).toContain('bank_details_json');
    expect(exportResponse.text).toContain('******2223');
    expect(exportResponse.text).not.toContain('0001112223');

    const events = await financeRepository.listAuditEvents('PAYROLL_RUN', payrollRunId);
    const exportEvent = [...events].reverse().find((event) => event.event_type === 'payroll_run.exported');
    expect(exportEvent?.payload).toMatchObject({
      secure: false,
      row_count: 1,
    });
  });

  it('allows secure payroll CSV export only for PAYOR and includes full bank details', async () => {
    const { app, financeRepository } = createTestApp();
    await createEmployee(app, {
      name: 'Secure Export Employee',
      email: 'secure.export@example.com',
      department_id: departmentAId,
      currency_id: gbpCurrencyId,
      salary_minor: '140000',
    });
    const payrollRunId = await createPayrollRun(app, gbpCurrencyId);

    const loadResponse = await request(app)
      .post(`/payroll-runs/${payrollRunId}/load-employees`)
      .set('x-user-id', payrollAdminUserId)
      .send({});
    expect(loadResponse.status).toBe(200);

    const blockedResponse = await request(app)
      .get(`/payroll-runs/${payrollRunId}/export-secure.csv`)
      .set('x-user-id', payrollAdminUserId);
    expect(blockedResponse.status).toBe(403);

    const secureResponse = await request(app)
      .get(`/payroll-runs/${payrollRunId}/export-secure.csv`)
      .set('x-user-id', payorUserId);
    expect(secureResponse.status).toBe(200);
    expect(secureResponse.headers['content-type']).toContain('text/csv');
    expect(secureResponse.text).toContain('0001112223');

    const events = await financeRepository.listAuditEvents('PAYROLL_RUN', payrollRunId);
    const secureExportEvent = [...events]
      .reverse()
      .find((event) => event.event_type === 'payroll_run.exported_secure');
    expect(secureExportEvent?.payload).toMatchObject({
      secure: true,
      row_count: 1,
    });
  });

  it('creates draft payment request only for DEPT_HEAD in their own department', async () => {
    const { app } = createTestApp();
    const spendItemId = await createSpendItem(app, departmentAId);

    const employeeCreate = await request(app)
      .post('/payment-requests')
      .set('x-user-id', employeeUserId)
      .send({ spend_item_id: spendItemId });
    expect(employeeCreate.status).toBe(403);

    const otherDeptHeadCreate = await request(app)
      .post('/payment-requests')
      .set('x-user-id', deptHeadBUserId)
      .send({ spend_item_id: spendItemId });
    expect(otherDeptHeadCreate.status).toBe(403);

    const deptHeadCreate = await request(app)
      .post('/payment-requests')
      .set('x-user-id', deptHeadAUserId)
      .send({ spend_item_id: spendItemId });
    expect(deptHeadCreate.status).toBe(201);
    expect(deptHeadCreate.body.payment_request.status).toBe('DRAFT');
    expect(deptHeadCreate.body.payment_request.department_id).toBe(departmentAId);
  });

  it('supports draft edit, submission, approval instance creation, and blocks edits after submission', async () => {
    const { app } = createTestApp();
    await createFxSnapshot(app, '800000');
    const spendItemId = await createSpendItem(app);
    const paymentRequestId = await createDraftPaymentRequest(app, spendItemId);

    const editResponse = await request(app)
      .patch(`/payment-requests/${paymentRequestId}`)
      .set('x-user-id', deptHeadAUserId)
      .send({
        requested_amount_minor: '160000',
        due_at: '2026-03-05T00:00:00.000Z',
      });
    expect(editResponse.status).toBe(200);
    expect(editResponse.body.payment_request.requested_amount_minor).toBe('160000');

    const submitResponse = await request(app)
      .post(`/payment-requests/${paymentRequestId}/submit`)
      .set('x-user-id', deptHeadAUserId)
      .send({ base_currency_id: ngnCurrencyId });
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.payment_request.status).toBe('SUBMITTED');
    expect(submitResponse.body.payment_request.fx_rate_ppm).toBe('800000');
    expect(submitResponse.body.payment_request.base_amount_minor).toBe('200000');
    expect(submitResponse.body.approval_instance.entity_type).toBe('PAYMENT_REQUEST');

    const editAfterSubmit = await request(app)
      .patch(`/payment-requests/${paymentRequestId}`)
      .set('x-user-id', deptHeadAUserId)
      .send({ requested_amount_minor: '180000' });
    expect(editAfterSubmit.status).toBe(409);
    expect(editAfterSubmit.body.error).toBe('Requestor cannot edit after submission');
  });

  it('defaults payment request base currency by team when omitted on submit', async () => {
    const { app } = createTestApp();
    const spendItemId = await createSpendItem(app, departmentBId, undefined, '145000', deptHeadBUserId);
    const paymentRequestId = await createDraftPaymentRequest(app, spendItemId, deptHeadBUserId);

    const submitResponse = await request(app)
      .post(`/payment-requests/${paymentRequestId}/submit`)
      .set('x-user-id', deptHeadBUserId)
      .send({});
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.payment_request.base_currency_id).toBe(gbpCurrencyId);
    expect(submitResponse.body.payment_request.base_amount_minor).toBe('145000');
    expect(submitResponse.body.payment_request.fx_rate_ppm).toBeNull();
  });

  it('attaches files and records file_added audit events', async () => {
    const { app, financeRepository } = createTestApp();
    const spendItemId = await createSpendItem(app);
    const paymentRequestId = await createDraftPaymentRequest(app, spendItemId);
    const fileId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    financeRepository.addFile(fileId);

    const firstAttach = await request(app)
      .post(`/payment-requests/${paymentRequestId}/files`)
      .set('x-user-id', deptHeadAUserId)
      .send({ file_id: fileId });
    expect(firstAttach.status).toBe(201);
    expect(firstAttach.body.created).toBe(true);

    const duplicateAttach = await request(app)
      .post(`/payment-requests/${paymentRequestId}/files`)
      .set('x-user-id', deptHeadAUserId)
      .send({ file_id: fileId });
    expect(duplicateAttach.status).toBe(200);
    expect(duplicateAttach.body.created).toBe(false);

    const detailResponse = await request(app).get(`/payment-requests/${paymentRequestId}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.attachments).toHaveLength(1);
    const fileAddedEvents = detailResponse.body.audit_events.filter(
      (event: { event_type: string }) => event.event_type === 'payment_request.file_added',
    );
    expect(fileAddedEvents.length).toBe(2);
  });

  it('lists payment requests with filters and pagination', async () => {
    const { app } = createTestApp();
    await createFxSnapshot(app, '900000');

    const spendItemA = await createSpendItem(app, departmentAId);
    const spendItemB = await createSpendItem(app, departmentAId);
    const spendItemC = await createSpendItem(app, departmentBId);

    const requestA = await createDraftPaymentRequest(app, spendItemA, deptHeadAUserId);
    await createDraftPaymentRequest(app, spendItemB, deptHeadAUserId);
    await createDraftPaymentRequest(app, spendItemC, deptHeadBUserId);

    await request(app)
      .post(`/payment-requests/${requestA}/submit`)
      .set('x-user-id', deptHeadAUserId)
      .send({ base_currency_id: ngnCurrencyId });

    const submittedList = await request(app).get('/payment-requests').query({
      status: 'SUBMITTED',
      page: 1,
      page_size: 10,
    });
    expect(submittedList.status).toBe(200);
    expect(submittedList.body.pagination.total).toBe(1);

    const draftPagedList = await request(app).get('/payment-requests').query({
      status: 'DRAFT',
      page: 1,
      page_size: 1,
      department_id: departmentAId,
    });
    expect(draftPagedList.status).toBe(200);
    expect(draftPagedList.body.pagination.page_size).toBe(1);
    expect(draftPagedList.body.pagination.total).toBe(1);
    expect(draftPagedList.body.data).toHaveLength(1);
  });

  it('returns payment request detail with timeline and audit trail', async () => {
    const { app, financeRepository } = createTestApp();
    await createFxSnapshot(app, '830000');
    const spendItemId = await createSpendItem(app);
    const paymentRequestId = await createDraftPaymentRequest(app, spendItemId);
    const fileId = '99999999-9999-4999-8999-999999999999';
    financeRepository.addFile(fileId);

    await request(app)
      .patch(`/payment-requests/${paymentRequestId}`)
      .set('x-user-id', deptHeadAUserId)
      .send({ requested_amount_minor: '123000' });

    await request(app)
      .post(`/payment-requests/${paymentRequestId}/files`)
      .set('x-user-id', deptHeadAUserId)
      .send({ file_id: fileId });

    await request(app)
      .post(`/payment-requests/${paymentRequestId}/submit`)
      .set('x-user-id', deptHeadAUserId)
      .send({ base_currency_id: ngnCurrencyId });

    const detailResponse = await request(app).get(`/payment-requests/${paymentRequestId}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.payment_request.status).toBe('SUBMITTED');
    expect(detailResponse.body.approval_instances).toHaveLength(1);
    expect(detailResponse.body.timeline.length).toBeGreaterThanOrEqual(4);
    expect(detailResponse.body.audit_events.length).toBe(detailResponse.body.timeline.length);
  });

  it('uploads external invoice and creates EXTERNAL_INVOICE spend item when none is linked', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/external-invoices')
      .set('x-user-id', employeeUserId)
      .send({
        vendor_id: vendorAId,
        invoice_number: 'INV-1001',
        invoice_date: '2026-02-27',
        currency_id: gbpCurrencyId,
        amount_minor: '245000',
        file: {
          storage_key: 'external-invoices/inv-1001.pdf',
          file_name: 'inv-1001.pdf',
          mime_type: 'application/pdf',
          size_bytes: '55000',
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.external_invoice.invoice_number).toBe('INV-1001');
    expect(response.body.spend_item.spend_item_type).toBe('EXTERNAL_INVOICE');
    expect(response.body.spend_item.vendor_id).toBe(vendorAId);
    expect(response.body.file.mime_type).toBe('application/pdf');
  });

  it('enforces vendor+invoice uniqueness and allows Finance/Admin override with reason', async () => {
    const { app } = createTestApp();

    const first = await request(app)
      .post('/external-invoices')
      .set('x-user-id', employeeUserId)
      .send({
        vendor_id: vendorAId,
        invoice_number: 'INV-2001',
        invoice_date: '2026-02-28',
        currency_id: gbpCurrencyId,
        amount_minor: '200000',
        file: {
          storage_key: 'external-invoices/inv-2001-a.pdf',
          file_name: 'inv-2001-a.pdf',
          mime_type: 'application/pdf',
          size_bytes: '61000',
        },
      });
    expect(first.status).toBe(201);

    const duplicateNoOverride = await request(app)
      .post('/external-invoices')
      .set('x-user-id', employeeUserId)
      .send({
        vendor_id: vendorAId,
        invoice_number: 'INV-2001',
        invoice_date: '2026-02-28',
        currency_id: gbpCurrencyId,
        amount_minor: '200000',
        file: {
          storage_key: 'external-invoices/inv-2001-b.pdf',
          file_name: 'inv-2001-b.pdf',
          mime_type: 'application/pdf',
          size_bytes: '62000',
        },
      });
    expect(duplicateNoOverride.status).toBe(409);

    const duplicateNoPrivilege = await request(app)
      .post('/external-invoices')
      .set('x-user-id', deptHeadAUserId)
      .send({
        vendor_id: vendorAId,
        invoice_number: 'INV-2001',
        invoice_date: '2026-02-28',
        currency_id: gbpCurrencyId,
        amount_minor: '200000',
        duplicate_override_reason: 'Manual migration from legacy ERP',
        file: {
          storage_key: 'external-invoices/inv-2001-c.pdf',
          file_name: 'inv-2001-c.pdf',
          mime_type: 'application/pdf',
          size_bytes: '62000',
        },
      });
    expect(duplicateNoPrivilege.status).toBe(403);

    const duplicateWithFinanceOverride = await request(app)
      .post('/external-invoices')
      .set('x-user-id', financeUserId)
      .send({
        vendor_id: vendorAId,
        invoice_number: 'INV-2001',
        invoice_date: '2026-02-28',
        currency_id: gbpCurrencyId,
        amount_minor: '200000',
        duplicate_override_reason: 'Manual migration from legacy ERP',
        file: {
          storage_key: 'external-invoices/inv-2001-d.pdf',
          file_name: 'inv-2001-d.pdf',
          mime_type: 'application/pdf',
          size_bytes: '62000',
        },
      });
    expect(duplicateWithFinanceOverride.status).toBe(201);

    const detail = await request(app).get(
      `/external-invoices/${duplicateWithFinanceOverride.body.external_invoice.id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.audit_events[0].event_type).toBe('external_invoice.created');
    expect(detail.body.audit_events[0].payload.duplicate_override_reason).toBe(
      'Manual migration from legacy ERP',
    );
  });

  it('links external invoice to existing spend item and supports list/detail views', async () => {
    const { app } = createTestApp();
    const existingSpendItemId = await createSpendItem(app, departmentAId, vendorBId);

    const uploadResponse = await request(app)
      .post('/external-invoices')
      .set('x-user-id', employeeUserId)
      .send({
        vendor_id: vendorBId,
        invoice_number: 'INV-3001',
        invoice_date: '2026-03-01',
        currency_id: gbpCurrencyId,
        amount_minor: '99000',
        spend_item_id: existingSpendItemId,
        file: {
          storage_key: 'external-invoices/inv-3001.png',
          file_name: 'inv-3001.png',
          mime_type: 'image/png',
          size_bytes: '18000',
        },
      });

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.spend_item.id).toBe(existingSpendItemId);
    expect(uploadResponse.body.spend_item.spend_item_type).toBe('GENERAL');

    const listResponse = await request(app).get('/external-invoices').query({
      vendor_id: vendorBId,
      page: 1,
      page_size: 10,
    });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.pagination.total).toBe(1);
    expect(listResponse.body.data[0].id).toBe(uploadResponse.body.external_invoice.id);

    const detailResponse = await request(app).get(
      `/external-invoices/${uploadResponse.body.external_invoice.id}`,
    );
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.spend_item.id).toBe(existingSpendItemId);
    expect(detailResponse.body.attachments).toHaveLength(1);
    expect(detailResponse.body.timeline[0].event_type).toBe('external_invoice.created');
  });

  it('creates internal invoice with line totals, attachments, and FX-locked spend item base totals', async () => {
    const { app } = createTestApp();
    await createFxSnapshot(app, '800000');

    const response = await request(app)
      .post('/internal-invoices')
      .set('x-user-id', deptHeadAUserId)
      .send({
        from_department_id: departmentAId,
        to_department_id: departmentBId,
        currency_id: gbpCurrencyId,
        base_currency_id: ngnCurrencyId,
        invoice_number: 'INT-1001',
        invoice_date: '2026-03-01',
        line_items: [
          {
            description: 'Engineering shared service',
            quantity: 2,
            unit_amount_minor: '50000',
          },
          {
            description: 'Security tooling allocation',
            quantity: 1,
            unit_amount_minor: '30000',
          },
        ],
        attachments: [
          {
            storage_key: 'internal-invoices/int-1001.pdf',
            file_name: 'int-1001.pdf',
            mime_type: 'application/pdf',
            size_bytes: '25000',
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.internal_invoice.status).toBe('DRAFT');
    expect(response.body.internal_invoice.total_amount_minor).toBe('130000');
    expect(response.body.spend_item.spend_item_type).toBe('INTERNAL_INVOICE');
    expect(response.body.spend_item.amount_minor).toBe('130000');
    expect(response.body.spend_item.base_currency_id).toBe(ngnCurrencyId);
    expect(response.body.spend_item.base_amount_minor).toBe('162500');
    expect(response.body.spend_item.fx_rate_ppm).toBe('800000');
    expect(response.body.line_items).toHaveLength(2);
    expect(response.body.attachments).toHaveLength(1);
  });

  it('defaults internal invoice base currency by from_department team', async () => {
    const { app } = createTestApp();
    await createFxSnapshot(app, '800000');

    const response = await request(app)
      .post('/internal-invoices')
      .set('x-user-id', deptHeadAUserId)
      .send({
        from_department_id: departmentAId,
        to_department_id: departmentBId,
        currency_id: gbpCurrencyId,
        invoice_number: 'INT-DEFAULT-BASE',
        invoice_date: '2026-03-01',
        line_items: [
          {
            description: 'Cross-team service charge',
            quantity: 1,
            unit_amount_minor: '100000',
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.spend_item.base_currency_id).toBe(ngnCurrencyId);
    expect(response.body.spend_item.fx_rate_ppm).toBe('800000');
  });

  it('submits internal invoice into approval engine and supports list/detail views', async () => {
    const { app } = createTestApp();
    const createResponse = await createInternalInvoice(app, deptHeadAUserId);
    const internalInvoiceId = createResponse.body.internal_invoice.id as string;

    const wrongUserSubmit = await request(app)
      .post(`/internal-invoices/${internalInvoiceId}/submit`)
      .set('x-user-id', deptHeadBUserId)
      .send({});
    expect(wrongUserSubmit.status).toBe(403);

    const submitResponse = await request(app)
      .post(`/internal-invoices/${internalInvoiceId}/submit`)
      .set('x-user-id', deptHeadAUserId)
      .send({});
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.internal_invoice.status).toBe('OPEN');
    expect(submitResponse.body.approval_instance.entity_type).toBe('INTERNAL_INVOICE');

    const listResponse = await request(app).get('/internal-invoices').query({
      status: 'OPEN',
      from_department_id: departmentAId,
      page: 1,
      page_size: 10,
    });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.pagination.total).toBe(1);
    expect(listResponse.body.data[0].id).toBe(internalInvoiceId);

    const detailResponse = await request(app).get(`/internal-invoices/${internalInvoiceId}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.internal_invoice.id).toBe(internalInvoiceId);
    expect(detailResponse.body.line_items.length).toBeGreaterThan(0);
    expect(detailResponse.body.attachments).toHaveLength(1);
    expect(detailResponse.body.approval_instances).toHaveLength(1);
    expect(detailResponse.body.timeline.length).toBeGreaterThanOrEqual(2);
  });
});
