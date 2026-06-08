import { Body, Controller, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { GenerateService, SubmitResult } from './generate.service';

export interface SubmitBodyDto {
  image_url: string;
  preset_keys: string[];
  text?: string;
}

/**
 * Generate submit endpoint. JWT-gated by the global JwtAuthGuard
 * (the @Public() decorator is NOT applied here). The endpoint is
 * optimised for the 50ms p99 budget (D5): the only synchronous work
 * is the rate-limit check + credit debit; everything else (AI
 * generation, watermark, OSS upload) is fanned out to the Bull
 * worker via `queue.add()`.
 */
@Controller('generate')
export class GenerateController {
  constructor(private readonly service: GenerateService) {}

  @Post('submit')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async submit(
    @CurrentUser() user: JwtPayload,
    @Body() body: SubmitBodyDto,
  ): Promise<SubmitResult> {
    return this.service.submit(user.id, body);
  }
}
