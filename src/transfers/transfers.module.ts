import { Module } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { FiscalPeriodsModule } from '../finance/fiscal-periods/fiscal-periods.module';

@Module({
  imports: [PrismaModule, AuditModule, FiscalPeriodsModule],
  providers: [TransfersService],
  controllers: [TransfersController],
  exports: [TransfersService],
})
export class TransfersModule {}
