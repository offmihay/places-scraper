import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './auth.dto.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return req.user;
  },
);
