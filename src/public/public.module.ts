import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PrismaService } from '../common/prisma/prisma.service';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [LeadsModule],
  controllers: [PublicController],
  providers: [PrismaService],
})
export class PublicModule {}
