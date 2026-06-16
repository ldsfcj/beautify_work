import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the four runtime data sets that the application needs before it
 * can serve any request:
 *   - 4 credit packages
 *   - 20 preset aesthetic-procedure items
 *   - 9 system configuration keys (protocols, prompts, rate limits, ...)
 *
 * Idempotent: every INSERT is `ON CONFLICT DO NOTHING` so re-running this
 * migration (e.g. after `migration:revert` + `migration:run`) is safe.
 */
export class SeedPresetsAndConfigs1700000000001 implements MigrationInterface {
  name = 'SeedPresetsAndConfigs1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Credit packages (4 tiers, §0.1 D2) ────────────────────────────
    await queryRunner.query(`
      INSERT INTO credit_packages (name, credits, price_cents, bonus_credits, validity_days, is_active, sort_order) VALUES
        ('体验',  50,   2900,  0,    90,  TRUE, 10),
        ('标准',  220,  9900,  20,   180, TRUE, 20),
        ('专业',  580,  22900, 80,   365, TRUE, 30),
        ('旗舰',  2400, 89900, 400,  365, TRUE, 40)
      ON CONFLICT DO NOTHING
    `);

    // ── Preset items (20, organised by category) ──────────────────────
    // Each row: (key, category, name, description, defaultPrompt, creditsCost, sortOrder)
    await queryRunner.query(`
      INSERT INTO preset_items (key, category, name, description, default_prompt, credits_cost, is_active, sort_order) VALUES
        ('rhinoplasty_full',         'nose',   '鼻综合整形',     '鼻梁+鼻头+鼻翼整体改善',         'subtle rhinoplasty, refined nasal bridge and tip,',         30, TRUE, 101),
        ('rhinoplasty_bridge',       'nose',   '鼻梁增高',       '提升鼻梁立体感',                 'elevated nasal bridge, higher and defined,',                20, TRUE, 102),
        ('rhinoplasty_tip',          'nose',   '鼻头塑形',       '精致鼻头',                       'refined and lifted nasal tip, smaller nostrils,',            20, TRUE, 103),
        ('rhinoplasty_alar',         'nose',   '鼻翼缩小',       '缩窄鼻翼',                       'narrower nasal alar, slimmer nose wings,',                   15, TRUE, 104),
        ('rhinoplasty_septum',       'nose',   '鼻中隔矫正',     '改善鼻中隔',                     'corrected nasal septum, straighter nose profile,',           20, TRUE, 105),

        ('eye_double_eyelid',        'eye',    '双眼皮成形',     '自然双眼皮褶皱',                 'natural double eyelid crease, defined upper lid fold,',      20, TRUE, 201),
        ('eye_canthoplasty',         'eye',    '开内眼角',       '延伸内眼角',                     'wider eye aperture, extended inner canthus,',                20, TRUE, 202),
        ('eye_bag_removal',          'eye',    '眼袋去除',       '平滑下眼睑',                     'smooth under-eye area, no eye bags, youthful look,',         20, TRUE, 203),
        ('eye_levator',              'eye',    '上睑提肌',       '提升上睑',                       'lifted upper eyelid, more open and alert eyes,',            20, TRUE, 204),
        ('eye_eyelash',              'eye',    '卧蚕成形',       '下眼睑卧蚕',                     'defined lower eyelid roll, charming aegyo-sal,',             10, TRUE, 205),

        ('lip_thinning',             'lip',    '厚唇改薄',       '唇部变薄',                       'thinner lips, balanced upper and lower lip,',                15, TRUE, 301),
        ('lip_augmentation',         'lip',    '薄唇增厚',       '唇部饱满',                       'fuller lips, plump upper and lower lip,',                    15, TRUE, 302),
        ('lip_reshape',              'lip',    '唇形重塑',       '唇线清晰',                       'reshaped lip contour, defined cupid''s bow,',                15, TRUE, 303),
        ('lip_lift',                 'lip',    '嘴角上扬',       '微笑唇形',                       'upturned mouth corners, gentle smile shape,',                15, TRUE, 304),
        ('lip_tubercles',            'lip',    '唇珠成形',       '立体唇珠',                       'prominent central lip tubercle, dimensional lips,',         10, TRUE, 305),

        ('face_cheekbone',           'face',   '颧骨内推',       '柔和高颧骨',                     'softer cheekbones, smoother facial contour,',                30, TRUE, 401),
        ('face_mandible',            'face',   '下颌角整形',     'V 脸下颌',                       'slimmer jaw angle, V-line facial contour,',                  30, TRUE, 402),
        ('face_chin',                'face',   '颏部成形',       '下巴塑形',                       'refined chin projection, balanced lower face,',              20, TRUE, 403),
        ('face_filler',              'face',   '面部填充',       '面部容量补充',                   'plump facial volume, youthful apple cheeks,',                25, TRUE, 404),
        ('face_lift',                'face',   '面部提拉',       '紧致提升',                       'lifted facial contour, tighter jawline, anti-aging effect,', 35, TRUE, 405)
      ON CONFLICT (key) DO NOTHING
    `);

