import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsExportController } from './reports-export.controller';
import { ReportsService } from './reports.service';
import { ReportExportService } from './report-export.service';

@Module({
  controllers: [ReportsController, ReportsExportController],
  providers: [ReportsService, ReportExportService],
  exports: [ReportsService],
})
export class ReportsModule {}
