import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema: 14 tables + enums + uuid extension. Mirror of
 * server/src/entities/* so a fresh database can be bootstrapped
 * end-to-end via `npm run typeorm migration:run` only.
 *
 * Order: extensions → enums (referenced by table columns) → tables → indexes.
 * Foreign keys are declared inline; ON DELETE behaviour follows each entity.
 */
export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // ── Enums ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE user_status AS ENUM ('active','banned','pending_delete','deleted')
    `);
    await queryRunner.query(`
      CREATE TYPE order_status AS ENUM ('pending','paid','refunded','cancelled')
    `);
    await queryRunner.query(`
      CREATE TYPE payment_method AS ENUM ('wechat','alipay')
    `);
    await queryRunner.query(`
      CREATE TYPE generation_status AS ENUM ('pending','processing','success','failed')
    `);
    await queryRunner.query(`
      CREATE TYPE ledger_type AS ENUM ('recharge','consume','refund','admin')
    `);
    await queryRunner.query(`
      CREATE TYPE refund_status AS ENUM ('pending','approved','rejected')
    `);
    await queryRunner.query(`
      CREATE TYPE admin_role AS ENUM ('admin','super')
    `);

    // ── users ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        phone_hash VARCHAR(64) NOT NULL,
        phone_encrypted TEXT NOT NULL,
        nickname VARCHAR(50),
        avatar TEXT,
        credits INTEGER NOT NULL DEFAULT 0,
        status user_status NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        delete_at TIMESTAMPTZ,
        CONSTRAINT uq_users_phone_hash UNIQUE (phone_hash)
      )
    `);

    // ── credit_packages ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE credit_packages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(50) NOT NULL,
        credits INTEGER NOT NULL,
        price_cents INTEGER NOT NULL,
        bonus_credits INTEGER NOT NULL DEFAULT 0,
        validity_days INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);

    // ── orders ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_no VARCHAR(32) NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        package_id UUID NOT NULL REFERENCES credit_packages(id) ON DELETE RESTRICT,
        credits INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        status order_status NOT NULL DEFAULT 'pending',
        payment_method payment_method,
        txn_id VARCHAR(64),
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_orders_order_no UNIQUE (order_no)
      )
    `);

    // ── generations ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE generations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        original_url TEXT NOT NULL,
        result_url TEXT,
        preset_keys TEXT[] NOT NULL DEFAULT '{}',
        prompt_text TEXT NOT NULL,
        model_used VARCHAR(64),
        credits_cost INTEGER NOT NULL,
        status generation_status NOT NULL DEFAULT 'pending',
        error_msg TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── preset_items ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE preset_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        key VARCHAR(64) NOT NULL,
        category VARCHAR(32) NOT NULL,
        name VARCHAR(80) NOT NULL,
        description TEXT,
        default_prompt TEXT NOT NULL,
        credits_cost INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT uq_preset_items_key UNIQUE (key)
      )
    `);

    // ── credit_ledger ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE credit_ledger (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type ledger_type NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        related_id VARCHAR(64),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── system_configs ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE system_configs (
        key VARCHAR(64) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_by VARCHAR(64) NOT NULL DEFAULT 'system',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── ai_call_logs ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ai_call_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
        model VARCHAR(64) NOT NULL,
        request_size INTEGER NOT NULL DEFAULT 0,
        response_size INTEGER NOT NULL DEFAULT 0,
        cost_cents INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        success BOOLEAN NOT NULL DEFAULT FALSE,
        error_code VARCHAR(32),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── download_logs ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE download_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
        ip VARCHAR(45) NOT NULL,
        ua TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── refunds ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE refunds (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        reason TEXT NOT NULL,
        status refund_status NOT NULL DEFAULT 'pending',
        amount_cents INTEGER NOT NULL,
        operator_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);

    // ── admin_users ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE admin_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(32) NOT NULL,
        password_hash VARCHAR(128) NOT NULL,
        role admin_role NOT NULL DEFAULT 'admin',
        last_login_at TIMESTAMPTZ,
        CONSTRAINT uq_admin_users_username UNIQUE (username)
      )
    `);

    // ── user_agreements ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE user_agreements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(32) NOT NULL,
        version VARCHAR(32) NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_agreements_user_type_version UNIQUE (user_id, type, version)
      )
    `);

    // ── sms_codes ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE sms_codes (
        phone VARCHAR(20) PRIMARY KEY,
        code VARCHAR(8) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── notifications ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(32) NOT NULL,
        title VARCHAR(128) NOT NULL,
        body TEXT NOT NULL,
        payload JSONB,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse FK-safe order (children before parents).
    await queryRunner.query(`DROP TABLE IF EXISTS notifications CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS sms_codes CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_agreements CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS admin_users CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS refunds CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS download_logs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_call_logs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS system_configs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS credit_ledger CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS preset_items CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS generations CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS orders CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS credit_packages CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS users CASCADE`);

    await queryRunner.query(`DROP TYPE IF EXISTS admin_role`);
    await queryRunner.query(`DROP TYPE IF EXISTS refund_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS ledger_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS generation_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS payment_method`);
    await queryRunner.query(`DROP TYPE IF EXISTS order_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_status`);
  }
}
