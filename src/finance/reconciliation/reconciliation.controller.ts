import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('Reconciliation')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/reconciliation')
export class ReconciliationController {
  constructor(private svc: ReconciliationService) {}

  @Get('suggest')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  suggestMatches(@Request() req: any, @Query('bankStatementLineId') bslId: string) {
    if (!bslId) throw new BadRequestException('bankStatementLineId required');
    return this.svc.suggestMatches(bslId, req.user.companyId);
  }

  @Get('unreconciled-lines')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getUnreconciled(@Query() q: any) {
    return this.svc.getUnreconciledLines(q.companyId, q);
  }

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  reconcile(@Body() body: { pairs: { bankStatementLineId: string; journalEntryLineId: string; amount: number }[] }) {
    return this.svc.reconcile(body.pairs);
  }

  @Delete(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  unreconcile(@Param('id') id: string) { return this.svc.unreconcile(id); }
}
