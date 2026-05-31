import { Module } from '@nestjs/common';
import { CoverageController } from './coverage.controller.js';
import { CoverageService } from './coverage.service.js';

@Module({
  controllers: [CoverageController],
  providers: [CoverageService],
  exports: [CoverageService],
})
export class CoverageModule {}
