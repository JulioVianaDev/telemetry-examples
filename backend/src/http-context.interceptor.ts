import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AsyncLocalStorage } from 'async_hooks';

export interface HttpRequestContext {
  method: string;
  route: string;
  tenantId?: string;
  userId?: string;
}

export const httpContextStorage = new AsyncLocalStorage<HttpRequestContext>();

@Injectable()
export class HttpContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    if (ctx.getType() !== 'http') {
      return next.handle();
    }

    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    const route: string = req.route
      ? req.baseUrl + req.route.path
      : req.path;
    const tenantId: string | undefined = req.tenantId ?? undefined;
    const userId: string | undefined = req.user?.id ?? undefined;

    return new Observable((subscriber) => {
      httpContextStorage.run({ method, route, tenantId, userId }, () => {
        next.handle().subscribe({
          next: (val) => subscriber.next(val),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
