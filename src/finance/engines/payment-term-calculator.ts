import Decimal from "decimal.js";

interface PaymentTermLineInput {
  valueType: string; // BALANCE, PERCENT, FIXED
  valueAmount: number | Decimal;
  nbDays: number;
  delayType: string; // DAYS_AFTER, DAYS_AFTER_END_OF_MONTH, DAYS_AFTER_END_OF_NEXT_MONTH
  sequence: number;
}

export interface InstallmentResult {
  dueDate: Date;
  amount: Decimal;
  label: string;
}

export function computePaymentTermDueDates(
  totalAmount: number | Decimal,
  invoiceDate: Date,
  lines: PaymentTermLineInput[],
): InstallmentResult[] {
  const total = new Decimal(totalAmount);
  const sortedLines = [...lines].sort((a, b) => a.sequence - b.sequence);

  const installments: InstallmentResult[] = [];
  let remaining = total;

  for (let i = 0; i < sortedLines.length; i++) {
    const line = sortedLines[i];
    let amount: Decimal;

    switch (line.valueType) {
      case "PERCENT":
        amount = total.times(new Decimal(line.valueAmount)).div(100);
        break;
      case "FIXED":
        amount = new Decimal(line.valueAmount);
        break;
      case "BALANCE":
      default:
        amount = remaining;
        break;
    }

    amount = Decimal.min(amount, remaining).toDecimalPlaces(2);
    remaining = remaining.minus(amount);

    const dueDate = computeDueDate(invoiceDate, line.nbDays, line.delayType);
    installments.push({ dueDate, amount, label: `Installment ${i + 1}` });
  }

  return installments;
}

function computeDueDate(invoiceDate: Date, nbDays: number, delayType: string): Date {
  switch (delayType) {
    case "DAYS_AFTER_END_OF_MONTH": {
      const monthEnd = endOfMonth(invoiceDate);
      return addDays(monthEnd, nbDays);
    }
    case "DAYS_AFTER_END_OF_NEXT_MONTH": {
      const nextMonth = new Date(invoiceDate.getFullYear(), invoiceDate.getMonth() + 2, 0);
      return addDays(nextMonth, nbDays);
    }
    case "DAYS_AFTER":
    default:
      return addDays(invoiceDate, nbDays);
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
