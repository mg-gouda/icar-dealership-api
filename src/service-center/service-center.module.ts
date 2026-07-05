import { Module } from '@nestjs/common';
import { ServiceCenterService } from './service-center.service';
import { ServiceCenterController } from './service-center.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ServiceCenterService],
  controllers: [ServiceCenterController],
  exports: [ServiceCenterService],
})
export class ServiceCenterModule {}
