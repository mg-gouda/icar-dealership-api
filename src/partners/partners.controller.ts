import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';
import { FieldPolicyEntity } from '../common/field-policies';
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

@ApiTags('Partners')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@FieldPolicyEntity('Partner')
@Controller({ path: 'partners', version: '1' })
export class PartnersController {
  constructor(private partners: PartnersService) {}

  @Get()
  @LocationScope()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(
    @Query('type') type?: string,
    @Query('limit') limit = '50',
    @Query('page') page = '1',
    @Query('q') q?: string,
  ) {
    return this.partners.list({
      type,
      q,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string) {
    return this.partners.findById(id);
  }

  @Post()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: CreatePartnerDto) {
    return this.partners.create(body);
  }

  @Patch(':id')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdatePartnerDto) {
    return this.partners.update(id, body);
  }
}
