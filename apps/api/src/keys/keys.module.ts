import { Module } from '@nestjs/common';
import { KeysController } from './keys.controller.js';
import { KeysService } from './keys.service.js';
import { KeysCron } from './keys.cron.js';

@Module({
  controllers: [KeysController],
  providers: [KeysService, KeysCron],
  exports: [KeysService],
})
export class KeysModule {}
