import { Global, Module } from '@nestjs/common';
import { createDatabase, type Database } from '@places/db';
import { AppConfigService } from '../config/config.service.js';
import { DRIZZLE } from './db.tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Database =>
        createDatabase(config.get('DATABASE_URL')),
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule {}
