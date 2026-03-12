import { ATTR_KEYS } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';

export const TEACHER_SCORE_PRESETS = {
  metal: [
    { reason: '準時完成並繳交任務，展現守時與條理', amount: 5 },
    { reason: '做事俐落、步驟清楚，能有效率完成工作', amount: 5 },
  ],
  wood: [
    { reason: '主動參與討論並提出自己的想法，展現探索精神', amount: 20 },
    { reason: '主動觀察並分享新發現，讓學習持續向外延伸', amount: 15 },
  ],
  water: [
    { reason: '主動整理器材並確實歸位，照顧共同使用的空間', amount: 5 },
    { reason: '用心打掃並維護學習環境，讓大家都能安心學習', amount: 10 },
  ],
  fire: [
    { reason: '學習表現優良（90–94），展現主動投入的成果', amount: 20 },
    { reason: '學習表現亮眼（95–99），持續燃起精進的動力', amount: 25 },
    { reason: '學習表現卓越（100），展現全力以赴的光芒', amount: 30 },
  ],
  earth: [
    { reason: '長時間專注完成學習任務，展現穩定與耐心', amount: 5 },
    { reason: '作品完整扎實，足以作為同學參考的優良示範', amount: 20 },
  ],
};


export const ATTR_META = {
  metal: { label: '金', panelTitle: '金｜秩序與條理' },
  wood: { label: '木', panelTitle: '木｜探索與表達' },
  water: { label: '水', panelTitle: '水｜照顧與整理' },
  fire: { label: '火', panelTitle: '火｜表現與熱情' },
  earth: { label: '土', panelTitle: '土｜穩定與專注' },
};

const LEGACY_TEACHER_ACTION_PANELS = {
  general: {
    id: 'general',
    title: '一般學習加分面板',
    hint: '對齊舊版老師常用事件，直接點擊即可套用到目前學生。',
    attrFocus: {
      metal: { label: '守時 / 條理', summary: '守時、步驟清楚、交辦完成。' },
      wood: { label: '探索 / 分享', summary: '主動發表、延伸提問、主動探索。' },
      water: { label: '整理 / 照顧', summary: '整理器材、維護環境、照顧共用空間。' },
      fire: { label: '表現 / 衝勁', summary: '成績表現、挑戰高分、主動投入。' },
      earth: { label: '專注 / 穩定', summary: '長時間專注、作品扎實、持續完成。' },
    },
    actions: TEACHER_SCORE_PRESETS,
  },
  support: {
    id: 'support',
    title: '學習扶助面板',
    hint: '保留舊版學習扶助語境，偏重鼓勵回應、完成補救與持續投入。',
    attrFocus: {
      metal: { label: '到課 / 配合', summary: '到課穩定、配合指示、作業補齊。' },
      wood: { label: '敢開口 / 願嘗試', summary: '願意回答、願意提問、勇於嘗試。' },
      water: { label: '互助 / 照顧', summary: '幫助同學、整理教材、協助收拾。' },
      fire: { label: '進步 / 突破', summary: '答題進步、完成補救、突破卡關。' },
      earth: { label: '穩定 / 持續', summary: '持續完成、維持專注、一步一步做到。' },
    },
    actions: {
      metal: [
        { reason: '按時到課並完成今日補救任務', amount: 5 },
        { reason: '配合老師節奏，補齊指定練習', amount: 10 },
      ],
      wood: [
        { reason: '願意主動回答問題，踏出第一步', amount: 10 },
        { reason: '願意再次嘗試卡關題目，持續探索', amount: 15 },
      ],
      water: [
        { reason: '協助整理教材並照顧共同學習環境', amount: 5 },
        { reason: '主動幫助同學完成學習準備', amount: 10 },
      ],
      fire: [
        { reason: '今日補救練習明顯進步', amount: 20 },
        { reason: '完成階段目標，成功突破舊關卡', amount: 25 },
      ],
      earth: [
        { reason: '穩定專注完成整段扶助任務', amount: 10 },
        { reason: '持續投入，不因挫折中斷學習', amount: 15 },
      ],
    },
  },
  science: {
    id: 'science',
    title: '科展團隊面板',
    hint: '保留舊版科展團隊操作感，偏重合作、紀錄與研究推進。',
    attrFocus: {
      metal: { label: '規畫 / 紀錄', summary: '流程規畫、紀錄完整、器材管理。' },
      wood: { label: '假設 / 發想', summary: '提出想法、設計實驗、延伸觀察。' },
      water: { label: '支援 / 協作', summary: '照顧材料、協助同組、整理環境。' },
      fire: { label: '發表 / 展現', summary: '成果發表、自信說明、勇於展示。' },
      earth: { label: '執行 / 耐心', summary: '長時間觀測、耐心修正、穩定推進。' },
    },
    actions: {
      metal: [
        { reason: '完整紀錄今日實驗流程與結果', amount: 10 },
        { reason: '器材整理有序，交接明確', amount: 10 },
      ],
      wood: [
        { reason: '提出新的研究假設或改良方向', amount: 20 },
        { reason: '主動延伸觀察並分享新發現', amount: 20 },
      ],
      water: [
        { reason: '主動支援組員並照顧共同材料', amount: 10 },
        { reason: '整理研究空間，維持實驗秩序', amount: 10 },
      ],
      fire: [
        { reason: '清楚發表今日研究成果', amount: 20 },
        { reason: '勇於面對提問並完整說明實驗', amount: 25 },
      ],
      earth: [
        { reason: '耐心完成長時間觀測與修正', amount: 15 },
        { reason: '穩定推進研究任務直到完成', amount: 20 },
      ],
    },
  },
};

