import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export interface AuditLogParams {
  userId: string;
  action: string;
  /** Entity type / model name */
  entity?: string;
  /** Alias for entity (legacy) */
  entityType?: string;
  entityId: string;
  locationId?: string;
  /** New state after create/update */
  newValue?: unknown;
  /** Diff object { field: { before, after } } */
  changes?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: AuditLogParams) {
    return this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entity ?? params.entityType ?? 'UNKNOWN',
        entityId: params.entityId,
        locationId: params.locationId,
        changes: (params.changes ??
          (params.newValue ? { newValue: params.newValue } : undefined)) as any,
      },
    });
  }
}
