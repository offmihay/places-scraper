import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { JwtPayload } from './auth.dto.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}
