import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { LocationsModule } from '../locations/locations.module';

@Module({
  imports: [LocationsModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
