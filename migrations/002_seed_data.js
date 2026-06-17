// migrations/002_seed_data.js
// 必须在 003_indexes 之前跑（preset_items 有 unique 索引）
// 写入 20 个 preset_items + 4 个 credit_packages + 9 个 system_configs
// 字段名以 design.md (section 4.1) 为准：preset_items.credits_cost

const presetItems = [
  // ── 鼻部（4）─────────────────────────────────────────────────────
  { key: 'nose_bridge_lift', category: '鼻部', name: '鼻梁增高',
    description: '提升鼻梁高度，更立体', default_prompt:
      'increase the height and projection of the nasal bridge from the radix to the supratip, create a straight defined dorsal line with subtle shadow along both sides of the bridge, keep the nasal tip and alae unchanged, maintain original skin texture and lighting',
    credits_cost: 2, is_active: true, sort_order: 10 },
  { key: 'nose_tip_refine', category: '鼻部', name: '鼻尖塑形',
    description: '鼻尖精致微调', default_prompt:
      'refine the nasal tip by slightly increasing tip projection and narrowing the tip lobule, create a refined tip-defining point with gentle supratip break, keep the alar base and bridge width unchanged, maintain skin pore detail',
    credits_cost: 2, is_active: true, sort_order: 20 },
  { key: 'nostril_reduce', category: '鼻部', name: '鼻翼缩小',
    description: '鼻翼更精致', default_prompt:
      'reduce the alar base width by narrowing the nostril sill and gently in-folding the alar rims, maintain the natural curvature of the nostril openings, keep the nasal tip and bridge unchanged, preserve surrounding cheek and upper lip area',
    credits_cost: 2, is_active: true, sort_order: 30 },
  { key: 'hump_nose_fix', category: '鼻部', name: '鹰钩鼻/驼峰鼻矫正',
    description: '矫正鼻梁不平', default_prompt:
      'smoothly shave down the dorsal hump to create a straight nasal bridge from radix to tip, remove the convex bump while preserving a subtle masculine or feminine dorsum contour appropriate for the face, keep tip and alae unchanged',
    credits_cost: 2, is_active: true, sort_order: 40 },

  // ── 眼部（4）─────────────────────────────────────────────────────
  { key: 'double_eyelid', category: '眼部', name: '双眼皮成形',
    description: '自然双眼皮', default_prompt:
      'create a natural double eyelid crease parallel to the lash line at moderate height, add a subtle supratarsal fold with gentle skin draping over the crease, keep the original eye opening size and canthal angles unchanged, maintain eyelash detail',
    credits_cost: 2, is_active: true, sort_order: 50 },
  { key: 'eye_corner_open', category: '眼部', name: '开眼角',
    description: '眼型更开阔', default_prompt:
      'subtly widen the medial canthus by reducing the epicanthal fold, expose 2-3 mm more of the caruncle, increase horizontal palpebral fissure length while keeping the eye shape natural, do not alter the lateral canthus or eyelid crease',
    credits_cost: 2, is_active: true, sort_order: 60 },
  { key: 'eye_bag_remove', category: '眼部', name: '去眼袋',
    description: '去除眼袋黑眼圈', default_prompt:
      'smooth out the infraorbital fat bulge by flattening the lower eyelid contour, reduce the shadow line at the orbitomalar groove, even out the tear trough hollow, brighten the under-eye skin tone, keep the lower eyelid margin and lash line unchanged',
    credits_cost: 2, is_active: true, sort_order: 70 },
  { key: 'brow_lift', category: '眼部', name: '提眉',
    description: '眉毛微提升', default_prompt:
      'raise the eyebrow position by 3-4 mm uniformly along the brow arch, open up the brow-to-upper-lid distance, create a more alert and refreshed upper eye area, keep the brow shape and arch curvature identical, do not widen the forehead',
    credits_cost: 2, is_active: true, sort_order: 80 },

  // ── 面部轮廓（4）─────────────────────────────────────────────────
  { key: 'face_slim', category: '面部轮廓', name: '瘦脸',
    description: 'V 脸效果', default_prompt:
      'narrow the lower third of the face by reducing soft tissue volume along the masseter region and jowl area, create a gentle V-line taper from cheekbone to chin, keep the midface width and zygomatic arch unchanged, maintain natural jawline shadow',
    credits_cost: 2, is_active: true, sort_order: 90 },
  { key: 'cheekbone_reduce', category: '面部轮廓', name: '颧骨内推',
    description: '颧骨更柔和', default_prompt:
      'reduce the lateral projection of the zygomatic arch by medially infolding the cheekbone contour, smooth the transition from temporal fossa to cheekbone to buccal region, keep the infraorbital rim and midface height unchanged',
    credits_cost: 2, is_active: true, sort_order: 100 },
  { key: 'temple_fill', category: '面部轮廓', name: '太阳穴填充',
    description: '太阳穴更饱满', default_prompt:
      'fill the temporal hollows with smooth volume to create a convex contour from lateral brow to zygomatic arch, eliminate the concave shadow at the temples, blend seamlessly with the forehead and upper cheek, keep the hairline and brow position unchanged',
    credits_cost: 2, is_active: true, sort_order: 110 },
  { key: 'cheek_fill', category: '面部轮廓', name: '苹果肌填充',
    description: '苹果肌更饱满', default_prompt:
      'restore volume to the anterior malar fat pad to create a youthful apple-cheek highlight on smile, add subtle fullness to the sub-orbicularis oculi fat compartment, keep the nasolabial fold and lower cheek unchanged, maintain natural animation lines',
    credits_cost: 2, is_active: true, sort_order: 120 },

  // ── 下颌（4）─────────────────────────────────────────────────────
  { key: 'chin_extend', category: '下颌', name: '垫下巴',
    description: '下巴更立体', default_prompt:
      'increase chin projection by advancing the pogonion 4-5 mm forward, add slight vertical length to the mentum, maintain the chin width and natural mental fold, keep the lower lip position unchanged',
    credits_cost: 2, is_active: true, sort_order: 130 },
  { key: 'chin_reduce', category: '下颌', name: '缩下巴',
    description: '下巴更小巧', default_prompt:
      'reduce chin projection by setting the pogonion back 3-4 mm, shorten the vertical mentum height slightly, narrow the chin width at the genial angles, keep the lower lip and labiomental sulcus unchanged',
    credits_cost: 2, is_active: true, sort_order: 140 },
  { key: 'jaw_slim', category: '下颌', name: '瘦下颌角',
    description: '下颌角更柔和', default_prompt:
      'reduce the mandibular angle prominence by rounding the gonion region, create a smooth curve from ear lobe to chin instead of an angular step, reduce masseter muscle bulk at the angle, keep the chin and midface unchanged',
    credits_cost: 2, is_active: true, sort_order: 150 },
  { key: 'double_chin_fix', category: '下颌', name: '双下巴消除',
    description: '下颌线更清晰', default_prompt:
      'remove submental fat to reveal a sharp cervicomental angle at approximately 90 degrees, tighten the submental skin envelope, create a crisp shadow line under the mandibular border, keep the chin projection and lower lip unchanged',
    credits_cost: 2, is_active: true, sort_order: 160 },

  // ── 肤质（4）─────────────────────────────────────────────────────
  { key: 'skin_lifting', category: '肤质', name: '紧致提拉',
    description: '面部更紧致', default_prompt:
      'tighten facial skin by gently smoothing the jowl line, sharpening the jawline definition, reducing nasolabial fold depth by 30%, and creating subtle upward tension on the midface, keep all facial features and proportions unchanged, only affect skin tightness',
    credits_cost: 2, is_active: true, sort_order: 170 },
  { key: 'nasolabial_fold', category: '肤质', name: '法令纹改善',
    description: '法令纹更浅', default_prompt:
      'soften the nasolabial folds by filling the sulcus depth at the alar base and mid-fold region, blend the fold shadow with surrounding cheek skin, reduce the crease depth by approximately 50%, keep the nasal alae and mouth corner position unchanged',
    credits_cost: 2, is_active: true, sort_order: 180 },
  { key: 'skin_whitening', category: '肤质', name: '美白提亮',
    description: '肤色更均匀', default_prompt:
      'brighten the overall facial skin tone by reducing melanin spots, evening out redness and sallowness, and adding a subtle luminous glow to the T-zone and cheek highlights, preserve the original skin undertone and ethnicity, do not bleach or over-expose',
    credits_cost: 2, is_active: true, sort_order: 190 },
  { key: 'pore_refine', category: '肤质', name: '毛孔细化',
    description: '皮肤更细腻', default_prompt:
      'reduce visible pore size across the nose, cheeks and chin by smoothing the skin micro-texture, eliminate enlarged pore shadows especially on the nose and perinasal area, maintain natural skin sheen and micro-reflections, do not blur or plasticize the skin surface',
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
