import { Module } from '@nestjs/common';
import { ImportShipmentsService } from './import-shipments.service';
import { ImportShipmentsController } from './import-shipments.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ImportShipmentsService],
  controllers: [ImportShipmentsController],
  exports: [ImportShipmentsService],
})
export class ImportShipmentsModule {}
