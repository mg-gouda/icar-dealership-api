import { Module } from '@nestjs/common';
import { PartnersController } from './partners.controller';

@Module({ controllers: [PartnersController] })
export class PartnersModule {}