export function getTeacherActionPanel(panelKey = 'general') {
  return LEGACY_TEACHER_ACTION_PANELS[panelKey] || LEGACY_TEACHER_ACTION_PANELS.general;
}

export function getTeacherActionPreset(panelKey = 'general', attrKey = 'fire', index = 0) {
  const panel = getTeacherActionPanel(panelKey);
  const list = panel?.actions?.[attrKey] || [];
  const found = list[Number(index)] || null;
  if (!found) return null;
  return {
    panelKey: panel.id,
    attrKey,
    amount: Number(found.amount || found.val || 0),
    reason: String(found.reason || found.desc || '').trim(),
  };
}


function ensureRewardEventList(data = {}) {
  return Array.isArray(data.reward_events) ? data.reward_events : [];
}

function buildTeacherRewardEvent(student, payload, meta = {}) {
  const now = Number(meta.now || Date.now()) || Date.now();
  const serial = student?.serial || student?.card_seq || payload?.serial || '';
  const kind = String(meta.kind || 'score').trim() || 'score';
  const source = String(meta.source || 'teacher_manual').trim() || 'teacher_manual';
  const baseId = String(meta.eventId || `${kind}:${serial}:${payload?.attrKey || payload?.statusKey || 'event'}:${payload?.amount || payload?.stacks || 0}:${now}`);
  const event = {
    eventId: baseId,
    id: baseId,
    type: kind === 'status' ? 'teacher_status' : 'teacher_score',
    category: 'teacher_reward',
    source,
    serial,
    timestamp: now,
    reason: String(payload?.reason || '').trim(),
    settled: true,
  };
  if (kind === 'status') {
    event.statusKey = payload?.statusKey || '';
    event.stacks = Number(payload?.stacks || 0) || 0;
  } else {
    event.attrKey = payload?.attrKey || '';
    event.amount = Number(payload?.amount || 0) || 0;
    event.xpAdded = event.amount;
  }
  return event;
}



function formatRewardSourceLabel(source = '', type = '') {
  const safe = String(source || '').trim();
  const safeType = String(type || '').trim();
  const table = {
    teacher_manual: '手動加分',
    teacher_direct: '手動加分',
    teacher_preview_confirm: '手動加分',
    batch_score: '批量加分',
    batch_debuff: '批量狀態',
    batch_xp: '批量加分',
    legacy_batch: '舊版批量',
    legacy_teacher: '舊版教師',
  };
  if (table[safe]) return table[safe];
  if (safeType === 'teacher_status') return '教師狀態';
  if (safeType === 'teacher_score') return '教師加分';
  return safe || '事件';
}