    // ── System configs (9) ─────────────────────────────────────────────
    // Reusable prompt scaffolding: every generation wraps the user text with
    // prompt_prefix and prompt_suffix (Task 25 prompt builder).
    // Scalars are wrapped via jsonb_build_object('v', <val>) so the jsonb
    // column always holds an object. Application code reads `cfg.value.v`
    // for scalars and the object directly for structured configs.
    await queryRunner.query(`
      INSERT INTO system_configs (key, value, updated_by) VALUES
        ('protocols.user',
         jsonb_build_object('v', 'v1.0', 'content', '《用户服务协议》\\n\\n一、协议接受\\n您在使用本服务前请仔细阅读本协议，一经使用即视为接受全部条款。\\n\\n二、服务内容\\n本平台为医美咨询师提供 AI 整形预览生成工具。\\n\\n三、用户责任\\n您应确保上传的客户照片已获得合法授权，并遵守相关法律法规。'),
         'system'),
        ('protocols.privacy',
         jsonb_build_object('v', 'v1.0', 'content', '《隐私政策》\\n\\n一、信息收集\\n我们仅收集为提供服务所必需的信息。\\n\\n二、信息存储\\n客户照片与生成结果保存 30 天后自动删除。\\n\\n三、信息使用\\n您的信息仅用于本服务，不会用于其他用途。'),
         'system'),
        ('credit_pricing_table',
         '{"tiers":[{"min":1,"max":1,"perCreditCents":58},{"min":2,"max":2,"perCreditCents":45},{"min":3,"max":3,"perCreditCents":39},{"min":4,"perCreditCents":37}]}'::jsonb,
         'system'),
        ('rate_limit',
         '{"perMinute":5,"perDay":50,"burst":3,"downloadPerHour":20}'::jsonb,
         'system'),
        ('ai_models',
         '{"primary":{"vendor":"tongyi","model":"wanx2.1-img2img","enabled":true,"timeoutMs":30000},"secondary":{"vendor":"hunyuan","model":"hunyuan-vision","enabled":true,"timeoutMs":30000},"allowFallback":true}'::jsonb,
         'system'),
        ('prompt_prefix',
         jsonb_build_object('v', 'medical aesthetic reference photo, frontal view, high detail, '),
         'system'),
        ('prompt_suffix',
         jsonb_build_object('v', ', preserve ethnicity and facial identity, natural result, no text overlay, realistic photograph'),
         'system'),
        ('generation_expiry_days',
         jsonb_build_object('v', '30'),
         'system'),
        ('copyright_notice',
         jsonb_build_object('v', '本服务生成内容仅供医美咨询参考，不构成医疗建议。'),
         'system')
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Wipe only the seeded keys (preserve any other configs that may have
    // been added in production via the admin panel).
    await queryRunner.query(`
      DELETE FROM system_configs WHERE key IN (
        'protocols.user','protocols.privacy','credit_pricing_table',
        'rate_limit','ai_models','prompt_prefix','prompt_suffix',
        'generation_expiry_days','copyright_notice'
      )
    `);
    await queryRunner.query(`DELETE FROM preset_items`);
    await queryRunner.query(`DELETE FROM credit_packages`);
  }
}
