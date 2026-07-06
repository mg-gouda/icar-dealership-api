import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReservationService } from './reservation.service';
import * as crypto from 'crypto';

// ponytail: public endpoint — no auth guards

@ApiTags('Public Reservations')
@Controller({ path: 'public/reservations', version: '1' })
export class ReservationController {
  private readonly logger = new Logger(ReservationController.name);

  constructor(private svc: ReservationService) {}

  @Post('vehicles/:vehicleId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate vehicle reservation with Paymob deposit' })
  initiate(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { name: string; email?: string; phone?: string; notes?: string },
  ) {
    return this.svc.initiateReservation(vehicleId, body);
  }

  @Post('webhook/paymob')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paymob payment webhook callback' })
  async webhook(@Body() payload: any, @Req() req: any) {
    // ponytail: HMAC-SHA512 verification per Paymob docs
    const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
    if (hmacSecret) {
      const receivedHmac = req.query?.['hmac'] as string;
      if (!receivedHmac) {
        throw new UnauthorizedException('Missing webhook HMAC');
      }
      const obj = payload?.obj;
      const dataString = [
        obj?.amount_cents,
        obj?.created_at,
        obj?.currency,
        obj?.error_occured,
        obj?.has_parent_transaction,
        obj?.id,
        obj?.integration_id,
        obj?.is_3d_secure,
        obj?.is_auth,
        obj?.is_capture,
        obj?.is_refunded,
        obj?.is_standalone_payment,
        obj?.is_voided,
        obj?.order?.id,
        obj?.owner,
        obj?.pending,
        obj?.source_data?.pan,
        obj?.source_data?.sub_type,
        obj?.source_data?.type,
        obj?.success,
      ].join('');
      const expected = crypto
        .createHmac('sha512', hmacSecret)
        .update(dataString)
        .digest('hex');
      if (receivedHmac !== expected) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } else {
      this.logger.warn(
        'PAYMOB_HMAC_SECRET not set — skipping webhook signature verification (dev mode)',
      );
    }

    await this.svc.handleWebhook(payload);
    return { received: true };
  }
}
