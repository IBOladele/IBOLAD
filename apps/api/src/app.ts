import cors from 'cors';
import express from 'express';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createUserSchema } from '@repo/shared';
import {
  type CreateSpendItemInput,
  type FinanceRepository,
  createPrismaFinanceRepository,
} from './finance-repository.js';
import { violatesSeparationOfDuties } from './approval-engine.js';

const uuidSchema = z.string().uuid();
const bigintInputSchema = z
  .union([z.string().regex(/^-?\d+$/), z.number().int()])
  .transform((value) => BigInt(value));

const createFxRateSnapshotSchema = z.object({
  base_currency_id: uuidSchema,
  quote_currency_id: uuidSchema,
  fx_rate_ppm: bigintInputSchema,
  effective_at: z.coerce.date().optional(),
});

const latestFxRateQuerySchema = z.object({
  base_currency_id: uuidSchema,
  quote_currency_id: uuidSchema,
});

const createSpendItemSchema = z.object({
  vendor_id: uuidSchema.nullable().optional(),
  department_id: uuidSchema.nullable().optional(),
  currency_id: uuidSchema,
  created_by_user_id: uuidSchema.nullable().optional(),
  description: z.string().min(1),
  amount_minor: bigintInputSchema,
  incurred_at: z.coerce.date().optional(),
});

const submitSpendItemSchema = z.object({
  base_currency_id: uuidSchema.optional(),
  quote_currency_id: uuidSchema,
});

const markSpendItemPaidSchema = z.object({
  payment_reference: z.string().trim().min(1).max(255),
  paid_at: z.coerce.date(),
});

const spendItemTypeSchema = z.enum(['GENERAL', 'EXTERNAL_INVOICE', 'INTERNAL_INVOICE', 'PAYROLL_RUN']);
const spendItemStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PAID',
  'REJECTED',
  'NEEDS_INFO',
]);

const listPendingPaymentSpendItemsQuerySchema = z.object({
  department_id: uuidSchema.optional(),
  currency_id: uuidSchema.optional(),
  spend_item_type: spendItemTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const exportSpendItemsQuerySchema = z
  .object({
    status: spendItemStatusSchema.optional(),
    department_id: uuidSchema.optional(),
    currency_id: uuidSchema.optional(),
    spend_item_type: spendItemTypeSchema.optional(),
    created_by_user_id: uuidSchema.optional(),
    incurred_from: z.coerce.date().optional(),
    incurred_to: z.coerce.date().optional(),
    submitted_from: z.coerce.date().optional(),
    submitted_to: z.coerce.date().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.incurred_from && value.incurred_to && value.incurred_from > value.incurred_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['incurred_from'],
        message: 'incurred_from must be earlier than or equal to incurred_to',
      });
    }
    if (value.submitted_from && value.submitted_to && value.submitted_from > value.submitted_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['submitted_from'],
        message: 'submitted_from must be earlier than or equal to submitted_to',
      });
    }
  });

const createPaymentRequestSchema = z.object({
  spend_item_id: uuidSchema,
  requested_amount_minor: bigintInputSchema.optional(),
  due_at: z.coerce.date().nullable().optional(),
  department_id: uuidSchema.optional(),
  vendor_id: uuidSchema.nullable().optional(),
});

const editPaymentRequestSchema = z.object({
  requested_amount_minor: bigintInputSchema.optional(),
  due_at: z.coerce.date().nullable().optional(),
  department_id: uuidSchema.optional(),
  vendor_id: uuidSchema.nullable().optional(),
});

const attachFileToPaymentRequestSchema = z.object({
  file_id: uuidSchema,
});

const submitPaymentRequestSchema = z.object({
  base_currency_id: uuidSchema.optional(),
});

const paymentRequestStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'PAID',
  'CANCELLED',
]);

const listPaymentRequestsQuerySchema = z.object({
  status: paymentRequestStatusSchema.optional(),
  department_id: uuidSchema.optional(),
  requested_by_user_id: uuidSchema.optional(),
  currency_id: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const invoiceStatusSchema = z.enum(['DRAFT', 'OPEN', 'APPROVED', 'REJECTED', 'PAID', 'VOID']);

const createExternalInvoiceSchema = z
  .object({
    vendor_id: uuidSchema,
    invoice_number: z.string().trim().min(1).max(128),
    invoice_date: z.coerce.date(),
    due_date: z.coerce.date().nullable().optional(),
    currency_id: uuidSchema,
    amount_minor: bigintInputSchema.optional(),
    total_amount_minor: bigintInputSchema.optional(),
    spend_item_id: uuidSchema.optional(),
    spend_item_department_id: uuidSchema.nullable().optional(),
    spend_item_description: z.string().trim().min(1).max(4000).optional(),
    spend_item_incurred_at: z.coerce.date().optional(),
    duplicate_override_reason: z.string().trim().min(3).max(2000).optional(),
    file: z.object({
      storage_key: z.string().trim().min(1).max(512),
      file_name: z.string().trim().min(1).max(255),
      mime_type: z.string().trim().min(1).max(128),
      size_bytes: bigintInputSchema,
      checksum_sha256: z
        .string()
        .trim()
        .regex(/^[0-9a-fA-F]{64}$/)
        .nullable()
        .optional(),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.amount_minor === undefined && value.total_amount_minor === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount_minor'],
        message: 'Either amount_minor or total_amount_minor is required',
      });
    }

    if (
      value.amount_minor !== undefined &&
      value.total_amount_minor !== undefined &&
      value.amount_minor !== value.total_amount_minor
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['total_amount_minor'],
        message: 'amount_minor and total_amount_minor must match when both are provided',
      });
    }
  });

const listExternalInvoicesQuerySchema = z.object({
  vendor_id: uuidSchema.optional(),
  currency_id: uuidSchema.optional(),
  spend_item_id: uuidSchema.optional(),
  invoice_number: z.string().trim().min(1).max(128).optional(),
  status: invoiceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const createInternalInvoiceSchema = z.object({
  from_department_id: uuidSchema,
  to_department_id: uuidSchema,
  currency_id: uuidSchema,
  base_currency_id: uuidSchema.optional(),
  invoice_number: z.string().trim().min(1).max(128),
  invoice_date: z.coerce.date(),
  due_date: z.coerce.date().nullable().optional(),
  line_items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(4000),
        quantity: z.coerce.number().int().min(1).default(1),
        unit_amount_minor: bigintInputSchema,
      }),
    )
    .min(1),
  attachments: z
    .array(
      z.object({
        storage_key: z.string().trim().min(1).max(512),
        file_name: z.string().trim().min(1).max(255),
        mime_type: z.string().trim().min(1).max(128),
        size_bytes: bigintInputSchema,
        checksum_sha256: z
          .string()
          .trim()
          .regex(/^[0-9a-fA-F]{64}$/)
          .nullable()
          .optional(),
      }),
    )
    .default([]),
});

const listInternalInvoicesQuerySchema = z.object({
  from_department_id: uuidSchema.optional(),
  to_department_id: uuidSchema.optional(),
  currency_id: uuidSchema.optional(),
  created_by_user_id: uuidSchema.optional(),
  status: invoiceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const employeeStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

const createEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  department_id: uuidSchema.nullable().optional(),
  currency_id: uuidSchema,
  salary_minor: bigintInputSchema,
  bank_details_json: z.record(z.string(), z.unknown()),
  status: employeeStatusSchema.default('ACTIVE'),
});

const updateEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    email: z.string().trim().email().max(255).optional(),
    department_id: uuidSchema.nullable().optional(),
    currency_id: uuidSchema.optional(),
    salary_minor: bigintInputSchema.optional(),
    bank_details_json: z.record(z.string(), z.unknown()).optional(),
    status: employeeStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const listEmployeesQuerySchema = z.object({
  department_id: uuidSchema.optional(),
  currency_id: uuidSchema.optional(),
  status: employeeStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const createPayrollRunSchema = z.object({
  period_start: z.coerce.date(),
  period_end: z.coerce.date(),
  pay_date: z.coerce.date().nullable().optional(),
  currency_id: uuidSchema,
});

const listPayrollRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const payrollAdjustmentTypeSchema = z.enum(['EARNING', 'DEDUCTION', 'CORRECTION']);

const createPayrollAdjustmentSchema = z.object({
  employee_id: uuidSchema,
  adjustment_type: payrollAdjustmentTypeSchema,
  amount_minor: bigintInputSchema,
  notes: z.string().trim().min(1).max(2000),
});

const approvalActionSchema = z.object({
  comment: z.string().trim().min(1).max(2000),
});

type AppDependencies = {
  financeRepository?: FinanceRepository;
  now?: () => Date;
};

type RateLimiterOptions = {
  window_ms: number;
  max_requests: number;
};

function serializeForJson(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeForJson(item));
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(record)) {
      output[key] = serializeForJson(nestedValue);
    }

    return output;
  }

  return value;
}

function parseUserId(req: express.Request): string | null {
  const userIdHeader = req.header('x-user-id');
  const parsed = uuidSchema.safeParse(userIdHeader);
  return parsed.success ? parsed.data : null;
}

async function requireUserId(req: express.Request, res: express.Response): Promise<string | null> {
  const userId = parseUserId(req);

  if (userId === null) {
    res.status(401).json({ error: 'Missing or invalid x-user-id header' });
    return null;
  }

  return userId;
}

async function requireAnyRole(
  repository: FinanceRepository,
  userId: string,
  roleCodes: readonly string[],
): Promise<boolean> {
  const currentUserRoleCodes = await repository.getUserRoleCodes(userId);
  return currentUserRoleCodes.some((roleCode) => roleCodes.includes(roleCode));
}

function inferRegionalDefaultBaseCurrencyCode(department: { code: string; name: string }): 'NGN' | 'GBP' | null {
  const fingerprint = `${department.code} ${department.name}`.toUpperCase();

  if (/(^|[^A-Z])(NG|NGA|NIGERIA|LAGOS|ABUJA)([^A-Z]|$)/.test(fingerprint)) {
    return 'NGN';
  }

  if (/(^|[^A-Z])(UK|GB|GBR|UNITED KINGDOM|BRITAIN|LONDON)([^A-Z]|$)/.test(fingerprint)) {
    return 'GBP';
  }

  return null;
}

