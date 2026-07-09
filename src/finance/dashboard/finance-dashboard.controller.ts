import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FinanceDashboardService } from './finance-dashboard.service';

@ApiTags('finance-dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'finance', version: '1' })
export class FinanceDashboardController {
  constructor(private svc: FinanceDashboardService) {}

  @Get('summary')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  summary(@Request() req: any) {
    return this.svc.getSummary(req.user.companyId);
  }

  @Get('todos')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  todos(@Request() req: any) {
    return this.svc.getTodos(req.user.companyId);
  }
}
