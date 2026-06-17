import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';

import { PrismaModule } from './common/prisma/prisma.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LocationsModule } from './locations/locations.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { LeadsModule } from './leads/leads.module';
import { DealsModule } from './deals/deals.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuditModule } from './audit/audit.module';

// Finance sub-modules
import { PostingModule } from './finance/posting/posting.module';
import { GlModule } from './finance/gl/gl.module';
import { InvoicesModule } from './finance/invoices/invoices.module';
import { PaymentsModule } from './finance/payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    PrismaModule,
    AuditModule,

    // Auth
    AuthModule,

    // Operations
    UsersModule,
    LocationsModule,
    VehiclesModule,
    LeadsModule,
    DealsModule,
    AppointmentsModule,

    // Finance
    PostingModule,
    GlModule,
    InvoicesModule,
    PaymentsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
