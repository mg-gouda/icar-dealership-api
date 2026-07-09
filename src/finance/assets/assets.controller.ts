import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AssetsService } from './assets.service';

@ApiTags('Fixed Assets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/assets')
export class AssetsController {
  constructor(private svc: AssetsService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(@Query() q: any, @Request() req: any) {
    return this.svc.list(req.user.companyId, q);
  }

  @Get(':id/schedule')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getSchedule(@Param('id') id: string, @Request() req: any) {
    return this.svc.getSchedule(id, req.user.companyId);
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getById(@Param('id') id: string, @Request() req: any) {
    return this.svc.getById(id, req.user.companyId);
  }

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Post(':id/depreciation-lines/:lineId/post')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  postLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body('journalId') journalId: string,
  ) {
    return this.svc.postDepreciationLine(id, lineId, journalId);
  }

  @Patch(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, body, req.user.id, req.user.companyId);
  }

  // ponytail: prefill asset from a vendor bill line (fixed-asset account posting trigger)
  @Post('from-invoice-line')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  createFromInvoiceLine(
    @Body() body: { invoiceLineId: string; [k: string]: unknown },
    @Request() req: any,
  ) {
    return this.svc.createFromInvoiceLine(
      body.invoiceLineId,
      body,
      req.user.id,
    );
  }

  // UI alias: POST /:id/depreciate { month: 'YYYY-MM', journalId? }
  @Post(':id/depreciate')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  depreciateByMonth(
    @Param('id') id: string,
    @Body() body: { month: string; journalId?: string },
    @Request() req: any,
  ) {
    return this.svc.depreciateByMonth(
      id,
      body.month,
      body.journalId,
      req.user.id,
      req.user.companyId,
    );
  }

  @Post(':id/dispose')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  dispose(
    @Param('id') id: string,
    @Body() body: { date: string; proceedsAmount?: number; journalId?: string },
    @Request() req: any,
  ) {
    return this.svc.dispose(id, body, req.user.id);
  }
}
