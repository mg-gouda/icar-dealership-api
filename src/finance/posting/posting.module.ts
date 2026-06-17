import { Module } from '@nestjs/common';
import { PostingService } from './posting.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PostingService],
  exports: [PostingService],
})
export class PostingModule {}
