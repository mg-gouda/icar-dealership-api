import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';
import { PostingModule } from '../posting/posting.module';

@Module({
  imports: [PrismaModule, AuditModule, PostingModule],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
