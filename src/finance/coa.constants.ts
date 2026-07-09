/**
 * Well-known account codes used across finance services.
 * Change here → all references update automatically.
 * ponytail: single source of truth for COA magic strings
 */
export const COA = {
  /** Depreciation expense account */
  DEPRECIATION_EXPENSE: '6500',
  /** Accounts Receivable control account */
  ACCOUNTS_RECEIVABLE: '1300',
  /** Accounts Payable control account */
  ACCOUNTS_PAYABLE: '2100',
  /** Output VAT payable (ETA box 5) */
  OUTPUT_VAT: '2200',
  /** Input VAT recoverable (ETA box 10) */
  INPUT_VAT: '1350',
} as const;
