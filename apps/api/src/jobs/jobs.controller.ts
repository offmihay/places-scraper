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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.dto.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { JobsService } from './jobs.service.js';
import { createJobSchema, type CreateJobDto } from './jobs.dto.js';

@Controller('jobs')
@UseGuards(JwtAuthGuard, AdminGuard)
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Get()
  list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.jobs.list(
      limit ? Math.min(Number(limit), 200) : 50,
      offset ? Math.max(Number(offset), 0) : 0,
    );
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobs.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createJobSchema)) body: CreateJobDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.jobs.create(body, user.sub);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobs.cancel(id);
  }
}
