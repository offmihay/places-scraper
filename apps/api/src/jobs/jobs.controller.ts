import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.dto.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { EventsSubscriber } from '../events/events.service.js';
import { JobsService } from './jobs.service.js';
import {
  createJobSchema,
  estimateJobSchema,
  listJobsQuerySchema,
  resumeJobSchema,
  type CreateJobDto,
  type EstimateJobDto,
  type ListJobsQuery,
  type ResumeJobDto,
} from './jobs.dto.js';

@Controller('jobs')
export class JobsController {
  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(EventsSubscriber) private readonly events: EventsSubscriber,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  list(@Query(new ZodValidationPipe(listJobsQuerySchema)) query: ListJobsQuery) {
    return this.jobs.list(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobs.get(id);
  }

  @Post('estimate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, AdminGuard)
  estimate(@Body(new ZodValidationPipe(estimateJobSchema)) body: EstimateJobDto) {
    return this.jobs.estimate(body);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(
    @Body(new ZodValidationPipe(createJobSchema)) body: CreateJobDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.jobs.create(body, user.sub);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, AdminGuard)
  cancel(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobs.cancel(id);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, AdminGuard)
  resume(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(resumeJobSchema)) body: ResumeJobDto,
  ) {
    return this.jobs.resume(id, body.maxCostUsd);
  }

  @Post(':id/retry-failed')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, AdminGuard)
  retryFailed(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobs.retryFailed(id);
  }

  /**
   * Live stream of cell/progress/status events for a job.
   * Auth via ?token= query (EventSource cannot send custom headers).
   * A 25-second keepalive ping keeps proxies and browsers from killing
   * the idle connection.
   */
  @Sse(':id/stream')
  @UseGuards(JwtAuthGuard, AdminGuard)
  stream(@Param('id', new ParseUUIDPipe()) id: string): Observable<MessageEvent> {
    const events$ = this.events.stream(id).pipe(
      map((event) => ({ data: event, type: event.kind })),
    );
    const keepalive$ = interval(25_000).pipe(
      map(() => ({ data: { kind: 'ping' }, type: 'ping' })),
    );
    return merge(events$, keepalive$);
  }
}
