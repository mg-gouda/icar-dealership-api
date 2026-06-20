import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BankStatementsService } from './bank-statements.service';

@ApiTags('Bank Statements')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/bank-statements')
export class BankStatementsController {
  constructor(private svc: BankStatementsService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Get('bank-accounts')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listBankAccounts() {
    return this.svc.listBankAccounts();
  }

  @Post('bank-accounts')
  @Roles('ADMIN', 'SUPER_ADMIN')
  createBankAccount(@Body() body: any) {
    return this.svc.createBankAccount(body);
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getById(@Param('id') id: string) {
    return this.svc.getById(id);
  }

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Post(':id/lines')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addLine(@Param('id') id: string, @Body() body: any) {
    return this.svc.addLine(id, body);
  }

  @Post(':id/import-csv')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  importCsv(@Param('id') id: string, @Body() body: { csv: string }) {
    return this.svc.importCsv(id, body.csv);
  }

  @Post(':id/import-ofx')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  importOfx(@Param('id') id: string, @Body() body: { ofx: string }) {
    return this.svc.importOfx(id, body.ofx);
  }
}
