import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from './payments.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CreatePaymentDto, AllocatePaymentDto } from './dto/create-payment.dto';

@ApiTags('Finance / WHT Categories')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/wht-categories')
export class WhtCategoriesController {
  constructor(private svc: PaymentsService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  findAll(@Request() req: any) {
    return this.svc.findAllWhtCategories(req.user.companyId);
  }
}

@ApiTags('Finance / Payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/payments')
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  findAll(@Query() q: any, @Request() req: any) {
    return this.svc.findAll(req.user.companyId, q);
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'SALES_REP')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Get(':id/receipt')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'SALES_REP')
  getReceipt(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: CreatePaymentDto, @Request() req: any) {
    return this.svc.create(body, req.user.id);
  }

  @Patch(':id/post')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  postPayment(@Param('id') id: string, @Request() req: any) {
    return this.svc.postPayment(id, req.user.id);
  }

  @Post(':id/cancel')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.svc.cancel(id, req.user.id);
  }

  @Post(':id/allocate')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  allocate(
    @Param('id') id: string,
    @Body() body: AllocatePaymentDto,
    @Request() req: any,
  ) {
    return this.svc.allocate(id, body.invoiceId, body.amount, req.user.id);
  }
}
