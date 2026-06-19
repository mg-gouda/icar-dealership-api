import { Controller, Get, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
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
    return this.svc.trialBalance(
      req.user.companyId,
      new Date(q.dateFrom),
      new Date(q.dateTo),
    );
  }

  @Get('income-statement')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  incomeStatement(@Request() req: any, @Query() q: any) {
    return this.svc.incomeStatement(
      req.user.companyId,
      new Date(q.dateFrom),
      new Date(q.dateTo),
    );
  }

  @Get('balance-sheet')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  balanceSheet(@Request() req: any, @Query() q: any) {
    return this.svc.balanceSheet(req.user.companyId, new Date(q.asOf));
  }

  @Get('aged-receivables')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedReceivables(@Request() req: any, @Query() q: any) {
    return this.svc.agedReceivables(req.user.companyId, new Date(q.asOf ?? Date.now()));
  }

  @Get('aged-payables')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedPayables(@Request() req: any, @Query() q: any) {
    return this.svc.agedPayables(req.user.companyId, new Date(q.asOf ?? Date.now()));
  }

  @Get('cash-flow')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  cashFlow(@Request() req: any, @Query() q: any) {
    return this.svc.cashFlow(
      req.user.companyId,
      new Date(q.dateFrom),
      new Date(q.dateTo),
    );
  }

  @Get('tax-report')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  taxReport(@Request() req: any, @Query() q: any) {
    return this.svc.taxReport(
      req.user.companyId,
      new Date(q.dateFrom),
      new Date(q.dateTo),
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
}
