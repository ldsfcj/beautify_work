import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PresetItem } from '../entities/preset-item.entity';
import { PresetController } from './preset.controller';
import { PresetService } from './preset.service';

/**
 * Preset module — exposes the curated procedure catalogue to the
 * public dashboard endpoint. Task 20 ships the read path; Task 25
 * (Generate submit) adds the lookup-by-key path that the submit
 * handler uses to resolve user-picked keys to prompt fragments.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PresetItem])],
  controllers: [PresetController],
  providers: [PresetService],
  exports: [PresetService],
})
export class PresetModule {}
