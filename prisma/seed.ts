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

  // ── 3b. Fiscal Periods (12 months for FY 2026) ─────────────────────────
  for (let month = 0; month < 12; month++) {
    const start = new Date(2026, month, 1);
    const end = new Date(2026, month + 1, 0); // last day of month
    await prisma.fiscalPeriod.upsert({
      where: { companyId_startDate: { companyId: company.id, startDate: start } },
      update: {},
      create: {
        id: `fp-2026-${String(month + 1).padStart(2, '0')}`,
        companyId: company.id,
        fiscalYearId: 'fy-2026',
        name: start.toLocaleString('en', { month: 'short', year: 'numeric' }),
        startDate: start,
        endDate: end,
        isLocked: false,
      },
    });
  }

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
    { code: '1310', name: 'Inter-Location Receivable', type: 'ASSET', parent: '1300' },
    { code: '1400', name: 'Vehicle Inventory – New', type: 'ASSET', parent: '1000' },
    { code: '1410', name: 'Vehicle Inventory – Used', type: 'ASSET', parent: '1000' },
    { code: '1350', name: 'Input VAT Receivable', type: 'ASSET', parent: '1300' },
    { code: '1420', name: 'Trade-In Clearing', type: 'ASSET', parent: '1000' },
    { code: '1430', name: 'Parts Inventory', type: 'ASSET', parent: '1000' },
    { code: '1440', name: 'Service Fleet Vehicles', type: 'ASSET', parent: '1000' },
    { code: '1500', name: 'Prepaid Expenses', type: 'ASSET', parent: '1000' },
    { code: '1600', name: 'Fixed Assets', type: 'ASSET', parent: null },
    { code: '1610', name: 'Equipment', type: 'ASSET', parent: '1600' },
    { code: '1611', name: 'Accumulated Depreciation – Equipment', type: 'ASSET', parent: '1600' },
    // Liabilities
    { code: '2000', name: 'Current Liabilities', type: 'LIABILITY', parent: null },
    { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', parent: '2000', reconcilable: true },
    { code: '2110', name: 'Floor Plan Payable', type: 'LIABILITY', parent: '2000' },
    { code: '2120', name: 'Withholding Tax Payable', type: 'LIABILITY', parent: '2000' },
    { code: '2200', name: 'VAT Payable (14%)', type: 'LIABILITY', parent: '2000' },
    { code: '2300', name: 'Customer Deposits', type: 'LIABILITY', parent: '2000' },
    { code: '2310', name: 'Inter-Location Payable', type: 'LIABILITY', parent: '2000' },
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
    { code: '4900', name: 'Gain on Disposal of Assets', type: 'INCOME', parent: '4000' },
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
    { code: '6900', name: 'Loss on Disposal of Assets', type: 'EXPENSE', parent: '6000' },
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

  // ── 4b. Fiscal Periods (monthly) ────────────────────────────────────────
  // (Seeded after FiscalYear section below, but placed here so COA section stays contiguous)

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

  // VAT 14% Purchase (AP side)
  await prisma.tax.upsert({
    where: { id: 'tax-vat14-purchase' },
    update: {},
    create: {
      id: 'tax-vat14-purchase',
      name: 'VAT 14% (Purchase)',
      amount: 14,
      computation: 'PERCENT',
      scope: 'PURCHASE',
      includedInPrice: false,
      taxGroupId: vatGroup.id,
      accountId: coa['1350'], // Input VAT Receivable (not output VAT 2200)
    },
  });

  // VAT 0% Exempt
  await prisma.tax.upsert({
    where: { id: 'tax-exempt' },
    update: {},
    create: {
      id: 'tax-exempt',
      name: 'VAT Exempt (0%)',
      amount: 0,
      computation: 'PERCENT',
      scope: 'SALE',
      includedInPrice: false,
      taxGroupId: vatGroup.id,
      accountId: coa['2200'],
    },
  });

  // ── 5b. WHT Categories ─────────────────────────────────────────────────────
  const whtCategories = [
    { id: 'wht-supplies', name: 'Supplies', rate: 1.0, companyId: company.id },
    { id: 'wht-contractors', name: 'Contractors', rate: 3.0, companyId: company.id },
    { id: 'wht-services', name: 'Professional Services', rate: 5.0, companyId: company.id },
    { id: 'wht-commercial', name: 'Commercial Activities', rate: 0.5, companyId: company.id },
  ];
  for (const wht of whtCategories) {
    await prisma.whtCategory.upsert({
      where: { id: wht.id },
      update: {},
      create: wht,
    });
  }

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
    {
      id: 'j-gen-cai',
      name: 'General Journal – Cairo',
      code: 'GEN-CAI',
      type: 'GENERAL',
      sequencePrefix: 'GEN/CAI/',
      defaultDebitCode: '1110',
      defaultCreditCode: '1110',
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

  // ── 8b. Alexandria Location & Journals ───────────────────────────────────
  const alexLocation = await prisma.location.upsert({
    where: { id: 'loc-alex-001' },
    update: {},
    create: {
      id: 'loc-alex-001',
      companyId: company.id,
      name: 'Alexandria Showroom',
      city: 'Alexandria',
      address: '45 El-Hurriya Road, Alexandria',
      phone: '+20 3 9876543',
      timezone: 'Africa/Cairo',
      defaultAdminFee: 2500,
      defaultInsuranceFee: 1500,
      defaultTaxId: vat14.id,
    },
  });

  await prisma.analyticAccount.upsert({
    where: { locationId: alexLocation.id },
    update: {},
    create: { locationId: alexLocation.id, name: 'ALX - Alexandria Location' },
  });

  const alexJournalDefs = [
    {
      id: 'j-sale-alx',
      name: 'Sales Journal – Alexandria',
      code: 'SALE-ALX',
      type: 'SALE',
      sequencePrefix: 'INV/ALX/',
      defaultDebitCode: '1300',
      defaultCreditCode: '4100',
    },
    {
      id: 'j-purch-alx',
      name: 'Purchase Journal – Alexandria',
      code: 'PUR-ALX',
      type: 'PURCHASE',
      sequencePrefix: 'BILL/ALX/',
      defaultDebitCode: '5100',
      defaultCreditCode: '2100',
    },
    {
      id: 'j-cash-alx',
      name: 'Cash Journal – Alexandria',
      code: 'CASH-ALX',
      type: 'CASH',
      sequencePrefix: 'CSH/ALX/',
      defaultDebitCode: '1110',
      defaultCreditCode: '1110',
    },
    {
      id: 'j-bank-alx',
      name: 'Bank Journal – Alexandria',
      code: 'BANK-ALX',
      type: 'BANK',
      sequencePrefix: 'BNK/ALX/',
      defaultDebitCode: '1210',
      defaultCreditCode: '1210',
    },
    {
      id: 'j-gen-alx',
      name: 'General Journal – Alexandria',
      code: 'GEN-ALX',
      type: 'GENERAL',
      sequencePrefix: 'GEN/ALX/',
      defaultDebitCode: '1110',
      defaultCreditCode: '1110',
    },
  ];

  for (const j of alexJournalDefs) {
    await prisma.journal.upsert({
      where: { companyId_code: { companyId: company.id, code: j.code } },
      update: {},
      create: {
        id: j.id,
        companyId: company.id,
        locationId: alexLocation.id,
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

  // ── 8c. Bank Accounts ─────────────────────────────────────────────────────
  await prisma.bankAccount.upsert({
    where: { id: 'bank-cai' },
    update: {},
    create: {
      id: 'bank-cai',
      name: 'Cairo Main Operating Account',
      accountNumber: '001-CAI-001',
      bankName: 'Commercial International Bank',
      currencyId: egp.id,
    },
  });
  await prisma.bankAccount.upsert({
    where: { id: 'bank-alx' },
    update: {},
    create: {
      id: 'bank-alx',
      name: 'Alexandria Main Operating Account',
      accountNumber: '001-ALX-001',
      bankName: 'Commercial International Bank',
      currencyId: egp.id,
    },
  });
  // Link bank journals to bank accounts
  await prisma.journal.update({ where: { id: 'j-bank-cai' }, data: { bankAccountId: 'bank-cai' } });
  await prisma.journal.update({ where: { id: 'j-bank-alx' }, data: { bankAccountId: 'bank-alx' } });

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

  // ── 10. Demo users (sales rep + finance + customers) ─────────────────────
  const staffHash = await bcrypt.hash('Staff@1234!', 10);
  const custHash  = await bcrypt.hash('Cust@1234!', 10);

  const salesRepPartner = await prisma.partner.upsert({
    where: { id: 'partner-salesrep-001' },
    update: {},
    create: { id: 'partner-salesrep-001', type: 'EMPLOYEE', name: 'Ahmed Hassan', defaultPaymentTermId: dueOnReceipt.id },
  });
  const salesRep = await prisma.user.upsert({
    where: { email: 'ahmed@icar.com' },
    update: {},
    create: { email: 'ahmed@icar.com', passwordHash: staffHash, name: 'Ahmed Hassan', role: 'SALES_REP', locationId: cairoLocation.id, partnerId: salesRepPartner.id },
  });

  const financePartner = await prisma.partner.upsert({
    where: { id: 'partner-finance-001' },
    update: {},
    create: { id: 'partner-finance-001', type: 'EMPLOYEE', name: 'Sara Mahmoud', defaultPaymentTermId: dueOnReceipt.id },
  });
  await prisma.user.upsert({
    where: { email: 'sara@icar.com' },
    update: {},
    create: { email: 'sara@icar.com', passwordHash: staffHash, name: 'Sara Mahmoud', role: 'FINANCE', locationId: cairoLocation.id, partnerId: financePartner.id },
  });

  const cust1Partner = await prisma.partner.upsert({
    where: { id: 'partner-cust-001' },
    update: {},
    create: { id: 'partner-cust-001', type: 'CUSTOMER', name: 'Mohamed Ali', defaultPaymentTermId: dueOnReceipt.id },
  });
  const cust1 = await prisma.user.upsert({
    where: { email: 'mali@example.com' },
    update: {},
    create: { email: 'mali@example.com', passwordHash: custHash, name: 'Mohamed Ali', phone: '01012345678', role: 'CUSTOMER', locationId: cairoLocation.id, partnerId: cust1Partner.id },
  });

  const cust2Partner = await prisma.partner.upsert({
    where: { id: 'partner-cust-002' },
    update: {},
    create: { id: 'partner-cust-002', type: 'CUSTOMER', name: 'Nour Ibrahim', defaultPaymentTermId: dueOnReceipt.id },
  });
  await prisma.user.upsert({
    where: { email: 'nour@example.com' },
    update: {},
    create: { email: 'nour@example.com', passwordHash: custHash, name: 'Nour Ibrahim', phone: '01098765432', role: 'CUSTOMER', locationId: cairoLocation.id, partnerId: cust2Partner.id },
  });

  // ── 11. Demo vehicles ─────────────────────────────────────────────────────
  const v1 = await prisma.vehicle.upsert({
    where: { vin: 'JN1AZ4EH5FM000001' },
    update: {},
    create: {
      vin: 'JN1AZ4EH5FM000001', make: 'Toyota', model: 'Camry', year: 2024, trim: 'GL',
      price: 1_450_000, cost: 1_280_000, status: 'AVAILABLE',
      bodyType: 'SEDAN', color: 'Pearl White', fuelType: 'Petrol', transmission: 'Automatic',
      mileage: 0, description: 'Brand new Toyota Camry GL 2024 — full service history, factory warranty.',
      locationId: cairoLocation.id,
      adminFeeOverride: 8000, insuranceFeeOverride: 12000,
    },
  });

  await prisma.vehicle.upsert({
    where: { vin: 'JN1AZ4EH5FM000002' },
    update: {},
    create: {
      vin: 'JN1AZ4EH5FM000002', make: 'Toyota', model: 'Corolla', year: 2024, trim: 'XLi',
      price: 980_000, cost: 860_000, status: 'AVAILABLE',
      bodyType: 'SEDAN', color: 'Silver', fuelType: 'Petrol', transmission: 'Automatic',
      mileage: 0, description: 'Toyota Corolla XLi 2024 — economical, reliable city sedan.',
      locationId: cairoLocation.id,
    },
  });

  await prisma.vehicle.upsert({
    where: { vin: 'JN1AZ4EH5FM000003' },
    update: {},
    create: {
      vin: 'JN1AZ4EH5FM000003', make: 'Hyundai', model: 'Tucson', year: 2023, trim: 'GLS',
      price: 1_250_000, cost: 1_090_000, status: 'AVAILABLE',
      bodyType: 'SUV', color: 'Phantom Black', fuelType: 'Petrol', transmission: 'Automatic',
      mileage: 12_000, description: 'Hyundai Tucson GLS 2023 — low mileage, full panoramic roof.',
      locationId: cairoLocation.id,
    },
  });

  await prisma.vehicle.upsert({
    where: { vin: 'JN1AZ4EH5FM000004' },
    update: {},
    create: {
      vin: 'JN1AZ4EH5FM000004', make: 'Kia', model: 'Sportage', year: 2024, trim: 'LX',
      price: 1_100_000, cost: 960_000, status: 'AVAILABLE',
      bodyType: 'SUV', color: 'Aurora Black', fuelType: 'Petrol', transmission: 'Automatic',
      mileage: 0, description: 'Kia Sportage LX 2024 — new model, 7-year warranty.',
      locationId: cairoLocation.id,
    },
  });

  await prisma.vehicle.upsert({
    where: { vin: 'JN1AZ4EH5FM000005' },
    update: {},
    create: {
      vin: 'JN1AZ4EH5FM000005', make: 'Nissan', model: 'Sunny', year: 2024, trim: 'S',
      price: 680_000, cost: 590_000, status: 'RESERVED',
      bodyType: 'SEDAN', color: 'Brilliant White', fuelType: 'Petrol', transmission: 'Automatic',
      mileage: 0, description: 'Nissan Sunny S 2024 — compact and fuel-efficient.',
      locationId: cairoLocation.id,
    },
  });

  await prisma.vehicle.upsert({
    where: { vin: 'JN1AZ4EH5FM000006' },
    update: {},
    create: {
      vin: 'JN1AZ4EH5FM000006', make: 'Mercedes-Benz', model: 'C200', year: 2023, trim: 'AMG Line',
      price: 3_200_000, cost: 2_850_000, status: 'AVAILABLE',
      bodyType: 'SEDAN', color: 'Obsidian Black', fuelType: 'Petrol', transmission: 'Automatic',
      mileage: 5_000, description: 'Mercedes-Benz C200 AMG Line 2023 — premium luxury, full spec.',
      locationId: cairoLocation.id,
    },
  });

  await prisma.vehicle.upsert({
    where: { vin: 'JN1AZ4EH5FM000007' },
    update: {},
    create: {
      vin: 'JN1AZ4EH5FM000007', make: 'Honda', model: 'HR-V', year: 2024, trim: 'EX',
      price: 1_050_000, cost: 920_000, status: 'AVAILABLE',
      bodyType: 'SUV', color: 'Sonic Grey', fuelType: 'Petrol', transmission: 'CVT',
      mileage: 0, description: 'Honda HR-V EX 2024 — stylish crossover with Honda Sensing suite.',
      locationId: cairoLocation.id,
    },
  });

  await prisma.vehicle.upsert({
    where: { vin: 'JN1AZ4EH5FM000008' },
    update: {},
    create: {
      vin: 'JN1AZ4EH5FM000008', make: 'BMW', model: '320i', year: 2022, trim: 'M Sport',
      price: 2_400_000, cost: 2_100_000, status: 'AVAILABLE',
      bodyType: 'SEDAN', color: 'Alpine White', fuelType: 'Petrol', transmission: 'Automatic',
      mileage: 25_000, description: 'BMW 320i M Sport 2022 — pre-owned, single owner, full BMW service.',
      locationId: cairoLocation.id,
    },
  });

  // ── 12. Demo leads ────────────────────────────────────────────────────────
  await prisma.lead.upsert({
    where: { id: 'lead-demo-001' },
    update: {},
    create: {
      id: 'lead-demo-001',
      name: 'Karim Saad', phone: '01155667788', email: 'karim@example.com',
      source: 'FACEBOOK', status: 'NEW',
      notes: 'Interested in SUV, budget ~1.2M EGP',
      locationId: cairoLocation.id,
      assignedToUserId: salesRep.id,
      vehicleId: v1.id,
    },
  });

  await prisma.lead.upsert({
    where: { id: 'lead-demo-002' },
    update: {},
    create: {
      id: 'lead-demo-002',
      name: 'Dina Fawzy', phone: '01023456789',
      source: 'WALK_IN', status: 'CONTACTED',
      notes: 'Came in to test drive a Corolla. Follow up this week.',
      locationId: cairoLocation.id,
      assignedToUserId: salesRep.id,
    },
  });

  await prisma.lead.upsert({
    where: { id: 'lead-demo-003' },
    update: {},
    create: {
      id: 'lead-demo-003',
      name: 'Hisham Nour', phone: '01099887766', email: 'hisham@example.com',
      source: 'WEBSITE', status: 'QUALIFIED',
      notes: 'Pre-approved for bank financing. Interested in C200.',
      locationId: cairoLocation.id,
      assignedToUserId: salesRep.id,
    },
  });

  // ── 13. Demo deal (in progress) ───────────────────────────────────────────
  await prisma.deal.upsert({
    where: { id: 'deal-demo-001' },
    update: {},
    create: {
      id: 'deal-demo-001',
      customerId: cust1.id,
      vehicleId: v1.id,
      salesRepId: salesRep.id,
      locationId: cairoLocation.id,
      purchaseMethod: 'CASH',
      salePrice: 1_450_000,
      adminFee: 8000,
      insuranceFee: 12000,
      status: 'DRAFT',
    },
  });

  // ── Commission Plans ─────────────────────────────────────────────────────
  await prisma.commissionPlan.upsert({
    where: { id: 'cp-percent-sale' },
    update: {},
    create: {
      id: 'cp-percent-sale',
      name: '2% of Sale Price (Standard)',
      basisType: 'PERCENT_OF_SALE_PRICE',
      percentage: 2,
      active: true,
      applicableRole: 'PRIMARY_SALES_REP',
    },
  });

  await prisma.commissionPlan.upsert({
    where: { id: 'cp-flat-senior' },
    update: {},
    create: {
      id: 'cp-flat-senior',
      name: '3% Senior Rep Plan',
      basisType: 'PERCENT_OF_SALE_PRICE',
      percentage: 3,
      active: true,
      applicableRole: 'PRIMARY_SALES_REP',
    },
  });

  await prisma.commissionPlan.upsert({
    where: { id: 'cp-fi-manager' },
    update: {},
    create: {
      id: 'cp-fi-manager',
      name: '1% Finance Manager Plan',
      basisType: 'PERCENT_OF_SALE_PRICE',
      percentage: 1,
      active: true,
      applicableRole: 'FINANCE_MANAGER',
    },
  });

  // ── Manager user ─────────────────────────────────────────────────────────
  const managerPartner = await prisma.partner.upsert({
    where: { id: 'partner-manager-001' },
    update: {},
    create: { id: 'partner-manager-001', type: 'EMPLOYEE', name: 'Khaled Omar', defaultPaymentTermId: dueOnReceipt.id },
  });
  await prisma.user.upsert({
    where: { email: 'khaled@icar.com' },
    update: {},
    create: { email: 'khaled@icar.com', passwordHash: staffHash, name: 'Khaled Omar', role: 'MANAGER', locationId: cairoLocation.id, partnerId: managerPartner.id },
  });

  // ── 14. Car Makes & Models ────────────────────────────────────────────────
  await seedCarMakes(company.id);

  console.log('✅  Seeding complete.');
}

async function seedCarMakes(companyId: string) {
  const MAKES = [
    // Japanese
    { name: 'Toyota', slug: 'toyota', models: ['Corolla', 'Camry', 'RAV4', 'Highlander', 'Land Cruiser', 'Land Cruiser Prado', 'Yaris', 'Fortuner', 'Innova', 'HiAce', 'Hilux', 'Supra', 'C-HR', 'Venza', 'Avalon', 'Crown', 'Prius', 'bZ4X', 'GR86', 'Sequoia', 'Tundra', 'Tacoma', '4Runner', 'FJ Cruiser'] },
    { name: 'Honda', slug: 'honda', models: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Pilot', 'Ridgeline', 'Odyssey', 'Passport', 'Jazz', 'City', 'Fit', 'Element', 'Insight', 'Breeze', 'ZR-V', 'e:Ny1'] },
    { name: 'Nissan', slug: 'nissan', models: ['Altima', 'Maxima', 'Sentra', 'Versa', 'Kicks', 'Rogue', 'Pathfinder', 'Frontier', 'Murano', 'Armada', 'GT-R', 'Z', 'X-Trail', 'Qashqai', 'Patrol', 'Navara', 'Terra', 'Leaf', 'Ariya', 'Juke', 'Note', 'Tiida'] },
    { name: 'Mazda', slug: 'mazda', models: ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-5', 'CX-30', 'CX-50', 'CX-60', 'CX-90', 'MX-5 Miata', 'BT-50', 'MX-30'] },
    { name: 'Subaru', slug: 'subaru', models: ['Outback', 'Forester', 'Impreza', 'Legacy', 'Crosstrek', 'Ascent', 'BRZ', 'WRX', 'XV', 'Solterra'] },
    { name: 'Mitsubishi', slug: 'mitsubishi', models: ['Outlander', 'Eclipse Cross', 'ASX', 'Pajero', 'L200 Triton', 'Galant', 'Lancer', 'Mirage', 'Attrage', 'Xpander', 'Montero Sport', 'Colt'] },
    { name: 'Suzuki', slug: 'suzuki', models: ['Vitara', 'Swift', 'Jimny', 'S-Cross', 'Baleno', 'Grand Vitara', 'Ertiga', 'Dzire', 'Alto', 'Ignis', 'Fronx', 'Brezza', 'XL6', 'Ciaz'] },
    { name: 'Isuzu', slug: 'isuzu', models: ['D-Max', 'MU-X', 'Trooper', 'Rodeo', 'Bighorn'] },
    { name: 'Daihatsu', slug: 'daihatsu', models: ['Terios', 'Rocky', 'Sirion', 'Mira', 'Move', 'Taft', 'Xenia'] },
    { name: 'Lexus', slug: 'lexus', models: ['IS', 'ES', 'GS', 'LS', 'NX', 'RX', 'GX', 'LX', 'UX', 'RC', 'LC', 'RZ', 'TX'] },
    { name: 'Acura', slug: 'acura', models: ['ILX', 'TLX', 'RLX', 'MDX', 'RDX', 'NSX', 'Integra'] },
    { name: 'Infiniti', slug: 'infiniti', models: ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'] },
    // German
    { name: 'BMW', slug: 'bmw', models: ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'M2', 'M3', 'M4', 'M5', 'M8', 'Z4', 'i3', 'i4', 'i5', 'i7', 'iX', 'iX1', 'iX3'] },
    { name: 'Mercedes-Benz', slug: 'mercedes-benz', models: ['A-Class', 'B-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'CLS', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'G-Class', 'AMG GT', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'SL', 'SLC', 'Maybach S-Class', 'Maybach GLS'] },
    { name: 'Audi', slug: 'audi', models: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'Q8 e-tron', 'TT', 'R8', 'e-tron GT', 'RS3', 'RS4', 'RS5', 'RS6', 'RS7'] },
    { name: 'Volkswagen', slug: 'volkswagen', models: ['Golf', 'Passat', 'Jetta', 'Tiguan', 'Atlas', 'Touareg', 'Polo', 'Arteon', 'Taos', 'ID.4', 'ID.3', 'ID.5', 'ID.7', 'T-Roc', 'T-Cross', 'Touran', 'Phaeton', 'Amarok', 'Multivan'] },
    { name: 'Porsche', slug: 'porsche', models: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', '718 Boxster', '718 Cayman', 'Cayenne E-Hybrid'] },
    { name: 'Opel', slug: 'opel', models: ['Astra', 'Corsa', 'Insignia', 'Mokka', 'Crossland', 'Grandland', 'Zafira', 'Vectra', 'Omega'] },
    { name: 'Smart', slug: 'smart', models: ['Fortwo', 'Forfour', '#1', '#3'] },
    // American
    { name: 'Ford', slug: 'ford', models: ['F-150', 'F-250', 'F-350', 'Mustang', 'Explorer', 'Escape', 'Edge', 'Expedition', 'Ranger', 'Bronco', 'Bronco Sport', 'Maverick', 'EcoSport', 'Puma', 'Focus', 'Fiesta', 'Fusion', 'Taurus', 'Mustang Mach-E', 'F-150 Lightning', 'Transit', 'Transit Connect'] },
    { name: 'Chevrolet', slug: 'chevrolet', models: ['Silverado 1500', 'Silverado 2500HD', 'Colorado', 'Camaro', 'Corvette', 'Tahoe', 'Suburban', 'Equinox', 'Trailblazer', 'Blazer', 'Trax', 'Malibu', 'Spark', 'Bolt EV', 'Traverse', 'Impala', 'Captiva', 'Groove', 'Express'] },
    { name: 'Dodge', slug: 'dodge', models: ['Charger', 'Challenger', 'Durango', 'Journey', 'Dart', 'Grand Caravan', 'Hornet'] },
    { name: 'Jeep', slug: 'jeep', models: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator', 'Wagoneer', 'Grand Wagoneer', 'Grand Cherokee 4xe', 'Avenger'] },
    { name: 'Ram', slug: 'ram', models: ['1500', '1500 Classic', '2500', '3500', 'ProMaster', 'ProMaster City'] },
    { name: 'GMC', slug: 'gmc', models: ['Sierra 1500', 'Sierra 2500HD', 'Canyon', 'Terrain', 'Acadia', 'Yukon', 'Yukon XL', 'Envoy', 'Hummer EV'] },
    { name: 'Cadillac', slug: 'cadillac', models: ['Escalade', 'Escalade ESV', 'XT4', 'XT5', 'XT6', 'CT4', 'CT5', 'Lyriq', 'Optiq'] },
    { name: 'Buick', slug: 'buick', models: ['Enclave', 'Encore', 'Encore GX', 'Envision', 'Envista', 'LaCrosse', 'Verano'] },
    { name: 'Lincoln', slug: 'lincoln', models: ['Navigator', 'Navigator L', 'Aviator', 'Nautilus', 'Corsair', 'Continental'] },
    { name: 'Tesla', slug: 'tesla', models: ['Model S', 'Model 3', 'Model X', 'Model Y', 'Cybertruck', 'Roadster'] },
    // Korean
    { name: 'Hyundai', slug: 'hyundai', models: ['Elantra', 'Sonata', 'Azera', 'Tucson', 'Santa Fe', 'Palisade', 'Kona', 'Venue', 'Ioniq', 'Ioniq 5', 'Ioniq 6', 'Ioniq 9', 'Nexo', 'Santa Cruz', 'Staria', 'Starex', 'i10', 'i20', 'i30', 'Accent', 'Creta', 'Verna'] },
    { name: 'Kia', slug: 'kia', models: ['Picanto', 'Rio', 'Cerato', 'K5', 'K8', 'Sportage', 'Sorento', 'Telluride', 'Seltos', 'Stonic', 'Niro', 'Carnival', 'EV6', 'EV9', 'Stinger', 'Mohave', 'Soul', 'Cadenza'] },
    { name: 'Genesis', slug: 'genesis', models: ['G70', 'G80', 'G90', 'GV70', 'GV80', 'GV60', 'Electrified GV70', 'Electrified G80'] },
    { name: 'SsangYong', slug: 'ssangyong', models: ['Tivoli', 'Korando', 'Rexton', 'Musso', 'Actyon', 'Torres', 'Rexton Sports'] },
    // British
    { name: 'Land Rover', slug: 'land-rover', models: ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque', 'Freelander'] },
    { name: 'Jaguar', slug: 'jaguar', models: ['XE', 'XF', 'XJ', 'F-Type', 'F-Pace', 'E-Pace', 'I-Pace'] },
    { name: 'Bentley', slug: 'bentley', models: ['Continental GT', 'Continental GTC', 'Bentayga', 'Flying Spur', 'Mulsanne', 'Bacalar'] },
    { name: 'Rolls-Royce', slug: 'rolls-royce', models: ['Phantom', 'Ghost', 'Wraith', 'Dawn', 'Cullinan', 'Spectre', 'Silver Shadow'] },
    { name: 'Aston Martin', slug: 'aston-martin', models: ['DB11', 'DBS', 'Vantage', 'Valkyrie', 'DBX', 'DBX707', 'DB12'] },
    { name: 'McLaren', slug: 'mclaren', models: ['720S', 'GT', 'Artura', 'Senna', '765LT', 'Speedtail', '750S', 'GTS'] },
    { name: 'MINI', slug: 'mini', models: ['Cooper', 'Cooper S', 'Countryman', 'Clubman', 'Convertible', 'Paceman', 'JCW', 'Aceman', 'Cooper Electric'] },
    { name: 'Lotus', slug: 'lotus', models: ['Elise', 'Exige', 'Evija', 'Emira', 'Eletre'] },
    // Italian
    { name: 'Ferrari', slug: 'ferrari', models: ['296 GTB', '296 GTS', 'Roma', 'Roma Spider', 'Portofino M', 'SF90 Stradale', 'SF90 Spider', '812 Superfast', 'F8 Tributo', 'F8 Spider', 'GTC4Lusso', 'Purosangue', '488', 'California'] },
    { name: 'Lamborghini', slug: 'lamborghini', models: ['Huracán', 'Huracán Sterrato', 'Huracán STO', 'Urus', 'Urus S', 'Urus Performante', 'Revuelto', 'Countach LPI 800-4'] },
    { name: 'Maserati', slug: 'maserati', models: ['Ghibli', 'Quattroporte', 'GranTurismo', 'GranCabrio', 'Levante', 'Grecale', 'MC20', 'MC20 Cielo'] },
    { name: 'Alfa Romeo', slug: 'alfa-romeo', models: ['Giulia', 'Stelvio', 'Tonale', '4C', 'Spider', 'Giulietta', 'MiTo', 'Brera'] },
    { name: 'Fiat', slug: 'fiat', models: ['500', '500e', 'Panda', 'Tipo', 'Doblo', 'Punto', '500X', '500L', 'Bravo', 'Stilo', 'Ducato', 'Talento'] },
    { name: 'Lancia', slug: 'lancia', models: ['Ypsilon', 'Delta', 'Stratos'] },
    // French
    { name: 'Peugeot', slug: 'peugeot', models: ['108', '208', '308', '408', '508', '2008', '3008', '5008', 'Partner', 'Expert', 'Landtrek', 'e-208', 'e-2008', 'e-308'] },
    { name: 'Renault', slug: 'renault', models: ['Clio', 'Megane', 'Captur', 'Arkana', 'Kadjar', 'Koleos', 'Duster', 'Trafic', 'Kangoo', 'Talisman', 'Austral', 'Espace', 'Zoe', 'Megane E-Tech', 'Scenic E-Tech', 'Twingo'] },
    { name: 'Citroën', slug: 'citroen', models: ['C3', 'C3 Aircross', 'C4', 'C4 X', 'C5 X', 'Berlingo', 'Spacetourer', 'Ami', 'ë-C3', 'ë-Berlingo', 'DS 3 Crossback'] },
    { name: 'DS Automobiles', slug: 'ds', models: ['DS 3', 'DS 3 Crossback E-Tense', 'DS 4', 'DS 7', 'DS 7 Crossback', 'DS 9'] },
    // Swedish
    { name: 'Volvo', slug: 'volvo', models: ['S60', 'S90', 'V60', 'V90', 'XC40', 'XC60', 'XC90', 'C40 Recharge', 'EX30', 'EX40', 'EX90', 'EC40'] },
    // Spanish / Czech / Romanian
    { name: 'SEAT', slug: 'seat', models: ['Ibiza', 'Leon', 'Ateca', 'Arona', 'Tarraco', 'Mii', 'Alhambra'] },
    { name: 'Cupra', slug: 'cupra', models: ['Formentor', 'Born', 'Ateca', 'Leon', 'Terramar', 'Tavascan'] },
    { name: 'Škoda', slug: 'skoda', models: ['Fabia', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq', 'Enyaq', 'Rapid', 'Scala', 'Citigo'] },
    { name: 'Dacia', slug: 'dacia', models: ['Sandero', 'Sandero Stepway', 'Logan', 'Duster', 'Spring', 'Jogger', 'Lodgy', 'Bigster'] },
    // Chinese
    { name: 'BYD', slug: 'byd', models: ['Seal', 'Atto 3', 'Dolphin', 'Tang', 'Han', 'Song Plus', 'Song Pro', 'Yuan Plus', 'Qin Plus', 'Destroyer 05', 'Sea Lion 6', 'Sea Lion 7', 'Seagull', 'Sealion U'] },
    { name: 'Dongfeng', slug: 'dongfeng', models: ['Fengshen AX4', 'Fengshen AX5', 'Fengshen AX7', 'Fengshen AX7 Pro', 'Fengshen ix5', 'Fengshen ix7', 'Aeolus E70', 'Aeolus A60', 'Aeolus A9', 'H30 Cross', 'S30', 'Fengxing T5', 'Fengxing T7', 'Fengxing CM7', 'Box'] },
    { name: 'Jaylong', slug: 'jaylong', models: ['T7', 'T9', 'S70', 'S80', 'X5', 'X7', 'Pro 5', 'Pro 7', 'EV5', 'EV7'] },
    { name: 'MG', slug: 'mg', models: ['MG3', 'MG5', 'MG6', 'ZS', 'ZS EV', 'RX5', 'HS', 'GS', 'Gloster', 'EP', 'Cyberster', 'One', 'Marvel R', 'Mulan', '4 Electric'] },
    { name: 'Chery', slug: 'chery', models: ['Tiggo 4 Pro', 'Tiggo 7 Pro', 'Tiggo 8 Pro', 'Arrizo 5', 'Arrizo 6', 'Arrizo 8', 'Omoda 5', 'Omoda C5', 'Jaecoo 7'] },
    { name: 'Haval', slug: 'haval', models: ['H2', 'H4', 'H6', 'H9', 'F5', 'F7', 'Jolion', 'Raptor', 'Dargo', 'Big Dog'] },
    { name: 'Geely', slug: 'geely', models: ['Coolray', 'Okavango', 'Azkarra', 'Preface', 'Xingyue', 'Emgrand', 'GX3 Pro', 'Tugella', 'Monjaro'] },
    { name: 'GAC', slug: 'gac', models: ['GS3', 'GS4', 'GS5', 'GS8', 'GA4', 'GA6', 'Aion S', 'Aion Y', 'Aion V', 'Trumpchi'] },
    { name: 'NIO', slug: 'nio', models: ['ET5', 'ET5T', 'ET7', 'ES6', 'ES7', 'ES8', 'EC6', 'EC7', 'EL6', 'EL7'] },
    { name: 'Xpeng', slug: 'xpeng', models: ['P7', 'G3i', 'P5', 'G9', 'G6', 'X9', 'MONA M03'] },
    // Indian
    { name: 'Tata', slug: 'tata', models: ['Nexon', 'Harrier', 'Safari', 'Tiago', 'Altroz', 'Punch', 'Tigor', 'Nexon EV', 'Punch EV', 'Curvv'] },
    { name: 'Mahindra', slug: 'mahindra', models: ['Scorpio', 'Scorpio-N', 'XUV700', 'XUV300', 'XUV400', 'Thar', 'Bolero', 'BE 6', 'XEV 9e', 'XUV 3XO'] },
    // Other
    { name: 'Saab', slug: 'saab', models: ['9-3', '9-5', '9-4X', '9-7X', '9-2X'] },
    { name: 'Daewoo', slug: 'daewoo', models: ['Lanos', 'Nubira', 'Leganza', 'Matiz', 'Kalos', 'Lacetti', 'Magnus'] },
    { name: 'Rivian', slug: 'rivian', models: ['R1T', 'R1S', 'R2', 'R3'] },
    { name: 'Lucid', slug: 'lucid', models: ['Air Pure', 'Air Touring', 'Air Grand Touring', 'Air Sapphire', 'Gravity'] },
    { name: 'Polestar', slug: 'polestar', models: ['1', '2', '3', '4', '5', '6'] },
  ];

  console.log('  Seeding car makes and models...');
  for (const makeData of MAKES) {
    const { models, ...makeFields } = makeData;
    const logoUrl = `https://cdn.jsdelivr.net/npm/car-logos-dataset@2.2.0/src/${makeFields.slug}/logo.png`;
    const make = await prisma.carMake.upsert({
      where: { companyId_name: { companyId, name: makeFields.name } },
      update: { logoUrl, slug: makeFields.slug },
      create: { name: makeFields.name, slug: makeFields.slug, logoUrl, companyId },
    });
    for (const modelName of models) {
      await prisma.carModel.upsert({
        where: { makeId_name: { makeId: make.id, name: modelName } },
        update: {},
        create: { name: modelName, makeId: make.id },
      });
    }
  }
  console.log('  Car makes and models seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
