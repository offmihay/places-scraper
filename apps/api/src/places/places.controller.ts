import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PlacesService } from './places.service.js';
import {
  geojsonQuerySchema,
  listPlacesQuerySchema,
  type GeojsonQuery,
  type ListPlacesQuery,
} from './places.dto.js';

@Controller('places')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PlacesController {
  constructor(@Inject(PlacesService) private readonly places: PlacesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listPlacesQuerySchema)) query: ListPlacesQuery) {
    return this.places.list(query);
  }

  @Get('stats')
  stats() {
    return this.places.stats();
  }

  @Get('export.csv')
  async exportCsv(
    @Query(new ZodValidationPipe(listPlacesQuerySchema)) query: ListPlacesQuery,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="places-${Date.now()}.csv"`);
    res.flushHeaders();
    for await (const chunk of this.places.csvStream(query)) {
      res.write(chunk);
    }
    res.end();
  }

  @Get('geojson')
  geojson(@Query(new ZodValidationPipe(geojsonQuerySchema)) query: GeojsonQuery) {
    return this.places.geojson(query, 5000);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.places.get(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.places.remove(id);
  }
}
