import { Global, Module } from '@nestjs/common';
import { EventsPublisher } from './events.service.js';

@Global()
@Module({
  providers: [EventsPublisher],
  exports: [EventsPublisher],
})
export class EventsModule {}
