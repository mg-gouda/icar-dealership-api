import { Module } from '@nestjs/common';
import { PettyCashService } from './petty-cash.service';
import { PettyCashController } from './petty-cash.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PettyCashService],
  controllers: [PettyCashController],
  exports: [PettyCashService],
})
export class PettyCashModule {}
