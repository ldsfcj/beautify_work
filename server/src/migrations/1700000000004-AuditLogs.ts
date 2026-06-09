import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `audit_logs` table populated by the back-office (admin)
 * write-side paths: credit adjust, preset/package CRUD, config
 * upsert, refund approve/reject, plus Task 24 cleanup events
 * (bad-signature payment notify, reconcile warn rows).
 *
 * Two indexes are intentional:
 *   - (admin_id, created_at DESC) — "what did admin X do lately?"
 *   - (action, created_at DESC)    — "all refund.approve events
 *     in the last 7 days" for finance compliance reports.
 *
 * The ON DELETE SET NULL on admin_id is the policy choice: we
 * keep the audit row even if the admin is later deleted (e.g.
 * offboarded), at the cost of a dangling FK.
 */
export class AuditLogs1700000000004 implements MigrationInterface {
  name = 'AuditLogs1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        admin_id     uuid,
        action       varchar(64) NOT NULL,
        target_type  varchar(32),
        target_id    varchar(64),
        payload      jsonb,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_audit_logs_admin
          FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_audit_logs_admin_created ON audit_logs (admin_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_audit_logs_action_created ON audit_logs (action, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_audit_logs_action_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS ix_audit_logs_admin_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
  }
}
