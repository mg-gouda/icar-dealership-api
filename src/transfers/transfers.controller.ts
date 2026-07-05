import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TransfersService } from './transfers.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';

@ApiTags('Transfers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private svc: TransfersService) {}

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create and post an inter-location fund transfer' })
  create(@Body() body: any, @Request() req: any) {
    return this.svc.createTransfer(
      {
        fromLocationId: body.fromLocationId,
        toLocationId: body.toLocationId,
        amount: body.amount,
        description: body.description,
        journalDate: body.journalDate,
      },
      req.user.id,
    );
  }

  @Get()
  @LocationScope()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List inter-location transfers' })
  findAll(@Query() q: any) {
    return this.svc.findAll({
      locationId: q.locationId,
      page: q.page,
      limit: q.limit,
    });
  }
}
