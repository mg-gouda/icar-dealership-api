import { Module } from '@nestjs/common';
import { CommissionConfigController } from './commission-config.controller';
import { CommissionConfigService } from './commission-config.service';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CommissionConfigController],
  providers: [CommissionConfigService],
  exports: [CommissionConfigService],
})
export class CommissionConfigModule {}
