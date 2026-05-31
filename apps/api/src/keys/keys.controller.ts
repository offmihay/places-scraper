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
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { KeysService } from './keys.service.js';
import {
  createKeySchema,
  updateKeySchema,
  type CreateKeyDto,
  type UpdateKeyDto,
} from './keys.dto.js';

@Controller('keys')
@UseGuards(JwtAuthGuard, AdminGuard)
export class KeysController {
  constructor(@Inject(KeysService) private readonly keys: KeysService) {}

  @Get()
  list() {
    return this.keys.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createKeySchema))
  create(@Body() body: CreateKeyDto) {
    return this.keys.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateKeySchema)) body: UpdateKeyDto,
  ) {
    return this.keys.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.keys.remove(id);
  }
}
