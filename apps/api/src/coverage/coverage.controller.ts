import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CoverageService } from './coverage.service.js';
import {
  cellsQuerySchema,
  heatmapQuerySchema,
  uncoveredQuerySchema,
  type CellsQuery,
  type HeatmapQuery,
  type UncoveredQuery,
} from './coverage.dto.js';

@Controller('coverage')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CoverageController {
  constructor(@Inject(CoverageService) private readonly coverage: CoverageService) {}

  @Get('cells')
  cells(@Query(new ZodValidationPipe(cellsQuerySchema)) query: CellsQuery) {
    return this.coverage.cells(query);
  }

  @Get('areas/:id/uncovered')
  uncovered(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(uncoveredQuerySchema)) query: UncoveredQuery,
  ) {
    return this.coverage.uncovered(id, query);
  }

  @Get('areas/:id/summary')
  summary(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.coverage.summary(id);
  }

  @Get('heatmap')
  heatmap(@Query(new ZodValidationPipe(heatmapQuerySchema)) query: HeatmapQuery) {
    return this.coverage.heatmap(query);
  }
}
