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
    code: 'EMPLOYEE',
    name: 'Employee',
    description: 'Standard employee access profile.',
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
