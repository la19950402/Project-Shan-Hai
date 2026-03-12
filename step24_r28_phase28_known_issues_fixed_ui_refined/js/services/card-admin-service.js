import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  limit,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { COLLECTIONS } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';
import { db } from './firebase.js?v=step24-r28-card-batch-workflow-20260312h';
import { applyDataMigration, fetchStudentBySerial, saveStudentData, getActiveTokenForSerial } from './student-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { normalizeSerial } from '../domain/serial.js?v=step24-r28-card-batch-workflow-20260312h';

function randomToken(length = 16) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (n) => chars[n % chars.length]).join('');
}

function cleanNtag(raw) {
  return String(raw || '').trim();
}

function buildTokenLog(detail, now = Date.now()) {
  return {
    log_id: `token_admin:${now}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    action_type: 'token_admin',
    points_added: 0,
    detail,
  };
}

async function listTokensBySerial(serial) {
  const qs = await getDocs(query(collection(db, COLLECTIONS.tokens), where('serial', '==', serial)));
  return qs.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
}

async function cloneStudentPageForToken(student, token, extras = {}) {
  await setDoc(doc(db, COLLECTIONS.studentPages, token), {
    ...applyDataMigration(student),
    serial: student.serial,
    card_seq: student.serial,
    active_token: token,
    page_token: token,
    ...extras,
    serverUpdatedAt: serverTimestamp(),
  }, { merge: true });
}


async function ensureSerialAvailable(serial) {
  try {
    const existing = await fetchStudentBySerial(serial);
    if (existing?.serial) throw new Error(`卡序 ${serial} 已存在，請更換新的卡序`);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (/找不到學生/.test(message)) return;
    throw error;
  }
}

async function ensureNtagAvailable(ntagId) {
  const safeNtag = cleanNtag(ntagId);
  if (!safeNtag) throw new Error('請先讀取或輸入新卡 UID / NTAG');
  const tokenHit = await getDocs(query(collection(db, COLLECTIONS.tokens), where('ntagId', '==', safeNtag), limit(1)));
  if (!tokenHit.empty) throw new Error(`此 UID / NTAG 已被綁定：${safeNtag}`);
  const studentHit = await getDocs(query(collection(db, COLLECTIONS.students), where('last_bound_ntag', '==', safeNtag), limit(1)));
  if (!studentHit.empty) throw new Error(`此 UID / NTAG 已存在於學生主檔：${safeNtag}`);
}

function createEmptyStudentRecord({ serial, grade, className = '', displayName = '', actorUid = null, token = '', ntagId = '' } = {}) {
  const now = Date.now();
  const safeDisplay = String(displayName || '').trim();
  const safeName = safeDisplay || `學生${serial}`;
  const safeClass = String(className || '').trim();
  const safeGrade = String(grade || '').trim();
  const safeToken = String(token || '').trim();
  const safeNtag = cleanNtag(ntagId);
  return applyDataMigration({
    serial,
    card_seq: serial,
    name: safeName,
    display_name: safeDisplay || safeName,
    nickname: safeDisplay || safeName,
    grade: safeGrade,
    class_name: safeClass,
    totalXP: 0,
    coins: 0,
    title: '新手',
    current_title: '新手',
    avatar_state: 'egg',
    guide_mode: 'cat',
    guide_mode_locked: true,
    active_token: safeToken || null,
    page_token: safeToken || null,
    last_bound_ntag: safeNtag || null,
    attributes: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
    debuffs: {},
    learning_issues: [],
    reward_events: [],
    reward_settled_ids: [],
    logs: [
      buildTokenLog(`[卡務] 建立新卡 / 發卡｜serial：${serial}｜grade：${safeGrade}${safeClass ? `｜class：${safeClass}` : ''}${safeNtag ? `｜ntag：${safeNtag}` : ''}${actorUid ? `｜teacher：${actorUid}` : ''}`, now),
    ],
    createdAt: now,
    updatedAt: now,
  });
}

export async function registerNewStudentCard({
  serial: rawSerial,
  grade = '',
  className = '',
  displayName = '',
  ntagId = '',
  actorUid = null,
  reason = '老師註冊新卡 / 發卡',
} = {}) {
  const serial = normalizeSerial(rawSerial);
  if (!serial) throw new Error('請先輸入新卡卡序 / serial');
  const safeGrade = String(grade || '').trim();
  if (!safeGrade) throw new Error('請先輸入學生年級，供後續題庫分發使用');
  const safeNtag = cleanNtag(ntagId);
  if (!safeNtag) throw new Error('請先讀取或輸入新卡 UID / NTAG');

  await ensureSerialAvailable(serial);
  await ensureNtagAvailable(safeNtag);

  const newToken = randomToken(16);
  const now = Date.now();
  const student = createEmptyStudentRecord({
    serial,
    grade: safeGrade,
    className,
    displayName,
    actorUid,
    token: newToken,
    ntagId: safeNtag,
  });

  await setDoc(doc(db, COLLECTIONS.tokens, newToken), {
    serial,
    active: true,
    issuedAt: now,
    issuedBy: actorUid || null,
    ntagId: safeNtag,
    issueReason: reason,
    createdBy: actorUid || null,
    serverUpdatedAt: serverTimestamp(),
  }, { merge: true });

  const saved = await saveStudentData(student, {
    token: newToken,
    source: 'card_new_registration',
    refreshAfterSave: true,
  });
  await cloneStudentPageForToken(saved, newToken, { token_status: 'active' });

  return {
    ok: true,
    serial,
    grade: safeGrade,
    className: String(className || '').trim() || '',
    studentName: saved.name || `學生${serial}`,
    ntagId: safeNtag,
    token: newToken,
    student: saved,
  };
}

export async function getStudentTokenSummary(rawSerial) {
  const serial = normalizeSerial(rawSerial);
  if (!serial) throw new Error('卡序格式不正確');
  const student = await fetchStudentBySerial(serial);
  const tokens = await listTokensBySerial(serial);
  const activeToken = student.active_token || student.page_token || (await getActiveTokenForSerial(serial)) || null;
  return {
    serial,
    student,
    activeToken,
    tokens: tokens.sort((a, b) => Number(b.issuedAt || 0) - Number(a.issuedAt || 0)),
  };
}

export async function reissueStudentToken(rawSerial, {
  actorUid = null,
  ntagId = '',
  reason = '老師補發 token',
  deactivateExisting = true,
} = {}) {
  const serial = normalizeSerial(rawSerial);
  if (!serial) throw new Error('卡序格式不正確');
  const student = await fetchStudentBySerial(serial);
  const oldTokens = await listTokensBySerial(serial);
  const oldActive = student.active_token || student.page_token || oldTokens.find((item) => item.active !== false)?.id || null;
  const newToken = randomToken(16);
  const now = Date.now();
  const safeNtag = cleanNtag(ntagId);
  const oldUid = cleanNtag(student.last_bound_ntag || student.uid || '');

  if (safeNtag) {
    if (oldUid && safeNtag === oldUid) throw new Error('偵測到同一張舊卡，請改用新卡完成補發 / 重綁');
    await ensureNtagAvailable(safeNtag);
  }

  if (deactivateExisting) {
    await Promise.all(oldTokens.map((item) => setDoc(doc(db, COLLECTIONS.tokens, item.id), {
      active: false,
      replacedBy: newToken,
      revokedAt: now,
      revokedBy: actorUid || null,
      revokeReason: reason,
      serverUpdatedAt: serverTimestamp(),
    }, { merge: true })));
  }

  await setDoc(doc(db, COLLECTIONS.tokens, newToken), {
    serial,
    active: true,
    issuedAt: now,
    issuedBy: actorUid || null,
    ntagId: safeNtag || null,
    prevToken: oldActive,
    issueReason: reason,
    serverUpdatedAt: serverTimestamp(),
  }, { merge: true });

  if (oldUid && safeNtag && oldUid !== safeNtag) {
    await setDoc(doc(db, COLLECTIONS.cards, oldUid), {
      serial,
      active: false,
      revokedAt: now,
      revokedBy: actorUid || null,
      replacedBy: safeNtag,
      replacedToken: newToken,
      serverUpdatedAt: serverTimestamp(),
    }, { merge: true });
  }

  if (safeNtag) {
    await setDoc(doc(db, COLLECTIONS.cards, safeNtag), {
      serial,
      active: true,
      createdAt: now,
      issuedBy: actorUid || null,
      replacedUid: oldUid || null,
      token: newToken,
      serverUpdatedAt: serverTimestamp(),
    }, { merge: true });
  }

  const next = applyDataMigration(student);
  next.active_token = newToken;
  next.page_token = newToken;
  if (safeNtag) {
    next.last_bound_ntag = safeNtag;
    next.uid = safeNtag;
  }
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.logs.push(buildTokenLog(`[卡務] ${reason}｜舊 token：${oldActive || '無'}｜新 token：${newToken}${oldUid ? `｜舊卡：${oldUid}` : ''}${safeNtag ? `｜新卡：${safeNtag}` : ''}`, now));
  if (next.logs.length > 200) next.logs = next.logs.slice(-200);

  const saved = await saveStudentData(next, {
    token: newToken,
    source: 'card_token_reissue',
    refreshAfterSave: true,
  });
  await cloneStudentPageForToken(saved, newToken, { token_status: 'active', replaced_uid: oldUid || null });

  return {
    ok: true,
    serial,
    studentName: saved.name || '未命名學生',
    oldToken: oldActive,
    newToken,
    oldUid: oldUid || null,
    ntagId: safeNtag || null,
    deactivatedCount: deactivateExisting ? oldTokens.length : 0,
    student: saved,
  };
}

export async function deactivateStudentToken(rawSerial, rawToken, { actorUid = null, reason = '老師停用舊卡 / token' } = {}) {
  const serial = normalizeSerial(rawSerial);
  const token = String(rawToken || '').trim();
  if (!serial) throw new Error('卡序格式不正確');
  if (!token) throw new Error('缺少要停用的 token');

  const tokenSnap = await getDoc(doc(db, COLLECTIONS.tokens, token));
  if (!tokenSnap.exists()) throw new Error('找不到指定 token');

  const data = tokenSnap.data() || {};
  const tokenSerial = normalizeSerial(data.serial || data.card_seq || data.cardSeq);
  if (tokenSerial && tokenSerial !== serial) throw new Error('token 與學生卡序不一致');

  const now = Date.now();
  await setDoc(doc(db, COLLECTIONS.tokens, token), {
    active: false,
    revokedAt: now,
    revokedBy: actorUid || null,
    revokeReason: reason,
    serverUpdatedAt: serverTimestamp(),
  }, { merge: true });

  const student = await fetchStudentBySerial(serial);
  const next = applyDataMigration(student);
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.logs.push(buildTokenLog(`[卡務] ${reason}｜停用 token：${token}`, now));
  if ((next.active_token || next.page_token) === token) {
    next.active_token = null;
    next.page_token = null;
  }
  if (next.logs.length > 200) next.logs = next.logs.slice(-200);
  const saved = await saveStudentData(next, {
    token: null,
    source: 'card_token_deactivate',
    refreshAfterSave: true,
  });

  return {
    ok: true,
    serial,
    token,
    studentName: saved.name || '未命名學生',
    student: saved,
  };
}

export async function bindNtagToActiveToken(rawSerial, rawNtagId, { actorUid = null } = {}) {
  const serial = normalizeSerial(rawSerial);
  const ntagId = cleanNtag(rawNtagId);
  if (!serial) throw new Error('卡序格式不正確');
  if (!ntagId) throw new Error('請輸入新的 ntag / NFC 識別');

  const token = await getActiveTokenForSerial(serial);
  if (!token) throw new Error('此學生目前沒有可綁定的 active token，請先補發或發卡');

  const now = Date.now();
  await setDoc(doc(db, COLLECTIONS.tokens, token), {
    serial,
    active: true,
    ntagId,
    boundAt: now,
    boundBy: actorUid || null,
    serverUpdatedAt: serverTimestamp(),
  }, { merge: true });

  const student = await fetchStudentBySerial(serial);
  const next = applyDataMigration(student);
  next.last_bound_ntag = ntagId;
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.logs.push(buildTokenLog(`[卡務] 綁定新 ntag｜token：${token}｜ntag：${ntagId}`, now));
  if (next.logs.length > 200) next.logs = next.logs.slice(-200);
  const saved = await saveStudentData(next, {
    token,
    source: 'card_ntag_bind',
    refreshAfterSave: true,
  });

  return {
    ok: true,
    serial,
    token,
    ntagId,
    studentName: saved.name || '未命名學生',
    student: saved,
  };
}
