import { Module } from '@nestjs/common';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { PostingModule } from '../finance/posting/posting.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PostingModule, AuditModule],
  controllers: [CommissionsController],
  providers: [CommissionsService],
})
export class CommissionsModule {}
