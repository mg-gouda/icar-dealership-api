import { Module } from '@nestjs/common';
import { FloorPlanService } from './floor-plan.service';
import { FloorPlanController } from './floor-plan.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FloorPlanService],
  controllers: [FloorPlanController],
  exports: [FloorPlanService],
})
export class FloorPlanModule {}
