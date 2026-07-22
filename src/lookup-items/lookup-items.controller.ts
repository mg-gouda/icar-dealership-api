import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LookupItemsService } from './lookup-items.service';

@ApiTags('lookup-items')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'lookup-items', version: '1' })
export class LookupItemsController {
  constructor(private svc: LookupItemsService) {}

  @Get()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getAll(@Request() req: any, @Query('category') category?: string) {
    return category
      ? this.svc.getByCategory(req.user.companyId, category)
      : this.svc.getAll(req.user.companyId);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(@Request() req: any, @Body() body: { category: string; value: string; label: string; labelAr?: string; sortOrder?: number }) {
    return this.svc.create(req.user.companyId, body, req.user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { label?: string; labelAr?: string; value?: string; sortOrder?: number; active?: boolean },
  ) {
    return this.svc.update(id, req.user.companyId, body, req.user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.svc.remove(id, req.user.companyId, req.user.id);
  }

  @Post('reorder')
  @Roles('ADMIN', 'SUPER_ADMIN')
  reorder(@Request() req: any, @Body() body: { category: string; ids: string[] }) {
    return this.svc.reorder(req.user.companyId, body.category, body.ids, req.user.id);
  }
}