function buildUnifiedHistoryEntryFromRewardEvent(item = {}, index = 0) {
  const type = String(item?.type || '').trim() || 'reward_event';
  const timestamp = Number(item?.timestamp || item?.createdAt || item?.updatedAt || 0) || Date.now();
  const eventId = String(item?.eventId || item?.id || `reward:${timestamp}:${index}`).trim();
  const sourceLabel = formatRewardSourceLabel(item?.source, type);
  let detail = String(item?.detail || '').trim();
  if (!detail) {
    if (type === 'teacher_status') {
      const statusLabel = DEBUFF_INFO[item?.statusKey]?.label || item?.statusLabel || item?.statusKey || '狀態';
      detail = `[${sourceLabel}] ${String(item?.reason || statusLabel || '未命名事件').trim()}｜${statusLabel} +${Number(item?.stacks || 0)}`;
    } else {
      const attrLabel = ATTR_META[item?.attrKey]?.label || item?.attrKey || '未設定屬性';
      const amount = Number(item?.amount || item?.xpAdded || 0) || 0;
      detail = `[${sourceLabel}] ${String(item?.reason || attrLabel || '未命名事件').trim()} +${amount}XP(${attrLabel})`;
    }
  }
  return {
    kind: 'reward_event',
    key: `reward_event::${eventId}`,
    actionType: type,
    timestamp,
    detail,
    sourceLabel,
    raw: item,
  };
}

function buildUnifiedHistoryEntryFromLog(item = {}, index = 0) {
  const timestamp = Number(item?.timestamp || 0) || Date.now();
  const rewardId = String(item?.reward_event_id || '').trim();
  const logId = String(item?.log_id || `log:${timestamp}:${index}`).trim();
  const actionType = String(item?.action_type || '').trim() || 'event';
  const sourceLabel = formatRewardSourceLabel(item?.source_channel, actionType);
  return {
    kind: 'log',
    key: rewardId ? `reward_event::${rewardId}` : `log::${logId}` ,
    actionType,
    timestamp,
    detail: String(item?.detail || '').trim() || actionType,
    sourceLabel,
    raw: item,
  };
}

export function buildUnifiedActivityFeed(student = {}, limit = 8) {
  const rewardEvents = Array.isArray(student?.reward_events) ? student.reward_events : [];
  const logs = Array.isArray(student?.logs) ? student.logs : [];
  const feed = [
    ...rewardEvents.map((item, idx) => buildUnifiedHistoryEntryFromRewardEvent(item, idx)),
    ...logs.map((item, idx) => buildUnifiedHistoryEntryFromLog(item, idx)),
  ];
  const deduped = [];
  const seen = new Set();
  feed
    .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0))
    .forEach((item) => {
      const key = String(item?.key || '').trim();
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      deduped.push(item);
    });
  return deduped.slice(0, Math.max(1, Number(limit) || 8));
}

export function buildUnifiedActivityLines(student = {}, limit = 8) {
  return buildUnifiedActivityFeed(student, limit).map((item) => {
    const at = new Date(Number(item.timestamp) || Date.now()).toLocaleString('zh-TW');
    return `${at}｜${item.detail || item.actionType || '未命名事件'}`;
  });
}

export function getUnifiedActivityCount(student = {}) {
  return buildUnifiedActivityFeed(student, 9999).length;
}

