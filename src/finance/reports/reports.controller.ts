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
import { LocationScopeGuard } from '../../common/guards/location-scope.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LocationScope } from '../../common/decorators/location-scope.decorator';
import { ReportsService } from './reports.service';

// ponytail: comparison helpers — no framework dep, no separate file
type CompareMode = 'prior_period' | 'same_period_last_year';
const VALID_COMPARE = new Set<string>(['prior_period', 'same_period_last_year']);

function comparisonWindow(dateFrom: Date, dateTo: Date, mode: CompareMode): [Date, Date] {
  if (mode === 'same_period_last_year') {
    const f = new Date(dateFrom); f.setFullYear(f.getFullYear() - 1);
    const t = new Date(dateTo); t.setFullYear(t.getFullYear() - 1);
    return [f, t];
  }
  // prior_period: same duration immediately before current window
  const ms = dateTo.getTime() - dateFrom.getTime();
  return [new Date(dateFrom.getTime() - ms - 86400000), new Date(dateFrom.getTime() - 86400000)];
}

function computeVariancePct(curr: any, comp: any): number | null {
  // ponytail: try primary-metric keys per report shape, first hit wins
  for (const key of ['netProfit', 'operatingCashFlow', 'totalIncome', 'totalAssets']) {
    const cv = curr?.[key], pv = comp?.[key];
    if (cv != null && pv != null) {
      const c = Number(cv.toString()), p = Number(pv.toString());
      if (p !== 0) return Number(((c - p) / Math.abs(p) * 100).toFixed(2));
    }
  }
  return null;
}

async function withComparison(
  mode: string | undefined,
  dateFrom: Date,
  dateTo: Date,
  fn: (from: Date, to: Date) => Promise<any>,
): Promise<any> {
  const current = await fn(dateFrom, dateTo);
  if (!mode) return current;
  const [cf, ct] = comparisonWindow(dateFrom, dateTo, mode as CompareMode);
  const comparison = await fn(cf, ct);
  return { current, comparison, variancePct: computeVariancePct(current, comparison) };
}

