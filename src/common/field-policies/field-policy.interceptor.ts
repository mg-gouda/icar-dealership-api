import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  FIELD_POLICIES,
  FieldPolicy,
  roleAtLeast,
  Role,
} from './field-policies';

export const FIELD_POLICY_ENTITY_KEY = 'field_policy_entity';

/** Declare which entity a controller/handler returns → interceptor strips restricted fields */
export const FieldPolicyEntity = (...entities: string[]) =>
  SetMetadata(FIELD_POLICY_ENTITY_KEY, entities);

@Injectable()
export class FieldPolicyInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const entities = this.reflector.getAllAndOverride<string[]>(
      FIELD_POLICY_ENTITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!entities?.length) return next.handle();

    const request = context.switchToHttp().getRequest();
    const userRole: Role = request.user?.role ?? 'CUSTOMER';

    // Collect all policies for declared entities
    const policies = FIELD_POLICIES.filter((p) => entities.includes(p.entity));
    if (!policies.length) return next.handle();

    return next
      .handle()
      .pipe(map((data) => stripFields(data, policies, userRole)));
  }
}

function stripFields(data: any, policies: FieldPolicy[], userRole: Role): any {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => stripFields(item, policies, userRole));
  }

  // Handle paginated { items: [], total: N } shape
  if (
    typeof data === 'object' &&
    'items' in data &&
    Array.isArray(data.items)
  ) {
    return {
      ...data,
      items: data.items.map((item: any) =>
        stripFields(item, policies, userRole),
      ),
    };
  }

  if (typeof data === 'object') {
    const result = { ...data };
    for (const policy of policies) {
      if (policy.field in result && !roleAtLeast(userRole, policy.minRole)) {
        delete result[policy.field];
      }
    }
    // Recurse into nested objects that might match other entity policies
    // (e.g. Deal response containing embedded financeApplication)
    for (const key of Object.keys(result)) {
      if (result[key] !== null && typeof result[key] === 'object') {
        result[key] = stripFields(result[key], policies, userRole);
      }
    }
    return result;
  }

  return data;
}