export function buildUnifiedSourceStats(student = {}, limit = 9999) {
  const feed = buildUnifiedActivityFeed(student, limit);
  const map = new Map();
  feed.forEach((item) => {
    const label = String(item?.sourceLabel || '事件').trim() || '事件';
    const current = map.get(label) || 0;
    map.set(label, current + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => Number(b?.count || 0) - Number(a?.count || 0));
}


export function findMatchingRewardEvent(student = {}, matcher) {
  const events = Array.isArray(student?.reward_events) ? student.reward_events : [];
  if (typeof matcher !== 'function') return null;
  for (let idx = events.length - 1; idx >= 0; idx -= 1) {
    const item = events[idx];
    if (matcher(item, idx)) return item;
  }
  return null;
}

export function findMatchingTeacherLog(student = {}, matcher) {
  const logs = Array.isArray(student?.logs) ? student.logs : [];
  if (typeof matcher !== 'function') return null;
  for (let idx = logs.length - 1; idx >= 0; idx -= 1) {
    const item = logs[idx];
    if (matcher(item, idx)) return item;
  }
  return null;
}

export function hasTeacherRewardPersistence(student = {}, spec = {}) {
  const type = String(spec?.type || '').trim();
  const reason = String(spec?.reason || '').trim();
  const sourcePrefix = String(spec?.sourcePrefix || '').trim();
  const eventId = String(spec?.eventId || '').trim();

  const rewardEvent = findMatchingRewardEvent(student, (item = {}) => {
    if (!item || typeof item !== 'object') return false;
    if (eventId && String(item?.eventId || item?.id || '').trim() === eventId) return true;
    if (type && String(item?.type || '').trim() !== type) return false;
    if (reason) {
      const haystacks = [
        String(item?.reason || '').trim(),
        String(item?.detail || '').trim(),
        String(item?.statusLabel || '').trim(),
      ].filter(Boolean);
      if (!haystacks.some((value) => value.includes(reason))) return false;
    }
    if (sourcePrefix && !String(item?.source || '').trim().startsWith(sourcePrefix)) return false;
    if (type === 'teacher_score') {
      if (spec?.attrKey && String(item?.attrKey || '').trim() !== String(spec.attrKey).trim()) return false;
      if (spec?.amount != null && Number(item?.amount || item?.xpAdded || 0) != Number(spec.amount || 0)) return false;
    }
    if (type === 'teacher_status') {
      if (spec?.statusKey && String(item?.statusKey || '').trim() !== String(spec.statusKey).trim()) return false;
      if (spec?.stacks != null && Number(item?.stacks || 0) != Number(spec.stacks || 0)) return false;
    }
    return true;
  });

  const log = findMatchingTeacherLog(student, (item = {}) => {
    if (!item || typeof item !== 'object') return false;
    if (eventId && String(item?.reward_event_id || item?.log_id || '').trim() == eventId) return true;
    if (type && String(item?.action_type || '').trim() !== type) return false;
    if (reason && !String(item?.detail || '').includes(reason)) return false;
    if (sourcePrefix && !String(item?.source_channel || '').trim().startsWith(sourcePrefix)) return false;
    if (type === 'teacher_score') {
      if (spec?.amount != null && Number(item?.points_added || 0) != Number(spec.amount || 0)) return false;
    }
    return true;
  });

  return {
    rewardEvent,
    log,
    matched: Boolean(rewardEvent || log),
    viaRewardEvent: Boolean(rewardEvent),
    viaLog: Boolean(log),
  };
}

export function buildTeacherPersistenceTrailLabel(match = {}) {
  if (match?.viaRewardEvent && match?.viaLog) return 'reward_events + logs';
  if (match?.viaRewardEvent) return 'reward_events';
  if (match?.viaLog) return 'logs';
  return '未寫入';
}


export const DEBUFF_INFO = {
  Poison: { label: '中毒', color: 'danger' },
  Frozen: { label: '冰凍', color: 'warn' },
  Paralyzed: { label: '麻痺', color: 'warn' },
  Confusion: { label: '混亂', color: 'danger' },
};

export function ensureRewardAttrs(data = {}) {
  const attrs = {};
  for (const key of ATTR_KEYS) attrs[key] = Number(data?.attributes?.[key]) || 0;
  return attrs;
}

export function buildTeacherScorePayload({ student, reason, amount, attrKey }) {
  const value = Math.max(0, Number(amount) || 0);
  if (!student) throw new Error('尚未載入學生');
  if (!reason) throw new Error('請輸入加分事件');
  if (!ATTR_KEYS.includes(attrKey)) throw new Error('屬性不正確');
  if (value <= 0) throw new Error('XP 必須大於 0');

  return {
    reason: String(reason).trim(),
    amount: value,
    attrKey,
    serial: student.serial || student.card_seq,
  };
}

export function applyTeacherScore(student, payload, options = {}) {
  const next = JSON.parse(JSON.stringify(student || {}));
  next.serial = next.serial || next.card_seq;
  next.card_seq = next.card_seq || next.serial;
  next.totalXP = Number(next.totalXP) || 0;
  next.coins = Number(next.coins) || 0;
  next.attributes = ensureRewardAttrs(next);
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.reward_events = ensureRewardEventList(next);

  const beforeXP = next.totalXP;
  const beforeAttr = Number(next.attributes[payload.attrKey]) || 0;

  next.totalXP += payload.amount;
  next.attributes[payload.attrKey] = beforeAttr + payload.amount;
  next.updatedAt = Date.now();

  const now = Date.now();
  const source = String(options?.source || 'teacher_manual').trim() || 'teacher_manual';
  const event = buildTeacherRewardEvent(next, payload, { kind: 'score', source, now });
  next.logs.push({
    log_id: event.eventId,
    reward_event_id: event.eventId,
    timestamp: now,
    action_type: 'teacher_score',
    source_channel: source,
    points_added: payload.amount,
    detail: `[教師加分] ${payload.reason} +${payload.amount}XP(${payload.attrKey})`,
  });
  next.reward_events.push(event);

  if (next.logs.length > 200) next.logs = next.logs.slice(-200);
  if (next.reward_events.length > 200) next.reward_events = next.reward_events.slice(-200);
  next.lastTeacherAction = {
    type: 'teacher_score',
    success: true,
    serial: next.serial,
    studentName: next.name || '未命名學生',
    reason: payload.reason,
    attrKey: payload.attrKey,
    xpAdded: payload.amount,
    beforeXP,
    afterXP: next.totalXP,
    beforeAttr,
    afterAttr: next.attributes[payload.attrKey],
    appliedAt: now,
    source,
    eventId: event.eventId,
  };
  return next;
}

export function buildTeacherStatusPayload({ student, statusKey, stacks, reason }) {
  if (!student) throw new Error('尚未載入學生');
  const safeKey = String(statusKey || '').trim();
  if (!DEBUFF_INFO[safeKey]) throw new Error('負面狀態不正確');
  const safeStacks = Math.max(1, Math.min(5, Number(stacks) || 1));
  const safeReason = String(reason || '').trim();
  if (!safeReason) throw new Error('請輸入學習問題或狀態原因');
  return {
    statusKey: safeKey,
    stacks: safeStacks,
    reason: safeReason,
    serial: student.serial || student.card_seq,
  };
}

export function applyTeacherStatus(student, payload, options = {}) {
  const next = JSON.parse(JSON.stringify(student || {}));
  next.serial = next.serial || next.card_seq;
  next.card_seq = next.card_seq || next.serial;
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.reward_events = ensureRewardEventList(next);
  next.debuffs = typeof next.debuffs === 'object' && next.debuffs ? next.debuffs : {
    Poison: 0,
    Frozen: 0,
    Paralyzed: 0,
    Confusion: 0,
  };
  next.learning_issues = Array.isArray(next.learning_issues) ? next.learning_issues : [];

  const beforeStacks = Number(next.debuffs[payload.statusKey]) || 0;
  const afterStacks = beforeStacks + payload.stacks;
  next.debuffs[payload.statusKey] = afterStacks;
  next.debuffs_timestamp = Date.now();
  next.learning_issues.push({
    id: `issue:${next.serial}:${payload.statusKey}:${next.debuffs_timestamp}`,
    statusKey: payload.statusKey,
    reason: payload.reason,
    stacks: payload.stacks,
    createdAt: next.debuffs_timestamp,
    source: 'teacher_status',
  });
  const source = String(options?.source || 'teacher_manual').trim() || 'teacher_manual';
  const event = buildTeacherRewardEvent(next, payload, { kind: 'status', source, now: next.debuffs_timestamp });
  next.logs.push({
    log_id: event.eventId,
    reward_event_id: event.eventId,
    timestamp: next.debuffs_timestamp,
    action_type: 'teacher_status',
    source_channel: source,
    points_added: 0,
    detail: `[教師狀態] ${DEBUFF_INFO[payload.statusKey].label} +${payload.stacks}｜${payload.reason}`,
  });
  next.reward_events.push(event);
  if (next.logs.length > 200) next.logs = next.logs.slice(-200);
  if (next.reward_events.length > 200) next.reward_events = next.reward_events.slice(-200);
  next.lastTeacherAction = {
    type: 'teacher_status',
    success: true,
    serial: next.serial,
    studentName: next.name || '未命名學生',
    statusKey: payload.statusKey,
    statusLabel: DEBUFF_INFO[payload.statusKey].label,
    stacksAdded: payload.stacks,
    beforeStacks,
    afterStacks,
    reason: payload.reason,
    appliedAt: next.debuffs_timestamp,
    source,
    eventId: event.eventId,
  };
  return next;
}

export function buildTeacherScorePreviewText(student, payload) {
  return `卡序 ${payload.serial} / ${student?.name || '未命名'}\n事件：${payload.reason}\n加分：+${payload.amount} XP\n屬性：${payload.attrKey}`;
}

export function formatTeacherActionResult(student, actionMeta = {}) {
  if (!student || !actionMeta?.type) return '尚未執行';
  if (actionMeta.type === 'teacher_score') {
    return [
      `狀態：成功`,
      `學生：${actionMeta.studentName} (#${actionMeta.serial})`,
      `事件：${actionMeta.reason}`,
      `套用屬性：${actionMeta.attrKey}`,
      `XP：${actionMeta.beforeXP} -> ${actionMeta.afterXP} ( +${actionMeta.xpAdded} )`,
      `屬性值：${actionMeta.beforeAttr} -> ${actionMeta.afterAttr}`,
      `金幣：${Number(student.coins) || 0}（本次未變動）`,
    ].join('\n');
  }
  if (actionMeta.type === 'teacher_status') {
    return [
      `狀態：成功`,
      `學生：${actionMeta.studentName} (#${actionMeta.serial})`,
      `事件：${actionMeta.reason}`,
      `套用狀態：${actionMeta.statusLabel}`,
      `層數：${actionMeta.beforeStacks} -> ${actionMeta.afterStacks} ( +${actionMeta.stacksAdded} )`,
      `XP：${Number(student.totalXP) || 0}（本次未變動）`,
      `金幣：${Number(student.coins) || 0}（本次未變動）`,
    ].join('\n');
  }
  return JSON.stringify(actionMeta, null, 2);
}


export const BATCH_CARD_PRESETS = {
  xp: [
    { key: 'fire_100', label: '火屬性｜100 分', reason: '學習表現卓越（100），展現全力以赴的光芒', attrKey: 'fire', amount: 30 },
    { key: 'wood_share', label: '木屬性｜主動分享', reason: '主動參與討論並提出自己的想法，展現探索精神', attrKey: 'wood', amount: 20 },
    { key: 'earth_focus', label: '土屬性｜長時間專注', reason: '長時間專注完成學習任務，展現穩定與耐心', attrKey: 'earth', amount: 5 },
  ],
  debuff: [
    { key: 'poison_missing_hw', label: '中毒｜作業缺交', statusKey: 'Poison', stacks: 1, reason: '作業缺交，需要老師追蹤' },
    { key: 'confusion_distracted', label: '混亂｜上課分心', statusKey: 'Confusion', stacks: 1, reason: '上課分心，需重新聚焦' },
    { key: 'frozen_passive', label: '冰凍｜互動被動', statusKey: 'Frozen', stacks: 1, reason: '互動被動，參與度不足' },
  ],
};

export function buildBatchCardEffect({ mode = 'xp', presetKey = '' } = {}) {
  const safeMode = String(mode || 'xp').trim() === 'debuff' ? 'debuff' : 'xp';
  const list = BATCH_CARD_PRESETS[safeMode] || [];
  const found = list.find((item) => item.key === presetKey) || list[0];
  if (!found) throw new Error('找不到道具卡預設');
  return { mode: safeMode, ...found };
}