@ApiTags('Finance Reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@Controller('finance/reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @Get('trial-balance')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  trialBalance(@Request() req: any, @Query() q: any) {
    if (q.compare && !VALID_COMPARE.has(q.compare)) throw new BadRequestException('invalid compare mode');
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const dateFrom = new Date(q.dateFrom ?? monthStart);
    const dateTo = new Date(q.dateTo ?? now);
    const locationId: string | undefined = q.locationId;
    return withComparison(q.compare, dateFrom, dateTo, (f, t) =>
      this.svc.trialBalance(req.user.companyId, f, t, locationId),
    );
  }

  @Get('income-statement')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  incomeStatement(@Request() req: any, @Query() q: any) {
    if (q.compare && !VALID_COMPARE.has(q.compare)) throw new BadRequestException('invalid compare mode');
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const dateFrom = new Date(q.dateFrom ?? monthStart);
    const dateTo = new Date(q.dateTo ?? now);
    const locationId: string | undefined = q.locationId;
    return withComparison(q.compare, dateFrom, dateTo, (f, t) =>
      this.svc.incomeStatement(req.user.companyId, f, t, locationId),
    );
  }

  @Get('balance-sheet')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async balanceSheet(@Request() req: any, @Query() q: any) {
    const asOf = new Date(q.asOf ?? Date.now());
    const locationId: string | undefined = q.locationId;
    if (!q.compare) return this.svc.balanceSheet(req.user.companyId, asOf, undefined, locationId);
    if (!VALID_COMPARE.has(q.compare)) throw new BadRequestException('invalid compare mode');
    // ponytail: for asOf reports, prior_period = -1 month, same_period_last_year = -1 year
    const compareAsOf = new Date(asOf);
    if (q.compare === 'same_period_last_year') compareAsOf.setFullYear(compareAsOf.getFullYear() - 1);
    else compareAsOf.setMonth(compareAsOf.getMonth() - 1);
    const [current, comparison] = await Promise.all([
      this.svc.balanceSheet(req.user.companyId, asOf, undefined, locationId),
      this.svc.balanceSheet(req.user.companyId, compareAsOf, undefined, locationId),
    ]);
    return { current, comparison, variancePct: computeVariancePct(current, comparison) };
  }

  @Get('aged-receivables')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedReceivables(@Request() req: any, @Query() q: any) {
    return this.svc.agedReceivables(
      req.user.companyId,
      new Date(q.asOf ?? Date.now()),
      q.locationId,
    );
  }

  @Get('aged-payables')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedPayables(@Request() req: any, @Query() q: any) {
    return this.svc.agedPayables(
      req.user.companyId,
      new Date(q.asOf ?? Date.now()),
      q.locationId,
    );
  }

  @Get('cash-flow')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  cashFlow(@Request() req: any, @Query() q: any) {
    if (q.compare && !VALID_COMPARE.has(q.compare)) throw new BadRequestException('invalid compare mode');
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const dateFrom = new Date(q.dateFrom ?? monthStart);
    const dateTo = new Date(q.dateTo ?? now);
    const locationId: string | undefined = q.locationId;
    return withComparison(q.compare, dateFrom, dateTo, (f, t) =>
      this.svc.cashFlow(req.user.companyId, f, t, locationId),
    );
  }

  @Get('tax-report')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  taxReport(@Request() req: any, @Query() q: any) {
    if (q.compare && !VALID_COMPARE.has(q.compare)) throw new BadRequestException('invalid compare mode');
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const dateFrom = new Date(q.dateFrom ?? monthStart);
    const dateTo = new Date(q.dateTo ?? now);
    const locationId: string | undefined = q.locationId;
    return withComparison(q.compare, dateFrom, dateTo, (f, t) =>
      this.svc.taxReport(req.user.companyId, f, t, locationId),
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
      q.locationId,
    );
  }

  @Get('vat-return-eta')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  vatReturnEta(@Request() req: any, @Query() q: any) {
    if (q.compare && !VALID_COMPARE.has(q.compare)) throw new BadRequestException('invalid compare mode');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dateFrom = new Date(q.dateFrom ?? monthStart);
    const dateTo = new Date(q.dateTo ?? now);
    const locationId: string | undefined = q.locationId;
    return withComparison(q.compare, dateFrom, dateTo, (f, t) =>
      this.svc.vatReturnEta(req.user.companyId, f, t, locationId),
    );
  }

  @Get('revenue-by-month')
  @LocationScope()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  revenueByMonth(@Request() req: any, @Query() q: any) {
    // ponytail: MANAGER scoped to own location; FINANCE/ADMIN/SUPER_ADMIN may pass locationId
    const locationId = req.user.role === 'MANAGER' ? req.user.locationId : q.locationId;
    return this.svc.revenueByMonth(req.user.companyId, q.months ? Number(q.months) : 6, locationId);
  }

  @Get('branch-profit')
  @LocationScope()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  branchProfit(@Request() req: any, @Query() q: any) {
    // ponytail: MANAGER scoped to own location; FINANCE/ADMIN/SUPER_ADMIN may pass locationId
    const locationId = req.user.role === 'MANAGER' ? req.user.locationId : q.locationId;
    return this.svc.branchProfit(req.user.companyId, locationId);
  }

  // UI path aliases
  @Get('profit-loss')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  incomeStatementAlias(@Request() req: any, @Query() q: any) {
    if (q.compare && !VALID_COMPARE.has(q.compare)) throw new BadRequestException('invalid compare mode');
    const now = new Date();
    const rawFrom = q.from ?? q.dateFrom;
    const rawTo = q.to ?? q.dateTo;
    const dateFrom = rawFrom ? new Date(rawFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const dateTo = rawTo ? new Date(rawTo) : now;
    const locationId: string | undefined = q.locationId;
    return withComparison(q.compare, dateFrom, dateTo, (f, t) =>
      this.svc.incomeStatement(req.user.companyId, f, t, locationId),
    );
  }

  @Get('aged-ar')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedArAlias(@Request() req: any, @Query() q: any) {
    return this.svc.agedReceivables(
      req.user.companyId,
      new Date(q.asOf ?? Date.now()),
      q.locationId,
    );
  }

  @Get('aged-ap')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  agedApAlias(@Request() req: any, @Query() q: any) {
    return this.svc.agedPayables(
      req.user.companyId,
      new Date(q.asOf ?? Date.now()),
      q.locationId,
    );
  }
}
