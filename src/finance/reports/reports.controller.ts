import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@ApiTags('Finance Reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @Get('trial-balance')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  trialBalance(@Request() req: any, @Query() q: any) {
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    return this.svc.trialBalance(
      req.user.companyId,
      new Date(q.dateFrom ?? monthStart),
      new Date(q.dateTo ?? now),
    );
  }

  @Get('income-statement')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  incomeStatement(@Request() req: any, @Query() q: any) {
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    return this.svc.incomeStatement(
      req.user.companyId,
      new Date(q.dateFrom ?? monthStart),
      new Date(q.dateTo ?? now),
    );
  }

  @Get('balance-sheet')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  balanceSheet(@Request() req: any, @Query() q: any) {
    return this.svc.balanceSheet(req.user.companyId, new Date(q.asOf ?? Date.now()));
  }

  @Get('aged-receivables')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedReceivables(@Request() req: any, @Query() q: any) {
    return this.svc.agedReceivables(
      req.user.companyId,
      new Date(q.asOf ?? Date.now()),
    );
  }

  @Get('aged-payables')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedPayables(@Request() req: any, @Query() q: any) {
    return this.svc.agedPayables(
      req.user.companyId,
      new Date(q.asOf ?? Date.now()),
    );
  }

  @Get('cash-flow')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  cashFlow(@Request() req: any, @Query() q: any) {
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    return this.svc.cashFlow(
      req.user.companyId,
      new Date(q.dateFrom ?? monthStart),
      new Date(q.dateTo ?? now),
    );
  }

  @Get('tax-report')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  taxReport(@Request() req: any, @Query() q: any) {
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    return this.svc.taxReport(
      req.user.companyId,
      new Date(q.dateFrom ?? monthStart),
      new Date(q.dateTo ?? now),
    );
  }

  @Get('gl-by-account')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  glByAccount(@Request() req: any, @Query() q: any) {
    if (!q.accountId) throw new BadRequestException('accountId required');
    return this.svc.glByAccount(
      req.user.companyId,
      q.accountId,
      q.dateFrom ? new Date(q.dateFrom) : undefined,
      q.dateTo ? new Date(q.dateTo) : undefined,
      Number(q.page ?? 1),
      Number(q.limit ?? 50),
    );
  }

  @Get('vat-return-eta')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  vatReturnEta(@Request() req: any, @Query() q: any) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.svc.vatReturnEta(
      req.user.companyId,
      new Date(q.dateFrom ?? monthStart),
      new Date(q.dateTo ?? now),
    );
  }

  @Get('revenue-by-month')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  revenueByMonth(@Request() req: any, @Query('months') months?: string) {
    return this.svc.revenueByMonth(req.user.companyId, months ? Number(months) : 6);
  }

  @Get('branch-profit')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  branchProfit(@Request() req: any) {
    return this.svc.branchProfit(req.user.companyId);
  }

  // UI path aliases
  @Get('profit-loss')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  incomeStatementAlias(@Request() req: any, @Query() q: any) {
    return this.svc.incomeStatement(
      req.user.companyId,
      new Date(q.from ?? q.dateFrom),
      new Date(q.to ?? q.dateTo),
    );
  }

  @Get('aged-ar')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedArAlias(@Request() req: any, @Query() q: any) {
    return this.svc.agedReceivables(
      req.user.companyId,
      new Date(q.asOf ?? Date.now()),
    );
  }

  @Get('aged-ap')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedApAlias(@Request() req: any, @Query() q: any) {
    return this.svc.agedPayables(
      req.user.companyId,
      new Date(q.asOf ?? Date.now()),
    );
  }
}
