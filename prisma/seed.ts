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
    { code: '1310', name: 'Inter-Location Receivable', type: 'ASSET', parent: '1300' },
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
      accountId: coa['2200'],
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

  console.log('✅  Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
