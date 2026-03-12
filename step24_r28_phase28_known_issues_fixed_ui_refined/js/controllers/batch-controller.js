import { APP_CONFIG } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';
import { batchState, currentState, setBatchSummary, setUiBusy, markUiSynced, resetBatchRuntimeState } from '../state.js?v=step24-r28-card-batch-workflow-20260312h';
import { fetchStudentBySerial, saveStudentData, refreshCurrentStudent, getActiveTokenForSerial, fetchValidationSnapshot } from '../services/student-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { normalizeSerial } from '../domain/serial.js?v=step24-r28-card-batch-workflow-20260312h';
import { buildTeacherScorePayload, applyTeacherScore, applyTeacherStatus, buildTeacherStatusPayload, buildBatchCardEffect, BATCH_CARD_PRESETS, hasTeacherRewardPersistence, buildTeacherPersistenceTrailLabel } from '../domain/reward.js?v=step24-r28-card-batch-workflow-20260312h';
import { getItemCardPresetById } from '../services/item-card-service.js?v=step24-r28-card-batch-workflow-20260312h';


function buildBatchStudentSnapshot(student = {}) {
  const debuffs = typeof student?.debuffs === 'object' && student?.debuffs ? student.debuffs : {};
  const statusText = Object.entries(debuffs).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${key}x${Number(value)}`).join('、') || '健康';
  return {
    serial: normalizeSerial(student?.serial || student?.card_seq),
    name: student?.name || '未命名學生',
    grade: student?.grade || student?.class_name || '-',
    title: student?.title || student?.current_title || '未設定',
    totalXP: Number(student?.totalXP) || 0,
    coins: Number(student?.coins) || 0,
    statusText,
  };
}

function pushBatchHistory(entry = {}) {
  const list = Array.isArray(batchState.sessionHistory) ? batchState.sessionHistory.slice(-11) : [];
  list.push({ at: Date.now(), ...entry });
  batchState.sessionHistory = list.slice(-12);
}

export async function resolveBatchEffectFromScanKey(rawKey) {
  const safeKey = String(rawKey || '').trim();
  if (!safeKey) return null;
  for (const mode of ['xp', 'debuff']) {
    const list = BATCH_CARD_PRESETS[mode] || [];
    const found = list.find((item) => item.key === safeKey);
    if (found) return { mode, ...found };
  }
  if (safeKey.startsWith('custom:')) {
    const custom = await getItemCardPresetById(safeKey.slice(7));
    if (custom.active === false) throw new Error('此自訂道具卡已停用');
    return { ...custom, key: custom.id, mode: custom.mode || 'xp' };
  }
  if (/^item[_-]/i.test(safeKey)) {
    const custom = await getItemCardPresetById(safeKey);
    if (custom.active === false) throw new Error('此自訂道具卡已停用');
    return { ...custom, key: custom.id, mode: custom.mode || 'xp' };
  }
  return null;
}


function verifyBatchPersistence(beforeStudent, afterStudent, effect = {}) {
  const before = beforeStudent || {};
  const after = afterStudent || {};
  if (effect.mode === 'debuff') {
    const beforeStacks = Number(before?.debuffs?.[effect.statusKey] || 0) || 0;
    const afterStacks = Number(after?.debuffs?.[effect.statusKey] || 0) || 0;
    const expectedStacks = beforeStacks + Number(effect.stacks || 0);
    if (afterStacks !== expectedStacks) throw new Error(`批量回讀驗證失敗：${effect.statusKey} 預期 ${expectedStacks}，實際 ${afterStacks}`);
    const hasIssue = Array.isArray(after?.learning_issues) && after.learning_issues.some((item) => item?.statusKey === effect.statusKey && String(item?.reason || '').includes(effect.reason || ''));
    if (!hasIssue) throw new Error('批量回讀驗證失敗：learning_issues 未同步寫入');
    const match = hasTeacherRewardPersistence(after, {
      type: 'teacher_status',
      reason: effect.reason || effect.statusKey,
      statusKey: effect.statusKey,
      stacks: effect.stacks,
      sourcePrefix: 'batch_',
    });
    if (!match.matched) throw new Error('批量回讀驗證失敗：teacher_status 未同步寫入 reward_events / logs');
    return ['寫入驗證：成功', `${effect.statusKey}：${beforeStacks} -> ${afterStacks}`, 'learning_issues：已同步寫入', `事件紀錄：已同步寫入 ${buildTeacherPersistenceTrailLabel(match)}`];
  }

  const beforeXp = Number(before?.totalXP || 0) || 0;
  const afterXp = Number(after?.totalXP || 0) || 0;
  const expectedXp = beforeXp + Number(effect.amount || 0);
  if (afterXp !== expectedXp) throw new Error(`批量回讀驗證失敗：totalXP 預期 ${expectedXp}，實際 ${afterXp}`);
  const beforeAttr = Number(before?.attributes?.[effect.attrKey] || 0) || 0;
  const afterAttr = Number(after?.attributes?.[effect.attrKey] || 0) || 0;
  const expectedAttr = beforeAttr + Number(effect.amount || 0);
  if (afterAttr !== expectedAttr) throw new Error(`批量回讀驗證失敗：${effect.attrKey} 預期 ${expectedAttr}，實際 ${afterAttr}`);
  const match = hasTeacherRewardPersistence(after, {
    type: 'teacher_score',
    reason: effect.reason || effect.attrKey,
    attrKey: effect.attrKey,
    amount: effect.amount,
    sourcePrefix: 'batch_',
  });
  if (!match.matched) throw new Error('批量回讀驗證失敗：teacher_score 未同步寫入 reward_events / logs');
  return ['寫入驗證：成功', `totalXP：${beforeXp} -> ${afterXp}`, `${effect.attrKey}：${beforeAttr} -> ${afterAttr}`, `事件紀錄：已同步寫入 ${buildTeacherPersistenceTrailLabel(match)}`];
}

function sanitizeSerialList(serialList = []) {
  const seen = new Set();
  const clean = [];
  for (const raw of serialList) {
    const serial = normalizeSerial(raw);
    if (!serial) continue;
    if (seen.has(serial)) continue;
    seen.add(serial);
    clean.push(serial);
  }
  return clean;
}

export function startBatchStudentSession(student, { token = null } = {}) {
  const serial = normalizeSerial(student?.serial || student?.card_seq);
  if (!serial) throw new Error('批量模式缺少學生卡序');
  const comboMap = (batchState.comboCountBySerial && typeof batchState.comboCountBySerial === 'object')
    ? batchState.comboCountBySerial
    : (batchState.comboCountBySerial = {});
  batchState.activeStudentSerial = serial;
  batchState.activeStudentName = student?.name || '未命名學生';
  batchState.activeToken = token || student?.active_token || student?.page_token || null;
  batchState.timeLeftMs = APP_CONFIG.batchWindowMs;
  batchState.comboCount = Number(comboMap[serial]) || 0;
  batchState.lastAppliedAt = Date.now();
  batchState.lastCardEffect = null;
  batchState.activeStudentSnapshot = buildBatchStudentSnapshot(student);
  batchState.scanModeEnabled = true;
  batchState.waitingFor = 'reward';
  batchState.lastScanSource = 'student';
  pushBatchHistory({ type: 'student_cycle', serial, studentName: batchState.activeStudentName, token: batchState.activeToken });
  return {
    serial,
    studentName: batchState.activeStudentName,
    timeLeftMs: batchState.timeLeftMs,
    comboCount: batchState.comboCount,
  };
}

export function getBatchSessionSnapshot(now = Date.now()) {
  if (!batchState.activeStudentSerial || !batchState.lastAppliedAt) {
    return { active: false, expired: true, timeLeftMs: 0, comboCount: batchState.comboCount || 0 };
  }
  const elapsed = Math.max(0, now - batchState.lastAppliedAt);
  const timeLeftMs = Math.max(0, APP_CONFIG.batchWindowMs - elapsed);
  batchState.timeLeftMs = timeLeftMs;
  return {
    active: timeLeftMs > 0,
    expired: timeLeftMs <= 0,
    timeLeftMs,
    comboCount: batchState.comboCount || 0,
    serial: batchState.activeStudentSerial,
    studentName: batchState.activeStudentName,
    effect: batchState.lastCardEffect,
    snapshot: batchState.activeStudentSnapshot,
    history: Array.isArray(batchState.sessionHistory) ? batchState.sessionHistory.slice() : [],
    scanModeEnabled: Boolean(batchState.scanModeEnabled),
    waitingFor: batchState.waitingFor || 'student',
    lastScanSource: batchState.lastScanSource || null,
  };
}

export function touchBatchStudentSession(now = Date.now()) {
  const snapshot = getBatchSessionSnapshot(now);
  if (!snapshot.serial || snapshot.expired) return snapshot;
  batchState.lastAppliedAt = Number(now) || Date.now();
  batchState.timeLeftMs = APP_CONFIG.batchWindowMs;
  return getBatchSessionSnapshot(Number(now) || Date.now());
}

export function resetBatchStudentSession() {
  resetBatchRuntimeState();
}

async function resolveBatchCardEffect({ mode = 'xp', presetKey = '' }) {
  const safeKey = String(presetKey || '').trim();
  if (safeKey.startsWith('custom:')) {
    const custom = await getItemCardPresetById(safeKey.slice(7));
    if (custom.active === false) throw new Error('此自訂道具卡已停用');
    return { ...custom, key: custom.id, mode: custom.mode || mode };
  }
  return buildBatchCardEffect({ mode, presetKey });
}

export async function applyBatchCardToActiveStudent({ mode = 'xp', presetKey = '', effectOverride = null }) {
  const snapshot = getBatchSessionSnapshot();
  if (!snapshot.serial || snapshot.expired) {
    resetBatchStudentSession();
    throw new Error('批量掃描視窗已過期，請先重新感應學生卡');
  }

  const student = await fetchStudentBySerial(snapshot.serial);
  const beforeStudent = JSON.parse(JSON.stringify(student || {}));
  const token = batchState.activeToken || await getActiveTokenForSerial(snapshot.serial) || null;
  const effect = effectOverride || await resolveBatchCardEffect({ mode, presetKey });
  let next;
  if (effect.mode === 'xp') {
    const payload = buildTeacherScorePayload({ student, reason: effect.reason, amount: effect.amount, attrKey: effect.attrKey });
    next = applyTeacherScore(student, payload, { source: `batch_${effect.mode}` });
  } else {
    const payload = buildTeacherStatusPayload({ student, statusKey: effect.statusKey, stacks: effect.stacks, reason: effect.reason });
    next = applyTeacherStatus(student, payload, { source: `batch_${effect.mode}` });
  }

  await saveStudentData(next, {
    token,
    source: `batch_scan_${effect.mode}`,
    setCurrent: currentState.currentSerial === snapshot.serial,
    refreshAfterSave: true,
  });
  const validation = await fetchValidationSnapshot({ serial: snapshot.serial, token });
  const saved = validation.merged;
  const persistenceChecks = verifyBatchPersistence(beforeStudent, validation.student || validation.merged, effect);

  const comboMap = (batchState.comboCountBySerial && typeof batchState.comboCountBySerial === 'object')
    ? batchState.comboCountBySerial
    : (batchState.comboCountBySerial = {});
  const serialKey = saved.serial || snapshot.serial;
  comboMap[serialKey] = Number(comboMap[serialKey]) + 1;
  batchState.comboCount = comboMap[serialKey];
  batchState.lastAppliedAt = Date.now();
  batchState.timeLeftMs = APP_CONFIG.batchWindowMs;
  batchState.lastCardEffect = effect;
  batchState.activeStudentName = saved.name || batchState.activeStudentName;
  batchState.scanModeEnabled = true;
  batchState.waitingFor = 'reward';
  batchState.lastScanSource = 'reward';
  batchState.activeStudentSnapshot = buildBatchStudentSnapshot(saved);
  pushBatchHistory({
    type: effect.mode === 'debuff' ? 'card_debuff' : 'card_xp',
    serial: saved.serial || snapshot.serial,
    studentName: saved.name || batchState.activeStudentName,
    effectLabel: effect.label || effect.reason || effect.statusKey || effect.key || '-',
    comboCount: batchState.comboCount,
  });

  return {
    ok: true,
    serial: saved.serial,
    studentName: saved.name || '未命名學生',
    effect,
    comboCount: batchState.comboCount,
    timeLeftMs: batchState.timeLeftMs,
    action: saved.lastTeacherAction,
    student: saved,
    persistenceChecks,
  };
}

export async function runBatchScore({ serialList, reason, amount, attrKey, onProgress }) {
  const results = [];
  const targetSerials = sanitizeSerialList(serialList);
  const originalSelection = {
    serial: currentState.currentSerial,
    token: currentState.currentToken,
  };

  batchState.isRunning = true;
  batchState.lastResult = [];
  setBatchSummary({ total: targetSerials.length, success: 0, failed: 0, skipped: 0 });
  setUiBusy(true, '批量加分執行中');

  let success = 0;
  let failed = 0;
  let skipped = 0;

  try {
    for (const serial of targetSerials) {
      try {
        const student = await fetchStudentBySerial(serial);
        const beforeStudent = JSON.parse(JSON.stringify(student || {}));
        const payload = buildTeacherScorePayload({
          student,
          reason,
          amount,
          attrKey,
        });
        const next = applyTeacherScore(student, payload, { source: 'batch_score' });
        const token = student.active_token || student.page_token || null;
        await saveStudentData(next, {
          token,
          source: 'batch_score',
          setCurrent: false,
          refreshAfterSave: true,
        });
        const validation = await fetchValidationSnapshot({ serial, token });
        const persistenceChecks = verifyBatchPersistence(beforeStudent, validation.student || validation.merged, { mode: 'xp', attrKey, amount, reason });
        const saved = validation.merged;

        success += 1;
        const result = { serial: saved.serial, ok: true, name: saved.name, xp: saved.totalXP, persistenceChecks };
        results.push(result);
        setBatchSummary({ total: targetSerials.length, success, failed, skipped });
        if (typeof onProgress === 'function') onProgress(result, results, batchState.summary);
      } catch (error) {
        failed += 1;
        const result = { serial, ok: false, error: error?.message || String(error) };
        results.push(result);
        setBatchSummary({ total: targetSerials.length, success, failed, skipped });
        if (typeof onProgress === 'function') onProgress(result, results, batchState.summary);
      }
    }

    batchState.lastResult = results;

    if (originalSelection.serial || originalSelection.token) {
      try {
        await refreshCurrentStudent();
      } catch (_error) {
        // ignore refresh failure after batch
      }
    }

    markUiSynced(`批量加分完成：成功 ${success} / 失敗 ${failed}`);
    return results;
  } finally {
    batchState.isRunning = false;
    setUiBusy(false);
  }
}