async function resolveBaseCurrencyId(
  repository: FinanceRepository,
  input: {
    explicit_base_currency_id?: string;
    department_id?: string | null;
    fallback_currency_id: string;
  },
): Promise<string> {
  if (input.explicit_base_currency_id) {
    return input.explicit_base_currency_id;
  }

  if (input.department_id) {
    const department = await repository.findDepartmentById(input.department_id);
    if (department !== null) {
      const defaultCurrencyCode = inferRegionalDefaultBaseCurrencyCode(department);
      if (defaultCurrencyCode !== null) {
        const currency = await repository.findCurrencyByCode(defaultCurrencyCode);
        if (currency !== null) {
          return currency.id;
        }
      }
    }
  }

  return input.fallback_currency_id;
}

function generatePaymentRequestNumber(current: Date): string {
  const ts = [
    current.getUTCFullYear().toString().padStart(4, '0'),
    (current.getUTCMonth() + 1).toString().padStart(2, '0'),
    current.getUTCDate().toString().padStart(2, '0'),
    current.getUTCHours().toString().padStart(2, '0'),
    current.getUTCMinutes().toString().padStart(2, '0'),
    current.getUTCSeconds().toString().padStart(2, '0'),
  ].join('');
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');

  return `PR-${ts}-${suffix}`;
}

function generatePayrollRunNumber(current: Date): string {
  const ts = [
    current.getUTCFullYear().toString().padStart(4, '0'),
    (current.getUTCMonth() + 1).toString().padStart(2, '0'),
    current.getUTCDate().toString().padStart(2, '0'),
    current.getUTCHours().toString().padStart(2, '0'),
    current.getUTCMinutes().toString().padStart(2, '0'),
    current.getUTCSeconds().toString().padStart(2, '0'),
  ].join('');
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');

  return `PAYRUN-${ts}-${suffix}`;
}

function getBankDetailsEncryptionKey(): Buffer {
  const configured = process.env.BANK_DETAILS_ENCRYPTION_KEY;
  if (configured && /^[0-9a-fA-F]{64}$/.test(configured)) {
    return Buffer.from(configured, 'hex');
  }
  if (configured) {
    return createHash('sha256').update(configured).digest();
  }
  return createHash('sha256').update('dev-only-bank-details-key').digest();
}

function encryptBankDetailsJson(value: unknown): string {
  const iv = randomBytes(12);
  const key = getBankDetailsEncryptionKey();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptBankDetailsJson(value: string | null): unknown {
  if (value === null) {
    return null;
  }

  const payload = Buffer.from(value, 'base64');
  if (payload.length < 12 + 16) {
    return null;
  }

  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const key = getBankDetailsEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted);
}

function mapEmployeeForApi(employee: {
  id: string;
  legal_name: string;
  email: string;
  department_id: string | null;
  salary_currency_id: string | null;
  base_salary_minor: bigint | null;
  status: 'ACTIVE' | 'INACTIVE';
  bank_details_encrypted: string | null;
  created_at: Date;
  updated_at: Date;
}, options?: {
  reveal_bank_details?: boolean;
}) {
  const decryptedBankDetails = decryptBankDetailsJson(employee.bank_details_encrypted);
  const shouldRevealBankDetails = options?.reveal_bank_details ?? false;

  return {
    id: employee.id,
    name: employee.legal_name,
    email: employee.email,
    department_id: employee.department_id,
    currency_id: employee.salary_currency_id,
    salary_minor: employee.base_salary_minor,
    bank_details_json: shouldRevealBankDetails ? decryptedBankDetails : maskBankDetails(decryptedBankDetails),
    status: employee.status,
    created_at: employee.created_at,
    updated_at: employee.updated_at,
  };
}

function computePayrollTotals(
  items: Array<{
    gross_pay_minor: bigint;
    net_pay_minor: bigint;
  }>,
): { total_gross_minor: bigint; total_net_minor: bigint } {
  return items.reduce(
    (acc, item) => ({
      total_gross_minor: acc.total_gross_minor + item.gross_pay_minor,
      total_net_minor: acc.total_net_minor + item.net_pay_minor,
    }),
    { total_gross_minor: 0n, total_net_minor: 0n },
  );
}

