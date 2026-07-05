import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PrismaService } from '../common/prisma/prisma.service';
import { LeadsModule } from '../leads/leads.module';
import { DealsModule } from '../deals/deals.module';

@Module({
  imports: [LeadsModule, DealsModule],
  controllers: [PublicController],
  providers: [PrismaService],
})
export class PublicModule {}
