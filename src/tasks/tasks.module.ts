import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { AssetsModule } from '../finance/assets/assets.module';
import { CurrenciesModule } from '../finance/currencies/currencies.module';
import { GlModule } from '../finance/gl/gl.module';

// ponytail: no ScheduleModule.forRoot() — @nestjs/schedule not installed.
// TasksService uses onModuleInit + setInterval instead.

@Module({
  imports: [AssetsModule, CurrenciesModule, GlModule],
  providers: [TasksService],
})
export class TasksModule {}
