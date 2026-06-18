import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { FieldPolicyEntity } from '../common/field-policies';

@ApiTags('Partners')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@FieldPolicyEntity('Partner')
@Controller({ path: 'partners', version: '1' })
export class PartnersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @LocationScope()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(
    @Query('type') type?: string,
    @Query('limit') limit = '50',
    @Query('page') page = '1',
    @Query('q') q?: string,
  ) {
    const where: any = {};
    if (type) where.type = type;
    if (q) where.name = { contains: q, mode: 'insensitive' };
    return this.prisma.partner.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: { name: 'asc' },
    });
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string) {
    return this.prisma.partner.findUniqueOrThrow({ where: { id } });
  }

  @Post()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any) {
    return this.prisma.partner.create({ data: body });
  }

  @Patch(':id')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any) {
    return this.prisma.partner.update({ where: { id }, data: body });
  }
}
