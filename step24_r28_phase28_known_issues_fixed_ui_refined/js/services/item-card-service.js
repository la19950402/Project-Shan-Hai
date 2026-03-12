import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { COLLECTIONS } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';
import { db } from './firebase.js?v=step24-r28-card-batch-workflow-20260312h';

function randomId(prefix = 'card') {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `${prefix}_${Array.from(bytes, (n) => chars[n % chars.length]).join('')}`;
}

export async function listItemCardPresets() {
  const qs = await getDocs(collection(db, COLLECTIONS.itemCards));
  return qs.docs
    .map((snap) => ({ id: snap.id, ...snap.data() }))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 50);
}

export async function getItemCardPresetById(id) {
  const safeId = String(id || '').trim();
  if (!safeId) throw new Error('缺少道具卡 id');
  const snap = await getDoc(doc(db, COLLECTIONS.itemCards, safeId));
  if (!snap.exists()) throw new Error('找不到道具卡');
  return { id: snap.id, ...snap.data() };
}

export async function saveItemCardPreset({
  id = null,
  name,
  mode,
  attrKey = null,
  amount = 0,
  statusKey = null,
  stacks = 1,
  reason = '',
  actorUid = null,
}) {
  const safeMode = String(mode || 'xp').trim() === 'debuff' ? 'debuff' : 'xp';
  const safeName = String(name || '').trim();
  const safeReason = String(reason || '').trim();
  if (!safeName) throw new Error('請輸入道具卡名稱');
  if (!safeReason) throw new Error('請輸入道具效果描述');
  if (safeMode === 'xp') {
    const safeAmount = Math.max(1, Number(amount) || 0);
    const safeAttr = String(attrKey || '').trim();
    if (!safeAttr) throw new Error('請選擇加分屬性');
    const cardId = String(id || randomId('item')).trim();
    const payload = {
      id: cardId,
      name: safeName,
      label: `${safeName}｜+${safeAmount} XP`,
      mode: 'xp',
      attrKey: safeAttr,
      amount: safeAmount,
      reason: safeReason,
      active: true,
      updatedAt: Date.now(),
      updatedBy: actorUid || null,
      serverUpdatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, COLLECTIONS.itemCards, cardId), payload, { merge: true });
    return payload;
  }

  const safeKey = String(statusKey || '').trim();
  const safeStacks = Math.max(1, Math.min(5, Number(stacks) || 1));
  if (!safeKey) throw new Error('請選擇負面狀態');
  const cardId = String(id || randomId('item')).trim();
  const payload = {
    id: cardId,
    name: safeName,
    label: `${safeName}｜${safeKey} x${safeStacks}`,
    mode: 'debuff',
    statusKey: safeKey,
    stacks: safeStacks,
    reason: safeReason,
    active: true,
    updatedAt: Date.now(),
    updatedBy: actorUid || null,
    serverUpdatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, COLLECTIONS.itemCards, cardId), payload, { merge: true });
  return payload;
}
