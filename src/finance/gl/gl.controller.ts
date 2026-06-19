import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GlService } from './gl.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Finance / GL')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/gl')
export class GlController {
  constructor(private svc: GlService) {}

  // Accounts
  @Get('accounts')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getAccounts(@Query() q: any, @Request() req: any) {
    return this.svc.getAccounts(req.user.companyId, q);
  }

  @Get('accounts/:id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getAccount(@Param('id') id: string) {
    return this.svc.getAccount(id);
  }

  @Post('accounts')
  @Roles('ADMIN', 'SUPER_ADMIN')
  createAccount(@Body() body: any, @Request() req: any) {
    return this.svc.createAccount({ ...body, companyId: req.user.companyId }, req.user.id);
  }

  @Patch('accounts/:id/activate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  activateAccount(@Param('id') id: string) {
    return this.svc.setAccountActive(id, true);
  }

  @Patch('accounts/:id/deactivate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  deactivateAccount(@Param('id') id: string) {
    return this.svc.setAccountActive(id, false);
  }

  // Journals
  @Get('journals')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getJournals(@Query() q: any, @Request() req: any) {
    return this.svc.getJournals(req.user.companyId, q.locationId);
  }

  // Journal Entries
  @Get('entries')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getEntries(@Query() q: any, @Request() req: any) {
    return this.svc.getEntries(req.user.companyId, q);
  }

  @Get('entries/:id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getEntry(@Param('id') id: string) {
    return this.svc.getEntry(id);
  }

  @Post('entries')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  createEntry(@Body() body: any, @Request() req: any) {
    return this.svc.createEntry(body, req.user.id);
  }

  @Patch('entries/:id/post')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  postEntry(@Param('id') id: string, @Request() req: any) {
    return this.svc.postEntry(id, req.user.id);
  }

  @Post('entries/:id/reverse')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  reverseEntry(@Param('id') id: string, @Request() req: any) {
    return this.svc.reverseEntry(id, req.user.id);
  }

  @Post('entries/:id/duplicate')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  duplicateEntry(@Param('id') id: string, @Request() req: any) {
    return this.svc.duplicateEntry(id, req.user.id);
  }

  @Delete('entries/:id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  deleteEntry(@Param('id') id: string, @Request() req: any) {
    return this.svc.deleteEntry(id, req.user.id);
  }

  // UI aliases — /finance/gl maps to /finance/gl/entries
  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getEntriesAlias(@Query() q: any, @Request() req: any) {
    return this.svc.getEntries(req.user.companyId, q);
  }

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  createEntryAlias(@Body() body: any, @Request() req: any) {
    return this.svc.createEntry(body, req.user.id);
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getEntryAlias(@Param('id') id: string) {
    return this.svc.getEntry(id);
  }

  @Post(':id/post')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  postEntryAlias(@Param('id') id: string, @Request() req: any) {
    return this.svc.postEntry(id, req.user.id);
  }

  @Post(':id/reverse')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  reverseEntryAlias(@Param('id') id: string, @Request() req: any) {
    return this.svc.reverseEntry(id, req.user.id);
  }

  @Delete(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  deleteEntryAlias(@Param('id') id: string, @Request() req: any) {
    return this.svc.deleteEntry(id, req.user.id);
  }

  // Reports
  @Get('trial-balance')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  trialBalance(@Query() q: any, @Request() req: any) {
    return this.svc.trialBalance(req.user.companyId, q.dateFrom, q.dateTo);
  }

  @Post('generate-recurring')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  generateRecurring(@Body() body: any, @Request() req: any) {
    return this.svc.generateRecurring(req.user.companyId, body.date ? new Date(body.date) : new Date(), req.user.id);
  }

  // Recurring template CRUD
  @Get('recurring')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listRecurring(@Request() req: any) {
    return this.svc.listRecurring(req.user.companyId);
  }

  @Post('recurring')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  createRecurring(@Body() body: any, @Request() req: any) {
    return this.svc.createRecurring(body, req.user.id);
  }

  @Delete('recurring/:id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  deleteRecurring(@Param('id') id: string, @Request() req: any) {
    return this.svc.deleteRecurring(id, req.user.id);
  }
}
