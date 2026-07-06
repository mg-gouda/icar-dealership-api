import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';
// ponytail: optional per-handler permission key for UserPermission override lookup
export const Permission = (key: string) => SetMetadata(PERMISSION_KEY, key);
