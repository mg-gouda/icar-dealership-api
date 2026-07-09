import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class FinanceDashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(companyId: string) {
    const [arAgg, apAgg, bankAccounts, overdueInstallments] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          journal: { companyId },
          type: 'CUSTOMER_INVOICE',
          status: 'POSTED',
          paymentStatus: { in: ['NOT_PAID', 'PARTIAL', 'OVERDUE'] },
        },
        _sum: { amountResidual: true },
        _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          journal: { companyId },
          type: 'VENDOR_BILL',
          status: 'POSTED',
          paymentStatus: { in: ['NOT_PAID', 'PARTIAL', 'OVERDUE'] },
        },
        _sum: { amountResidual: true },
        _count: { id: true },
      }),
      this.prisma.bankAccount.findMany({
        where: { journal: { companyId } },
        include: {
          statements: { orderBy: { endDate: 'desc' }, take: 1 },
        },
      }),
      this.prisma.installmentLine.aggregate({
        where: {
          installmentPlan: { deal: { location: { companyId } } },
          status: 'OVERDUE',
        },
        _sum: { totalDue: true },
        _count: { id: true },
      }),
    ]);

    const cashBalance = bankAccounts.reduce((sum, acc) => {
      const latest = acc.statements[0];
      return sum + (latest ? Number(latest.endingBalance) : 0);
    }, 0);

    return {
      arOutstanding: Number(arAgg._sum.amountResidual ?? 0),
      arInvoiceCount: arAgg._count.id,
      apOutstanding: Number(apAgg._sum.amountResidual ?? 0),
      apBillCount: apAgg._count.id,
      cashBalance,
      bankAccountCount: bankAccounts.length,
      overdueInstallmentCount: overdueInstallments._count.id,
      overdueInstallmentAmount: Number(overdueInstallments._sum.totalDue ?? 0),
    };
  }

  async getTodos(companyId: string) {
    const todos: Array<{ id: string; description: string; type: string; href: string }> = [];

    const [draftInvoices, overdueInstallments] = await Promise.all([
      this.prisma.invoice.count({
        where: { journal: { companyId }, type: 'CUSTOMER_INVOICE', status: 'DRAFT' },
      }),
      this.prisma.installmentLine.count({
        where: {
          installmentPlan: { deal: { location: { companyId } } },
          status: 'OVERDUE',
        },
      }),
    ]);

    if (draftInvoices > 0)
      todos.push({ id: 'draft-invoices', description: `${draftInvoices} draft invoice${draftInvoices > 1 ? 's' : ''} pending approval`, type: 'Invoice', href: '/finance/invoices?status=DRAFT' });
    if (overdueInstallments > 0)
      todos.push({ id: 'overdue-installments', description: `${overdueInstallments} overdue installment${overdueInstallments > 1 ? 's' : ''} need attention`, type: 'Invoice', href: '/deals?tab=installments&filter=overdue' });

    return todos;
  }
}
