import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HunyuanAdapter } from './adapters/hunyuan.adapter';
import { MockAdapter } from './adapters/mock.adapter';
import { TongyiAdapter } from './adapters/tongyi.adapter';
import { AiAdapter } from './adapters/ai-adapter.interface';
import { AI_ADAPTERS, AiService } from './ai.service';
import { CreditModule } from '../credit/credit.module';
import { Generation } from '../entities/generation.entity';
import { PresetItem } from '../entities/preset-item.entity';
import { SystemConfig } from '../entities/system-config.entity';

/**
 * AI module — wires the three adapters (mock / tongyi / hunyuan)
 * into a Map keyed by `name`, and exposes `AIService` to the rest
 * of the app. The Map is the runtime registry: the AIService
 * looks up the vendor name from `system_configs.ai_models` and
 * dispatches to the right adapter, with no other module needing
 * to know which providers exist.
 *
 * Adding a new vendor later is two changes: implement its
 * `AiAdapter`, then add it to the `adapters` Map below. No
 * `AIService` edit required.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PresetItem, Generation, SystemConfig]),
    CreditModule,
  ],
  providers: [
    MockAdapter,
    TongyiAdapter,
    HunyuanAdapter,
    {
      // The Map<vendor, AiAdapter> is the dispatch table. The
      // provider factory runs once at boot; we collect the
      // instantiated adapters Nest injected into this factory.
      provide: AI_ADAPTERS,
      useFactory: (
        mock: MockAdapter,
        tongyi: TongyiAdapter,
        hunyuan: HunyuanAdapter,
      ): Map<string, AiAdapter> =>
        new Map<string, AiAdapter>([
          [mock.name, mock],
          [tongyi.name, tongyi],
          [hunyuan.name, hunyuan],
        ]),
      inject: [MockAdapter, TongyiAdapter, HunyuanAdapter],
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
