// migrations/002_seed_data.js
// 必须在 003_indexes 之前跑（preset_items 有 unique 索引）
// 写入 20 个 preset_items + 4 个 credit_packages + 9 个 system_configs
// 字段名以 design.md (section 4.1) 为准：preset_items.credits_cost

const presetItems = [
  // 鼻部（4）
  { key: 'nose_bridge_lift', category: '鼻部', name: '鼻梁增高',
    description: '提升鼻梁高度，更立体', default_prompt:
      'subtly raise and define the nose bridge, natural-looking, preserve ethnicity and facial identity, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 10 },
  { key: 'nose_tip_refine', category: '鼻部', name: '鼻尖塑形',
    description: '鼻尖精致微调', default_prompt:
      'refine and lift the nose tip, natural projection, preserve identity, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 20 },
  { key: 'nostril_reduce', category: '鼻部', name: '鼻翼缩小',
    description: '鼻翼更精致', default_prompt:
      'slightly reduce nostril width, balanced with face, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 30 },
  { key: 'hump_nose_fix', category: '鼻部', name: '鹰钩鼻/驼峰鼻矫正',
    description: '矫正鼻梁不平', default_prompt:
      'smooth the nasal hump, straighten the bridge, natural result, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 40 },
  // 眼部（4）
  { key: 'double_eyelid', category: '眼部', name: '双眼皮成形',
    description: '自然双眼皮', default_prompt:
      'add a natural double eyelid crease, asian-friendly option, subtle, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 50 },
  { key: 'eye_corner_open', category: '眼部', name: '开眼角',
    description: '眼型更开阔', default_prompt:
      'slightly extend the inner/outer canthus, brighter eye shape, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 60 },
  { key: 'eye_bag_remove', category: '眼部', name: '去眼袋',
    description: '去除眼袋黑眼圈', default_prompt:
      'remove under-eye bags and dark circles, smooth skin, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 70 },
  { key: 'brow_lift', category: '眼部', name: '提眉',
    description: '眉毛微提升', default_prompt:
      'subtly lift the eyebrows, more open eye area, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 80 },
  // 面部轮廓（4）
  { key: 'face_slim', category: '面部轮廓', name: '瘦脸',
    description: 'V 脸效果', default_prompt:
      'slightly slim the face contour, V-line effect, natural, preserve identity, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 90 },
  { key: 'cheekbone_reduce', category: '面部轮廓', name: '颧骨内推',
    description: '颧骨更柔和', default_prompt:
      'soften prominent cheekbones, smoother face contour, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 100 },
  { key: 'temple_fill', category: '面部轮廓', name: '太阳穴填充',
    description: '太阳穴更饱满', default_prompt:
      'fill in temple hollows, smoother forehead-to-cheek transition, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 110 },
  { key: 'cheek_fill', category: '面部轮廓', name: '苹果肌填充',
    description: '苹果肌更饱满', default_prompt:
      'subtly restore apple cheek volume, youthful look, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 120 },
  // 下颌（4）
  { key: 'chin_extend', category: '下颌', name: '垫下巴',
    description: '下巴更立体', default_prompt:
      'subtly extend the chin forward, better facial proportions, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 130 },
  { key: 'chin_reduce', category: '下颌', name: '缩下巴',
    description: '下巴更小巧', default_prompt:
      'slightly reduce chin length/projection, balanced profile, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 140 },
  { key: 'jaw_slim', category: '下颌', name: '瘦下颌角',
    description: '下颌角更柔和', default_prompt:
      'slim the mandibular angle, more oval face shape, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 150 },
  { key: 'double_chin_fix', category: '下颌', name: '双下巴消除',
    description: '下颌线更清晰', default_prompt:
      'reduce submental fat, defined jawline, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 160 },
  // 肤质（4）
  { key: 'skin_lifting', category: '肤质', name: '紧致提拉',
    description: '面部更紧致', default_prompt:
      'subtle non-surgical face lifting effect, firmer skin, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 170 },
  { key: 'nasolabial_fold', category: '肤质', name: '法令纹改善',
    description: '法令纹更浅', default_prompt:
      'soften nasolabial folds, smoother mid-face, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 180 },
  { key: 'skin_whitening', category: '肤质', name: '美白提亮',
    description: '肤色更均匀', default_prompt:
      'brighter, even skin tone, preserve ethnicity, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 190 },
  { key: 'pore_refine', category: '肤质', name: '毛孔细化',
    description: '皮肤更细腻', default_prompt:
      'refine pores, smoother skin texture, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 200 },
];

// 4 档套餐：50/220/580/2400 积分（赠送积分合入总计），¥29/99/229/899
const creditPackages = [
  { name: '尝鲜', credits: 50,  price_cents: 2900,  bonus_credits: 0,   validity_days: 730, is_active: true, sort_order: 10 },
  { name: '标准', credits: 220, price_cents: 9900,  bonus_credits: 20,  validity_days: 730, is_active: true, sort_order: 20 },
  { name: '专业', credits: 580, price_cents: 22900, bonus_credits: 80,  validity_days: 730, is_active: true, sort_order: 30 },
  { name: '机构', credits: 2400, price_cents: 89900, bonus_credits: 400, validity_days: 730, is_active: true, sort_order: 40 },
];

// 9 条系统配置
const systemConfigs = {
  ai_models: {
    primary:   { vendor: 'tongyi',  model: 'wanx-v1',     enabled: true },
    secondary: { vendor: 'hunyuan', model: 'hunyuan-image', enabled: true },
    allow_fallback: true,
  },
  rate_limit: { per_minute: 5, per_day: 50, burst: 3 },
  credit_pricing_table: [
    { items: 1, cost: 2 },
    { items: 2, cost: 3 },
    { items: 3, cost: 4 },
    { items: 4, cost: 5 },
  ],
  ai_prompt_prefix: 'medical aesthetic reference photo, frontal view, high detail, ',
  ai_prompt_suffix: ', preserve ethnicity and facial identity, natural result, no text overlay, realistic photograph',
  image_retention_days: 30,
  protocols: {
    user:    { version: 'v1.0', content: '...（v1 启动前由陈工提供完整文本）', must_accept: true },
    privacy: { version: 'v1.0', content: '...',                                must_accept: true },
  },
  maintenance_mode: false,
  watermark_text: 'AI 模拟预览，仅供娱乐参考，不构成医疗建议',
};

module.exports.up = async (db) => {
  // preset_items
  for (const p of presetItems) {
    await db.collection('preset_items').add({ ...p, created_at: new Date() });
  }
  // credit_packages
  for (const p of creditPackages) {
    await db.collection('credit_packages').add({ ...p, created_at: new Date() });
  }
  // system_configs（用 _id 作为 key，便于 KV 查询）
  for (const [key, value] of Object.entries(systemConfigs)) {
    await db.collection('system_configs').add({
      _id: key,
      value,
      updated_at: new Date(),
      updated_by: 'system',
    });
  }
};
