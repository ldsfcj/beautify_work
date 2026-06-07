import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PresetItem } from '../entities/preset-item.entity';

/**
 * PresetService — read-only view of the curated procedure catalogue.
 *
 * The catalogue itself is seeded by
 * `1700000000001-SeedPresetsAndConfigs.ts` (P0 setup, reused by Task
 * 20). The runtime contract is intentionally minimal: the web
 * dashboard fetches the full grouped list once on load and caches it
 * in Pinia; subsequent calls within a session are local. Generation
 * submission (Task 25) takes the `key` strings the user picked and
 * resolves them server-side through the same repository.
 *
 * Why group on the server, not the client: keeps the wire payload
 * structured for direct render, and lets future server-side
 * filtering (e.g. "presets available under the user's current
 * credit balance") slot in without changing the API shape.
 */
@Injectable()
export class PresetService {
  constructor(
    @InjectRepository(PresetItem)
    private readonly repo: Repository<PresetItem>,
  ) {}

  /**
   * Return every active preset grouped by `category`, ordered by
   * `sort_order` within each group. The result is a plain object
   * (not a Map) so it serialises cleanly through the global
   * `TransformInterceptor`.
   */
  async list(): Promise<Record<string, PresetItem[]>> {
    const items = await this.repo.find({
      where: { isActive: true },
      order: { category: 'ASC', sortOrder: 'ASC' },
    });
    return items.reduce<Record<string, PresetItem[]>>((acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    }, {});
  }
}
