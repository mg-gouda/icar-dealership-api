import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query: {
    leadId?: string;
    phone?: string;
    direction?: string;
    companyId: string;
    locationId?: string;
    page?: number;
    limit?: number;
  }) {
    const { leadId, phone, direction, companyId, locationId, page = 1, limit = 50 } = query;
    const where: any = { companyId };
    if (leadId) where.leadId = leadId;
    if (phone) where.phone = phone;
    if (direction) where.direction = direction;
    if (locationId) where.locationId = locationId;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { lead: { select: { id: true, name: true } } },
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async send(
    data: { phone: string; body: string; leadId?: string; companyId: string; locationId?: string },
    userId: string,
  ) {
    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        phone: data.phone,
        body: data.body,
        direction: 'OUTBOUND',
        status: 'QUEUED',
        leadId: data.leadId,
        companyId: data.companyId,
        locationId: data.locationId,
      },
    });

    // ponytail: stub — real integration calls WhatsApp Business API here
    // Mark SENT immediately for now
    const sent = await this.prisma.whatsAppMessage.update({
      where: { id: msg.id },
      data: { status: 'SENT' },
    });
    this.logger.log(`WhatsApp OUTBOUND ${msg.id} → ${data.phone} (stub: marked SENT)`);

    await this.audit.log({
      entity: 'WhatsAppMessage',
      entityId: msg.id,
      action: 'WHATSAPP_SENT',
      userId,
      newValue: { phone: data.phone, body: data.body },
    });

    return sent;
  }

  async receiveWebhook(payload: any) {
    // Parse WhatsApp Business API webhook format
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;

    if (!messages?.length) return { status: 'ok' };

    for (const waMsg of messages) {
      const phone = waMsg.from ?? '';
      const body = waMsg.text?.body ?? waMsg.caption ?? '';
      const externalId = waMsg.id ?? null;
      const mediaUrl = waMsg.image?.link ?? waMsg.document?.link ?? null;

      // Try to link to existing Lead by phone
      const lead = phone
        ? await this.prisma.lead.findFirst({ where: { phone }, select: { id: true } })
        : null;

      await this.prisma.whatsAppMessage.create({
        data: {
          phone,
          body,
          direction: 'INBOUND',
          status: 'DELIVERED',
          externalId,
          mediaUrl,
          leadId: lead?.id,
          // ponytail: webhook has no auth → use hardcoded companyId
          companyId: 'company-001',
        },
      });
    }

    return { status: 'ok' };
  }

  async getConversations(companyId: string, locationId?: string) {
    const where: any = { companyId };
    if (locationId) where.locationId = locationId;

    // Group by phone — Prisma groupBy doesn't support nested selects,
    // so fetch last message per phone via raw approach
    const phones = await this.prisma.whatsAppMessage.groupBy({
      by: ['phone'],
      where,
      _count: { id: true },
      _max: { sentAt: true },
    });

    const conversations = await Promise.all(
      phones.map(async (g) => {
        const lastMessage = await this.prisma.whatsAppMessage.findFirst({
          where: { phone: g.phone, companyId },
          orderBy: { sentAt: 'desc' },
          select: { id: true, body: true, direction: true, sentAt: true, status: true },
        });

        // Unread = INBOUND messages not yet READ
        const unreadCount = await this.prisma.whatsAppMessage.count({
          where: { phone: g.phone, companyId, direction: 'INBOUND', status: { not: 'READ' } },
        });

        return {
          phone: g.phone,
          messageCount: g._count.id,
          lastMessage,
          unreadCount,
        };
      }),
    );

    // Sort by most recent first
    conversations.sort((a, b) => {
      const aTime = a.lastMessage?.sentAt?.getTime() ?? 0;
      const bTime = b.lastMessage?.sentAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    return conversations;
  }

  async getThread(phone: string, companyId: string) {
    return this.prisma.whatsAppMessage.findMany({
      where: { phone, companyId },
      orderBy: { sentAt: 'asc' },
      include: { lead: { select: { id: true, name: true } } },
    });
  }
}
