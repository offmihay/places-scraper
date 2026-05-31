import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.dto.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AreasService } from './areas.service.js';
import {
  cloneCountrySchema,
  createAreaSchema,
  deriveAreaSchema,
  listAreasQuerySchema,
  updateAreaSchema,
  type CloneCountryDto,
  type CreateAreaDto,
  type DeriveAreaDto,
  type ListAreasQuery,
  type UpdateAreaDto,
} from './areas.dto.js';

@Controller('areas')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AreasController {
  constructor(@Inject(AreasService) private readonly areas: AreasService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listAreasQuerySchema)) query: ListAreasQuery) {
    return this.areas.list(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.areas.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createAreaSchema)) body: CreateAreaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.areas.create(body, user.sub);
  }

  @Post('from-country')
  cloneCountry(
    @Body(new ZodValidationPipe(cloneCountrySchema)) body: CloneCountryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.areas.cloneCountry(body.countryAreaId, user.sub, body.name);
  }

  @Post('derive')
  derive(
    @Body(new ZodValidationPipe(deriveAreaSchema)) body: DeriveAreaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.areas.derive(body, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateAreaSchema)) body: UpdateAreaDto,
  ) {
    return this.areas.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.areas.remove(id);
  }
}
