import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DealsService } from './deals.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  FieldPolicyEntity,
  assertFieldWriteAccess,
} from '../common/field-policies';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { CreateInstallmentPlanDto } from './dto/installment-plan.dto';
import {
  CreateFinanceApplicationDto,
  UpdateFinanceApplicationDto,
  RecordBankApprovalDto,
  AddDocumentDto,
  UpdateDocumentDto,
  AddCommissionSplitDto,
  BulkDealActionDto,
} from './dto/finance-application.dto';

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
    const locationId = ['ADMIN', 'SUPER_ADMIN'].includes(role)
      ? q.locationId
      : (q.locationId ?? userLoc);
    return this.svc.findAll({ ...q, locationId });
  }

  @Post('bulk')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  bulk(@Body() body: BulkDealActionDto, @Request() req: any) {
    return this.svc.bulk(body.ids, body.action, body.value, req.user.id);
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

  @Get(':id/statement')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  statement(@Param('id') id: string) {
    return this.svc.getStatement(id);
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async findById(@Param('id') id: string, @Request() req: any) {
    const deal = await this.svc.findById(id);
    // SEC-2: enforce location scope for non-ADMIN per-item access
    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) && deal.locationId !== req.user.locationId) {
      throw new ForbiddenException('Access to this location is not permitted.');
    }
    return deal;
  }

  @Post()
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: CreateDealDto, @Request() req: any) {
    const locationId = body.locationId ?? req.user.locationId;
    // SEC-1: SALES_REP can only create deals for themselves
    const salesRepId = req.user.role === 'SALES_REP' ? req.user.id : (body.salesRepId ?? req.user.id);
    return this.svc.create({ ...body, locationId, salesRepId }, req.user.id);
  }

  @Patch(':id')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateDealDto, @Request() req: any) {
    assertFieldWriteAccess('Deal', body, req.user.role);
    return this.svc.update(id, body, req.user.id);
  }

  @Post(':id/finalize')
  @HttpCode(200)
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  finalize(@Param('id') id: string, @Request() req: any) {
    return this.svc.finalize(id, req.user.id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.svc.cancel(id, req.user.id);
  }

  @Post(':id/installment-plan')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addInstallmentPlan(
    @Param('id') id: string,
    @Body() body: CreateInstallmentPlanDto,
    @Request() req: any,
  ) {
    return this.svc.addInstallmentPlan(id, body, req.user.id);
  }

  // ── Finance Application (BANK_FINANCING deals) ──────────────────────────

  @Post(':id/finance-application')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  createFinanceApplication(@Param('id') id: string, @Body() body: CreateFinanceApplicationDto) {
    return this.svc.createFinanceApplication(id, body);
  }

  @Patch(':id/finance-application')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  updateFinanceApplication(@Param('id') id: string, @Body() body: UpdateFinanceApplicationDto) {
    return this.svc.updateFinanceApplication(id, body);
  }

  @Post(':id/finance-application/documents')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addDocument(
    @Param('id') id: string,
    @Body() body: AddDocumentDto,
  ) {
    return this.svc.addDocument(id, body);
  }

  @Patch(':id/finance-application/documents/:docId')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  updateDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: UpdateDocumentDto,
  ) {
    return this.svc.updateDocument(id, docId, body);
  }

  @Post(':id/finance-application/bank-approval')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  recordBankApproval(@Param('id') id: string, @Body() body: RecordBankApprovalDto) {
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
  remindInstallment(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.svc.sendInstallmentReminder(id, lineId);
  }

  @Get(':id/installment-plan/lines/:lineId/receipt')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  installmentReceipt(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.svc.getInstallmentLineReceipt(id, lineId);
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
  addCommissionSplit(
    @Param('id') id: string,
    @Body() body: AddCommissionSplitDto,
    @Request() req: any,
  ) {
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

  @Get(':id/notes')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getNotes(@Param('id') id: string) {
    return this.svc.getNotes(id);
  }

  @Post(':id/notes')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addNote(@Param('id') id: string, @Request() req: any, @Body() body: any) {
    return this.svc.addNote(id, req.user.id, body);
  }

  @Delete(':id/notes/:noteId')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  deleteNote(@Param('id') id: string, @Param('noteId') noteId: string, @Request() req: any) {
    return this.svc.deleteNote(noteId, req.user.id, req.user.role);
  }
}
