import { Module } from '@nestjs/common';
import { GlService } from './gl.service';
import { GlController } from './gl.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module';

@Module({
  imports: [PrismaModule, AuditModule, FiscalPeriodsModule],
  providers: [GlService],
  controllers: [GlController],
  exports: [GlService],
})
export class GlModule {}
