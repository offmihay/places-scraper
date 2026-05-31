import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { configSchema } from './config.schema.js';
import { AppConfigService } from './config.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Walk from dist/config (build) or src/config (dev) up to repo root.
const repoRoot = join(__dirname, '..', '..', '..', '..');

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(repoRoot, '.env')],
      validate: (raw) => configSchema.parse(raw),
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
