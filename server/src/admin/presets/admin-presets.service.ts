import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PresetItem } from '../../entities/preset-item.entity';

export interface AdminPresetListResult {
  items: PresetItem[];
  total: number;
}

export interface AdminPresetUpsertDto {
  key: string;
  category: string;
  name: string;
  description?: string | null;
  defaultPrompt: string;
  creditsCost: number;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * Back-office preset CRUD. The dashboard bundles a `category` enum
 * (nose/eye/face/lip/jaw/skin) — admin can add new items, edit
 * `defaultPrompt` or pricing, and soft-disable (`isActive=false`)
 * entries that the user-facing catalogue should hide.
 *
 * Soft-delete via `isActive=false` is preferred over row deletion
 * because old `generations.preset_keys[]` rows still reference these
 * by key and the result-page renderer needs the name to look up.
 */
@Injectable()
export class AdminPresetsService {
  constructor(
    @InjectRepository(PresetItem) private readonly repo: Repository<PresetItem>,
  ) {}

  async list(opts: { includeInactive?: boolean } = {}): Promise<AdminPresetListResult> {
    const where = opts.includeInactive ? {} : { isActive: true };
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { category: 'ASC', sortOrder: 'ASC' },
    });
    return { items, total };
  }

  async upsert(dto: AdminPresetUpsertDto, id?: string): Promise<PresetItem> {
    if (id) {
      const existing = await this.repo.findOne({ where: { id } });
      if (!existing) throw new NotFoundException('preset 不存在');
      Object.assign(existing, dto);
      return this.repo.save(existing);
    }
    // Create: key must be unique.
    const dup = await this.repo.findOne({ where: { key: dto.key } });
    if (dup) throw new ConflictException('preset key 已存在');
    const created = this.repo.create({
      ...dto,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.repo.save(created);
  }

  async remove(id: string): Promise<{ id: string; isActive: boolean }> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('preset 不存在');
    // Soft-disable rather than hard-delete: keep the key stable for
    // existing generations.presetKeys rows.
    existing.isActive = false;
    await this.repo.save(existing);
    return { id: existing.id, isActive: false };
  }
}
