import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { schema, type Database } from '@places/db';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../db/db.tokens.js';
import { AppConfigService } from '../config/config.service.js';
import type { AuthTokens, JwtPayload } from './auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens({ sub: user.id, email: user.email, role: user.role });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens({ sub: payload.sub, email: payload.email, role: payload.role });
  }

  async me(userId: string) {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  private async issueTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL');
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_TTL'),
    });
    return { accessToken, refreshToken, expiresIn: parseTtlToSeconds(accessTtl) };
  }
}

function parseTtlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 900;
  const value = Number(match[1]);
  switch (match[2]) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 900;
  }
}
