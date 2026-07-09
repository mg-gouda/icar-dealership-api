import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { PrismaModule } from './common/prisma/prisma.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { FieldPolicyInterceptor } from './common/field-policies/field-policy.interceptor';
import { DecimalInterceptor } from './common/interceptors/decimal.interceptor';

import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { LocationsModule } from './locations/locations.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { LeadsModule } from './leads/leads.module';
import { DealsModule } from './deals/deals.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CommissionsModule } from './commissions/commissions.module';
import { CommissionPlansModule } from './commission-plans/commission-plans.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { PartnersModule } from './partners/partners.module';
import { AuditModule } from './audit/audit.module';

// Finance sub-modules
import { PostingModule } from './finance/posting/posting.module';
import { GlModule } from './finance/gl/gl.module';
import { InvoicesModule } from './finance/invoices/invoices.module';
import { PaymentsModule } from './finance/payments/payments.module';
import { AccountsModule } from './finance/accounts/accounts.module';
import { JournalsModule } from './finance/journals/journals.module';
import { TaxesModule } from './finance/taxes/taxes.module';
import { CurrenciesModule } from './finance/currencies/currencies.module';
import { FiscalYearsModule } from './finance/fiscal-years/fiscal-years.module';
import { BankStatementsModule } from './finance/bank-statements/bank-statements.module';
import { ReconciliationModule } from './finance/reconciliation/reconciliation.module';
import { AssetsModule } from './finance/assets/assets.module';
import { ReportsModule } from './finance/reports/reports.module';
import { EtaModule } from './finance/eta/eta.module';
import { ServiceCenterModule } from './service-center/service-center.module';
import { PartsModule } from './parts/parts.module';
import { PublicModule } from './public/public.module';
import { ReservationModule } from './public/reservations/reservation.module';
import { TasksModule } from './tasks/tasks.module';
import { MailModule } from './common/mail/mail.module';
import { UploadModule } from './upload/upload.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { SalesTargetsModule } from './sales-targets/sales-targets.module';
import { TransfersModule } from './transfers/transfers.module';
import { PettyCashModule } from './petty-cash/petty-cash.module';
import { ImportShipmentsModule } from './import-shipments/import-shipments.module';
import { FloorPlanModule } from './floor-plan/floor-plan.module';
import { OperationalReportsModule } from './reports/reports.module';
import { FinanceDashboardModule } from './finance/dashboard/finance-dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { LookupItemsModule } from './lookup-items/lookup-items.module';
import { AccreditedDealersModule } from './accredited-dealers/accredited-dealers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60_000,
      // Raise limit for local dev/test; prod sits behind Nginx rate-limiting
      limit: process.env.NODE_ENV === 'production' ? 200 : 2000,
    }]),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
        level: process.env.LOG_LEVEL ?? 'info',
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    PrismaModule,
    AuditModule,

    // Health
    HealthModule,

    // Auth
    AuthModule,

    // Operations
    UsersModule,
    LocationsModule,
    VehiclesModule,
    LeadsModule,
    DealsModule,
    AppointmentsModule,
    CommissionsModule,
    CommissionPlansModule,
    PurchaseOrdersModule,
    PartnersModule,
    ServiceCenterModule,
    PartsModule,

    // Public (B2C — no auth)
    PublicModule,
    ReservationModule,

    // Finance
    PostingModule,
    GlModule,
    InvoicesModule,
    PaymentsModule,
    AccountsModule,
    JournalsModule,
    TaxesModule,
    CurrenciesModule,
    FiscalYearsModule,
    BankStatementsModule,
    ReconciliationModule,
    AssetsModule,
    ReportsModule,
    EtaModule,

    // Scheduled tasks
    TasksModule,

    // Messaging
    WhatsAppModule,

    // Sales Performance
    SalesTargetsModule,

    // Inter-Location Transfers
    TransfersModule,

    // Petty Cash / Import / Floor Plan
    PettyCashModule,
    ImportShipmentsModule,
    FloorPlanModule,

    // Operational Reports
    OperationalReportsModule,

    // Finance dashboard summary + todos
    FinanceDashboardModule,

    // Root settings controller
    SettingsModule,

    // Editable dropdown lookup lists
    LookupItemsModule,

    // Accredited car dealers (manufacturers / importers)
    AccreditedDealersModule,

    // Cross-cutting
    MailModule,
    UploadModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: DecimalInterceptor },
    { provide: APP_INTERCEPTOR, useClass: FieldPolicyInterceptor },
  ],
})
export class AppModule {}
