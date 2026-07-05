import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PettyCashService } from './petty-cash.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Petty Cash')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('petty-cash')
export class PettyCashController {
  constructor(private svc: PettyCashService) {}

  // ── Funds ────────────────────────────────────────────────────────────────

  @Get('funds')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listFunds(@Query() q: any) {
    return this.svc.listFunds(q);
  }

  @Post('funds')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  createFund(@Body() body: any, @Request() req: any) {
    return this.svc.createFund(body, req.user.id);
  }

  @Patch('funds/:id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  updateFund(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.svc.updateFund(id, body, req.user.id);
  }

  // ── Vouchers ─────────────────────────────────────────────────────────────

  @Get('vouchers')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listVouchers(@Query() q: any) {
    return this.svc.listVouchers(q);
  }

  @Post('vouchers')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  submitVoucher(@Body() body: any, @Request() req: any) {
    return this.svc.submitVoucher(body, req.user.id);
  }

  @Post('vouchers/:id/approve')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  approveVoucher(@Param('id') id: string, @Request() req: any) {
    return this.svc.approveVoucher(id, req.user.id);
  }

  @Post('vouchers/:id/reject')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  rejectVoucher(@Param('id') id: string, @Request() req: any) {
    return this.svc.rejectVoucher(id, req.user.id);
  }
}
