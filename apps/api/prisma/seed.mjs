import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const currencySeeds = [
  {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: 'NGN',
    minor_unit: 2,
  },
  {
    code: 'GBP',
    name: 'British Pound Sterling',
    symbol: 'GBP',
    minor_unit: 2,
  },
];

const roleSeeds = [
  {
    code: 'ADMIN',
    name: 'Administrator',
    description: 'System-wide administration privileges.',
  },
  {
    code: 'FINANCE',
    name: 'Finance',
    description: 'Finance operations and treasury workflows.',
  },
  {
    code: 'DEPT_HEAD',
    name: 'Department Head',
    description: 'Department-level requester and budget owner.',
  },
  {
    code: 'APPROVER',
    name: 'Approver',
    description: 'Approval authority for configured policies.',
  },
  {
    code: 'PAYROLL',
    name: 'Payroll',
    description: 'Payroll run and adjustment management.',
  },
  {
    code: 'PAYROLL_ADMIN',
    name: 'Payroll Admin',
    description: 'Payroll administration and approvals.',
  },
  {
    code: 'PAYOR',
    name: 'Payor',
    description: 'Executes approved spend item payments.',
  },
  {
    code: 'EMPLOYEE',
    name: 'Employee',
    description: 'Standard employee access profile.',
  },
];

const spendItemTypes = ['GENERAL', 'EXTERNAL_INVOICE', 'INTERNAL_INVOICE', 'PAYROLL_RUN'];

const approvalRuleTemplates = [
  {
    step_order: 1,
    min_amount_minor: null,
    max_amount_minor: 1_000_000n,
    steps_json: [{ step_order: 1, role_code: 'DEPT_HEAD' }],
  },
  {
    step_order: 2,
    min_amount_minor: 1_000_001n,
    max_amount_minor: null,
    steps_json: [
      { step_order: 1, role_code: 'DEPT_HEAD' },
      { step_order: 2, role_code: 'FINANCE' },
    ],
  },
];

async function main() {
  for (const currency of currencySeeds) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {
        name: currency.name,
        symbol: currency.symbol,
        minor_unit: currency.minor_unit,
      },
      create: currency,
    });
  }

  for (const role of roleSeeds) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
      },
      create: role,
    });
  }

  const currencies = await prisma.currency.findMany({
    where: {
      code: { in: ['NGN', 'GBP'] },
    },
  });
  const currencyByCode = new Map(currencies.map((currency) => [currency.code, currency]));

  for (const currencyCode of ['NGN', 'GBP']) {
    const currency = currencyByCode.get(currencyCode);
    if (!currency) {
      continue;
    }

    for (const spendItemType of spendItemTypes) {
      const policyCode = `SPEND_ITEM_${spendItemType}_${currency.code}_DEFAULT`;
      const policy = await prisma.approvalPolicy.upsert({
        where: { code: policyCode },
        update: {
          name: `Default ${spendItemType} approval policy (${currency.code})`,
          description: 'Seeded default spend item approval routing policy.',
          scope: 'SPEND_ITEM',
          spend_item_type: spendItemType,
          base_currency_id: currency.id,
          department_id: null,
          is_active: true,
        },
        create: {
          code: policyCode,
          name: `Default ${spendItemType} approval policy (${currency.code})`,
          description: 'Seeded default spend item approval routing policy.',
          scope: 'SPEND_ITEM',
          spend_item_type: spendItemType,
          base_currency_id: currency.id,
          department_id: null,
          is_active: true,
        },
      });

      for (const ruleTemplate of approvalRuleTemplates) {
        await prisma.approvalPolicyRule.upsert({
          where: {
            approval_policy_id_step_order: {
              approval_policy_id: policy.id,
              step_order: ruleTemplate.step_order,
            },
          },
          update: {
            min_amount_minor: ruleTemplate.min_amount_minor,
            max_amount_minor: ruleTemplate.max_amount_minor,
            steps_json: ruleTemplate.steps_json,
            requires_all: false,
            role_id: null,
            user_id: null,
            department_id: null,
          },
          create: {
            approval_policy_id: policy.id,
            step_order: ruleTemplate.step_order,
            min_amount_minor: ruleTemplate.min_amount_minor,
            max_amount_minor: ruleTemplate.max_amount_minor,
            steps_json: ruleTemplate.steps_json,
            requires_all: false,
            role_id: null,
            user_id: null,
            department_id: null,
          },
        });
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
