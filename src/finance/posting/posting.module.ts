import { Module } from '@nestjs/common';
import { PostingService } from './posting.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module';

@Module({
  imports: [PrismaModule, AuditModule, FiscalPeriodsModule],
  providers: [PostingService],
  exports: [PostingService],
})
export class PostingModule {}
