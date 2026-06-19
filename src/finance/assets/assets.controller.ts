import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
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
  list(@Query() q: any) { return this.svc.list(q); }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getById(@Param('id') id: string) { return this.svc.getById(id); }

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any) { return this.svc.create(body); }

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
    return this.svc.update(id, body, req.user.id);
  }

  // ponytail: prefill asset from a vendor bill line (fixed-asset account posting trigger)
  @Post('from-invoice-line')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  createFromInvoiceLine(@Body() body: { invoiceLineId: string; [k: string]: unknown }, @Request() req: any) {
    return this.svc.createFromInvoiceLine(body.invoiceLineId, body, req.user.id);
  }
}
