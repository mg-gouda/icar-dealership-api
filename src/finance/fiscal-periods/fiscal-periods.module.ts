import { Module } from '@nestjs/common';
import { FiscalPeriodService } from './fiscal-period.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FiscalPeriodService],
  exports: [FiscalPeriodService],
})
export class FiscalPeriodsModule {}
