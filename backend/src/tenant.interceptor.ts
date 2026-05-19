import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { trace } from '@opentelemetry/api';
import { resolveUser } from './users.mock';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    if (ctx.getType() !== 'http') {
      return next.handle();
    }

    const req = ctx.switchToHttp().getRequest();
    const userId = req.headers['x-user-id'] as string | undefined;
    const user = resolveUser(userId);

    // Attach to request so controllers/services can access it
    req.user = user ?? null;
    req.tenantId = user?.tenantId ?? null;

    // Set tenant attributes on the active OTel span
    const span = trace.getActiveSpan();
    if (span) {
      if (user) {
        span.setAttribute('user.id', user.id);
        span.setAttribute('user.name', user.name);
      }
      if (user?.tenantId) {
        span.setAttribute('tenant.id', user.tenantId);
      }
    }

    return next.handle();
  }
}
