import { addDoc, collection, getDocs, limit, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { COLLECTIONS } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';
import { db } from './firebase.js?v=step24-r28-card-batch-workflow-20260312h';
import { applyDataMigration, saveStudentData, dedupeLogs } from './student-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { createPhysicalRewardVoucher, redeemVoucher, isVoucherActive } from '../domain/voucher.js?v=step24-r28-card-batch-workflow-20260312h';

function getGrowthStageKey(totalXP = 0) {
  const xp = Number(totalXP) || 0;
  if (xp >= 300) return 'adult-cat';
  if (xp >= 200) return 'young-cat';
  if (xp >= 100) return 'kitten-box';
  if (xp >= 10) return 'clean-box';
  return 'dusty-box';
}

function getSnapshotVisual(stageKey = '', attrs = {}) {
  const sorted = Object.entries(attrs || {}).sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0));
  const topAttr = String(sorted[0]?.[0] || 'metal').trim() || 'metal';
  const glyphMap = {
    metal: '金', wood: '木', water: '水', fire: '火', earth: '土',
  };
  const stageTitleMap = {
    'dusty-box': '佈滿灰塵的紙箱',
    'clean-box': '乾淨的紙箱',
    'kitten-box': '紙箱中的小貓',
    'young-cat': '青年小貓',
    'adult-cat': '成年貓',
  };
  return {
    stageKey,
    glyph: glyphMap[topAttr] || '獸',
    imageKey: `${stageKey}:${topAttr}`,
    visualTitle: stageTitleMap[stageKey] || '異獸展示',
    visualDescription: `以 ${topAttr} 為主要屬性的收藏快照。`,
  };
}

