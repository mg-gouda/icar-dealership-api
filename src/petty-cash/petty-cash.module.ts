import { Module } from '@nestjs/common';
import { PettyCashService } from './petty-cash.service';
import { PettyCashController } from './petty-cash.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { FiscalPeriodsModule } from '../finance/fiscal-periods/fiscal-periods.module';

@Module({
  imports: [PrismaModule, AuditModule, FiscalPeriodsModule],
  providers: [PettyCashService],
  controllers: [PettyCashController],
  exports: [PettyCashService],
})
export class PettyCashModule {}
