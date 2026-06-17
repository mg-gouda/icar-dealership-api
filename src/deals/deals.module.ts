import { Module } from '@nestjs/common';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PostingModule } from '../finance/posting/posting.module';

@Module({
  imports: [PrismaModule, AuditModule, PostingModule],
  providers: [DealsService],
  controllers: [DealsController],
  exports: [DealsService],
})
export class DealsModule {}
