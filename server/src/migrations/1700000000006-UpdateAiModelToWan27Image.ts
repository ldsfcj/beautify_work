import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Updates `system_configs.ai_models.primary.model` from the unavailable
 * `wanx2.1-img2img` to `wan2.7-image` (Aliyun's current DashScope image2image
 * model). Background: `wanx2.1-img2img` was deprecated/removed from
 * DashScope — submitting to it returns `Model not exist`. Probed viable
 * names: `wan2.7-image`, `wan2.6-image`, `wan-v1`, `qwen-image-edit*`.
 *
 * Idempotent — no-op when the value is already `wan2.7-image`. Uses
 * `jsonb_set` to touch only the `primary.model` leaf.
 *
 * Safe with `…0001-SeedPresetsAndConfigs`: that seed now ships the new
 * value, and this migration back-fills any DB that was migrated past
 * `…0005-UpdateAiModelToWanx21Img2Img`.
 */
export class UpdateAiModelToWan27Image1700000000006
  implements MigrationInterface
{
  name = 'UpdateAiModelToWan27Image1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE system_configs
         SET value = jsonb_set(
                value,
                '{primary,model}',
                '"wan2.7-image"',
                false
              ),
             updated_at = now()
       WHERE key = 'ai_models'
         AND value -> 'primary' ->> 'model' IS DISTINCT FROM 'wan2.7-image'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to the previous (now-deprecated) target so this migration
    // is symmetric and the down-direction actually undoes the change.
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
         AND value -> 'primary' ->> 'model' = 'wan2.7-image'
    `);
  }
}
