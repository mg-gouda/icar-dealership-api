import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DealsService } from './deals.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FieldPolicyEntity, assertFieldWriteAccess } from '../common/field-policies';

@ApiTags('Deals')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@FieldPolicyEntity('Deal', 'FinanceApplication', 'BankApproval')
@Controller('deals')
export class DealsController {
  constructor(private svc: DealsService) {}

  @Get()
  @LocationScope()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findAll(@Query() q: any, @Request() req: any) {
    const { role, locationId: userLoc } = req.user;
    const locationId = ['ADMIN', 'SUPER_ADMIN'].includes(role) ? q.locationId : (q.locationId ?? userLoc);
    return this.svc.findAll({ ...q, locationId });
  }

  // ponytail: static routes before :id wildcard
  @Get('installments/overdue-count')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  countOverdueInstallments() {
    return this.svc.countOverdueInstallments().then((count) => ({ count }));
  }

  @Get('installments/overdue')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listOverdueInstallments(@Query('limit') limit?: string) {
    return this.svc.listOverdueInstallments(limit ? Number(limit) : 20);
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any, @Request() req: any) {
    const locationId = body.locationId ?? req.user.locationId;
    return this.svc.create({ ...body, locationId }, req.user.id);
  }

  @Patch(':id')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    assertFieldWriteAccess('Deal', body, req.user.role);
    return this.svc.update(id, body, req.user.id);
  }

  @Post(':id/finalize')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  finalize(@Param('id') id: string, @Request() req: any) {
    return this.svc.finalize(id, req.user.id);
  }

  @Post(':id/cancel')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.svc.cancel(id, req.user.id);
  }

  @Post(':id/installment-plan')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addInstallmentPlan(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.addInstallmentPlan(id, body, req.user.id);
  }

  // ── Finance Application (BANK_FINANCING deals) ──────────────────────────

  @Post(':id/finance-application')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  createFinanceApplication(@Param('id') id: string, @Body() body: any) {
    return this.svc.createFinanceApplication(id, body);
  }

  @Patch(':id/finance-application')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  updateFinanceApplication(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateFinanceApplication(id, body);
  }

  @Post(':id/finance-application/documents')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addDocument(@Param('id') id: string, @Body() body: { documentType: string; fileUrl?: string; notes?: string }) {
    return this.svc.addDocument(id, body);
  }

  @Patch(':id/finance-application/documents/:docId')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  updateDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: { status?: string; fileUrl?: string; notes?: string },
  ) {
    return this.svc.updateDocument(id, docId, body);
  }

  @Post(':id/finance-application/bank-approval')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  recordBankApproval(@Param('id') id: string, @Body() body: any) {
    return this.svc.recordBankApproval(id, body);
  }

  // ── Installment collection ────────────────────────────────────────────────

  @Post(':id/installment-plan/lines/:lineId/collect')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  collectInstallment(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Request() req: any,
  ) {
    return this.svc.collectInstallment(id, lineId, req.user.id);
  }

  @Post(':id/installment-plan/lines/:lineId/remind')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  remindInstallment(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.svc.sendInstallmentReminder(id, lineId);
  }

  // ── Bank financing disbursement ───────────────────────────────────────────

  @Post(':id/bank-disbursement')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  postBankDisbursement(@Param('id') id: string, @Request() req: any) {
    return this.svc.postBankDisbursement(id, req.user.id);
  }

  // ── Commission splits ─────────────────────────────────────────────────────

  @Post(':id/commissions')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addCommissionSplit(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.addCommissionSplit(id, body, req.user.id);
  }

  @Delete(':id/commissions/:commissionId')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  removeCommissionSplit(
    @Param('id') id: string,
    @Param('commissionId') commissionId: string,
    @Request() req: any,
  ) {
    return this.svc.removeCommissionSplit(id, commissionId, req.user.id);
  }
}
