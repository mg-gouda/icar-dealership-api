import { Module } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { CurrenciesController } from './currencies.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module';

@Module({
  imports: [PrismaModule, AuditModule, FiscalPeriodsModule],
  providers: [CurrenciesService],
  controllers: [CurrenciesController],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
