import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

// ponytail: stub Paymob integration — env-var driven, graceful skip when credentials absent

@Injectable()
export class ReservationService {
  private readonly log = new Logger(ReservationService.name);
  private readonly paymobApiKey = process.env.PAYMOB_API_KEY ?? '';
  private readonly paymobIntegrationId = process.env.PAYMOB_INTEGRATION_ID ?? '';
  private readonly paymobIframeId = process.env.PAYMOB_IFRAME_ID ?? '';
  private readonly depositAmount = Number(process.env.RESERVATION_DEPOSIT_EGP ?? '5000');

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async initiateReservation(
    vehicleId: string,
    body: { name: string; email?: string; phone?: string; notes?: string },
  ): Promise<{ reservationId: string; paymentUrl?: string; status: string }> {
    // 1. Vehicle must be AVAILABLE
    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: {
        id: true,
        status: true,
        make: true,
        model: true,
        year: true,
        price: true,
        locationId: true,
      },
    });

    if (vehicle.status !== 'AVAILABLE') {
      return { reservationId: '', status: 'VEHICLE_NOT_AVAILABLE' };
    }

    // 2. Create lead to track reservation intent
    const lead = await this.prisma.lead.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        source: 'WEBSITE' as any,
        notes: `RESERVATION: ${vehicle.year} ${vehicle.make} ${vehicle.model}. Deposit: EGP ${this.depositAmount}. ${body.notes ?? ''}`.trim(),
        vehicleId,
        locationId: vehicle.locationId,
        status: 'NEW',
      },
    });

    await this.audit.log({
      entity: 'Lead',
      entityId: lead.id,
      action: 'RESERVATION_INITIATED',
      userId: 'system',
      newValue: { vehicleId, depositAmount: this.depositAmount },
    });

    // 3. If no Paymob credentials → graceful fallback
    if (!this.paymobApiKey) {
      this.log.warn('PAYMOB_API_KEY not set — reservation created without payment');
      return { reservationId: lead.id, status: 'CREDENTIALS_NOT_CONFIGURED' };
    }

    try {
      // Step 1: Auth token
      const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.paymobApiKey }),
      });
      const { token: authToken } = (await authRes.json()) as any;

      // Step 2: Register order
      const orderRes = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          delivery_needed: false,
          amount_cents: this.depositAmount * 100,
          currency: 'EGP',
          merchant_order_id: lead.id,
          items: [
            {
              name: `${vehicle.year} ${vehicle.make} ${vehicle.model} — Reservation Deposit`,
              amount_cents: this.depositAmount * 100,
              description: `Vehicle ID: ${vehicleId}`,
              quantity: 1,
            },
          ],
        }),
      });
      const { id: orderId } = (await orderRes.json()) as any;

      // Step 3: Payment key
      const firstName = body.name.split(' ')[0] ?? body.name;
      const lastName = body.name.split(' ').slice(1).join(' ') || 'NA';

      const pkRes = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          amount_cents: this.depositAmount * 100,
          expiration: 3600,
          order_id: orderId,
          billing_data: {
            apartment: 'NA',
            email: body.email ?? 'na@na.com',
            floor: 'NA',
            first_name: firstName,
            last_name: lastName,
            street: 'NA',
            building: 'NA',
            phone_number: body.phone ?? '+20000000000',
            shipping_method: 'NA',
            postal_code: 'NA',
            city: 'Cairo',
            country: 'EG',
            state: 'Cairo',
          },
          currency: 'EGP',
          integration_id: Number(this.paymobIntegrationId),
          lock_order_when_paid: true,
        }),
      });
      const { token: paymentKey } = (await pkRes.json()) as any;
      const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${this.paymobIframeId}?payment_token=${paymentKey}`;

      await this.audit.log({
        entity: 'Lead',
        entityId: lead.id,
        action: 'PAYMOB_ORDER_CREATED',
        userId: 'system',
        newValue: { orderId, paymentUrl },
      });

      return { reservationId: lead.id, paymentUrl, status: 'PAYMENT_INITIATED' };
    } catch (e: any) {
      this.log.error(`Paymob error for lead ${lead.id}: ${e.message}`);
      await this.audit.log({
        entity: 'Lead',
        entityId: lead.id,
        action: 'PAYMOB_ERROR',
        userId: 'system',
        newValue: { error: e.message },
      });
      return { reservationId: lead.id, status: 'PAYMENT_ERROR' };
    }
  }

  async handleWebhook(payload: any): Promise<void> {
    // ponytail: Paymob sends HMAC-verified callback
    // payload.obj.merchant_order_id = lead.id
    // payload.obj.success = true/false
    // HMAC verification skipped in stub — add when credentials available
    const merchantOrderId = payload?.obj?.merchant_order_id;
    const success = payload?.obj?.success === true;

    if (!merchantOrderId || !success) return;

    const lead = await this.prisma.lead.findUnique({ where: { id: merchantOrderId } });
    if (!lead) return;

    // Mark vehicle RESERVED + lead CLOSED_WON atomically
    await this.prisma.$transaction(async (tx) => {
      const vehicle = lead.vehicleId
        ? await tx.vehicle.findUnique({ where: { id: lead.vehicleId } })
        : null;

      if (vehicle?.status === 'AVAILABLE') {
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { status: 'RESERVED' },
        });
      }

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: 'CLOSED_WON',
          notes: `${lead.notes ?? ''}\nPAYMOB_PAID: ${JSON.stringify(payload?.obj?.id)}`,
        },
      });
    });

    await this.audit.log({
      entity: 'Lead',
      entityId: merchantOrderId,
      action: 'RESERVATION_PAID',
      userId: 'system',
      newValue: { paymobTransactionId: payload?.obj?.id },
    });
  }
}
