import { PipeTransform, BadRequestException, ArgumentMetadata } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Accept any ZodType regardless of its input shape — schemas with .default()
 * or transforms have a wider input type than output, and we don't want
 * each caller to fight the inference.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Validation failed',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
