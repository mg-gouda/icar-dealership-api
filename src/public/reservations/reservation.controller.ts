import {
  Controller,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReservationService } from './reservation.service';

// ponytail: public endpoint — no auth guards

@ApiTags('Public Reservations')
@Controller({ path: 'public/reservations', version: '1' })
export class ReservationController {
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
  webhook(@Body() payload: any) {
    // ponytail: HMAC verification skipped in stub — add when PAYMOB_HMAC_SECRET is set
    return this.svc.handleWebhook(payload).then(() => ({ received: true }));
  }
}
