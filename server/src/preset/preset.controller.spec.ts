import { PresetService } from './preset.service';
import { PresetController } from './preset.controller';

/**
 * Controller test for PresetController. Behaviour we own here:
 *   - delegates to PresetService.list()
 *   - returns the grouped object as-is (no extra wrapping, no
 *     filtering by user) so the global TransformInterceptor
 *     emits `{code, message, data: <grouped>}`.
 */
describe('PresetController', () => {
  let controller: PresetController;
  let service: jest.Mocked<Pick<PresetService, 'list'>>;

  beforeEach(() => {
    service = { list: jest.fn() } as any;
    controller = new PresetController(service as unknown as PresetService);
  });

  it('returns the grouped catalogue as-is', async () => {
    const grouped = { nose: [{ key: 'rhinoplasty_bridge' } as any] };
    service.list.mockResolvedValue(grouped);

    await expect(controller.list()).resolves.toBe(grouped);
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('returns an empty object when the catalogue is empty', async () => {
    service.list.mockResolvedValue({});
    await expect(controller.list()).resolves.toEqual({});
  });
});
