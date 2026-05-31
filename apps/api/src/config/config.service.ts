import { Inject, Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import type { AppConfig } from './config.schema.js';

@Injectable()
export class AppConfigService {
  constructor(@Inject(NestConfigService) private readonly raw: NestConfigService<AppConfig, true>) {}

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.raw.get(key, { infer: true });
  }
}
