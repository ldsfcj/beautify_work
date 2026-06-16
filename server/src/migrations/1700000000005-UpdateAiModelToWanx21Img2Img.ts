import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Updates `system_configs.ai_models.primary.model` from the legacy
 * `wanx-v1` placeholder to the real DashScope image2image model
 * `wanx2.1-img2img` (万相-通用图像编辑2.1). Background: see
 * `docs/2026-06-12-通义万相接入计划.md`.
 *
 * Idempotent: the UPDATE is a no-op when the row already holds the
 * target value (e.g. fresh DBs whose seed migration `…0001` already
 * shipped the new name). Uses `jsonb_set` so we only touch the
 * `primary.model` leaf and leave everything else (vendor, enabled,
 * timeoutMs, secondary, allowFallback) untouched.
 *
 * Safe with `1700000000001-SeedPresetsAndConfigs`: that seed now
 * inserts the new value, and this migration back-fills any DB
 * seeded before the change.
 */
export class UpdateAiModelToWanx21Img2Img1700000000005
  implements MigrationInterface
{
  name = 'UpdateAiModelToWanx21Img2Img1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE system_configs
         SET value = jsonb_set(
                value,
                '{primary,model}',
                '"wanx2.1-img2img"',
                false
              ),
             updated_at = now()
       WHERE key = 'ai_models'
         AND value -> 'primary' ->> 'model' IS DISTINCT FROM 'wanx2.1-img2img'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to the legacy placeholder so this migration is symmetric.
    // Down is only meaningful for local dev that hasn't been seeded.
    await queryRunner.query(`
      UPDATE system_configs
         SET value = jsonb_set(
                value,
                '{primary,model}',
                '"wanx-v1"',
                false
              ),
             updated_at = now()
       WHERE key = 'ai_models'
    `);
  }
}
