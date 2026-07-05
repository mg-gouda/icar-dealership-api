import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WhatsAppService } from './whatsapp.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private svc: WhatsAppService) {}

  // ── Protected endpoints ─────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
  @Get('messages')
  @LocationScope()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List WhatsApp messages (paginated, filterable)' })
  findAll(@Query() q: any, @Request() req: any) {
    return this.svc.findAll({
      ...q,
      companyId: req.user.companyId ?? 'company-001',
    });
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
  @Post('send')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Send outbound WhatsApp message' })
  send(@Body() body: any, @Request() req: any) {
    return this.svc.send(
      {
        phone: body.phone,
        body: body.body,
        leadId: body.leadId,
        companyId: req.user.companyId ?? 'company-001',
        locationId: body.locationId ?? req.user.locationId,
      },
      req.user.id,
    );
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
  @Get('conversations')
  @LocationScope()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List conversations grouped by phone' })
  conversations(@Query() q: any, @Request() req: any) {
    return this.svc.getConversations(
      req.user.companyId ?? 'company-001',
      q.locationId,
    );
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
  @Get('conversations/:phone')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get full message thread for a phone number' })
  thread(@Param('phone') phone: string, @Request() req: any) {
    return this.svc.getThread(phone, req.user.companyId ?? 'company-001');
  }

  // ── Public webhook (no auth — WhatsApp requires 200 always) ─────────────

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WhatsApp Business API inbound webhook (public)' })
  webhook(@Body() payload: any) {
    return this.svc.receiveWebhook(payload);
  }
}
