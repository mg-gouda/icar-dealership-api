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
import { ServiceCenterService } from './service-center.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Service Center')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('service-orders')
export class ServiceCenterController {
  constructor(private svc: ServiceCenterService) {}

  @Get()
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findAll(@Query() q: any) {
    return this.svc.findAll(q);
  }

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

  @Post(':id/lines')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  addLine(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.addLine(id, body, req.user.id);
  }

  @Delete(':id/lines/:lineId')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  removeLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Request() req: any,
  ) {
    return this.svc.removeLine(id, lineId, req.user.id);
  }

  @Post(':id/complete')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  complete(@Param('id') id: string, @Request() req: any) {
    return this.svc.complete(id, req.user.id);
  }

  @Post(':id/invoice')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  createInvoice(@Param('id') id: string, @Request() req: any) {
    return this.svc.createInvoice(id, req.user.id);
  }
}
