import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class EtaService {
  private readonly logger = new Logger(EtaService.name);
  private readonly etaApiUrl =
    process.env.ETA_API_URL ?? 'https://api.invoicing.eta.gov.eg/api/v1';
  private readonly etaIdUrl =
    process.env.ETA_ID_URL ?? 'https://id.invoicing.eta.gov.eg/connect/token';
  private readonly etaClientId = process.env.ETA_CLIENT_ID ?? '';
  private readonly etaClientSecret = process.env.ETA_CLIENT_SECRET ?? '';

  // ponytail: cache token; re-fetch 60s before expiry
  private cachedToken: { value: string; expiresAt: number } | null = null;

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.value;
    }
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.etaClientId,
      client_secret: this.etaClientSecret,
    });
    const res = await fetch(this.etaIdUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ETA token fetch failed (${res.status}): ${err}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = { value: json.access_token, expiresAt: now + json.expires_in * 1000 };
    return this.cachedToken.value;
  }

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Build ETA-compliant JSON document from an invoice. */
  async buildEtaDocument(invoiceId: string): Promise<object> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        lines: { include: { tax: true } },
        partner: {
          select: { name: true, taxId: true, phone: true, address: true },
        },
        journal: { include: { location: { include: { company: true } } } },
      },
    });

    const company = invoice.journal.location?.company;

    const taxableItems = invoice.lines.map((line, i) => {
      const taxRate = line.tax ? Number(line.tax.amount) : 0;
      const lineTotal = Number(line.subtotal);
      const taxAmount = lineTotal * taxRate / 100;

      return {
        description: line.description ?? `Item ${i + 1}`,
        itemType: 'GS1',
        itemCode: line.id.slice(-8).toUpperCase(),
        unitType: 'EA',
        quantity: Number(line.quantity ?? 1),
        unitValue: {
          currencySold: 'EGP',
          amountEGP: Number(line.unitPrice ?? 0),
        },
        salesTotal: lineTotal,
        discount: { rate: 0, amount: 0 },
        taxableItems: line.tax
          ? [
              {
                taxType: 'T1', // VAT
                amount: taxAmount,
                subType: 'V009',
                rate: taxRate,
              },
            ]
          : [],
        netTotal: lineTotal,
        total: lineTotal + taxAmount,
      };
    });

    return {
      issuer: {
        address: {
          branchId: '0',
          country: 'EG',
          governate: company?.address ?? 'Cairo',
          regionCity: company?.address ?? 'Cairo',
          street: company?.address ?? '',
          buildingNumber: '1',
        },
        type: 'B',
        id: company?.taxId ?? '',
        name: company?.name ?? 'Dealership',
        country: 'EG',
      },
      receiver: {
        address: {
          country: 'EG',
          governate: 'Cairo',
          regionCity: 'Cairo',
          street: invoice.partner?.address ?? '',
          buildingNumber: '1',
        },
        type: invoice.partner?.taxId ? 'B' : 'P',
        id: invoice.partner?.taxId ?? '',
        name: invoice.partner?.name ?? 'Customer',
      },
      documentType: 'I',
      documentTypeVersion: '1.0',
      dateTimeIssued: invoice.date?.toISOString() ?? new Date().toISOString(),
      taxpayerActivityCode: '4511', // Motor vehicle dealers
      internalID: invoice.id.slice(-8).toUpperCase(),
      invoiceLines: taxableItems,
      totalDiscountAmount: 0,
      totalSalesAmount: Number(invoice.amountUntaxed),
      netAmount: Number(invoice.amountUntaxed),
      taxTotals: [{ taxType: 'T1', amount: Number(invoice.amountTax ?? 0) }],
      totalAmount: Number(invoice.amountTotal),
      extraDiscountAmount: 0,
      totalItemsDiscountAmount: 0,
    };
  }

  /** Submit invoice to ETA. Returns submission result or skip reason. */
  async submitInvoice(
    invoiceId: string,
    userId: string,
  ): Promise<{ submissionId?: string; status: string; error?: string }> {
    if (!this.etaClientId || !this.etaClientSecret) {
      // ponytail: credentials not configured -- log and return pending
      this.logger.warn(`ETA submit skipped for invoice ${invoiceId} -- no credentials`);
      await this.audit.log({
        entity: 'Invoice',
        entityId: invoiceId,
        action: 'ETA_SUBMIT_SKIPPED',
        userId,
        newValue: { reason: 'ETA credentials not configured' },
      });
      return { status: 'CREDENTIALS_NOT_CONFIGURED' };
    }

    try {
      const doc = await this.buildEtaDocument(invoiceId);

      // TODO: add HMAC/certificate signing here once ETA device certificate is issued
      const token = await this.getAccessToken();
      const response = await fetch(
        `${this.etaApiUrl}/documentsubmissions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ documents: [doc] }),
        },
      );

      const result = (await response.json()) as any;
      const submissionId =
        result?.submissionId ?? result?.acceptedDocuments?.[0]?.uuid;
      const status = response.ok ? 'SUBMITTED' : 'FAILED';

      await this.audit.log({
        entity: 'Invoice',
        entityId: invoiceId,
        action: `ETA_SUBMIT_${status}`,
        userId,
        newValue: { submissionId, httpStatus: response.status },
      });

      // Store submissionId on invoice if successful
      if (submissionId) {
        await this.prisma.invoice.update({
          where: { id: invoiceId },
          data: { etaSubmissionId: submissionId },
        });
      }

      return {
        submissionId,
        status,
        error: response.ok ? undefined : JSON.stringify(result),
      };
    } catch (e: any) {
      this.logger.error(`ETA submit error for invoice ${invoiceId}: ${e.message}`);
      await this.audit.log({
        entity: 'Invoice',
        entityId: invoiceId,
        action: 'ETA_SUBMIT_ERROR',
        userId,
        newValue: { error: e.message },
      });
      return { status: 'ERROR', error: e.message };
    }
  }

  /** Poll ETA for current submission status. */
  async getSubmissionStatus(invoiceId: string): Promise<object> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const submissionId = invoice.etaSubmissionId;
    if (!submissionId) return { status: 'NOT_SUBMITTED' };

    if (!this.etaClientId) {
      return { status: 'CREDENTIALS_NOT_CONFIGURED', submissionId };
    }

    try {
      const r = await fetch(
        `${this.etaApiUrl}/documentsubmissions/${submissionId}`,
        {
          headers: {
            Authorization: `Bearer ${this.etaClientId}:${this.etaClientSecret}`,
          },
        },
      );
      return r.ok ? r.json() : { status: 'LOOKUP_FAILED', httpStatus: r.status };
    } catch (e: any) {
      return { status: 'LOOKUP_ERROR', error: e.message };
    }
  }
}
