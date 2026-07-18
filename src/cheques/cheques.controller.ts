import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChequesService } from './cheques.service';
import { CreateChequeDto, UpdateChequeStatusDto, ListChequesQuery, ChequeAllocationDto } from './dto/cheque.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/cheques')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ChequesController {
  constructor(private readonly svc: ChequesService) {}

  @Get()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(@Req() req: any, @Query() q: ListChequesQuery) {
    return this.svc.list(req.user.companyId, q);
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  create(@Req() req: any, @Body() dto: CreateChequeDto) {
    return this.svc.create(req.user.companyId, dto);
  }

  @Patch(':id/status')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateChequeStatusDto) {
    return this.svc.updateStatus(id, dto);
  }

  @Post(':id/allocations')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addAllocation(@Param('id') id: string, @Body() body: ChequeAllocationDto) {
    return this.svc.addAllocation(id, body);
  }

  @Delete('allocations/:id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  deleteAllocation(@Param('id') id: string) {
    return this.svc.deleteAllocation(id);
  }
}
