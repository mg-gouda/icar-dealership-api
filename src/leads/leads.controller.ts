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
import { LeadsService } from './leads.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { AddLeadActivityDto } from './dto/add-activity.dto';
import { BulkLeadActionDto } from './dto/bulk-lead-action.dto';

@ApiTags('Leads')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@Controller('leads')
export class LeadsController {
  constructor(private svc: LeadsService) {}

  @Get()
  @LocationScope()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findAll(@Query() q: any, @Request() req: any) {
    const { role, locationId: userLoc } = req.user;
    // SALES_REP scoped to their location unless overridden
    const locationId = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role)
      ? q.locationId
      : (q.locationId ?? userLoc);
    return this.svc.findAll({ ...q, locationId });
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: CreateLeadDto, @Request() req: any) {
    const locationId = body.locationId ?? req.user.locationId;
    return this.svc.create({ ...body, locationId }, req.user.id);
  }

  @Patch(':id')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateLeadDto, @Request() req: any) {
    return this.svc.update(id, body, req.user.id);
  }

  @Post(':id/activities')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  addActivity(@Param('id') id: string, @Body() body: AddLeadActivityDto, @Request() req: any) {
    return this.svc.addActivity(id, body, req.user.id);
  }

  @Post('bulk')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  bulk(@Body() body: BulkLeadActionDto, @Request() req: any) {
    return this.svc.bulk(body.ids, body.action, body.value, req.user.id);
  }

  @Patch(':id/convert')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  convert(@Param('id') id: string, @Request() req: any) {
    return this.svc.convertToDeal(id, req.user.id);
  }
}
