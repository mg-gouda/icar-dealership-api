import { Module } from '@nestjs/common';
import { FiscalYearsService } from './fiscal-years.service';
import { FiscalYearsController } from './fiscal-years.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [FiscalYearsService],
  controllers: [FiscalYearsController],
  exports: [FiscalYearsService],
})
export class FiscalYearsModule {}
