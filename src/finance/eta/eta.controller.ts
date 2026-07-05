import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { EtaService } from './eta.service';

@ApiTags('Finance / ETA E-Invoice')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/eta')
export class EtaController {
  constructor(private svc: EtaService) {}

  /** Preview ETA document JSON before submission. */
  @Get('invoices/:id/preview')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  preview(@Param('id') id: string) {
    return this.svc.buildEtaDocument(id);
  }

  /** Submit invoice to ETA. */
  @Post('invoices/:id/submit')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  submit(@Param('id') id: string, @Request() req: any) {
    return this.svc.submitInvoice(id, req.user.id);
  }

  /** Check ETA submission status. */
  @Get('invoices/:id/status')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  status(@Param('id') id: string) {
    return this.svc.getSubmissionStatus(id);
  }
}
