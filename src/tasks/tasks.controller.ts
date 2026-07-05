import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'tasks', version: '1' })
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  status() {
    return { ok: true, message: 'Scheduled tasks running via setInterval.' };
  }

  @Post('run-depreciation')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async runDepreciation() {
    await this.tasks.postMonthlyDepreciation();
    return { ok: true, message: 'Depreciation run complete.' };
  }

  @Post('run-overdue-installments')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async runOverdue() {
    await this.tasks.markOverdueInstallments();
    return { ok: true, message: 'Overdue installments marked.' };
  }

  @Post('run-appointment-reminders')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async runReminders() {
    await this.tasks.sendAppointmentReminders();
    return { ok: true, message: 'Appointment reminders sent.' };
  }
}
