import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AiAdapter, AiEditInput, AiEditResult } from './ai-adapter.interface';

/**
 * Stub for the future Tencent Hunyuan image-editing adapter. v2
 * placeholder — always throws 501 so the AIService's fallback
 * path (Task 23) gets exercised in production when Hunyuan is
 * selected as primary or secondary but the SDK isn't wired yet.
 *
 * Why 501 not 503: 501 means "we know this should exist but we
 * haven't built it"; the runbook / on-call playbook treats 501 as
 * a hard "fix the integration" signal, not a transient outage.
 */
@Injectable()
export class HunyuanAdapter implements AiAdapter {
  readonly name = 'hunyuan' as const;

  async editImage(_input: AiEditInput): Promise<AiEditResult> {
    throw new HttpException(
      { code: 'AI_NOT_IMPLEMENTED', message: 'HunyuanAdapter is a v2 stub' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
