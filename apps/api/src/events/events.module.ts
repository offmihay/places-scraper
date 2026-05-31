import { Global, Module } from '@nestjs/common';
import { EventsPublisher } from './events-publisher.service.js';
import { EventsSubscriber } from './events.service.js';

@Global()
@Module({
  providers: [EventsPublisher, EventsSubscriber],
  exports: [EventsPublisher, EventsSubscriber],
})
export class EventsModule {}