function createHiddenEggSnapshotRecord(student, item, source = 'shop_catalog_purchase') {
  const now = Date.now();
  const hiddenEggId = String(item.hiddenEggId || '').trim();
  if (!hiddenEggId) throw new Error('此隱藏蛋商品缺少 hiddenEggId');
  const attrs = typeof student?.attributes === 'object' && student?.attributes ? { ...student.attributes } : { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
  const totalXP = Number(student?.totalXP) || 0;
  const stageKey = getGrowthStageKey(totalXP);
  const visual = getSnapshotVisual(stageKey, attrs);
  return {
    type: 'hidden_egg',
    id: `${hiddenEggId}_${now}`,
    hiddenEggId,
    name: item.name,
    img: '',
    status: 'incubating',
    stats: attrs,
    timestamp: now,
    collectedAt: now,
    snapshotTotalXP: totalXP,
    stageKey,
    glyph: visual.glyph,
    imageKey: visual.imageKey,
    visualTitle: visual.visualTitle,
    visualDescription: visual.visualDescription,
    sourceItemId: item.id,
    sourceItemName: item.name,
    source,
  };
}


export async function buyPhysicalRewardForCurrentStudent(currentStudent, { itemId, itemName, price }, options = {}) {
  if (!currentStudent) throw new Error('尚未載入學生');
  const safeItemId = String(itemId || '').trim();
  const safeItemName = String(itemName || '').trim();
  const safePrice = Math.max(0, Number(price) || 0);
  if (!safeItemId) throw new Error('請輸入商品 ID');
  if (!safeItemName) throw new Error('請輸入商品名稱');
  if (safePrice <= 0) throw new Error('價格必須大於 0');

  const next = applyDataMigration(currentStudent);
  next.collection = Array.isArray(next.collection) ? next.collection : [];
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.coins = Number(next.coins) || 0;

  if (next.coins < safePrice) {
    throw new Error(`金幣不足，目前只有 ${next.coins}`);
  }

  const voucher = createPhysicalRewardVoucher({
    itemId: safeItemId,
    itemName: safeItemName,
    serial: next.serial || next.card_seq,
    price: safePrice,
  });

  next.coins -= safePrice;
  next.collection.push(voucher);
  next.logs.push({
    log_id: `shop_purchase:${voucher.voucherId}`,
    timestamp: Date.now(),
    action_type: 'shop_purchase',
    detail: `[商城] 購買實體商品 ${safeItemName} -${safePrice} 金幣，已生成憑證 ${voucher.voucherId}`,
  });
  next.logs = dedupeLogs(next.logs);

  return saveStudentData(next, { ...options, source: 'shop_purchase', refreshAfterSave: true });
}



export async function giftPhysicalRewardForCurrentStudent(currentStudent, { itemId, itemName, price }, options = {}) {
  if (!currentStudent) throw new Error('尚未載入學生');
  const safeItemId = String(itemId || '').trim();
  const safeItemName = String(itemName || '').trim();
  const safePrice = Math.max(0, Number(price) || 0);
  if (!safeItemId) throw new Error('請輸入商品 ID');
  if (!safeItemName) throw new Error('請輸入商品名稱');

  const next = applyDataMigration(currentStudent);
  next.collection = Array.isArray(next.collection) ? next.collection : [];
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.coins = Number(next.coins) || 0;

  const voucher = createPhysicalRewardVoucher({
    itemId: safeItemId,
    itemName: safeItemName,
    serial: next.serial || next.card_seq,
    price: safePrice,
  });

  next.collection.push(voucher);
  next.lastVoucherId = voucher.voucherId;
  next.logs.push({
    log_id: `teacher_shop_grant:${voucher.voucherId}`,
    timestamp: Date.now(),
    action_type: 'teacher_shop_grant',
    detail: `[教師贈送] 免費贈送實體商品 ${safeItemName}${safePrice > 0 ? `（原定價 ${safePrice} 金幣）` : ''}，已生成憑證 ${voucher.voucherId}`,
  });
  next.logs = dedupeLogs(next.logs);

  return saveStudentData(next, { ...options, source: 'teacher_shop_grant', refreshAfterSave: true });
}
export async function redeemVoucherForCurrentStudent(currentStudent, voucherId, options = {}) {
  if (!currentStudent) throw new Error('尚未載入學生');
  const safeVoucherId = String(voucherId || '').trim();
  if (!safeVoucherId) throw new Error('請輸入 voucherId');

  const next = applyDataMigration(currentStudent);
  next.collection = Array.isArray(next.collection) ? next.collection : [];
  next.logs = Array.isArray(next.logs) ? next.logs : [];

  const idx = next.collection.findIndex((item) => item?.type === 'voucher' && item?.voucherId === safeVoucherId);
  if (idx < 0) throw new Error('找不到指定憑證');

  const currentVoucher = next.collection[idx];
  if (!isVoucherActive(currentVoucher)) {
    throw new Error('這張憑證不是有效狀態');
  }

  next.collection[idx] = redeemVoucher(currentVoucher, { teacherUid: options?.teacherUid || null });
  next.logs.push({
    log_id: `voucher_redeem:${safeVoucherId}`,
    timestamp: Date.now(),
    action_type: 'voucher_redeem',
    detail: `[教師兌現] 憑證 ${safeVoucherId} 已兌現`,
  });
  next.logs = dedupeLogs(next.logs);

  return saveStudentData(next, { ...options, source: 'voucher_redeem', refreshAfterSave: true });
}


function normalizeShopCatalogRow(id, row = {}) {
  const effectType = String(row.effectType || row.type || row.effect || (row.voucherOnly ? 'physical_reward' : 'physical_reward')).trim() || 'physical_reward';
  const quantity = row.quantity === null || row.quantity === undefined || row.quantity === '' ? null : Math.max(0, Number(row.quantity) || 0);
  return {
    id: String(id || row.id || '').trim(),
    name: String(row.name || row.title || '').trim() || '未命名商品',
    price: Math.max(0, Number(row.price ?? row.cost) || 0),
    cost: Math.max(0, Number(row.cost ?? row.price) || 0),
    description: String(row.description || row.desc || '').trim(),
    desc: String(row.desc || row.description || '').trim(),
    active: row.active !== false,
    quantity,
    minGrade: String(row.minGrade || '').trim(),
    requiredTitle: String(row.requiredTitle || '').trim(),
    voucherOnly: row.voucherOnly !== false,
    effectType,
    hiddenEggId: String(row.hiddenEggId || '').trim(),
    updatedAt: Number(row.updatedAt) || Number(row.timestamp) || 0,
    builtIn: row.builtIn === true,
  };
}

function parseGradeNumber(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function canStudentUseShopItem(student, item) {
  if (!item || item.active === false) return { ok: false, reason: '商品未上架' };
  if (item.quantity !== null && item.quantity !== undefined && Number(item.quantity) <= 0) return { ok: false, reason: '商品已售罄' };
  const itemGrade = parseGradeNumber(item.minGrade);
  const studentGrade = parseGradeNumber(student?.grade || student?.gradeLabel || '');
  if (itemGrade && studentGrade && studentGrade < itemGrade) return { ok: false, reason: `需 ${item.minGrade} 以上` };
  if (String(item.requiredTitle || '').trim()) {
    const title = String(student?.title || student?.current_title || '').trim();
    if (title !== String(item.requiredTitle || '').trim()) return { ok: false, reason: `需稱號 ${item.requiredTitle}` };
  }
  return { ok: true, reason: '可發放' };
}

export async function listTeacherShopCatalogForStudent(currentStudent) {
  const qs = await getDocs(query(collection(db, COLLECTIONS.shopCatalog), orderBy('updatedAt', 'desc'), limit(100)));
  const student = applyDataMigration(currentStudent || {});
  return qs.docs.map((snap) => {
    const item = normalizeShopCatalogRow(snap.id, snap.data());
    const rule = canStudentUseShopItem(student, item);
    return { ...item, allowed: rule.ok, blockedReason: rule.reason };
  });
}

export async function buyShopCatalogItemForCurrentStudent(currentStudent, itemMeta, options = {}) {
  if (!currentStudent) throw new Error('尚未載入學生');
  const item = normalizeShopCatalogRow(itemMeta?.id, itemMeta || {});
  if (!item.id) throw new Error('缺少商品 ID');
  const next = applyDataMigration(currentStudent);
  next.collection = Array.isArray(next.collection) ? next.collection : [];
  next.hidden_eggs = Array.isArray(next.hidden_eggs) ? next.hidden_eggs : [];
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.attributes = typeof next.attributes === 'object' && next.attributes ? next.attributes : { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
  next.coins = Number(next.coins) || 0;

  const eligibility = canStudentUseShopItem(next, item);
  if (!eligibility.ok) throw new Error(eligibility.reason);
  if (next.coins < item.price) throw new Error(`金幣不足，目前只有 ${next.coins}`);

  next.coins -= item.price;
  let outcome = { effectType: item.effectType, itemName: item.name, price: item.price };

  if (item.effectType === 'physical_reward') {
    const voucher = createPhysicalRewardVoucher({
      itemId: item.id,
      itemName: item.name,
      serial: next.serial || next.card_seq,
      price: item.price,
    });
    next.collection.push(voucher);
    next.lastVoucherId = voucher.voucherId;
    outcome.voucherId = voucher.voucherId;
  } else if (item.effectType === 'hidden_egg') {
    const eggRecord = createHiddenEggSnapshotRecord(next, item, 'shop_catalog_purchase');
    const hiddenEggId = String(eggRecord.hiddenEggId || '').trim();
    next.hidden_eggs.push(eggRecord);
    next.collection.push({ ...eggRecord });
    if (!String(next.active_hidden_egg_id || '').trim()) {
      next.active_hidden_egg_id = hiddenEggId;
      next.active_hidden_egg = { ...eggRecord, status: 'active', activatedAt: Date.now() };
    }
    outcome.hiddenEggId = hiddenEggId;
  } else if (item.effectType === 'antidote') {
    next.debuffs = {};
  } else if (item.effectType === 'evo_stone') {
    next.totalXP = Number(next.totalXP) || 0;
    next.totalXP += 30;
  } else if (item.effectType === 'wonder_stone') {
    next.collection.push({ type: 'material', name: item.name, itemId: item.id, timestamp: Date.now() });
  }

  next.logs.push({
    log_id: `shop_catalog_purchase:${item.id}:${Date.now()}`,
    timestamp: Date.now(),
    action_type: 'shop_purchase',
    detail: `[商城] 購買 ${item.name} -${item.price} 金幣${outcome.voucherId ? `，已生成憑證 ${outcome.voucherId}` : ''}${outcome.hiddenEggId ? `，已加入隱藏蛋 ${outcome.hiddenEggId}` : ''}`,
  });
  next.logs = dedupeLogs(next.logs);

  const saved = await saveStudentData(next, { ...options, source: 'shop_catalog_purchase', refreshAfterSave: true });
  return { ...saved, shopOutcome: outcome };
}

export async function grantShopCatalogItemToCurrentStudent(currentStudent, itemMeta, options = {}) {
  if (!currentStudent) throw new Error('尚未載入學生');
  const item = normalizeShopCatalogRow(itemMeta?.id, itemMeta || {});
  if (!item.id) throw new Error('缺少商品 ID');
  const next = applyDataMigration(currentStudent);
  next.collection = Array.isArray(next.collection) ? next.collection : [];
  next.hidden_eggs = Array.isArray(next.hidden_eggs) ? next.hidden_eggs : [];
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.attributes = typeof next.attributes === 'object' && next.attributes ? next.attributes : { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
  next.coins = Number(next.coins) || 0;

  const eligibility = canStudentUseShopItem(next, item);
  if (!eligibility.ok) throw new Error(eligibility.reason);

  let outcome = { effectType: item.effectType, itemName: item.name, price: item.price, grantMode: 'teacher_free' };

  if (item.effectType === 'physical_reward') {
    const voucher = createPhysicalRewardVoucher({
      itemId: item.id,
      itemName: item.name,
      serial: next.serial || next.card_seq,
      price: item.price,
    });
    next.collection.push(voucher);
    next.lastVoucherId = voucher.voucherId;
    outcome.voucherId = voucher.voucherId;
  } else if (item.effectType === 'hidden_egg') {
    const eggRecord = createHiddenEggSnapshotRecord(next, item, 'teacher_shop_grant');
    const hiddenEggId = String(eggRecord.hiddenEggId || '').trim();
    next.hidden_eggs.push(eggRecord);
    next.collection.push({ ...eggRecord });
    if (!String(next.active_hidden_egg_id || '').trim()) {
      next.active_hidden_egg_id = hiddenEggId;
      next.active_hidden_egg = { ...eggRecord, status: 'active', activatedAt: Date.now() };
    }
    outcome.hiddenEggId = hiddenEggId;
  } else if (item.effectType === 'antidote') {
    next.debuffs = {};
  } else if (item.effectType === 'evo_stone') {
    next.totalXP = Number(next.totalXP) || 0;
    next.totalXP += 30;
  } else if (item.effectType === 'wonder_stone') {
    next.collection.push({ type: 'material', name: item.name, itemId: item.id, timestamp: Date.now(), source: 'teacher_shop_grant' });
  }

  next.logs.push({
    log_id: `teacher_shop_grant:${item.id}:${Date.now()}`,
    timestamp: Date.now(),
    action_type: 'teacher_shop_grant',
    detail: `[教師贈送] 免費給予 ${item.name}${outcome.voucherId ? `，已生成憑證 ${outcome.voucherId}` : ''}${outcome.hiddenEggId ? `，已加入隱藏蛋 ${outcome.hiddenEggId}` : ''}${item.price ? `（原定價 ${item.price} 金幣）` : ''}`,
  });
  next.logs = dedupeLogs(next.logs);

  const saved = await saveStudentData(next, { ...options, source: 'teacher_shop_grant', refreshAfterSave: true });
  return { ...saved, shopOutcome: outcome };
}


export async function activateHiddenEggForCurrentStudent(currentStudent, hiddenEggRecordId, options = {}) {
  if (!currentStudent) throw new Error('尚未載入學生');
  const safeRecordId = String(hiddenEggRecordId || '').trim();
  if (!safeRecordId) throw new Error('請先選擇一顆隱藏蛋');

  const next = applyDataMigration(currentStudent);
  next.hidden_eggs = Array.isArray(next.hidden_eggs) ? next.hidden_eggs : [];
  next.collection = Array.isArray(next.collection) ? next.collection : [];
  next.logs = Array.isArray(next.logs) ? next.logs : [];

  const egg = next.hidden_eggs.find((row) => String(row?.id || '').trim() === safeRecordId)
    || next.collection.find((row) => row?.type === 'hidden_egg' && String(row?.id || '').trim() === safeRecordId);
  if (!egg) throw new Error('找不到指定的隱藏蛋');

  next.active_hidden_egg_id = String(egg.hiddenEggId || egg.id || '').trim();
  next.active_hidden_egg = {
    ...egg,
    status: 'active',
    activatedAt: Date.now(),
  };

  next.hidden_eggs = next.hidden_eggs.map((row) => {
    if (String(row?.id || '').trim() !== safeRecordId) return row;
    return { ...row, status: 'active', activatedAt: Date.now() };
  });
  next.collection = next.collection.map((row) => {
    if (row?.type !== 'hidden_egg' || String(row?.id || '').trim() !== safeRecordId) return row;
    return { ...row, status: 'active', activatedAt: Date.now() };
  });

  next.logs.push({
    log_id: `hidden_egg_activate:${safeRecordId}:${Date.now()}`,
    timestamp: Date.now(),
    action_type: 'hidden_egg_activate',
    detail: `[學生前台] 啟用隱藏蛋 ${egg.name || egg.hiddenEggId || safeRecordId}`,
  });
  next.logs = dedupeLogs(next.logs);

  const saved = await saveStudentData(next, { ...options, source: 'hidden_egg_activate', refreshAfterSave: true });
  return { ...saved, activeHiddenEgg: next.active_hidden_egg };
}
