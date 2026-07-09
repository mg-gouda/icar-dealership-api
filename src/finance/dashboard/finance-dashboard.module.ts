import { Module } from '@nestjs/common';
import { FinanceDashboardController } from './finance-dashboard.controller';
import { FinanceDashboardService } from './finance-dashboard.service';

@Module({
  controllers: [FinanceDashboardController],
  providers: [FinanceDashboardService],
})
export class FinanceDashboardModule {}
