import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AssetsService } from '../finance/assets/assets.service';
import { CurrenciesService } from '../finance/currencies/currencies.service';

// ponytail: setInterval workaround — @nestjs/schedule not installed.
// Replace with @Cron decorators once the package is added.

const ONE_MINUTE = 60_000;
const ONE_HOUR = 60 * ONE_MINUTE;

@Injectable()
export class TasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasksService.name);
  private intervals: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly assetsService: AssetsService,
    private readonly currenciesService: CurrenciesService,
  ) {}

  onModuleInit() {
    this.scheduleDaily(1, 0, () => this.markOverdueInstallments());
    this.scheduleMonthlyFirstDay(2, 0, () => this.postMonthlyDepreciation());
    this.scheduleMonthlyLastDay(3, 0, () => this.monthlyFxRevaluation());
    this.scheduleDaily(8, 0, () => this.sendAppointmentReminders());
    this.logger.log('Scheduled tasks registered');
  }

  onModuleDestroy() {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
  }

  // ── Scheduling helpers ──────────────────────────────────────────────

  /**
   * Run `fn` daily at the given hour:minute (local server time).
   * Checks every minute whether it's time to fire.
   */
  private scheduleDaily(hour: number, minute: number, fn: () => Promise<void>) {
    let lastRunDate = '';
    const timer = setInterval(() => {
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      if (now.getHours() === hour && now.getMinutes() === minute && lastRunDate !== todayKey) {
        lastRunDate = todayKey;
        fn().catch((e: unknown) => {
          this.logger.error(`Daily task @${hour}:${String(minute).padStart(2, '0')} failed`, e instanceof Error ? e.stack : String(e));
        });
      }
    }, ONE_MINUTE);
    this.intervals.push(timer);
  }

  /**
   * Run `fn` on the 1st of each month at hour:minute.
   */
  private scheduleMonthlyFirstDay(hour: number, minute: number, fn: () => Promise<void>) {
    let lastRunMonth = '';
    const timer = setInterval(() => {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
      if (now.getDate() === 1 && now.getHours() === hour && now.getMinutes() === minute && lastRunMonth !== monthKey) {
        lastRunMonth = monthKey;
        fn().catch((e: unknown) => {
          this.logger.error('Monthly first-day task failed', e instanceof Error ? e.stack : String(e));
        });
      }
    }, ONE_MINUTE);
    this.intervals.push(timer);
  }

  /**
   * Run `fn` on the last day of each month at hour:minute.
   */
  private scheduleMonthlyLastDay(hour: number, minute: number, fn: () => Promise<void>) {
    let lastRunMonth = '';
    const timer = setInterval(() => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const isLastDay = now.getMonth() !== tomorrow.getMonth();
      const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
      if (isLastDay && now.getHours() === hour && now.getMinutes() === minute && lastRunMonth !== monthKey) {
        lastRunMonth = monthKey;
        fn().catch((e: unknown) => {
          this.logger.error('Monthly last-day task failed', e instanceof Error ? e.stack : String(e));
        });
      }
    }, ONE_MINUTE);
    this.intervals.push(timer);
  }

  // ── Task 1: Mark overdue installments (daily 01:00) ────────────────

  async markOverdueInstallments(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.prisma.installmentLine.updateMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: today },
      },
      data: { status: 'OVERDUE' },
    });

    this.logger.log(`markOverdueInstallments: ${result.count} line(s) marked OVERDUE`);
  }

  // ── Task 2: Post asset depreciation (monthly 1st, 02:00) ──────────

  async postMonthlyDepreciation(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find RUNNING assets with unposted lines whose date <= today
    const pendingLines = await this.prisma.assetDepreciationLine.findMany({
      where: {
        posted: false,
        date: { lte: today },
        asset: { state: 'RUNNING' },
      },
      include: { asset: true },
      orderBy: [{ assetId: 'asc' }, { sequence: 'asc' }],
    });

    if (pendingLines.length === 0) {
      this.logger.log('postMonthlyDepreciation: no pending lines');
      return;
    }

    // Need a GENERAL journal to post against. Grab the first one.
    const generalJournal = await this.prisma.journal.findFirst({
      where: { type: 'GENERAL' },
    });

    if (!generalJournal) {
      this.logger.warn('postMonthlyDepreciation: no GENERAL journal found, skipping');
      return;
    }

    let posted = 0;
    for (const line of pendingLines) {
      try {
        await this.assetsService.postDepreciationLine(line.assetId, line.id, generalJournal.id);
        posted++;
      } catch (e: unknown) {
        this.logger.error(
          `postMonthlyDepreciation: failed for asset=${line.assetId} line=${line.id}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }

    this.logger.log(`postMonthlyDepreciation: ${posted}/${pendingLines.length} line(s) posted`);
  }

  // ── Task 3: FX revaluation (monthly last day, 03:00) ──────────────

  async monthlyFxRevaluation(): Promise<void> {
    // Single-company system → grab the first (only) company
    const company = await this.prisma.company.findFirst();
    if (!company) {
      this.logger.warn('monthlyFxRevaluation: no company found, skipping');
      return;
    }

    // CurrenciesService.revaluate needs a userId for audit.
    // Use 'system' as the actor identifier for automated tasks.
    try {
      const result = await this.currenciesService.revaluate(company.id, 'system');
      this.logger.log(
        `monthlyFxRevaluation: revalued ${result.revaluedCount} line(s), variance=${result.totalVariance}`,
      );
    } catch (e: unknown) {
      this.logger.error('monthlyFxRevaluation failed', e instanceof Error ? e.stack : String(e));
    }
  }

  // ── Task 4: Appointment reminders (daily 08:00) ────────────────────

  async sendAppointmentReminders(): Promise<void> {
    const now = new Date();
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(now.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowStart.getDate() + 1);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { gte: tomorrowStart, lt: tomorrowEnd },
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true } },
        vehicle: { select: { id: true, make: true, model: true } },
      },
    });

    if (appointments.length === 0) {
      this.logger.log('sendAppointmentReminders: no appointments tomorrow');
      return;
    }

    // Batch-create AuditLog entries as REMINDER_SENT placeholders.
    // AuditLog.userId is required → use the assignedTo rep's ID as the actor.
    await this.prisma.auditLog.createMany({
      data: appointments.map((apt) => ({
        userId: apt.assignedToUserId,
        action: 'REMINDER_SENT',
        entityType: 'Appointment',
        entityId: apt.id,
        locationId: apt.locationId,
        changes: {
          customerId: apt.customerId,
          customerName: apt.customer.name,
          scheduledAt: apt.scheduledAt.toISOString(),
          vehicleId: apt.vehicleId,
        },
      })),
    });

    this.logger.log(`sendAppointmentReminders: ${appointments.length} reminder(s) logged`);
  }
}
