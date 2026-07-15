import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { CarMakesController } from './car-makes.controller';
import { CarMakesService } from './car-makes.service';
import { LocationsModule } from '../locations/locations.module';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [LocationsModule, PrismaModule],
  controllers: [SettingsController, CarMakesController],
  providers: [CarMakesService],
  exports: [CarMakesService],
})
export class SettingsModule {}
