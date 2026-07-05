import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';
import { PostingModule } from '../posting/posting.module';
import { EtaModule } from '../eta/eta.module';

@Module({
  imports: [PrismaModule, AuditModule, PostingModule, EtaModule],
  providers: [InvoicesService],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
