import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportExportService } from './report-export.service';

@ApiTags('Finance Reports Export')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/reports/export')
export class ReportsExportController {
  constructor(
    private svc: ReportsService,
    private exportSvc: ReportExportService,
  ) {}

  private reply(res: Response, title: string, headers: string[], rows: string[][], format?: string) {
    const out = this.exportSvc.build(title, headers, rows, format);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.content);
  }

  private monthStart(): string {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1).toISOString();
  }

  @Get('trial-balance')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async trialBalance(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const data = await this.svc.trialBalance(
      req.user.companyId,
      new Date(q.dateFrom ?? this.monthStart()),
      new Date(q.dateTo ?? Date.now()),
    );
    const f = this.exportSvc.fmt;
    const headers = ['Code', 'Account', 'Type', 'Opening Balance', 'Period Debit', 'Period Credit', 'Closing Balance'];
    const rows = data.map((r) => [r.code, r.name, r.type, f(r.openingBalance), f(r.periodDebit), f(r.periodCredit), f(r.closingBalance)]);
    this.reply(res, 'Trial Balance', headers, rows, q.format);
  }

  @Get('income-statement')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async incomeStatement(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const data = await this.svc.incomeStatement(
      req.user.companyId,
      new Date(q.dateFrom ?? this.monthStart()),
      new Date(q.dateTo ?? Date.now()),
    );
    const f = this.exportSvc.fmt;
    const headers = ['Code', 'Account', 'Type', 'Amount'];
    const rows: string[][] = [
      ['--- INCOME ---', '', '', ''],
      ...data.income.map((r: any) => [r.code, r.name, r.type, f(r.net)]),
      ['', 'Total Income', '', f(data.totalIncome)],
      ['--- EXPENSES ---', '', '', ''],
      ...data.expenses.map((r: any) => [r.code, r.name, r.type, f(r.net)]),
      ['', 'Total Expenses', '', f(data.totalExpense)],
      ['', 'Net Profit', '', f(data.netProfit)],
    ];
    this.reply(res, 'Income Statement', headers, rows, q.format);
  }

  @Get('balance-sheet')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async balanceSheet(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const data = await this.svc.balanceSheet(req.user.companyId, new Date(q.asOf ?? Date.now()));
    const f = this.exportSvc.fmt;
    const headers = ['Code', 'Account', 'Type', 'Balance'];
    const rows: string[][] = [
      ['--- ASSETS ---', '', '', ''],
      ...data.assets.map((r: any) => [r.code, r.name, r.type, f(r.balance)]),
      ['', 'Total Assets', '', f(data.totalAssets)],
      ['--- LIABILITIES ---', '', '', ''],
      ...data.liabilities.map((r: any) => [r.code, r.name, r.type, f(r.balance)]),
      ['', 'Total Liabilities', '', f(data.totalLiabilities)],
      ['--- EQUITY ---', '', '', ''],
      ...data.equity.map((r: any) => [r.code, r.name, r.type, f(r.balance)]),
      ['', 'Total Equity', '', f(data.totalEquity)],
      ['', 'Total Liabilities + Equity', '', f(data.totalLiabilitiesAndEquity)],
    ];
    this.reply(res, 'Balance Sheet', headers, rows, q.format);
  }

  @Get('aged-receivables')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async agedReceivables(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const data = await this.svc.agedReceivables(req.user.companyId, new Date(q.asOf ?? Date.now()));
    const [headers, rows] = this.flattenAged(data);
    this.reply(res, 'Aged Receivables', headers, rows, q.format);
  }

  @Get('aged-payables')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async agedPayables(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const data = await this.svc.agedPayables(req.user.companyId, new Date(q.asOf ?? Date.now()));
    const [headers, rows] = this.flattenAged(data);
    this.reply(res, 'Aged Payables', headers, rows, q.format);
  }

  private flattenAged(data: any[]): [string[], string[][]] {
    const f = this.exportSvc.fmt;
    return [
      ['Partner', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'],
      data.map((r) => [r.partnerName, f(r.current), f(r.b30), f(r.b60), f(r.b90), f(r.b90plus), f(r.total)]),
    ];
  }

  @Get('cash-flow')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async cashFlow(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const data = await this.svc.cashFlow(
      req.user.companyId,
      new Date(q.dateFrom ?? this.monthStart()),
      new Date(q.dateTo ?? Date.now()),
    );
    const f = this.exportSvc.fmt;
    const headers = ['Item', 'Amount'];
    const rows = [
      ['Net Profit', f(data.netProfit)],
      ['Add: Depreciation', f(data.depreciation)],
      ['Less: Change in AR', f(data.arChange)],
      ['Add: Change in AP', f(data.apChange)],
      ['Operating Cash Flow', f(data.operatingCashFlow)],
    ];
    this.reply(res, 'Cash Flow Statement', headers, rows, q.format);
  }

  @Get('tax-report')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async taxReport(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const data = await this.svc.taxReport(
      req.user.companyId,
      new Date(q.dateFrom ?? this.monthStart()),
      new Date(q.dateTo ?? Date.now()),
    );
    const f = this.exportSvc.fmt;
    const headers = ['Tax Group', 'Rate %', 'Collected', 'Paid', 'Net Payable'];
    const rows = (data as any[]).map((r) => [r.taxGroupName, f(r.rate), f(r.taxCollected), f(r.taxPaid), f(r.netPayable)]);
    this.reply(res, 'Tax Report', headers, rows, q.format);
  }

  @Get('gl-by-account')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async glByAccount(@Request() req: any, @Query() q: any, @Res() res: Response) {
    if (!q.accountId) throw new BadRequestException('accountId required');
    const data = await this.svc.glByAccount(
      req.user.companyId,
      q.accountId,
      q.dateFrom ? new Date(q.dateFrom) : undefined,
      q.dateTo ? new Date(q.dateTo) : undefined,
      Number(q.page ?? 1),
      Number(q.limit ?? 1000),
    );
    const f = this.exportSvc.fmt;
    const headers = ['Date', 'Reference', 'Account Code', 'Account Name', 'Debit', 'Credit'];
    const rows = data.items.map((r: any) => [
      r.journalEntry.date ? new Date(r.journalEntry.date).toISOString().split('T')[0] : '',
      r.journalEntry.ref ?? '',
      r.account.code,
      r.account.name,
      f(r.debit),
      f(r.credit),
    ]);
    this.reply(res, 'GL by Account', headers, rows, q.format);
  }

  @Get('vat-return-eta')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async vatReturnEta(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const data = await this.svc.vatReturnEta(
      req.user.companyId,
      new Date(q.dateFrom ?? monthStart),
      new Date(q.dateTo ?? now),
    );
    const headers = ['Box', 'Amount'];
    const rows = Object.entries(data.boxes).map(([box, value]) => [box, String(value)]);
    this.reply(res, 'VAT Return ETA', headers, rows, q.format);
  }

  @Get('revenue-by-month')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  async revenueByMonth(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const data = await this.svc.revenueByMonth(req.user.companyId, q.months ? Number(q.months) : 6);
    const f = this.exportSvc.fmt;
    const headers = ['Month', 'Revenue', 'Expenses', 'Net'];
    const rows = data.months.map((r: any) => [r.month, f(r.revenue), f(r.expenses), f(r.revenue - r.expenses)]);
    this.reply(res, 'Revenue by Month', headers, rows, q.format);
  }

  @Get('branch-profit')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  async branchProfit(@Request() req: any, @Query() q: any, @Res() res: Response) {
    const data = await this.svc.branchProfit(req.user.companyId);
    const f = this.exportSvc.fmt;
    const headers = ['Branch', 'Gross Profit'];
    const rows = data.branches.map((r: any) => [r.branch, f(r.gross)]);
    this.reply(res, 'Branch Profit', headers, rows, q.format);
  }
}
