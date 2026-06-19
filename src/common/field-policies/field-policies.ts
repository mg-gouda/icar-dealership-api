// ponytail: single source of truth for field-level visibility/editability per role

export type Role = 'CUSTOMER' | 'SALES_REP' | 'MANAGER' | 'FINANCE' | 'ADMIN' | 'SUPER_ADMIN';

export interface FieldPolicy {
  entity: string;
  field: string;
  /** Roles below this cannot see the field in responses */
  minRole: Role;
  /** Roles below this cannot set the field in write payloads (defaults to minRole) */
  writeMinRole?: Role;
}

const ROLE_ORDER: Role[] = ['CUSTOMER', 'SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN'];

export function roleAtLeast(userRole: Role, minRole: Role): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(minRole);
}

/**
 * All field-level policies derived from Project_Docs/09-field-level-permissions.md.
 * "no policy" = visible/editable to all authenticated roles with endpoint access.
 */
export const FIELD_POLICIES: FieldPolicy[] = [
  // ── Vehicle ──
  { entity: 'Vehicle', field: 'cost', minRole: 'MANAGER', writeMinRole: 'FINANCE' },
  { entity: 'Vehicle', field: 'adminFeeOverride', minRole: 'MANAGER', writeMinRole: 'FINANCE' },
  { entity: 'Vehicle', field: 'insuranceFeeOverride', minRole: 'MANAGER', writeMinRole: 'FINANCE' },

  // ── Deal ──
  { entity: 'Deal', field: 'grossProfit', minRole: 'MANAGER' },
  { entity: 'Deal', field: 'costOfGoods', minRole: 'MANAGER' },
  { entity: 'Deal', field: 'salePrice', minRole: 'SALES_REP', writeMinRole: 'MANAGER' },
  { entity: 'Deal', field: 'purchaseMethod', minRole: 'SALES_REP', writeMinRole: 'MANAGER' },

  // ── User (staff-to-staff edits) ──
  { entity: 'User', field: 'passwordHash', minRole: 'ADMIN' },
  { entity: 'User', field: 'role', minRole: 'MANAGER', writeMinRole: 'ADMIN' },
  { entity: 'User', field: 'totpSecret', minRole: 'ADMIN' },

  // ── BankFinancingDocument ──
  { entity: 'BankFinancingDocument', field: 'fileUrl', minRole: 'FINANCE' },

  // ── FinanceApplication ──
  { entity: 'FinanceApplication', field: 'applicantInfo', minRole: 'FINANCE' },

  // ── BankApproval ──
  { entity: 'BankApproval', field: 'approvedAmount', minRole: 'MANAGER' },
  { entity: 'BankApproval', field: 'approvedBy', minRole: 'MANAGER' },
  { entity: 'BankApproval', field: 'approvalDocumentUrl', minRole: 'FINANCE' },

  // ── Partner ──
  { entity: 'Partner', field: 'taxExemptCertNumber', minRole: 'FINANCE' },
  { entity: 'Partner', field: 'taxExemptCertUrl', minRole: 'FINANCE' },
  { entity: 'Partner', field: 'defaultExpenseAccountId', minRole: 'FINANCE' },
  { entity: 'Partner', field: 'defaultPaymentTermId', minRole: 'FINANCE' },

  // ── AuditLog ──
  { entity: 'AuditLog', field: 'oldValue', minRole: 'ADMIN' },
  { entity: 'AuditLog', field: 'newValue', minRole: 'ADMIN' },
];
