import { Repository } from 'typeorm';
import { PresetItem } from '../entities/preset-item.entity';
import { PresetService } from './preset.service';

/**
 * Unit tests for PresetService.list().
 *
 * Contract:
 *   1. Returns active items only — `is_active=false` is filtered out
 *      (the UI never offers a hidden preset to a user).
 *   2. Grouped by `category` — each category key maps to an array
 *      of items in that category.
 *   3. Within a group, items are ordered by `sort_order` ASC (the
 *      aesthetic order the design team curated, not alphabetic).
 *   4. The grouping iteration order itself is stable: categories
 *      come back in the order the DB returned them. Since the
 *      service does a single SELECT … ORDER BY category, sort_order
 *      the result is naturally grouped + sorted in one pass.
 *   5. Empty result → empty object (not null, not undefined).
 */
describe('PresetService', () => {
  let service: PresetService;
  let repo: jest.Mocked<Pick<Repository<PresetItem>, 'find'>>;

  function makePreset(overrides: Partial<PresetItem> = {}): PresetItem {
    return {
      id: 'p-1',
      key: 'k_1',
      category: 'nose',
      name: 'P1',
      description: null,
      defaultPrompt: 'prompt-1',
      creditsCost: 10,
      isActive: true,
      sortOrder: 100,
      ...overrides,
    } as PresetItem;
  }

  beforeEach(() => {
    repo = { find: jest.fn() } as any;
    service = new PresetService(repo as unknown as Repository<PresetItem>);
  });

  it('groups active items by category in the order the DB returned them', async () => {
    // The service delegates ordering to the repo (find with
    // `order: { category, sortOrder }`), so the mock simulates
    // an already-sorted result: categories ASC, then sortOrder ASC
    // within each category.
    repo.find.mockResolvedValue([
      makePreset({ key: 'c', category: 'eye', sortOrder: 5 }),
      makePreset({ key: 'b', category: 'nose', sortOrder: 10 }),
      makePreset({ key: 'a', category: 'nose', sortOrder: 20 }),
    ] as PresetItem[]);

    const result = await service.list();

    expect(result).toEqual({
      eye: [makePreset({ key: 'c', category: 'eye', sortOrder: 5 })],
      nose: [
        makePreset({ key: 'b', category: 'nose', sortOrder: 10 }),
        makePreset({ key: 'a', category: 'nose', sortOrder: 20 }),
      ],
    });
  });

  it('excludes inactive items', async () => {
    repo.find.mockResolvedValue([
      makePreset({ key: 'a', isActive: true, sortOrder: 1 }),
      makePreset({ key: 'b', isActive: false, sortOrder: 2 }),
    ] as PresetItem[]);

    // Service delegates the filter to the repo (find with where:
    // { is_active: true }) so the repo mock only sees the active
    // ones. We assert via the SELECT call rather than post-filter.
    await service.list();
    expect(repo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { category: 'ASC', sortOrder: 'ASC' },
    });
  });

  it('returns an empty object when no active presets exist', async () => {
    repo.find.mockResolvedValue([] as PresetItem[]);
    await expect(service.list()).resolves.toEqual({});
  });

  it('handles a single category with a single item', async () => {
    const only = makePreset({ key: 'only' });
    repo.find.mockResolvedValue([only] as PresetItem[]);

    const result = await service.list();

    expect(result).toEqual({ nose: [only] });
  });
});
