import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AssetsModule } from '../finance/assets/assets.module';
import { CurrenciesModule } from '../finance/currencies/currencies.module';
import { GlModule } from '../finance/gl/gl.module';

// ponytail: no ScheduleModule.forRoot() — @nestjs/schedule not installed.
// TasksService uses onModuleInit + setInterval instead.

@Module({
  imports: [AssetsModule, CurrenciesModule, GlModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
