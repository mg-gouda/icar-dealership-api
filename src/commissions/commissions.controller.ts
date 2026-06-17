import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CommissionsService } from './commissions.service';

@ApiTags('Commissions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'commissions', version: '1' })
export class CommissionsController {
  constructor(private readonly svc: CommissionsService) {}

  @Get()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('dealId') dealId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '30',
    @Req() req?: any,
  ) {
    // SALES_REP can only see their own commissions
    const effectiveUserId =
      req?.user?.role === 'SALES_REP' ? req.user.sub : userId;
    return this.svc.list({
      status, userId: effectiveUserId, dealId,
      page: Number(page), limit: Number(limit),
    });
  }

  @Get('summary')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  summary(@Query('userId') userId?: string) {
    return this.svc.summary(userId);
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id/mark-payable')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  markPayable(@Param('id') id: string) {
    return this.svc.markPayable(id);
  }

  @Post('batch-pay')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  batchPay(
    @Body() body: { commissionIds: string[]; journalId: string },
    @Req() req: any,
  ) {
    return this.svc.batchPay(body.commissionIds, body.journalId, req.user.sub);
  }
}
