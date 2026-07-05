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
import { FloorPlanService } from './floor-plan.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Floor Plan Financing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('floor-plan')
export class FloorPlanController {
  constructor(private svc: FloorPlanService) {}

  // ponytail: static routes before :id wildcard
  @Get('summary')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  summary() {
    return this.svc.summary();
  }

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findAll(@Query() q: any) {
    return this.svc.findAll(q);
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any, @Request() req: any) {
    return this.svc.create(body, req.user.id);
  }

  @Patch(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, body, req.user.id);
  }

  @Post(':id/pay-off')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  payOff(@Param('id') id: string, @Request() req: any) {
    return this.svc.payOff(id, req.user.id);
  }
}
