import { Module } from '@nestjs/common';
import { AccreditedDealersController } from './accredited-dealers.controller';
import { AccreditedDealersService } from './accredited-dealers.service';

@Module({
  controllers: [AccreditedDealersController],
  providers: [AccreditedDealersService],
  exports: [AccreditedDealersService],
})
export class AccreditedDealersModule {}
