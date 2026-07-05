import { Module } from '@nestjs/common';
import { SalesTargetsService } from './sales-targets.service';
import { SalesTargetsController } from './sales-targets.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SalesTargetsService],
  controllers: [SalesTargetsController],
  exports: [SalesTargetsService],
})
export class SalesTargetsModule {}
