import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `deleted` value to the `generation_status` PG enum so
 * `softDelete` can flip rows to a soft-deleted state without
 * violating the enum constraint. Mirrors `GenerationStatus.DELETED`
 * added in Task 26.
 */
export class AddDeletedToGenerationStatus1700000000002
  implements MigrationInterface
{
  name = 'AddDeletedToGenerationStatus1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE generation_status ADD VALUE IF NOT EXISTS 'deleted'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PG does not support DROP VALUE on an enum. No-op down.
  }
}
