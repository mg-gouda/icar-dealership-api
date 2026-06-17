import { SetMetadata } from '@nestjs/common';

export const LOCATION_SCOPE_KEY = 'location_scope';
export const LocationScope = () => SetMetadata(LOCATION_SCOPE_KEY, true);
