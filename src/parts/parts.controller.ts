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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PartsService } from './parts.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CreatePartReturnDto, RejectPartReturnDto, ListPartReturnsQuery } from './dto/part-return.dto';
import { CreateRMADto, ResolveRMADto, ListRMAsQuery } from './dto/rma.dto';
import { ApplyCreditDto, ListSupplierCreditsQuery } from './dto/supplier-credit.dto';

@ApiTags('Parts Inventory')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('parts')
export class PartsController {
  constructor(private svc: PartsService) {}

  @Get()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  findAll(@Query() q: any) {
    return this.svc.findAll(q);
  }

  // ponytail: static routes before :id param routes
  @Get('by-scan')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  findByBarcode(@Query('code') code: string) {
    if (!code) return null;
    return this.svc.findByBarcode(code.trim());
  }

  // ---------------------------------------------------------------------------
  // Part Returns (static segment — must precede :id)
  // ---------------------------------------------------------------------------

  @Get('returns')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listReturns(@Query() q: ListPartReturnsQuery, @Request() req: any) {
    return this.svc.listReturns(req.user.companyId, q);
  }

  @Post('returns')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  createReturn(@Body() dto: CreatePartReturnDto, @Request() req: any) {
    return this.svc.createReturn(req.user.companyId, dto, req.user.id);
  }

  @Get('returns/:id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getReturn(@Param('id') id: string, @Request() req: any) {
    return this.svc.getReturn(req.user.companyId, id);
  }

  @Patch('returns/:id/approve')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  approveReturn(@Param('id') id: string, @Request() req: any) {
    return this.svc.approveReturn(req.user.companyId, id, req.user.id);
  }

  @Patch('returns/:id/reject')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  rejectReturn(
    @Param('id') id: string,
    @Body() dto: RejectPartReturnDto,
    @Request() req: any,
  ) {
    return this.svc.rejectReturn(req.user.companyId, id, dto.rejectionReason, req.user.id);
  }

  @Patch('returns/:id/complete')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  completeReturn(@Param('id') id: string, @Request() req: any) {
    return this.svc.completeReturn(req.user.companyId, id, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // Manufacturer RMAs (static segment — must precede :id)
  // ---------------------------------------------------------------------------

  @Get('rmas')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listRMAs(@Query() q: ListRMAsQuery, @Request() req: any) {
    return this.svc.listRMAs(req.user.companyId, q);
  }

  @Post('rmas')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  createRMA(@Body() dto: CreateRMADto, @Request() req: any) {
    return this.svc.createRMA(req.user.companyId, dto, req.user.id);
  }

  @Get('rmas/:id')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getRMA(@Param('id') id: string, @Request() req: any) {
    return this.svc.getRMA(req.user.companyId, id);
  }

  @Patch('rmas/:id/submit')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  submitRMA(@Param('id') id: string, @Request() req: any) {
    return this.svc.submitRMA(req.user.companyId, id, req.user.id);
  }

  @Patch('rmas/:id/sent')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  markRMASent(@Param('id') id: string, @Request() req: any) {
    return this.svc.markRMASent(req.user.companyId, id, req.user.id);
  }

  @Post('rmas/:id/resolve')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  resolveRMA(
    @Param('id') id: string,
    @Body() dto: ResolveRMADto,
    @Request() req: any,
  ) {
    return this.svc.resolveRMA(req.user.companyId, id, dto, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // Supplier Credit Notes (static segment — must precede :id)
  // ---------------------------------------------------------------------------

  @Get('supplier-credits')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listSupplierCredits(@Query() q: ListSupplierCreditsQuery, @Request() req: any) {
    return this.svc.listSupplierCredits(req.user.companyId, q);
  }

  @Get('supplier-credits/:id')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getSupplierCredit(@Param('id') id: string, @Request() req: any) {
    return this.svc.getSupplierCredit(req.user.companyId, id);
  }

  @Post('supplier-credits/:id/apply')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  applyCredit(
    @Param('id') id: string,
    @Body() dto: ApplyCreditDto,
    @Request() req: any,
  ) {
    return this.svc.applyCredit(req.user.companyId, id, dto, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // Part CRUD (param routes last)
  // ---------------------------------------------------------------------------

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any, @Request() req: any) {
    return this.svc.create(body, req.user.id);
  }

  @Patch(':id')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, body, req.user.id);
  }

  @Post(':id/adjust')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  adjust(
    @Param('id') id: string,
    @Body() body: { qty: number; reason: string },
    @Request() req: any,
  ) {
    return this.svc.adjust(id, body.qty, body.reason, req.user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  softDelete(@Param('id') id: string, @Request() req: any) {
    return this.svc.softDelete(id, req.user.id);
  }
}