function computeBaseAmountMinor(amountMinor: bigint, fxRatePpm: bigint): bigint {
  if (fxRatePpm <= 0n) {
    throw new Error('FX rate ppm must be greater than zero');
  }

  return (amountMinor * 1_000_000n) / fxRatePpm;
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function escapeCsv(value: string): string {
  if (/["\n\r,]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map((value) => escapeCsv(csvValue(value))).join(','));
  return `${lines.join('\n')}\n`;
}

function setCsvHeaders(res: express.Response, filename: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

function maskSensitiveString(value: string): string {
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

function maskBankDetails(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskBankDetails(item));
  }

  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (
        typeof nested === 'string' &&
        /account|iban|swift|routing|sort|bvn|bank_code|branch/i.test(key)
      ) {
        output[key] = maskSensitiveString(nested);
      } else {
        output[key] = maskBankDetails(nested);
      }
    }
    return output;
  }

  return value;
}

function createIpRateLimiter(options: RateLimiterOptions): express.RequestHandler {
  const buckets = new Map<string, { count: number; reset_at_ms: number }>();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.method}:${req.path}:${ip}`;
    const nowMs = Date.now();

    const existingBucket = buckets.get(key);
    if (!existingBucket || nowMs >= existingBucket.reset_at_ms) {
      buckets.set(key, {
        count: 1,
        reset_at_ms: nowMs + options.window_ms,
      });

      res.setHeader('X-RateLimit-Limit', options.max_requests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max_requests - 1).toString());
      return next();
    }

    if (existingBucket.count >= options.max_requests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existingBucket.reset_at_ms - nowMs) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      res.setHeader('X-RateLimit-Limit', options.max_requests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({ error: 'Too many requests' });
    }

    existingBucket.count += 1;
    res.setHeader('X-RateLimit-Limit', options.max_requests.toString());
    res.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, options.max_requests - existingBucket.count).toString(),
    );
    return next();
  };
}

function isSupportedInvoiceMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
}

export function createApp(dependencies: AppDependencies = {}) {
  const financeRepository = dependencies.financeRepository ?? createPrismaFinanceRepository();
  const now = dependencies.now ?? (() => new Date());
  const app = express();
  const authRateLimiter = createIpRateLimiter({
    window_ms: 60_000,
    max_requests: 5,
  });

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/users', authRateLimiter, (req, res) => {
    const result = createUserSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: result.error.flatten(),
      });
    }

    return res.status(201).json({ user: result.data });
  });

  app.post('/fx-rates', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'FINANCE']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'Admin or Finance role required' });
    }

    const result = createFxRateSnapshotSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: result.error.flatten(),
      });
    }

    try {
      const fxRate = await financeRepository.createFxRateSnapshot({
        base_currency_id: result.data.base_currency_id,
        quote_currency_id: result.data.quote_currency_id,
        fx_rate_ppm: result.data.fx_rate_ppm,
        effective_at: result.data.effective_at ?? now(),
      });

      return res.status(201).json({ fx_rate: serializeForJson(fxRate) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ error: 'FX rate snapshot already exists for that pair and time' });
      }

      return res.status(500).json({ error: 'Failed to create FX rate snapshot' });
    }
  });

  app.get('/fx-rates/latest', async (req, res) => {
    const result = latestFxRateQuerySchema.safeParse(req.query);

    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: result.error.flatten(),
      });
    }

    const latestRate = await financeRepository.findLatestFxRate(
      result.data.base_currency_id,
      result.data.quote_currency_id,
    );

    if (latestRate === null) {
      return res.status(404).json({ error: 'No FX rate snapshot found for that pair' });
    }

    return res.json({ fx_rate: serializeForJson(latestRate) });
  });

  app.post('/spend-items', async (req, res) => {
    const result = createSpendItemSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: result.error.flatten(),
      });
    }

    const payload: CreateSpendItemInput = {
      vendor_id: result.data.vendor_id ?? null,
      department_id: result.data.department_id ?? null,
      currency_id: result.data.currency_id,
      created_by_user_id: result.data.created_by_user_id ?? null,
      description: result.data.description,
      amount_minor: result.data.amount_minor,
      incurred_at: result.data.incurred_at ?? now(),
    };

    try {
      const spendItem = await financeRepository.createSpendItem(payload);
      return res.status(201).json({ spend_item: serializeForJson(spendItem) });
    } catch {
      return res.status(500).json({ error: 'Failed to create spend item' });
    }
  });

  app.get('/spend-items/pending-payment', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['PAYOR', 'ADMIN']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'PAYOR or ADMIN role required' });
    }

    const query = listPendingPaymentSpendItemsQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: query.error.flatten(),
      });
    }

    const { items, total } = await financeRepository.listPendingPaymentSpendItems(
      {
        department_id: query.data.department_id,
        currency_id: query.data.currency_id,
        spend_item_type: query.data.spend_item_type,
      },
      {
        page: query.data.page,
        page_size: query.data.page_size,
      },
    );

    const totalPages = Math.max(1, Math.ceil(total / query.data.page_size));
    return res.json({
      data: serializeForJson(items),
      pagination: {
        page: query.data.page,
        page_size: query.data.page_size,
        total,
        total_pages: totalPages,
      },
    });
  });

  app.get('/exports/spend-items.csv', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'FINANCE', 'PAYOR']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN, FINANCE, or PAYOR role required' });
    }

    const query = exportSpendItemsQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: query.error.flatten(),
      });
    }

    const spendItems = await financeRepository.listSpendItems({
      status: query.data.status,
      department_id: query.data.department_id,
      currency_id: query.data.currency_id,
      spend_item_type: query.data.spend_item_type,
      created_by_user_id: query.data.created_by_user_id,
      incurred_from: query.data.incurred_from,
      incurred_to: query.data.incurred_to,
      submitted_from: query.data.submitted_from,
      submitted_to: query.data.submitted_to,
    });

    const csv = toCsv(
      [
        'id',
        'spend_item_type',
        'status',
        'vendor_id',
        'department_id',
        'currency_id',
        'base_currency_id',
        'amount_minor',
        'base_amount_minor',
        'fx_rate_ppm',
        'fx_rate_locked_at',
        'description',
        'created_by_user_id',
        'incurred_at',
        'submitted_at',
        'approved_at',
        'payment_reference',
        'paid_at',
        'created_at',
        'updated_at',
      ],
      spendItems.map((item) => [
        item.id,
        item.spend_item_type,
        item.status,
        item.vendor_id,
        item.department_id,
        item.currency_id,
        item.base_currency_id,
        item.amount_minor,
        item.base_amount_minor,
        item.fx_rate_ppm,
        item.fx_rate_locked_at,
        item.description,
        item.created_by_user_id,
        item.incurred_at,
        item.submitted_at,
        item.approved_at,
        item.payment_reference,
        item.paid_at,
        item.created_at,
        item.updated_at,
      ]),
    );

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'spend_item.exported',
      entity_type: 'SPEND_ITEM_EXPORT',
      entity_id: 'ALL',
      payload: {
        row_count: spendItems.length,
        filters: {
          ...query.data,
          incurred_from: query.data.incurred_from?.toISOString(),
          incurred_to: query.data.incurred_to?.toISOString(),
          submitted_from: query.data.submitted_from?.toISOString(),
          submitted_to: query.data.submitted_to?.toISOString(),
        },
      },
    });

    setCsvHeaders(res, 'spend-items.csv');
    return res.status(200).send(csv);
  });

  app.get('/spend-items/:id', async (req, res) => {
    const parsedId = uuidSchema.safeParse(req.params.id);

    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid spend item id' });
    }

    const spendItem = await financeRepository.findSpendItemById(parsedId.data);

    if (spendItem === null) {
      return res.status(404).json({ error: 'Spend item not found' });
    }

    return res.json({ spend_item: serializeForJson(spendItem) });
  });

  app.post('/spend-items/:id/submit', async (req, res) => {
    const parsedId = uuidSchema.safeParse(req.params.id);

    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid spend item id' });
    }

    const body = submitSpendItemSchema.safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: body.error.flatten(),
      });
    }

    const spendItem = await financeRepository.findSpendItemById(parsedId.data);

    if (spendItem === null) {
      return res.status(404).json({ error: 'Spend item not found' });
    }

    if (spendItem.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Spend item is not in DRAFT status' });
    }

    if (spendItem.currency_id !== body.data.quote_currency_id) {
      return res.status(400).json({
        error: 'quote_currency_id must match spend item currency_id',
      });
    }

    if (spendItem.created_by_user_id === null) {
      return res.status(400).json({
        error: 'Spend item requires created_by_user_id before submission',
      });
    }

    const submittedAt = now();
    const baseCurrencyId = await resolveBaseCurrencyId(financeRepository, {
      explicit_base_currency_id: body.data.base_currency_id,
      department_id: spendItem.department_id,
      fallback_currency_id: body.data.quote_currency_id,
    });
    let baseAmountMinor = spendItem.amount_minor;
    let fxRatePpm: bigint | null = null;
    let fxRateLockedAt: Date | null = null;
    let lockedFxRate: { id: string; fx_rate_ppm: bigint; effective_at: Date } | null = null;

    if (baseCurrencyId !== body.data.quote_currency_id) {
      const latestRate = await financeRepository.findLatestFxRate(
        baseCurrencyId,
        body.data.quote_currency_id,
      );

      if (latestRate === null) {
        return res.status(404).json({ error: 'No FX rate snapshot found for that pair' });
      }

      try {
        baseAmountMinor = computeBaseAmountMinor(spendItem.amount_minor, latestRate.fx_rate_ppm);
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : 'Unable to compute base amount',
        });
      }

      fxRatePpm = latestRate.fx_rate_ppm;
      fxRateLockedAt = submittedAt;
      lockedFxRate = {
        id: latestRate.id,
        fx_rate_ppm: latestRate.fx_rate_ppm,
        effective_at: latestRate.effective_at,
      };
    }

    const resolvedPolicy = await financeRepository.findApplicableSpendItemApprovalPolicy(
      spendItem.spend_item_type,
      spendItem.department_id,
      baseCurrencyId,
      baseAmountMinor,
    );

    if (resolvedPolicy === null) {
      return res.status(404).json({
        error: 'No active approval policy matched this spend item type, department, base currency, and threshold',
      });
    }

    try {
      const updatedSpendItem = await financeRepository.updateSpendItemApprovalState(spendItem.id, {
        status: 'SUBMITTED',
        submitted_at: submittedAt,
        base_currency_id: baseCurrencyId,
        base_amount_minor: baseAmountMinor,
        fx_rate_ppm: fxRatePpm,
        fx_rate_locked_at: fxRateLockedAt,
      });

      const { approval_instance, approval_steps } = await financeRepository.createApprovalInstanceForSpendItem({
        spend_item_id: spendItem.id,
        requested_by_user_id: spendItem.created_by_user_id,
        approval_policy_id: resolvedPolicy.approval_policy_id,
        steps: resolvedPolicy.steps,
      });

      await financeRepository.createAuditEvent({
        actor_user_id: spendItem.created_by_user_id,
        event_type: 'spend_item.submitted',
        entity_type: 'SPEND_ITEM',
        entity_id: spendItem.id,
        payload: {
          base_currency_id: baseCurrencyId,
          base_amount_minor: baseAmountMinor.toString(),
          fx_rate_ppm: fxRatePpm?.toString() ?? null,
          approval_policy_id: resolvedPolicy.approval_policy_id,
          approval_policy_code: resolvedPolicy.approval_policy_code,
          approval_policy_rule_id: resolvedPolicy.approval_policy_rule_id,
          approval_instance_id: approval_instance.id,
          approval_step_count: approval_steps.length,
        },
        occurred_at: submittedAt,
      });

      return res.json({
        spend_item: serializeForJson(updatedSpendItem),
        locked_fx_rate: serializeForJson(lockedFxRate),
        approval_instance: serializeForJson(approval_instance),
        approval_steps: serializeForJson(approval_steps),
        approval_policy: serializeForJson(resolvedPolicy),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ error: 'A pending approval instance already exists for this spend item' });
      }

      return res.status(500).json({ error: 'Failed to submit spend item' });
    }
  });

  app.post('/spend-items/:id/mark-paid', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const actorRoleCodes = await financeRepository.getUserRoleCodes(userId);
    const hasPrivilege = actorRoleCodes.some((roleCode) => ['PAYOR', 'ADMIN'].includes(roleCode));
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'PAYOR or ADMIN role required' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid spend item id' });
    }

    const payload = markSpendItemPaidSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    const spendItem = await financeRepository.findSpendItemById(parsedId.data);
    if (spendItem === null) {
      return res.status(404).json({ error: 'Spend item not found' });
    }

    if (spendItem.status !== 'APPROVED') {
      return res.status(409).json({
        error: 'Only APPROVED spend items can be marked as PAID',
      });
    }

    const finalApproverUserId = await financeRepository.findFinalApproverForSpendItem(spendItem.id);
    const isPayor = actorRoleCodes.includes('PAYOR');
    if (isPayor && finalApproverUserId !== null && finalApproverUserId === userId) {
      return res.status(403).json({
        error: 'PAYOR cannot be the same user that acted on the final approval step',
      });
    }

    const updated = await financeRepository.updateSpendItemApprovalState(spendItem.id, {
      status: 'PAID',
      payment_reference: payload.data.payment_reference,
      paid_at: payload.data.paid_at,
    });

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'PAID',
      entity_type: 'SPEND_ITEM',
      entity_id: spendItem.id,
      payload: {
        payment_reference: payload.data.payment_reference,
      },
      occurred_at: payload.data.paid_at,
    });

    return res.json({
      spend_item: serializeForJson(updated),
    });
  });

  app.post('/employees', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'PAYROLL_ADMIN']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN or PAYROLL_ADMIN role required' });
    }

    const payload = createEmployeeSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    try {
      const created = await financeRepository.createEmployee({
        name: payload.data.name,
        email: payload.data.email,
        department_id: payload.data.department_id ?? null,
        currency_id: payload.data.currency_id,
        salary_minor: payload.data.salary_minor,
        bank_details_encrypted: encryptBankDetailsJson(payload.data.bank_details_json),
        status: payload.data.status,
      });

      await financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'employee.created',
        entity_type: 'EMPLOYEE',
        entity_id: created.id,
        payload: {
          email: created.email,
          department_id: created.department_id,
          currency_id: created.salary_currency_id,
          status: created.status,
        },
        occurred_at: now(),
      });

      return res.status(201).json({ employee: serializeForJson(mapEmployeeForApi(created)) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ error: 'Employee already exists for this user/email' });
      }
      if (error instanceof Error && error.message.toLowerCase().includes('conflict')) {
        return res.status(409).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to create employee' });
    }
  });

  app.get('/employees', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const actorRoleCodes = await financeRepository.getUserRoleCodes(userId);
    const hasPrivilege = actorRoleCodes.some((roleCode) =>
      ['ADMIN', 'PAYROLL_ADMIN', 'PAYOR'].includes(roleCode),
    );
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN, PAYROLL_ADMIN, or PAYOR role required' });
    }

    const revealBankDetails = actorRoleCodes.includes('PAYOR');

    const query = listEmployeesQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: query.error.flatten(),
      });
    }

    const { items, total } = await financeRepository.listEmployees(
      {
        department_id: query.data.department_id,
        currency_id: query.data.currency_id,
        status: query.data.status,
      },
      {
        page: query.data.page,
        page_size: query.data.page_size,
      },
    );

    const totalPages = Math.max(1, Math.ceil(total / query.data.page_size));
    return res.json({
      data: serializeForJson(
        items.map((item) =>
          mapEmployeeForApi(item, {
            reveal_bank_details: revealBankDetails,
          }),
        ),
      ),
      pagination: {
        page: query.data.page,
        page_size: query.data.page_size,
        total,
        total_pages: totalPages,
      },
    });
  });

  app.get('/employees/:id', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const actorRoleCodes = await financeRepository.getUserRoleCodes(userId);
    const hasPrivilege = actorRoleCodes.some((roleCode) =>
      ['ADMIN', 'PAYROLL_ADMIN', 'PAYOR'].includes(roleCode),
    );
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN, PAYROLL_ADMIN, or PAYOR role required' });
    }

    const revealBankDetails = actorRoleCodes.includes('PAYOR');

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid employee id' });
    }

    const employee = await financeRepository.findEmployeeById(parsedId.data);
    if (employee === null) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    return res.json({
      employee: serializeForJson(
        mapEmployeeForApi(employee, {
          reveal_bank_details: revealBankDetails,
        }),
      ),
    });
  });

  app.patch('/employees/:id', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'PAYROLL_ADMIN']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN or PAYROLL_ADMIN role required' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid employee id' });
    }

    const payload = updateEmployeeSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    const existing = await financeRepository.findEmployeeById(parsedId.data);
    if (existing === null) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    try {
      const updated = await financeRepository.updateEmployee(parsedId.data, {
        name: payload.data.name,
        email: payload.data.email,
        department_id: payload.data.department_id,
        currency_id: payload.data.currency_id,
        salary_minor: payload.data.salary_minor,
        bank_details_encrypted:
          payload.data.bank_details_json !== undefined
            ? encryptBankDetailsJson(payload.data.bank_details_json)
            : undefined,
        status: payload.data.status,
      });

      await financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'employee.updated',
        entity_type: 'EMPLOYEE',
        entity_id: updated.id,
        payload: serializeForJson(payload.data),
        occurred_at: now(),
      });

      return res.json({ employee: serializeForJson(mapEmployeeForApi(updated)) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ error: 'Employee email conflict' });
      }
      if (error instanceof Error && error.message.toLowerCase().includes('conflict')) {
        return res.status(409).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to update employee' });
    }
  });

  app.delete('/employees/:id', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'PAYROLL_ADMIN']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN or PAYROLL_ADMIN role required' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid employee id' });
    }

    try {
      await financeRepository.deleteEmployee(parsedId.data);
      await financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'employee.deleted',
        entity_type: 'EMPLOYEE',
        entity_id: parsedId.data,
        payload: null,
        occurred_at: now(),
      });
      return res.status(204).send();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return res.status(409).json({ error: 'Cannot delete employee with payroll history' });
      }
      if (error instanceof Error && error.message.includes('payroll history')) {
        return res.status(409).json({ error: 'Cannot delete employee with payroll history' });
      }
      return res.status(500).json({ error: 'Failed to delete employee' });
    }
  });

  app.post('/payroll-runs', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'PAYROLL_ADMIN']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN or PAYROLL_ADMIN role required' });
    }

    const payload = createPayrollRunSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    if (payload.data.period_start > payload.data.period_end) {
      return res.status(400).json({
        error: 'period_start must be before or equal to period_end',
      });
    }

    try {
      const created = await financeRepository.createPayrollRun({
        run_number: generatePayrollRunNumber(now()),
        period_start: payload.data.period_start,
        period_end: payload.data.period_end,
        pay_date: payload.data.pay_date ?? null,
        currency_id: payload.data.currency_id,
        created_by_user_id: userId,
      });

      await financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'payroll_run.created',
        entity_type: 'PAYROLL_RUN',
        entity_id: created.id,
        payload: {
          run_number: created.run_number,
          period_start: created.period_start,
          period_end: created.period_end,
          currency_id: created.currency_id,
        },
        occurred_at: now(),
      });

      return res.status(201).json({ payroll_run: serializeForJson(created) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ error: 'Payroll run already exists for period and currency' });
      }
      return res.status(500).json({ error: 'Failed to create payroll run' });
    }
  });

  app.post('/payroll-runs/:id/load-employees', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'PAYROLL_ADMIN']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN or PAYROLL_ADMIN role required' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payroll run id' });
    }

    const payrollRun = await financeRepository.findPayrollRunById(parsedId.data);
    if (payrollRun === null) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    if (payrollRun.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Payroll run is immutable after submission' });
    }

    const employees = await financeRepository.findActiveEmployeesForPayrollCurrency(payrollRun.currency_id);
    const snapshots = employees
      .filter((employee) => employee.base_salary_minor !== null)
      .map((employee) => ({
        employee_id: employee.id,
        currency_id: payrollRun.currency_id,
        gross_pay_minor: employee.base_salary_minor ?? 0n,
        deductions_minor: 0n,
        net_pay_minor: employee.base_salary_minor ?? 0n,
      }));

    if (snapshots.length === 0) {
      return res.status(400).json({ error: 'No active employees with salary found for payroll currency' });
    }

    const items = await financeRepository.replacePayrollRunItemsWithEmployeeSnapshots(
      payrollRun.id,
      snapshots,
    );
    const totals = computePayrollTotals(items);
    const updatedPayrollRun = await financeRepository.updatePayrollRun(payrollRun.id, {
      total_gross_minor: totals.total_gross_minor,
      total_net_minor: totals.total_net_minor,
    });

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'payroll_run.employees_loaded',
      entity_type: 'PAYROLL_RUN',
      entity_id: payrollRun.id,
      payload: {
        employee_count: items.length,
        total_gross_minor: totals.total_gross_minor.toString(),
        total_net_minor: totals.total_net_minor.toString(),
      },
      occurred_at: now(),
    });

    return res.json({
      payroll_run: serializeForJson(updatedPayrollRun),
      payroll_run_items: serializeForJson(items),
    });
  });

  app.post('/payroll-runs/:id/adjustments', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'PAYROLL_ADMIN']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN or PAYROLL_ADMIN role required' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payroll run id' });
    }

    const payload = createPayrollAdjustmentSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    const payrollRun = await financeRepository.findPayrollRunById(parsedId.data);
    if (payrollRun === null) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    if (payrollRun.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Payroll run is immutable after submission' });
    }

    const payrollRunItem = await financeRepository.findPayrollRunItemByRunEmployee(
      payrollRun.id,
      payload.data.employee_id,
    );
    if (payrollRunItem === null) {
      return res.status(404).json({ error: 'Employee is not part of this payroll run' });
    }

    if (payrollRunItem.currency_id !== payrollRun.currency_id) {
      return res.status(409).json({ error: 'Payroll run items must remain single-currency' });
    }

    let nextGross = payrollRunItem.gross_pay_minor;
    let nextDeductions = payrollRunItem.deductions_minor;
    let nextNet = payrollRunItem.net_pay_minor;
    if (payload.data.adjustment_type === 'EARNING') {
      nextGross += payload.data.amount_minor;
      nextNet += payload.data.amount_minor;
    } else if (payload.data.adjustment_type === 'DEDUCTION') {
      nextDeductions += payload.data.amount_minor;
      nextNet -= payload.data.amount_minor;
    } else {
      nextNet += payload.data.amount_minor;
    }

    const [createdAdjustment, updatedRunItem] = await Promise.all([
      financeRepository.createPayrollAdjustment({
        payroll_run_id: payrollRun.id,
        payroll_run_item_id: payrollRunItem.id,
        employee_id: payload.data.employee_id,
        currency_id: payrollRun.currency_id,
        created_by_user_id: userId,
        adjustment_type: payload.data.adjustment_type,
        amount_minor: payload.data.amount_minor,
        reason: payload.data.notes,
      }),
      financeRepository.updatePayrollRunItem(payrollRunItem.id, {
        gross_pay_minor: nextGross,
        deductions_minor: nextDeductions,
        net_pay_minor: nextNet,
      }),
    ]);

    const refreshedItems = await financeRepository.listPayrollRunItems(payrollRun.id);
    const totals = computePayrollTotals(refreshedItems);
    const updatedPayrollRun = await financeRepository.updatePayrollRun(payrollRun.id, {
      total_gross_minor: totals.total_gross_minor,
      total_net_minor: totals.total_net_minor,
    });

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'payroll_run.adjustment_added',
      entity_type: 'PAYROLL_RUN',
      entity_id: payrollRun.id,
      payload: {
        employee_id: payload.data.employee_id,
        adjustment_type: payload.data.adjustment_type,
        amount_minor: payload.data.amount_minor.toString(),
        notes: payload.data.notes,
      },
      occurred_at: now(),
    });

    return res.status(201).json({
      payroll_run: serializeForJson(updatedPayrollRun),
      payroll_run_item: serializeForJson(updatedRunItem),
      payroll_adjustment: serializeForJson(createdAdjustment),
    });
  });

  app.post('/payroll-runs/:id/submit', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'PAYROLL_ADMIN']);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN or PAYROLL_ADMIN role required' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payroll run id' });
    }

    const payrollRun = await financeRepository.findPayrollRunById(parsedId.data);
    if (payrollRun === null) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    if (payrollRun.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Payroll run already submitted' });
    }

    const runItems = await financeRepository.listPayrollRunItems(payrollRun.id);
    if (runItems.length === 0) {
      return res.status(400).json({ error: 'Payroll run has no employees loaded' });
    }

    if (runItems.some((item) => item.currency_id !== payrollRun.currency_id)) {
      return res.status(409).json({ error: 'Payroll run must remain single-currency' });
    }

    const totals = computePayrollTotals(runItems);
    const resolvedPolicy = await financeRepository.findApplicableSpendItemApprovalPolicy(
      'PAYROLL_RUN',
      null,
      payrollRun.currency_id,
      totals.total_net_minor,
    );
    if (resolvedPolicy === null) {
      return res.status(404).json({
        error: 'No active payroll approval policy matched currency and threshold',
      });
    }

    const submittedAt = now();
    const spendItem = await financeRepository.createSpendItem({
      department_id: null,
      currency_id: payrollRun.currency_id,
      base_currency_id: payrollRun.currency_id,
      created_by_user_id: userId,
      spend_item_type: 'PAYROLL_RUN',
      description: `Payroll run ${payrollRun.run_number}`,
      amount_minor: totals.total_net_minor,
      base_amount_minor: totals.total_net_minor,
      incurred_at: payrollRun.pay_date ?? submittedAt,
    });

    const updatedSpendItem = await financeRepository.updateSpendItemApprovalState(spendItem.id, {
      status: 'SUBMITTED',
      submitted_at: submittedAt,
      base_currency_id: payrollRun.currency_id,
      base_amount_minor: totals.total_net_minor,
      fx_rate_ppm: null,
      fx_rate_locked_at: submittedAt,
    });

    const { approval_instance, approval_steps } = await financeRepository.createApprovalInstanceForSpendItem({
      spend_item_id: spendItem.id,
      requested_by_user_id: userId,
      approval_policy_id: resolvedPolicy.approval_policy_id,
      steps: resolvedPolicy.steps,
    });

    const updatedPayrollRun = await financeRepository.updatePayrollRun(payrollRun.id, {
      spend_item_id: spendItem.id,
      status: 'PENDING_APPROVAL',
      total_gross_minor: totals.total_gross_minor,
      total_net_minor: totals.total_net_minor,
      submitted_at: submittedAt,
    });

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'payroll_run.submitted',
      entity_type: 'PAYROLL_RUN',
      entity_id: payrollRun.id,
      payload: {
        spend_item_id: spendItem.id,
        approval_instance_id: approval_instance.id,
        total_gross_minor: totals.total_gross_minor.toString(),
        total_net_minor: totals.total_net_minor.toString(),
      },
      occurred_at: submittedAt,
    });

    return res.json({
      payroll_run: serializeForJson(updatedPayrollRun),
      spend_item: serializeForJson(updatedSpendItem),
      approval_instance: serializeForJson(approval_instance),
      approval_steps: serializeForJson(approval_steps),
      approval_policy: serializeForJson(resolvedPolicy),
    });
  });

  app.get('/payroll-runs', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, [
      'ADMIN',
      'PAYROLL_ADMIN',
      'PAYOR',
    ]);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN, PAYROLL_ADMIN, or PAYOR role required' });
    }

    const query = listPayrollRunsQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: query.error.flatten(),
      });
    }

    const { items, total } = await financeRepository.listPayrollRuns({
      page: query.data.page,
      page_size: query.data.page_size,
    });

    const totalPages = Math.max(1, Math.ceil(total / query.data.page_size));
    return res.json({
      data: serializeForJson(items),
      pagination: {
        page: query.data.page,
        page_size: query.data.page_size,
        total,
        total_pages: totalPages,
      },
    });
  });

  app.get('/payroll-runs/:id', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, [
      'ADMIN',
      'PAYROLL_ADMIN',
      'PAYOR',
    ]);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN, PAYROLL_ADMIN, or PAYOR role required' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payroll run id' });
    }

    const payrollRun = await financeRepository.findPayrollRunById(parsedId.data);
    if (payrollRun === null) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const [runItems, adjustments, spendItem, approvalInstances, auditEvents] = await Promise.all([
      financeRepository.listPayrollRunItems(payrollRun.id),
      financeRepository.listPayrollAdjustments(payrollRun.id),
      payrollRun.spend_item_id
        ? financeRepository.findSpendItemById(payrollRun.spend_item_id)
        : Promise.resolve(null),
      payrollRun.spend_item_id
        ? financeRepository.listApprovalInstancesForSpendItem(payrollRun.spend_item_id)
        : Promise.resolve([]),
      financeRepository.listAuditEvents('PAYROLL_RUN', payrollRun.id),
    ]);

    const totals = computePayrollTotals(runItems);
    const timeline = auditEvents.map((event) => ({
      event_type: event.event_type,
      actor_user_id: event.actor_user_id,
      occurred_at: event.occurred_at,
      payload: event.payload,
    }));

    return res.json({
      payroll_run: serializeForJson(payrollRun),
      payroll_run_items: serializeForJson(runItems),
      payroll_adjustments: serializeForJson(adjustments),
      totals: serializeForJson(totals),
      spend_item: serializeForJson(spendItem),
      approval_instances: serializeForJson(approvalInstances),
      timeline: serializeForJson(timeline),
      audit_events: serializeForJson(auditEvents),
    });
  });

  app.get('/payroll-runs/:id/export.csv', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasPrivilege = await requireAnyRole(financeRepository, userId, [
      'ADMIN',
      'PAYROLL_ADMIN',
      'PAYOR',
    ]);
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'ADMIN, PAYROLL_ADMIN, or PAYOR role required' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payroll run id' });
    }

    const payrollRun = await financeRepository.findPayrollRunById(parsedId.data);
    if (payrollRun === null) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const runItems = await financeRepository.listPayrollRunItems(payrollRun.id);
    const uniqueEmployeeIds = [...new Set(runItems.map((item) => item.employee_id))];
    const employeeEntries = await Promise.all(
      uniqueEmployeeIds.map(async (employeeId) => [
        employeeId,
        await financeRepository.findEmployeeById(employeeId),
      ]),
    );
    const employeeById = new Map(
      employeeEntries.filter(
        (entry): entry is [string, NonNullable<Awaited<ReturnType<FinanceRepository['findEmployeeById']>>>] =>
          entry[1] !== null,
      ),
    );

    const csv = toCsv(
      [
        'payroll_run_id',
        'run_number',
        'period_start',
        'period_end',
        'pay_date',
        'currency_id',
        'employee_id',
        'employee_name',
        'employee_email',
        'gross_pay_minor',
        'deductions_minor',
        'net_pay_minor',
        'bank_details_json',
      ],
      runItems.map((item) => {
        const employee = employeeById.get(item.employee_id);
        const bankDetails = employee ? decryptBankDetailsJson(employee.bank_details_encrypted) : null;
        return [
          payrollRun.id,
          payrollRun.run_number,
          payrollRun.period_start,
          payrollRun.period_end,
          payrollRun.pay_date,
          payrollRun.currency_id,
          item.employee_id,
          item.employee_legal_name,
          item.employee_email,
          item.gross_pay_minor,
          item.deductions_minor,
          item.net_pay_minor,
          maskBankDetails(bankDetails),
        ];
      }),
    );

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'payroll_run.exported',
      entity_type: 'PAYROLL_RUN',
      entity_id: payrollRun.id,
      payload: {
        secure: false,
        row_count: runItems.length,
      },
    });

    setCsvHeaders(res, `payroll-run-${payrollRun.run_number}-masked.csv`);
    return res.status(200).send(csv);
  });

  app.get('/payroll-runs/:id/export-secure.csv', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const roleCodes = await financeRepository.getUserRoleCodes(userId);
    if (!roleCodes.includes('PAYOR')) {
      return res.status(403).json({ error: 'PAYOR role required for secure payroll export' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payroll run id' });
    }

    const payrollRun = await financeRepository.findPayrollRunById(parsedId.data);
    if (payrollRun === null) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const runItems = await financeRepository.listPayrollRunItems(payrollRun.id);
    const uniqueEmployeeIds = [...new Set(runItems.map((item) => item.employee_id))];
    const employeeEntries = await Promise.all(
      uniqueEmployeeIds.map(async (employeeId) => [
        employeeId,
        await financeRepository.findEmployeeById(employeeId),
      ]),
    );
    const employeeById = new Map(
      employeeEntries.filter(
        (entry): entry is [string, NonNullable<Awaited<ReturnType<FinanceRepository['findEmployeeById']>>>] =>
          entry[1] !== null,
      ),
    );

    const csv = toCsv(
      [
        'payroll_run_id',
        'run_number',
        'period_start',
        'period_end',
        'pay_date',
        'currency_id',
        'employee_id',
        'employee_name',
        'employee_email',
        'gross_pay_minor',
        'deductions_minor',
        'net_pay_minor',
        'bank_details_json',
      ],
      runItems.map((item) => {
        const employee = employeeById.get(item.employee_id);
        const bankDetails = employee ? decryptBankDetailsJson(employee.bank_details_encrypted) : null;
        return [
          payrollRun.id,
          payrollRun.run_number,
          payrollRun.period_start,
          payrollRun.period_end,
          payrollRun.pay_date,
          payrollRun.currency_id,
          item.employee_id,
          item.employee_legal_name,
          item.employee_email,
          item.gross_pay_minor,
          item.deductions_minor,
          item.net_pay_minor,
          bankDetails,
        ];
      }),
    );

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'payroll_run.exported_secure',
      entity_type: 'PAYROLL_RUN',
      entity_id: payrollRun.id,
      payload: {
        secure: true,
        row_count: runItems.length,
      },
    });

    setCsvHeaders(res, `payroll-run-${payrollRun.run_number}-secure.csv`);
    return res.status(200).send(csv);
  });

  app.post('/payroll-runs/:id/mark-paid', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const actorRoleCodes = await financeRepository.getUserRoleCodes(userId);
    const hasPrivilege = actorRoleCodes.some((roleCode) => ['PAYOR', 'ADMIN'].includes(roleCode));
    if (!hasPrivilege) {
      return res.status(403).json({ error: 'PAYOR or ADMIN role required' });
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payroll run id' });
    }

    const payload = markSpendItemPaidSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    const payrollRun = await financeRepository.findPayrollRunById(parsedId.data);
    if (payrollRun === null) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    if (payrollRun.spend_item_id === null) {
      return res.status(409).json({ error: 'Payroll run has not been submitted to approvals' });
    }

    const spendItem = await financeRepository.findSpendItemById(payrollRun.spend_item_id);
    if (spendItem === null) {
      return res.status(404).json({ error: 'Linked spend item not found' });
    }

    if (spendItem.status !== 'APPROVED') {
      return res.status(409).json({ error: 'Only APPROVED payroll runs can be marked as PAID' });
    }

    const finalApproverUserId = await financeRepository.findFinalApproverForSpendItem(spendItem.id);
    const isPayor = actorRoleCodes.includes('PAYOR');
    if (isPayor && finalApproverUserId !== null && finalApproverUserId === userId) {
      return res.status(403).json({
        error: 'PAYOR cannot be the same user that acted on the final approval step',
      });
    }

    const [updatedSpendItem, updatedPayrollRun] = await Promise.all([
      financeRepository.updateSpendItemApprovalState(spendItem.id, {
        status: 'PAID',
        payment_reference: payload.data.payment_reference,
        paid_at: payload.data.paid_at,
      }),
      financeRepository.updatePayrollRun(payrollRun.id, {
        status: 'PROCESSED',
        payment_reference: payload.data.payment_reference,
        paid_at: payload.data.paid_at,
      }),
    ]);

    await Promise.all([
      financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'PAID',
        entity_type: 'SPEND_ITEM',
        entity_id: spendItem.id,
        payload: { payment_reference: payload.data.payment_reference },
        occurred_at: payload.data.paid_at,
      }),
      financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'payroll_run.paid',
        entity_type: 'PAYROLL_RUN',
        entity_id: payrollRun.id,
        payload: { payment_reference: payload.data.payment_reference },
        occurred_at: payload.data.paid_at,
      }),
    ]);

    return res.json({
      payroll_run: serializeForJson(updatedPayrollRun),
      spend_item: serializeForJson(updatedSpendItem),
    });
  });

  app.post('/payment-requests', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const hasDeptHeadRole = await requireAnyRole(financeRepository, userId, ['DEPT_HEAD']);
    if (!hasDeptHeadRole) {
      return res.status(403).json({ error: 'DEPT_HEAD role required' });
    }

    const payload = createPaymentRequestSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    const spendItem = await financeRepository.findSpendItemById(payload.data.spend_item_id);
    if (spendItem === null) {
      return res.status(404).json({ error: 'Spend item not found' });
    }

    const departmentId = payload.data.department_id ?? spendItem.department_id;
    if (departmentId === null) {
      return res.status(400).json({ error: 'department_id is required for draft creation' });
    }

    const userDepartmentIds = await financeRepository.getUserDepartmentIds(userId);
    if (!userDepartmentIds.includes(departmentId)) {
      return res.status(403).json({ error: 'DEPT_HEAD can only create drafts for their department' });
    }

    const currentTime = now();
    const requestNumber = generatePaymentRequestNumber(currentTime);

    try {
      const paymentRequest = await financeRepository.createPaymentRequestDraft({
        request_number: requestNumber,
        spend_item_id: spendItem.id,
        vendor_id: payload.data.vendor_id ?? spendItem.vendor_id,
        department_id: departmentId,
        currency_id: spendItem.currency_id,
        requested_by_user_id: userId,
        requested_amount_minor: payload.data.requested_amount_minor ?? spendItem.amount_minor,
        due_at: payload.data.due_at ?? null,
      });

      await financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'payment_request.created',
        entity_type: 'PAYMENT_REQUEST',
        entity_id: paymentRequest.id,
        payload: {
          spend_item_id: spendItem.id,
          request_number: paymentRequest.request_number,
        },
        occurred_at: currentTime,
      });

      return res.status(201).json({
        payment_request: serializeForJson(paymentRequest),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ error: 'A payment request with that request number already exists' });
      }

      return res.status(500).json({ error: 'Failed to create draft payment request' });
    }
  });

  app.patch('/payment-requests/:id', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payment request id' });
    }

    const payload = editPaymentRequestSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    const paymentRequest = await financeRepository.findPaymentRequestById(parsedId.data);
    if (paymentRequest === null) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    if (paymentRequest.requested_by_user_id !== userId) {
      return res.status(403).json({ error: 'Only the requestor can edit this payment request' });
    }

    if (paymentRequest.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Requestor cannot edit after submission' });
    }

    if (payload.data.department_id) {
      const userDepartmentIds = await financeRepository.getUserDepartmentIds(userId);
      if (!userDepartmentIds.includes(payload.data.department_id)) {
        return res.status(403).json({ error: 'DEPT_HEAD can only edit drafts for their department' });
      }
    }

    const updated = await financeRepository.updatePaymentRequest(parsedId.data, {
      requested_amount_minor: payload.data.requested_amount_minor,
      due_at: payload.data.due_at,
      department_id: payload.data.department_id,
      vendor_id: payload.data.vendor_id,
    });

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'payment_request.updated',
      entity_type: 'PAYMENT_REQUEST',
      entity_id: updated.id,
      payload: serializeForJson(payload.data),
      occurred_at: now(),
    });

    return res.json({ payment_request: serializeForJson(updated) });
  });

  app.post('/payment-requests/:id/files', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payment request id' });
    }

    const payload = attachFileToPaymentRequestSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    const paymentRequest = await financeRepository.findPaymentRequestById(parsedId.data);
    if (paymentRequest === null) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    if (paymentRequest.requested_by_user_id !== userId) {
      return res.status(403).json({ error: 'Only the requestor can attach files' });
    }

    if (paymentRequest.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Requestor cannot edit after submission' });
    }

    const fileExists = await financeRepository.fileExists(payload.data.file_id);
    if (!fileExists) {
      return res.status(404).json({ error: 'File not found' });
    }

    try {
      const result = await financeRepository.attachFileToPaymentRequest(
        paymentRequest.id,
        payload.data.file_id,
      );

      await financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'payment_request.file_added',
        entity_type: 'PAYMENT_REQUEST',
        entity_id: paymentRequest.id,
        payload: {
          file_id: payload.data.file_id,
          created: result.created,
        },
        occurred_at: now(),
      });

      return res.status(result.created ? 201 : 200).json({
        payment_request_id: paymentRequest.id,
        file_id: payload.data.file_id,
        created: result.created,
      });
    } catch {
      return res.status(400).json({ error: 'Payment request must be linked to a spend item before attaching files' });
    }
  });

  app.post('/payment-requests/:id/submit', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payment request id' });
    }

    const payload = submitPaymentRequestSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    const paymentRequest = await financeRepository.findPaymentRequestById(parsedId.data);
    if (paymentRequest === null) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    if (paymentRequest.requested_by_user_id !== userId) {
      return res.status(403).json({ error: 'Only the requestor can submit this payment request' });
    }

    if (paymentRequest.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Payment request already submitted' });
    }

    const missingFields: string[] = [];
    if (paymentRequest.spend_item_id === null) {
      missingFields.push('spend_item_id');
    }
    if (paymentRequest.department_id === null) {
      missingFields.push('department_id');
    }
    if (paymentRequest.currency_id === '') {
      missingFields.push('currency_id');
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields for submission',
        missing_fields: missingFields,
      });
    }

    const baseCurrencyId = await resolveBaseCurrencyId(financeRepository, {
      explicit_base_currency_id: payload.data.base_currency_id,
      department_id: paymentRequest.department_id,
      fallback_currency_id: paymentRequest.currency_id,
    });
    const submittedAt = now();
    let baseAmountMinor = paymentRequest.requested_amount_minor;
    let fxRatePpm: bigint | null = null;
    let fxRateLockedAt: Date | null = null;

    if (baseCurrencyId !== paymentRequest.currency_id) {
      const latestRate = await financeRepository.findLatestFxRate(
        baseCurrencyId,
        paymentRequest.currency_id,
      );

      if (latestRate === null) {
        return res.status(404).json({ error: 'No FX rate snapshot found for base/quote pair' });
      }

      try {
        baseAmountMinor = computeBaseAmountMinor(paymentRequest.requested_amount_minor, latestRate.fx_rate_ppm);
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : 'Unable to compute base amount',
        });
      }

      fxRatePpm = latestRate.fx_rate_ppm;
      fxRateLockedAt = submittedAt;
    }

    const updatedPaymentRequest = await financeRepository.updatePaymentRequest(paymentRequest.id, {
      status: 'SUBMITTED',
      base_currency_id: baseCurrencyId,
      base_amount_minor: baseAmountMinor,
      fx_rate_ppm: fxRatePpm,
      fx_rate_locked_at: fxRateLockedAt,
      submitted_at: submittedAt,
    });

    if (paymentRequest.spend_item_id !== null && fxRatePpm !== null) {
      const spendItem = await financeRepository.findSpendItemById(paymentRequest.spend_item_id);
      if (spendItem !== null && spendItem.fx_rate_locked_at === null) {
        await financeRepository.lockSpendItemFx({
          spend_item_id: spendItem.id,
          fx_rate_ppm: fxRatePpm,
          locked_at: submittedAt,
        });
      }
    }

    const approvalInstance = await financeRepository.createApprovalInstanceForPaymentRequest(
      paymentRequest.id,
      userId,
    );

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'payment_request.submitted',
      entity_type: 'PAYMENT_REQUEST',
      entity_id: paymentRequest.id,
      payload: {
        base_currency_id: baseCurrencyId,
        fx_rate_ppm: fxRatePpm?.toString() ?? null,
        base_amount_minor: baseAmountMinor.toString(),
      },
      occurred_at: submittedAt,
    });

    return res.json({
      payment_request: serializeForJson(updatedPaymentRequest),
      approval_instance: serializeForJson(approvalInstance),
    });
  });

  app.get('/payment-requests', async (req, res) => {
    const query = listPaymentRequestsQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: query.error.flatten(),
      });
    }

    const { items, total } = await financeRepository.listPaymentRequests(
      {
        status: query.data.status,
        department_id: query.data.department_id,
        requested_by_user_id: query.data.requested_by_user_id,
        currency_id: query.data.currency_id,
      },
      {
        page: query.data.page,
        page_size: query.data.page_size,
      },
    );

    const totalPages = Math.max(1, Math.ceil(total / query.data.page_size));

    return res.json({
      data: serializeForJson(items),
      pagination: {
        page: query.data.page,
        page_size: query.data.page_size,
        total,
        total_pages: totalPages,
      },
    });
  });

  app.get('/payment-requests/:id', async (req, res) => {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid payment request id' });
    }

    const paymentRequest = await financeRepository.findPaymentRequestById(parsedId.data);
    if (paymentRequest === null) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    const [attachments, approvalInstances, auditEvents] = await Promise.all([
      financeRepository.listPaymentRequestFiles(paymentRequest.id),
      financeRepository.listApprovalInstancesForPaymentRequest(paymentRequest.id),
      financeRepository.listAuditEvents('PAYMENT_REQUEST', paymentRequest.id),
    ]);

    const timeline = auditEvents.map((event) => ({
      event_type: event.event_type,
      actor_user_id: event.actor_user_id,
      occurred_at: event.occurred_at,
      payload: event.payload,
    }));

    return res.json({
      payment_request: serializeForJson(paymentRequest),
      attachments: serializeForJson(attachments),
      approval_instances: serializeForJson(approvalInstances),
      timeline: serializeForJson(timeline),
      audit_events: serializeForJson(auditEvents),
    });
  });

  app.post('/external-invoices', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const payload = createExternalInvoiceSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    if (!isSupportedInvoiceMimeType(payload.data.file.mime_type)) {
      return res.status(400).json({ error: 'Invoice file must be a PDF or image MIME type' });
    }

    const totalAmountMinor = payload.data.total_amount_minor ?? payload.data.amount_minor;
    if (totalAmountMinor === undefined) {
      return res.status(400).json({ error: 'Either amount_minor or total_amount_minor is required' });
    }

    const duplicateInvoice = await financeRepository.findExternalInvoiceByVendorInvoice(
      payload.data.vendor_id,
      payload.data.invoice_number,
    );

    const overrideReason = payload.data.duplicate_override_reason?.trim();
    const hasDuplicateOverride = duplicateInvoice !== null && overrideReason !== undefined;

    if (duplicateInvoice !== null && overrideReason === undefined) {
      return res.status(409).json({
        error: 'External invoice already exists for vendor_id + invoice_number',
        existing_external_invoice_id: duplicateInvoice.id,
      });
    }

    if (hasDuplicateOverride) {
      const hasPrivilege = await requireAnyRole(financeRepository, userId, ['ADMIN', 'FINANCE']);
      if (!hasPrivilege) {
        return res.status(403).json({ error: 'Finance/Admin role required for duplicate override' });
      }
    }

    let spendItem = payload.data.spend_item_id
      ? await financeRepository.findSpendItemById(payload.data.spend_item_id)
      : null;

    if (payload.data.spend_item_id && spendItem === null) {
      return res.status(404).json({ error: 'Spend item not found' });
    }

    if (spendItem !== null && spendItem.currency_id !== payload.data.currency_id) {
      return res.status(400).json({
        error: 'Linked spend item currency must match invoice currency',
      });
    }

    if (spendItem !== null && spendItem.vendor_id !== null && spendItem.vendor_id !== payload.data.vendor_id) {
      return res.status(400).json({
        error: 'Linked spend item vendor must match invoice vendor when spend item vendor is already set',
      });
    }

    try {
      if (spendItem === null) {
        spendItem = await financeRepository.createSpendItem({
          vendor_id: payload.data.vendor_id,
          department_id: payload.data.spend_item_department_id ?? null,
          currency_id: payload.data.currency_id,
          created_by_user_id: userId,
          spend_item_type: 'EXTERNAL_INVOICE',
          description:
            payload.data.spend_item_description ??
            `External invoice ${payload.data.invoice_number}`,
          amount_minor: totalAmountMinor,
          incurred_at: payload.data.spend_item_incurred_at ?? payload.data.invoice_date,
        });
      }

      const file = await financeRepository.createFile({
        storage_key: payload.data.file.storage_key,
        file_name: payload.data.file.file_name,
        mime_type: payload.data.file.mime_type,
        size_bytes: payload.data.file.size_bytes,
        checksum_sha256: payload.data.file.checksum_sha256 ?? null,
      });

      await financeRepository.attachFileToSpendItem(spendItem.id, file.id);

      const externalInvoice = await financeRepository.createExternalInvoice({
        spend_item_id: spendItem.id,
        vendor_id: payload.data.vendor_id,
        currency_id: payload.data.currency_id,
        invoice_number: payload.data.invoice_number,
        invoice_date: payload.data.invoice_date,
        due_date: payload.data.due_date ?? null,
        total_amount_minor: totalAmountMinor,
        received_at: now(),
      });

      await financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'external_invoice.created',
        entity_type: 'EXTERNAL_INVOICE',
        entity_id: externalInvoice.id,
        payload: {
          vendor_id: payload.data.vendor_id,
          invoice_number: payload.data.invoice_number,
          currency_id: payload.data.currency_id,
          total_amount_minor: totalAmountMinor.toString(),
          spend_item_id: spendItem.id,
          file_id: file.id,
          duplicate_override_reason: overrideReason ?? null,
          duplicate_of_external_invoice_id: duplicateInvoice?.id ?? null,
        },
        occurred_at: now(),
      });

      return res.status(201).json({
        external_invoice: serializeForJson(externalInvoice),
        spend_item: serializeForJson(spendItem),
        file: serializeForJson(file),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({
          error: 'External invoice upload conflict (duplicate file storage_key or duplicate relation)',
        });
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return res.status(400).json({
          error: 'Invalid vendor_id or currency_id reference',
        });
      }

      return res.status(500).json({ error: 'Failed to upload external invoice' });
    }
  });

  app.get('/external-invoices', async (req, res) => {
    const query = listExternalInvoicesQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: query.error.flatten(),
      });
    }

    const { items, total } = await financeRepository.listExternalInvoices(
      {
        vendor_id: query.data.vendor_id,
        currency_id: query.data.currency_id,
        spend_item_id: query.data.spend_item_id,
        invoice_number: query.data.invoice_number,
        status: query.data.status,
      },
      {
        page: query.data.page,
        page_size: query.data.page_size,
      },
    );

    const totalPages = Math.max(1, Math.ceil(total / query.data.page_size));

    return res.json({
      data: serializeForJson(items),
      pagination: {
        page: query.data.page,
        page_size: query.data.page_size,
        total,
        total_pages: totalPages,
      },
    });
  });

  app.get('/external-invoices/:id', async (req, res) => {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid external invoice id' });
    }

    const externalInvoice = await financeRepository.findExternalInvoiceById(parsedId.data);
    if (externalInvoice === null) {
      return res.status(404).json({ error: 'External invoice not found' });
    }

    const [spendItem, attachments, auditEvents] = await Promise.all([
      externalInvoice.spend_item_id
        ? financeRepository.findSpendItemById(externalInvoice.spend_item_id)
        : Promise.resolve(null),
      externalInvoice.spend_item_id
        ? financeRepository.listSpendItemFiles(externalInvoice.spend_item_id)
        : Promise.resolve([]),
      financeRepository.listAuditEvents('EXTERNAL_INVOICE', externalInvoice.id),
    ]);

    const timeline = auditEvents.map((event) => ({
      event_type: event.event_type,
      actor_user_id: event.actor_user_id,
      occurred_at: event.occurred_at,
      payload: event.payload,
    }));

    return res.json({
      external_invoice: serializeForJson(externalInvoice),
      spend_item: serializeForJson(spendItem),
      attachments: serializeForJson(attachments),
      timeline: serializeForJson(timeline),
      audit_events: serializeForJson(auditEvents),
    });
  });

  app.post('/internal-invoices', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const payload = createInternalInvoiceSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    if (payload.data.from_department_id === payload.data.to_department_id) {
      return res.status(400).json({
        error: 'from_department_id and to_department_id must be different',
      });
    }

    for (const attachment of payload.data.attachments) {
      if (!isSupportedInvoiceMimeType(attachment.mime_type)) {
        return res.status(400).json({
          error: 'Attachments must be PDF or image MIME types',
        });
      }
    }

    const computedLineItems = payload.data.line_items.map((lineItem) => ({
      description: lineItem.description,
      quantity: lineItem.quantity,
      unit_amount_minor: lineItem.unit_amount_minor,
      line_amount_minor: lineItem.unit_amount_minor * BigInt(lineItem.quantity),
      department_id: payload.data.to_department_id,
    }));

    const totalAmountMinor = computedLineItems.reduce(
      (sum, lineItem) => sum + lineItem.line_amount_minor,
      0n,
    );

    const baseCurrencyId = await resolveBaseCurrencyId(financeRepository, {
      explicit_base_currency_id: payload.data.base_currency_id,
      department_id: payload.data.from_department_id,
      fallback_currency_id: payload.data.currency_id,
    });
    let baseAmountMinor = totalAmountMinor;
    let fxRatePpm: bigint | null = null;
    let fxRateLockedAt: Date | null = null;
    let lockedFxRate: { id: string; fx_rate_ppm: bigint; effective_at: Date } | null = null;

    if (baseCurrencyId !== payload.data.currency_id) {
      const latestRate = await financeRepository.findLatestFxRate(
        baseCurrencyId,
        payload.data.currency_id,
      );

      if (latestRate === null) {
        return res.status(404).json({
          error: 'No FX rate snapshot found for base/quote pair',
        });
      }

      fxRatePpm = latestRate.fx_rate_ppm;
      fxRateLockedAt = now();
      lockedFxRate = {
        id: latestRate.id,
        fx_rate_ppm: latestRate.fx_rate_ppm,
        effective_at: latestRate.effective_at,
      };

      try {
        baseAmountMinor = computeBaseAmountMinor(totalAmountMinor, latestRate.fx_rate_ppm);
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : 'Unable to compute base total',
        });
      }
    }

    try {
      const spendItem = await financeRepository.createSpendItem({
        vendor_id: null,
        department_id: payload.data.from_department_id,
        currency_id: payload.data.currency_id,
        base_currency_id: baseCurrencyId,
        created_by_user_id: userId,
        spend_item_type: 'INTERNAL_INVOICE',
        description: `Internal invoice ${payload.data.invoice_number}`,
        amount_minor: totalAmountMinor,
        base_amount_minor: baseAmountMinor,
        incurred_at: payload.data.invoice_date,
        fx_rate_ppm: fxRatePpm,
        fx_rate_locked_at: fxRateLockedAt,
      });

      const { invoice, line_items } = await financeRepository.createInternalInvoice(
        {
          spend_item_id: spendItem.id,
          from_department_id: payload.data.from_department_id,
          to_department_id: payload.data.to_department_id,
          currency_id: payload.data.currency_id,
          created_by_user_id: userId,
          invoice_number: payload.data.invoice_number,
          invoice_date: payload.data.invoice_date,
          due_date: payload.data.due_date ?? null,
          total_amount_minor: totalAmountMinor,
          status: 'DRAFT',
        },
        computedLineItems,
      );

      const attachments: Array<Awaited<ReturnType<FinanceRepository['createFile']>>> = [];
      for (const attachment of payload.data.attachments) {
        const file = await financeRepository.createFile({
          storage_key: attachment.storage_key,
          file_name: attachment.file_name,
          mime_type: attachment.mime_type,
          size_bytes: attachment.size_bytes,
          checksum_sha256: attachment.checksum_sha256 ?? null,
        });

        await financeRepository.attachFileToSpendItem(spendItem.id, file.id);
        attachments.push(file);
      }

      await financeRepository.createAuditEvent({
        actor_user_id: userId,
        event_type: 'internal_invoice.created',
        entity_type: 'INTERNAL_INVOICE',
        entity_id: invoice.id,
        payload: {
          spend_item_id: spendItem.id,
          from_department_id: payload.data.from_department_id,
          to_department_id: payload.data.to_department_id,
          currency_id: payload.data.currency_id,
          base_currency_id: baseCurrencyId,
          total_amount_minor: totalAmountMinor.toString(),
          base_amount_minor: baseAmountMinor.toString(),
          fx_rate_ppm: fxRatePpm?.toString() ?? null,
          line_item_count: line_items.length,
          attachment_count: attachments.length,
        },
        occurred_at: now(),
      });

      return res.status(201).json({
        internal_invoice: serializeForJson(invoice),
        line_items: serializeForJson(line_items),
        attachments: serializeForJson(attachments),
        spend_item: serializeForJson(spendItem),
        locked_fx_rate: serializeForJson(lockedFxRate),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({
          error: 'Internal invoice or attachment conflict',
        });
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return res.status(400).json({
          error: 'Invalid department_id, currency_id, or related reference',
        });
      }

      return res.status(500).json({
        error: 'Failed to create internal invoice',
      });
    }
  });

  app.post('/internal-invoices/:id/submit', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid internal invoice id' });
    }

    const internalInvoice = await financeRepository.findInternalInvoiceById(parsedId.data);
    if (internalInvoice === null) {
      return res.status(404).json({ error: 'Internal invoice not found' });
    }

    const canSubmitAsPrivileged = await requireAnyRole(financeRepository, userId, ['ADMIN', 'FINANCE']);
    const isCreator = internalInvoice.created_by_user_id === userId;
    if (!isCreator && !canSubmitAsPrivileged) {
      return res.status(403).json({ error: 'Only creator, Admin, or Finance can submit this internal invoice' });
    }

    if (internalInvoice.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Internal invoice already submitted' });
    }

    const lineItems = await financeRepository.listInternalInvoiceLineItems(internalInvoice.id);
    if (lineItems.length === 0) {
      return res.status(400).json({
        error: 'Cannot submit internal invoice without line items',
      });
    }

    if (internalInvoice.spend_item_id === null) {
      return res.status(400).json({
        error: 'Cannot submit internal invoice without linked spend item',
      });
    }

    const approvalInstance = await financeRepository.createApprovalInstanceForInternalInvoice(
      internalInvoice.id,
      userId,
    );

    const submittedAt = now();
    const updatedInternalInvoice = await financeRepository.updateInternalInvoice(internalInvoice.id, {
      status: 'OPEN',
      submitted_at: submittedAt,
    });

    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: 'internal_invoice.submitted',
      entity_type: 'INTERNAL_INVOICE',
      entity_id: internalInvoice.id,
      payload: {
        approval_instance_id: approvalInstance.id,
        line_item_count: lineItems.length,
        spend_item_id: internalInvoice.spend_item_id,
      },
      occurred_at: submittedAt,
    });

    return res.json({
      internal_invoice: serializeForJson(updatedInternalInvoice),
      approval_instance: serializeForJson(approvalInstance),
    });
  });

  app.get('/internal-invoices', async (req, res) => {
    const query = listInternalInvoicesQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: 'Invalid query',
        details: query.error.flatten(),
      });
    }

    const { items, total } = await financeRepository.listInternalInvoices(
      {
        from_department_id: query.data.from_department_id,
        to_department_id: query.data.to_department_id,
        currency_id: query.data.currency_id,
        created_by_user_id: query.data.created_by_user_id,
        status: query.data.status,
      },
      {
        page: query.data.page,
        page_size: query.data.page_size,
      },
    );

    const totalPages = Math.max(1, Math.ceil(total / query.data.page_size));

    return res.json({
      data: serializeForJson(items),
      pagination: {
        page: query.data.page,
        page_size: query.data.page_size,
        total,
        total_pages: totalPages,
      },
    });
  });

  app.get('/internal-invoices/:id', async (req, res) => {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid internal invoice id' });
    }

    const internalInvoice = await financeRepository.findInternalInvoiceById(parsedId.data);
    if (internalInvoice === null) {
      return res.status(404).json({ error: 'Internal invoice not found' });
    }

    const [lineItems, spendItem, attachments, approvalInstances, auditEvents] = await Promise.all([
      financeRepository.listInternalInvoiceLineItems(internalInvoice.id),
      internalInvoice.spend_item_id
        ? financeRepository.findSpendItemById(internalInvoice.spend_item_id)
        : Promise.resolve(null),
      internalInvoice.spend_item_id
        ? financeRepository.listSpendItemFiles(internalInvoice.spend_item_id)
        : Promise.resolve([]),
      financeRepository.listApprovalInstancesForInternalInvoice(internalInvoice.id),
      financeRepository.listAuditEvents('INTERNAL_INVOICE', internalInvoice.id),
    ]);

    const timeline = auditEvents.map((event) => ({
      event_type: event.event_type,
      actor_user_id: event.actor_user_id,
      occurred_at: event.occurred_at,
      payload: event.payload,
    }));

    return res.json({
      internal_invoice: serializeForJson(internalInvoice),
      line_items: serializeForJson(lineItems),
      spend_item: serializeForJson(spendItem),
      attachments: serializeForJson(attachments),
      approval_instances: serializeForJson(approvalInstances),
      timeline: serializeForJson(timeline),
      audit_events: serializeForJson(auditEvents),
    });
  });

  app.get('/approvals/queue', async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const roleCodes = await financeRepository.getUserRoleCodes(userId);
    const queueItems = await financeRepository.listSpendItemApprovalQueue(userId, roleCodes);

    return res.json({
      data: serializeForJson(queueItems),
      total: queueItems.length,
    });
  });

  async function handleSpendItemApprovalAction(
    req: express.Request,
    res: express.Response,
    action: 'approve' | 'reject' | 'request-info',
  ) {
    const userId = await requireUserId(req, res);
    if (userId === null) {
      return;
    }

    const parsedId = uuidSchema.safeParse(req.params.spend_item_id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'Invalid spend item id' });
    }

    const payload = approvalActionSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: payload.error.flatten(),
      });
    }

    const spendItem = await financeRepository.findSpendItemById(parsedId.data);
    if (spendItem === null) {
      return res.status(404).json({ error: 'Spend item not found' });
    }

    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(spendItem.status)) {
      return res.status(409).json({
        error: 'Spend item is not pending review',
      });
    }

    if (violatesSeparationOfDuties(spendItem.created_by_user_id, userId)) {
      return res.status(403).json({
        error: 'created_by user cannot approve their own item',
      });
    }

    const approvalInstance = await financeRepository.findPendingApprovalInstanceForSpendItem(spendItem.id);
    if (approvalInstance === null) {
      return res.status(404).json({
        error: 'No pending approval instance found for spend item',
      });
    }

    const approvalSteps = await financeRepository.listApprovalStepsForInstance(approvalInstance.id);
    const pendingStep = [...approvalSteps]
      .sort((left, right) => left.step_order - right.step_order)
      .find((step) => step.status === 'PENDING');

    if (!pendingStep) {
      return res.status(409).json({
        error: 'No pending approval step found',
      });
    }

    const roleCodes = await financeRepository.getUserRoleCodes(userId);
    const queueItems = await financeRepository.listSpendItemApprovalQueue(userId, roleCodes);
    const canActOnStep = queueItems.some((queueItem) => queueItem.approval_step_id === pendingStep.id);
    if (!canActOnStep) {
      return res.status(403).json({
        error: 'User is not eligible to act on this approval step',
      });
    }

    const actedAt = now();
    const stepStatus =
      action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'REQUESTED_INFO';
    const updatedStep = await financeRepository.updateApprovalStep(pendingStep.id, {
      status: stepStatus,
      acted_by_user_id: userId,
      acted_at: actedAt,
      comment: payload.data.comment,
    });

    let updatedSpendItem = spendItem;
    let updatedApprovalInstance = approvalInstance;

    if (action === 'approve') {
      const remainingPendingSteps = approvalSteps.filter(
        (step) => step.status === 'PENDING' && step.id !== pendingStep.id,
      );

      if (remainingPendingSteps.length === 0) {
        updatedApprovalInstance = await financeRepository.updateApprovalInstance(approvalInstance.id, {
          status: 'APPROVED',
          completed_at: actedAt,
        });
        updatedSpendItem = await financeRepository.updateSpendItemApprovalState(spendItem.id, {
          status: 'APPROVED',
          approved_at: actedAt,
        });

        if (updatedSpendItem.spend_item_type === 'PAYROLL_RUN') {
          const payrollRun = await financeRepository.findPayrollRunBySpendItemId(updatedSpendItem.id);
          if (payrollRun !== null) {
            await financeRepository.updatePayrollRun(payrollRun.id, {
              status: 'APPROVED',
            });
          }
        }
      } else {
        if (spendItem.status === 'SUBMITTED') {
          updatedSpendItem = await financeRepository.updateSpendItemApprovalState(spendItem.id, {
            status: 'UNDER_REVIEW',
          });
        }
      }
    } else if (action === 'reject') {
      updatedApprovalInstance = await financeRepository.updateApprovalInstance(approvalInstance.id, {
        status: 'REJECTED',
        completed_at: actedAt,
      });
      updatedSpendItem = await financeRepository.updateSpendItemApprovalState(spendItem.id, {
        status: 'REJECTED',
      });
    } else {
      updatedApprovalInstance = await financeRepository.updateApprovalInstance(approvalInstance.id, {
        status: 'NEEDS_INFO',
        completed_at: actedAt,
      });
      updatedSpendItem = await financeRepository.updateSpendItemApprovalState(spendItem.id, {
        status: 'NEEDS_INFO',
      });
    }

    const eventType =
      action === 'approve' ? 'approval.approved' : action === 'reject' ? 'approval.rejected' : 'approval.requested_info';
    await financeRepository.createAuditEvent({
      actor_user_id: userId,
      event_type: eventType,
      entity_type: 'SPEND_ITEM',
      entity_id: spendItem.id,
      payload: {
        approval_instance_id: approvalInstance.id,
        approval_step_id: updatedStep.id,
        approval_step_order: updatedStep.step_order,
        action,
        comment: payload.data.comment,
      },
      occurred_at: actedAt,
    });

    return res.json({
      spend_item: serializeForJson(updatedSpendItem),
      approval_instance: serializeForJson(updatedApprovalInstance),
      approval_step: serializeForJson(updatedStep),
    });
  }

  app.post('/approvals/:spend_item_id/approve', async (req, res) =>
    handleSpendItemApprovalAction(req, res, 'approve'),
  );
  app.post('/approvals/:spend_item_id/reject', async (req, res) =>
    handleSpendItemApprovalAction(req, res, 'reject'),
  );
  app.post('/approvals/:spend_item_id/request-info', async (req, res) =>
    handleSpendItemApprovalAction(req, res, 'request-info'),
  );

  return app;
}
