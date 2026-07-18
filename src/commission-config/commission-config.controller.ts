import { Controller, Get, Put, Body, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommissionConfigService } from './commission-config.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller({ path: 'finance/commission-config', version: '1' })
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CommissionConfigController {
  constructor(private svc: CommissionConfigService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  get(@Req() req: any) {
    return this.svc.getConfig(req.user.companyId);
  }

  @Put()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  upsert(
    @Req() req: any,
    @Body() body: { baseAmount: number; tiers: { minTargetPct: number; amount: number; label?: string }[] },
  ) {
    return this.svc.upsertConfig(req.user.companyId, body);
  }
}
