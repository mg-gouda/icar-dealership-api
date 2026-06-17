import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding database...');

  // ── 1. Base Currency ──────────────────────────────────────────────────────
  const egp = await prisma.currency.upsert({
    where: { code: 'EGP' },
    update: {},
    create: { code: 'EGP', symbol: 'ج.م', decimalPlaces: 2, active: true },
  });

  const usd = await prisma.currency.upsert({
    where: { code: 'USD' },
    update: {},
    create: { code: 'USD', symbol: '$', decimalPlaces: 2, active: true },
  });

  const eur = await prisma.currency.upsert({
    where: { code: 'EUR' },
    update: {},
    create: { code: 'EUR', symbol: '€', decimalPlaces: 2, active: true },
  });

  // Initial exchange rates (placeholder — update via admin before go-live)
  await prisma.currencyRate.upsert({
    where: { currencyId_date: { currencyId: usd.id, date: new Date('2026-01-01') } },
    update: {},
    create: { currencyId: usd.id, rate: 49.5, date: new Date('2026-01-01') },
  });
  await prisma.currencyRate.upsert({
    where: { currencyId_date: { currencyId: eur.id, date: new Date('2026-01-01') } },
    update: {},
    create: { currencyId: eur.id, rate: 53.5, date: new Date('2026-01-01') },
  });

  // ── 2. Company ────────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { id: 'company-001' },
    update: {},
    create: {
      id: 'company-001',
      name: 'iCar Dealership',
      baseCurrencyId: egp.id,
      taxId: '',
      fiscalYearStartMonth: 1,
      address: 'Cairo, Egypt',
    },
  });

  // ── 3. Fiscal Year ────────────────────────────────────────────────────────
  await prisma.fiscalYear.upsert({
    where: { id: 'fy-2026' },
    update: {},
    create: {
      id: 'fy-2026',
      companyId: company.id,
      name: 'FY 2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
  });

  // ── 4. Chart of Accounts ──────────────────────────────────────────────────
  // Assets
  const coa: Record<string, string> = {};
  const accounts = [
    // Assets
    { code: '1000', name: 'Current Assets', type: 'ASSET', parent: null },
    { code: '1100', name: 'Cash', type: 'ASSET', parent: '1000' },
    { code: '1110', name: 'Petty Cash', type: 'ASSET', parent: '1100' },
    { code: '1200', name: 'Bank Accounts', type: 'ASSET', parent: '1000' },
    { code: '1210', name: 'Main Operating Bank', type: 'ASSET', parent: '1200' },
    { code: '1300', name: 'Accounts Receivable', type: 'ASSET', parent: '1000', reconcilable: true },
    { code: '1400', name: 'Vehicle Inventory – New', type: 'ASSET', parent: '1000' },
    { code: '1410', name: 'Vehicle Inventory – Used', type: 'ASSET', parent: '1000' },
    { code: '1420', name: 'Trade-In Clearing', type: 'ASSET', parent: '1000' },
    { code: '1500', name: 'Prepaid Expenses', type: 'ASSET', parent: '1000' },
    { code: '1600', name: 'Fixed Assets', type: 'ASSET', parent: null },
    { code: '1610', name: 'Equipment', type: 'ASSET', parent: '1600' },
    { code: '1611', name: 'Accumulated Depreciation – Equipment', type: 'ASSET', parent: '1600' },
    // Liabilities
    { code: '2000', name: 'Current Liabilities', type: 'LIABILITY', parent: null },
    { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', parent: '2000', reconcilable: true },
    { code: '2200', name: 'VAT Payable (14%)', type: 'LIABILITY', parent: '2000' },
    { code: '2300', name: 'Customer Deposits', type: 'LIABILITY', parent: '2000' },
    { code: '2400', name: 'Commissions Payable', type: 'LIABILITY', parent: '2000' },
    { code: '2500', name: 'Installment Payments Received', type: 'LIABILITY', parent: '2000' },
    { code: '2600', name: 'Bank Financing Liability', type: 'LIABILITY', parent: '2000' },
    { code: '2900', name: 'Long-term Liabilities', type: 'LIABILITY', parent: null },
    // Equity
    { code: '3000', name: 'Equity', type: 'EQUITY', parent: null },
    { code: '3100', name: 'Share Capital', type: 'EQUITY', parent: '3000' },
    { code: '3200', name: 'Retained Earnings', type: 'EQUITY', parent: '3000' },
    // Income
    { code: '4000', name: 'Revenue', type: 'INCOME', parent: null },
    { code: '4100', name: 'Vehicle Sales Income', type: 'INCOME', parent: '4000' },
    { code: '4200', name: 'Finance & Insurance Income', type: 'INCOME', parent: '4000' },
    { code: '4210', name: 'Admin Fee Income', type: 'INCOME', parent: '4200' },
    { code: '4220', name: 'Compulsory Insurance Income', type: 'INCOME', parent: '4200' },
    { code: '4300', name: 'Installment Interest Income', type: 'INCOME', parent: '4000' },
    { code: '4400', name: 'Parts & Service Income', type: 'INCOME', parent: '4000' },
    // Cost of Revenue
    { code: '5000', name: 'Cost of Revenue', type: 'COST_OF_REVENUE', parent: null },
    { code: '5100', name: 'COGS – Vehicle Sales', type: 'COST_OF_REVENUE', parent: '5000' },
    { code: '5200', name: 'COGS – Parts & Service', type: 'COST_OF_REVENUE', parent: '5000' },
    // Expenses
    { code: '6000', name: 'Operating Expenses', type: 'EXPENSE', parent: null },
    { code: '6100', name: 'Sales Commission Expense', type: 'EXPENSE', parent: '6000' },
    { code: '6200', name: 'Salaries & Wages', type: 'EXPENSE', parent: '6000' },
    { code: '6300', name: 'Rent & Occupancy', type: 'EXPENSE', parent: '6000' },
    { code: '6400', name: 'Marketing & Advertising', type: 'EXPENSE', parent: '6000' },
    { code: '6500', name: 'Depreciation Expense', type: 'EXPENSE', parent: '6000' },
    { code: '6600', name: 'Utilities', type: 'EXPENSE', parent: '6000' },
    { code: '6700', name: 'Miscellaneous Expense', type: 'EXPENSE', parent: '6000' },
    { code: '7000', name: 'Finance Expense', type: 'EXPENSE', parent: null },
    { code: '7100', name: 'Bank Charges', type: 'EXPENSE', parent: '7000' },
    { code: '7200', name: 'Foreign Exchange Loss', type: 'EXPENSE', parent: '7000' },
    // Unrealized FX (special — used by period-end revaluation)
    { code: '8100', name: 'Unrealized Exchange Gain/Loss', type: 'EXPENSE', parent: null },
  ];

  // First pass — create root accounts (no parent)
  for (const acc of accounts.filter((a) => !a.parent)) {
    const created = await prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: acc.code } },
      update: {},
      create: {
        companyId: company.id,
        code: acc.code,
        name: acc.name,
        type: acc.type as any,
        reconcilable: (acc as any).reconcilable ?? false,
      },
    });
    coa[acc.code] = created.id;
  }

  // Second pass — create child accounts
  for (const acc of accounts.filter((a) => a.parent)) {
    const created = await prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: acc.code } },
      update: {},
      create: {
        companyId: company.id,
        code: acc.code,
        name: acc.name,
        type: acc.type as any,
        parentId: coa[acc.parent!],
        reconcilable: (acc as any).reconcilable ?? false,
      },
    });
    coa[acc.code] = created.id;
  }

  // ── 5. Tax Groups & Taxes ─────────────────────────────────────────────────
  const vatGroup = await prisma.taxGroup.upsert({
    where: { id: 'tg-vat' },
    update: {},
    create: { id: 'tg-vat', name: 'VAT' },
  });

  const vat14 = await prisma.tax.upsert({
    where: { id: 'tax-vat14' },
    update: {},
    create: {
      id: 'tax-vat14',
      name: 'VAT 14%',
      amount: 14,
      computation: 'PERCENT',
      scope: 'SALE',
      includedInPrice: false,
      taxGroupId: vatGroup.id,
      accountId: coa['2200'],
    },
  });

  // ── 6. Payment Terms ──────────────────────────────────────────────────────
  const dueOnReceipt = await prisma.paymentTerm.upsert({
    where: { id: 'pt-due-on-receipt' },
    update: {},
    create: {
      id: 'pt-due-on-receipt',
      name: 'Due on Receipt',
      lines: { create: [{ daysDue: 0, percentage: 100 }] },
    },
  });

  await prisma.paymentTerm.upsert({
    where: { id: 'pt-net30' },
    update: {},
    create: {
      id: 'pt-net30',
      name: 'Net 30',
      lines: { create: [{ daysDue: 30, percentage: 100 }] },
    },
  });

  // ── 7. Product Category Tax Mappings ──────────────────────────────────────
  const categoryMappings = [
    { category: 'VEHICLE', taxId: vat14.id, accountId: coa['4100'] },
    { category: 'TRADE_IN_CREDIT', taxId: null, accountId: coa['1420'] },
    { category: 'WARRANTY', taxId: vat14.id, accountId: coa['4200'] },
    { category: 'GAP_INSURANCE', taxId: vat14.id, accountId: coa['4200'] },
    { category: 'DOC_FEE', taxId: vat14.id, accountId: coa['4210'] },
    { category: 'REGISTRATION_FEE', taxId: null, accountId: coa['4210'] },
    { category: 'ADMIN_FEE', taxId: vat14.id, accountId: coa['4210'] },
    { category: 'COMPULSORY_INSURANCE', taxId: vat14.id, accountId: coa['4220'] },
    { category: 'PARTS', taxId: vat14.id, accountId: coa['4400'] },
    { category: 'SERVICE', taxId: vat14.id, accountId: coa['4400'] },
  ];

  for (const m of categoryMappings) {
    await prisma.productCategoryTaxMapping.upsert({
      where: { category: m.category },
      update: {},
      create: m,
    });
  }

  // ── 8. Location & Journals ────────────────────────────────────────────────
  const cairoLocation = await prisma.location.upsert({
    where: { id: 'loc-cairo-001' },
    update: {},
    create: {
      id: 'loc-cairo-001',
      companyId: company.id,
      name: 'Cairo Showroom',
      city: 'Cairo',
      timezone: 'Africa/Cairo',
      defaultAdminFee: 2500,
      defaultInsuranceFee: 1500,
      defaultTaxId: vat14.id,
    },
  });

  // AnalyticAccount per location
  await prisma.analyticAccount.upsert({
    where: { locationId: cairoLocation.id },
    update: {},
    create: { locationId: cairoLocation.id, name: 'Cairo Showroom' },
  });

  // Per-location journals
  const journalDefs = [
    {
      id: 'j-sale-cai',
      name: 'Sales Journal – Cairo',
      code: 'SALE-CAI',
      type: 'SALE',
      sequencePrefix: 'INV/CAI/',
      defaultDebitCode: '1300',
      defaultCreditCode: '4100',
    },
    {
      id: 'j-purch-cai',
      name: 'Purchase Journal – Cairo',
      code: 'PURCH-CAI',
      type: 'PURCHASE',
      sequencePrefix: 'BILL/CAI/',
      defaultDebitCode: '5100',
      defaultCreditCode: '2100',
    },
    {
      id: 'j-cash-cai',
      name: 'Cash Journal – Cairo',
      code: 'CASH-CAI',
      type: 'CASH',
      sequencePrefix: 'CSH/CAI/',
      defaultDebitCode: '1110',
      defaultCreditCode: '1110',
    },
    {
      id: 'j-bank-cai',
      name: 'Bank Journal – Cairo',
      code: 'BANK-CAI',
      type: 'BANK',
      sequencePrefix: 'BNK/CAI/',
      defaultDebitCode: '1210',
      defaultCreditCode: '1210',
    },
  ];

  for (const j of journalDefs) {
    await prisma.journal.upsert({
      where: { companyId_code: { companyId: company.id, code: j.code } },
      update: {},
      create: {
        id: j.id,
        companyId: company.id,
        locationId: cairoLocation.id,
        name: j.name,
        code: j.code,
        type: j.type as any,
        sequencePrefix: j.sequencePrefix,
        defaultDebitAccountId: coa[j.defaultDebitCode],
        defaultCreditAccountId: coa[j.defaultCreditCode],
        currencyId: egp.id,
      },
    });
  }

  // Company-level general journal
  await prisma.journal.upsert({
    where: { companyId_code: { companyId: company.id, code: 'MISC' } },
    update: {},
    create: {
      id: 'j-misc',
      companyId: company.id,
      locationId: null,
      name: 'Miscellaneous / General',
      code: 'MISC',
      type: 'GENERAL',
      sequencePrefix: 'MISC/',
      currencyId: egp.id,
    },
  });

  // ── 9. SUPER_ADMIN user ───────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@1234!', 12);

  const adminPartner = await prisma.partner.upsert({
    where: { id: 'partner-admin-001' },
    update: {},
    create: {
      id: 'partner-admin-001',
      type: 'EMPLOYEE',
      name: 'System Administrator',
      defaultPaymentTermId: dueOnReceipt.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@icar.com' },
    update: {},
    create: {
      email: 'admin@icar.com',
      passwordHash,
      name: 'System Administrator',
      role: 'SUPER_ADMIN',
      locationId: cairoLocation.id,
      partnerId: adminPartner.id,
    },
  });

  console.log('✅  Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
