import { Module } from '@nestjs/common';
import { OperationalReportsController } from './reports.controller';
import { OperationalReportsService } from './reports.service';

@Module({
  controllers: [OperationalReportsController],
  providers: [OperationalReportsService],
})
export class OperationalReportsModule {}
