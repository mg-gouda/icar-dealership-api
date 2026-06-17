import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

interface LogParams {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  locationId?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: LogParams) {
    return this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        locationId: params.locationId,
        changes: params.changes ?? undefined,
      },
    });
  }
}
