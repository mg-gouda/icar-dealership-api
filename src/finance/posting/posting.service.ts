import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * All GL postings go through this service. Never create JournalEntry rows directly
 * from other modules — always call PostingService so audit and validation are consistent.
 */
@Injectable()
export class PostingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Finalize a deal: create customer invoice (draft), vehicle COGS entry,
   * and update vehicle status to SOLD. Must be called inside a transaction.
   * Spec: Project_Docs/03-backend-api-spec.md, 06-egypt-financing-spec.md
   */
  async finalizeDeal(_dealId: string, _userId: string): Promise<void> {
    // TODO: implement per spec §Deal Finalize flow
    // 1. Load deal + vehicle + location + fees
    // 2. Create Invoice (CUSTOMER_INVOICE, DRAFT) with lines: vehicle, admin fee, insurance fee
    // 3. Post invoice → create JournalEntry (SALE journal, POSTED)
    //    DR: AR 1300 / CR: Vehicle Sales Income 4100 + VAT 2200
    // 4. Post COGS → create JournalEntry (GENERAL journal, POSTED)
    //    DR: COGS-Vehicle 5100 / CR: Vehicle Inventory 1400/1410
    // 5. vehicle.status → SOLD
    // 6. deal.status → FINALIZED
    throw new Error('PostingService.finalizeDeal not yet implemented');
  }

  /**
   * Post a dealership installment payment line.
   * Spec: Project_Docs/06-egypt-financing-spec.md §Installment GL posting
   */
  async postInstallment(_installmentLineId: string, _userId: string): Promise<void> {
    // TODO: implement per spec
    // DR: Cash/Bank / CR: Installment Payments Received (principal) + Interest Income
    throw new Error('PostingService.postInstallment not yet implemented');
  }

  /**
   * Post bank financing disbursement (shortfall or overage).
   * Spec: Project_Docs/06-egypt-financing-spec.md §Bank Financing GL posting
   */
  async postBankDisbursement(_dealId: string, _userId: string): Promise<void> {
    // TODO: implement per spec
    throw new Error('PostingService.postBankDisbursement not yet implemented');
  }

  /**
   * Accrue commission at deal finalize.
   * DR: Sales Commission Expense 6100 / CR: Commissions Payable 2400
   * Spec: Project_Docs/10-sales-commission-spec.md
   */
  async accrueCommission(_dealCommissionId: string, _userId: string): Promise<void> {
    // TODO: implement per spec
    throw new Error('PostingService.accrueCommission not yet implemented');
  }

  /**
   * Pay out commissions: DR Commissions Payable / CR Bank.
   * Spec: Project_Docs/10-sales-commission-spec.md §Payout
   */
  async payCommission(_commissionIds: string[], _journalId: string, _userId: string): Promise<void> {
    // TODO: implement per spec
    throw new Error('PostingService.payCommission not yet implemented');
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async assertFiscalPeriodOpen(date: Date, companyId: string) {
    const fiscal = await this.prisma.fiscalYear.findFirst({
      where: {
        companyId,
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
    if (!fiscal) throw new BadRequestException('No open fiscal year for the posting date.');
    if (fiscal.lockDate && date <= fiscal.lockDate) {
      throw new BadRequestException(
        'Fiscal period is locked. Finance Admin – Lock Override permission required.',
      );
    }
  }
}
