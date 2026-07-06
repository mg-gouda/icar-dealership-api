import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma/prisma.service';

@ApiTags('Audit Log')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('audit-log')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async list(
    @Req() req: any,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('locationId') locationId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    const skip = ((Number(page) || 1) - 1) * take;

    const where: Record<string, unknown> = {};
    if (entityType)
      where.entityType = { contains: entityType, mode: 'insensitive' };
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (locationId) where.locationId = locationId;
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }

    // B-18: FINANCE role sees only finance-related entity types
    const user = (req as any).user;
    if (user?.role === 'FINANCE') {
      where.entityType = {
        in: ['Invoice', 'Payment', 'JournalEntry', 'Account', 'Asset',
             'BankStatement', 'BankReconciliation', 'FiscalYear', 'Currency',
             'Commission', 'TaxRate'],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: where as any,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.auditLog.count({ where: where as any }),
    ]);

    return { data, total, page: skip / take + 1, limit: take };
  }
}
