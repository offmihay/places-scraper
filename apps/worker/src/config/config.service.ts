import { Inject, Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import type { WorkerConfig } from './config.schema.js';

@Injectable()
export class AppConfigService {
  constructor(
    @Inject(NestConfigService) private readonly raw: NestConfigService<WorkerConfig, true>,
  ) {}

  get<K extends keyof WorkerConfig>(key: K): WorkerConfig[K] {
    return this.raw.get(key, { infer: true });
  }
}
