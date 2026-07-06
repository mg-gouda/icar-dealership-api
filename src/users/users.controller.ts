import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @LocationScope()
  @Roles('ADMIN', 'SUPER_ADMIN', 'MANAGER')
  findAll(@Query('locationId') locationId?: string) {
    return this.usersService.findAll(locationId);
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MANAGER')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(@Body() body: CreateUserDto) {
    return this.usersService.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.update(id, body);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  deactivate(@Param('id') id: string) {
    return this.usersService.setActive(id, false);
  }

  @Patch(':id/activate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  activate(@Param('id') id: string) {
    return this.usersService.setActive(id, true);
  }

  // ── Permission overrides ──────────────────────────────────────────────────

  @Post(':id/permissions')
  @Roles('ADMIN', 'SUPER_ADMIN')
  grantPermission(
    @Param('id') id: string,
    @Body() body: { permissionKey: string; granted?: boolean },
    @Request() req: any,
  ) {
    return this.usersService.grantPermission(
      id,
      body.permissionKey,
      body.granted ?? true,
      req.user.id,
    );
  }

  @Delete(':id/permissions/:permissionKey')
  @Roles('ADMIN', 'SUPER_ADMIN')
  revokePermission(
    @Param('id') id: string,
    @Param('permissionKey') permissionKey: string,
    @Request() req: any,
  ) {
    return this.usersService.revokePermission(id, permissionKey, req.user.id);
  }

  // ── Working hours ─────────────────────────────────────────────────────────

  @Get(':id/working-hours')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  getWorkingHours(@Param('id') id: string) {
    return this.usersService.getWorkingHours(id);
  }

  @Patch(':id/working-hours')
  @Roles('ADMIN', 'SUPER_ADMIN')
  upsertWorkingHours(
    @Param('id') id: string,
    @Body()
    body: {
      hours: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
    },
  ) {
    return this.usersService.upsertWorkingHours(id, body.hours);
  }

  @Get(':id/2fa-status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async twoFaStatus(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    return { userId: id, totpEnabled: !!(user as any).totpSecret };
  }
}
