import { currentState, setCurrentStudent } from '../state.js?v=step24-r28-card-batch-workflow-20260312h';
import { settleRewardViaServer } from '../services/reward-api.js?v=step24-r28-card-batch-workflow-20260312h';
import { applyDataMigration, saveStudentData, fetchValidationSnapshot } from '../services/student-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { showAlert } from '../ui/feedback.js?v=step24-r28-card-batch-workflow-20260312h';
import { listTeacherShopCatalogForStudent, buyShopCatalogItemForCurrentStudent, activateHiddenEggForCurrentStudent } from '../services/shop-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { ATTR_KEYS, APP_CONFIG } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';
import { listBossConfigs } from '../services/system-admin-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { listGradeUnitsForStudent, getDailyQuestionForStudent, getBossRuntimeForStudent } from '../services/quiz-runtime-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { buildUnifiedActivityLines, getUnifiedActivityCount } from '../domain/reward.js?v=step24-r28-card-batch-workflow-20260312h';

const DAILY_LIMIT = 10;
let currentDailyQuestion = null;
let currentBossRuntime = null;
let studentIdleWarnTimer = null;
let studentIdleTimer = null;


const ATTR_LABELS = {
  metal: '金系 / 精準',
  wood: '木系 / 成長',
  water: '水系 / 穩定',
  fire: '火系 / 表現',
  earth: '土系 / 韌性',
};

const ATTR_DETAIL_MAP = {
  metal: { label: '金系 / 精準', summary: '代表精準、規則感與細節掌握。', items: ['答題正確與細節核對', '批量 / 手動加分中的精準表現', '需要規則感的任務完成'] },
  wood: { label: '木系 / 成長', summary: '代表持續進步、理解延展與學習成長。', items: ['每日訓練累積', '成長型任務或學習扶助進步', '老師記錄的學習成長事件'] },
  water: { label: '水系 / 穩定', summary: '代表穩定度、調節力與持續完成。', items: ['穩定完成每日挑戰', '狀態恢復或穩定表現', '需要耐心與持續度的任務'] },
  fire: { label: '火系 / 表現', summary: '代表表現力、主動性與高分衝刺。', items: ['高分事件與公開表現', 'Boss 勝利與挑戰成功', '老師手動表揚的優秀表現'] },
  earth: { label: '土系 / 韌性', summary: '代表韌性、抗壓與持續堅持。', items: ['面對挫折後持續完成', '需要累積的長期任務', '老師記錄的努力與韌性事件'] },
};




function noonResetKey(now = new Date()) {
  const d = new Date(now);
  const noon = new Date(d);
  noon.setHours(12, 0, 0, 0);
  if (d.getTime() < noon.getTime()) noon.setDate(noon.getDate() - 1);
  return noon.toISOString().slice(0, 10);
}

function isSameNoonBucket(stamp, now = new Date()) {
  if (!stamp) return false;
  const raw = String(stamp || '').trim();
  return raw.slice(0, 10) === noonResetKey(now);
}

async function reconcileRewardMirror(snapshot, token, source = 'student_reward_settle') {
  const merged = snapshot?.merged;
  if (!merged || !token) return merged || null;
  const student = snapshot?.student || {};
  const page = snapshot?.page || {};
  const drift = ['coins', 'totalXP', 'today_quiz_reward_count', 'today_battle_used', 'daily_quiz_date', 'boss_battle_date'].some((key) => JSON.stringify(student?.[key] ?? null) !== JSON.stringify(page?.[key] ?? null));
  if (!drift) return merged;
  return saveStudentData(merged, { token, source, setCurrent: true, refreshAfterSave: true });
}

function getCollectionItemId(item = {}, fallback = '') {
  return String(item?.id || item?.hiddenEggId || fallback || '').trim();
}

function getMergedCollectionItems(student) {
  const safe = applyDataMigration(student || {});
  const eggs = Array.isArray(safe.hidden_eggs) ? safe.hidden_eggs : [];
  const collection = Array.isArray(safe.collection) ? safe.collection : [];
  const base = [...eggs, ...collection.filter((item) => item?.type === 'hidden_egg')];
  const seen = new Set();
  const deduped = [];
  for (let idx = 0; idx < base.length; idx += 1) {
    const item = base[idx];
    const id = getCollectionItemId(item, `collection-${idx}`);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ ...item, _collectionId: id });
  }

  const order = Array.isArray(safe.collection_display_order)
    ? safe.collection_display_order.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const rank = new Map(order.map((id, idx) => [id, idx]));
  return deduped.sort((a, b) => {
    const aId = getCollectionItemId(a, a._collectionId);
    const bId = getCollectionItemId(b, b._collectionId);
    const aRank = rank.has(aId) ? rank.get(aId) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(bId) ? rank.get(bId) : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    const aTs = Number(a?.updatedAt || a?.timestamp || 0) || 0;
    const bTs = Number(b?.updatedAt || b?.timestamp || 0) || 0;
    return bTs - aTs;
  });
}

function getCollectionStageKey(item = {}) {
  return String(item?.stageKey || item?.stage_key || item?.growthStage || item?.growth_stage || '').trim();
}

function getCollectionSnapshotXP(item = {}) {
  return Number(item?.snapshotTotalXP || item?.totalXP || item?.total_xp || item?.xpSnapshot || 0) || 0;
}

function isMatureCollectionItem(item = {}) {
  const stageKey = getCollectionStageKey(item);
  const status = String(item?.status || '').trim();
  return stageKey === 'adult-cat'
    || getCollectionSnapshotXP(item) >= 300
    || status.includes('成熟')
    || status.toLowerCase().includes('mature');
}

function getMatureCollectionItems(student) {
  return getMergedCollectionItems(student).filter((item) => isMatureCollectionItem(item));
}

function getLeaderboardTeamIds(student) {
  const safe = applyDataMigration(student || {});
  return Array.isArray(safe.leaderboard_team_ids)
    ? safe.leaderboard_team_ids.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
}

function getLeaderboardTeamItems(student) {
  const items = getMatureCollectionItems(student);
  const ids = getLeaderboardTeamIds(student);
  const byId = new Map(items.map((item) => [getCollectionItemId(item, item._collectionId), item]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const fallback = items.filter((item) => !ids.includes(getCollectionItemId(item, item._collectionId)));
  return [...ordered, ...fallback].slice(0, 3);
}

function getCollectionSnapshotReadiness(student) {
  const items = getMergedCollectionItems(student);
  const missing = [];
  items.forEach((item, idx) => {
    const lacksStats = !(item?.stats && typeof item.stats === 'object' && ATTR_KEYS.some((key) => Number(item?.stats?.[key] || 0) > 0));
    const lacksStage = !getCollectionStageKey(item);
    const lacksVisual = !String(item?.glyph || item?.image || item?.imageKey || '').trim();
    const lacksAt = !(item?.collectedAt || item?.updatedAt || item?.timestamp);
    if (lacksStats || lacksStage || lacksVisual || lacksAt) {
      missing.push({
        id: getCollectionItemId(item, `collection-${idx}`),
        name: item?.name || item?.hiddenEggId || `收藏 ${idx + 1}`,
        lacksStats,
        lacksStage,
        lacksVisual,
        lacksAt,
      });
    }
  });
  return { total: items.length, ready: Math.max(0, items.length - missing.length), missing };
}


function buildCollectionSnapshotDefaults(student, item = {}, idx = 0) {
  const safe = applyDataMigration(student || {});
  const attrs = safe.attributes || {};
  const fallbackXp = getCollectionSnapshotXP(item) || Math.max(0, Number(safe.totalXP || 0));
  const stage = getGrowthStage(fallbackXp);
  const guideMeta = getGuideModeMeta(safe);
  const visual = getStudentGrowthVisual(stage.key, guideMeta.mode);
  const existingStats = item?.stats && typeof item.stats === 'object' ? item.stats : null;
  const normalizedStats = ATTR_KEYS.reduce((acc, key) => {
    const raw = Number(existingStats?.[key] ?? attrs?.[key] ?? 0) || 0;
    acc[key] = Math.max(0, raw);
    return acc;
  }, {});
  return {
    id: getCollectionItemId(item, `collection-${idx}`),
    name: String(item?.name || item?.hiddenEggId || `${visual.title} ${idx + 1}`).trim(),
    stageKey: getCollectionStageKey(item) || stage.key,
    stats: normalizedStats,
    glyph: String(item?.glyph || visual.glyph || '').trim(),
    imageKey: String(item?.imageKey || `${guideMeta.mode}:${stage.key}`).trim(),
    collectedAt: item?.collectedAt || item?.updatedAt || item?.timestamp || Date.now(),
    snapshotTotalXP: fallbackXp,
    visualTitle: String(item?.visualTitle || visual.title || '').trim(),
    visualDescription: String(item?.visualDescription || visual.description || '').trim(),
  };
}

function solidifyCollectionSnapshotsData(student) {
  const safe = applyDataMigration(student || {});
  const next = applyDataMigration(JSON.parse(JSON.stringify(safe)));
  const collection = Array.isArray(next.collection) ? next.collection : [];
  let changed = 0;
  next.collection = collection.map((entry, idx) => {
    if (!entry || entry.type !== 'hidden_egg') return entry;
    const defaults = buildCollectionSnapshotDefaults(safe, entry, idx);
    const updated = { ...entry };
    if (!(updated.stats && typeof updated.stats === 'object' && ATTR_KEYS.every((key) => Number.isFinite(Number(updated.stats?.[key]))))) {
      updated.stats = defaults.stats;
      changed += 1;
    }
    if (!getCollectionStageKey(updated)) { updated.stageKey = defaults.stageKey; changed += 1; }
    if (!String(updated.glyph || updated.image || updated.imageKey || '').trim()) { updated.glyph = defaults.glyph; updated.imageKey = defaults.imageKey; changed += 1; }
    if (!(updated.collectedAt || updated.updatedAt || updated.timestamp)) { updated.collectedAt = defaults.collectedAt; changed += 1; }
    if (!Number(updated.snapshotTotalXP || updated.totalXP || updated.total_xp || updated.xpSnapshot)) { updated.snapshotTotalXP = defaults.snapshotTotalXP; changed += 1; }
    if (!String(updated.name || '').trim()) { updated.name = defaults.name; changed += 1; }
    if (!String(updated.visualTitle || '').trim()) { updated.visualTitle = defaults.visualTitle; changed += 1; }
    if (!String(updated.visualDescription || '').trim()) { updated.visualDescription = defaults.visualDescription; changed += 1; }
    return updated;
  });
  return { next, changed, readiness: getCollectionSnapshotReadiness(next) };
}

function buildStudentReadinessAudit(student) {
  const safe = applyDataMigration(student || {});
  const readiness = getCollectionSnapshotReadiness(safe);
  const teamItems = getLeaderboardTeamItems(safe);
  const matureItems = getMatureCollectionItems(safe);
  const currentBucket = noonResetKey();
  const dailyBucket = String(safe.daily_quiz_date || safe.today_quiz_reward_date || '').trim();
  const bossBucket = String(safe.boss_battle_date || safe.today_battle_date || '').trim();
  const token = getBoundToken() || currentState.currentToken || '';
  return {
    tokenBound: Boolean(token),
    currentBucket,
    dailyResetOk: !dailyBucket || isSameNoonBucket(dailyBucket) || !safe.today_quiz_reward_count,
    bossResetOk: !bossBucket || isSameNoonBucket(bossBucket) || !safe.today_battle_used,
    collectionReady: readiness.ready,
    collectionTotal: readiness.total,
    collectionMissing: readiness.missing,
    matureCount: matureItems.length,
    teamCount: teamItems.length,
    teamReady: teamItems.every((item) => !readiness.missing.some((row) => row.id === getCollectionItemId(item, item._collectionId))),
  };
}

function buildStudentReadinessAuditHtml(student) {
  const audit = buildStudentReadinessAudit(student);
  const missingHtml = audit.collectionMissing.length
    ? audit.collectionMissing.slice(0, 12).map((row) => `<li>${escapeHtml(row.name)}｜缺 ${[row.lacksStats ? '雷達' : '', row.lacksStage ? '階段' : '', row.lacksVisual ? '圖像' : '', row.lacksAt ? '時間' : ''].filter(Boolean).join(' / ')}</li>`).join('')
    : '<li>所有收藏快照欄位完整。</li>';
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">學生端收尾巡檢</h3>
        <div class="student-detail-line"><span class="student-detail-label">Token 綁定</span><span class="student-detail-value">${audit.tokenBound ? '已綁定' : '未綁定'}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">每日挑戰重置桶</span><span class="student-detail-value">${audit.dailyResetOk ? '正常' : '待檢查'}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">Boss 重置桶</span><span class="student-detail-value">${audit.bossResetOk ? '正常' : '待檢查'}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">成熟隊伍</span><span class="student-detail-value">${audit.teamCount} / 3｜${audit.teamReady ? '可直接上榜' : '有隊伍但快照未齊'}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">收藏快照完整度</span><span class="student-detail-value">${audit.collectionReady} / ${audit.collectionTotal}</span></div>
        <div class="legacy-callout">這個巡檢摘要會優先幫你抓收藏快照與排行榜隊伍是否已具備最終版需要的欄位。</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">待補欄位</h3>
        <ul class="student-audit-list">${missingHtml}</ul>
      </div>
    </div>`;
}

async function persistLeaderboardTeamIds(teamIds = []) {
  const student = ensureStudentLoaded();
  const next = applyDataMigration(student);
  next.leaderboard_team_ids = teamIds.map((value) => String(value || '').trim()).filter(Boolean);
  const saved = await saveStudentData(next, {
    token: getBoundToken() || currentState.currentToken || null,
    source: 'student_leaderboard_team',
    setCurrent: true,
    refreshAfterSave: false,
  });
  setCurrentStudent(saved, {
    serial: saved.serial || saved.card_seq || currentState.currentSerial || null,
    token: getBoundToken() || currentState.currentToken || null,
  });
  window.dispatchEvent(new CustomEvent('shanhai-v2-student-updated'));
  return saved;
}

async function toggleLeaderboardTeamItem(itemId) {
  const student = ensureStudentLoaded();
  const matureItems = getMatureCollectionItems(student);
  const safeId = String(itemId || '').trim();
  const validIds = matureItems.map((item) => getCollectionItemId(item, item._collectionId));
  if (!validIds.includes(safeId)) throw new Error('只能選擇成熟期異獸加入排行榜隊伍');
  const teamIds = getLeaderboardTeamIds(student);
  const nextIds = teamIds.includes(safeId)
    ? teamIds.filter((id) => id !== safeId)
    : [...teamIds, safeId].slice(0, 3);
  return persistLeaderboardTeamIds(nextIds);
}

async function moveLeaderboardTeamItem(itemId, direction) {
  const student = ensureStudentLoaded();
  const ids = getLeaderboardTeamIds(student);
  const safeId = String(itemId || '').trim();
  const index = ids.indexOf(safeId);
  if (index < 0) throw new Error('找不到指定隊伍異獸');
  const targetIndex = direction === 'left' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= ids.length) return student;
  const nextIds = [...ids];
  const [picked] = nextIds.splice(index, 1);
  nextIds.splice(targetIndex, 0, picked);
  return persistLeaderboardTeamIds(nextIds);
}

function buildAttrEventSourceSummary(student, attrKey) {
  const safe = applyDataMigration(student || {});
  const attrLabel = ATTR_LABELS[attrKey] || attrKey;
  const logs = Array.isArray(safe.logs) ? safe.logs : [];
  const rewards = Array.isArray(safe.reward_events) ? safe.reward_events : [];
  const labelNeedles = [attrKey, attrLabel, attrLabel.split(' / ')[0], attrLabel.split(' / ')[1]].filter(Boolean);
  const matched = [];
  const pushMatched = (source, detail) => {
    const text = String(detail || '');
    if (!text) return;
    if (labelNeedles.some((needle) => text.includes(needle))) matched.push(`${source}｜${text}`);
  };
  rewards.slice(-20).forEach((item) => pushMatched(item?.source || item?.action_type || 'reward_event', item?.detail || item?.reason || item?.label || ''));
  logs.slice(-20).forEach((item) => {
    if (String(item?.attrKey || item?.attr || '').trim() === attrKey) {
      matched.push(`${item?.source || item?.action_type || 'log'}｜${item?.detail || item?.reason || item?.label || attrLabel}`);
      return;
    }
    pushMatched(item?.source || item?.action_type || 'log', item?.detail || item?.reason || item?.label || '');
  });
  return matched.slice(-6).reverse();
}

function sortCollectionItems(student, mode = 'custom') {
  const safe = applyDataMigration(student || {});
  const items = getMergedCollectionItems(safe);
  const activeId = String(safe.active_hidden_egg?.id || safe.active_hidden_egg_id || '').trim();
  if (mode === 'newest') {
    return [...items].sort((a, b) => (Number(b?.updatedAt || b?.timestamp || 0) || 0) - (Number(a?.updatedAt || a?.timestamp || 0) || 0));
  }
  if (mode === 'active_first') {
    return [...items].sort((a, b) => {
      const aActive = getCollectionItemId(a, a._collectionId) === activeId ? 1 : 0;
      const bActive = getCollectionItemId(b, b._collectionId) === activeId ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aTs = Number(a?.updatedAt || a?.timestamp || 0) || 0;
      const bTs = Number(b?.updatedAt || b?.timestamp || 0) || 0;
      return bTs - aTs;
    });
  }
  return items;
}

async function persistCollectionPresentation({ mode = null, orderedIds = null } = {}) {
  const student = ensureStudentLoaded();
  const next = applyDataMigration(student);
  if (mode) next.collection_view_mode = String(mode).trim();
  if (Array.isArray(orderedIds)) {
    next.collection_display_order = orderedIds.map((value) => String(value || '').trim()).filter(Boolean);
  }
  const saved = await saveStudentData(next, {
    token: getBoundToken() || currentState.currentToken || null,
    source: 'student_collection_preferences',
    setCurrent: true,
    refreshAfterSave: false,
  });
  setCurrentStudent(saved, {
    serial: saved.serial || saved.card_seq || currentState.currentSerial || null,
    token: getBoundToken() || currentState.currentToken || null,
  });
  window.dispatchEvent(new CustomEvent('shanhai-v2-student-updated'));
  return saved;
}

async function moveCollectionItem(itemId, direction) {
  const student = ensureStudentLoaded();
  const items = sortCollectionItems(student, 'custom');
  const ids = items.map((item) => getCollectionItemId(item, item._collectionId)).filter(Boolean);
  const index = ids.indexOf(String(itemId || '').trim());
  if (index < 0) throw new Error('找不到指定收藏項目');
  const targetIndex = direction === 'left' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= ids.length) return student;
  const nextIds = [...ids];
  const [picked] = nextIds.splice(index, 1);
  nextIds.splice(targetIndex, 0, picked);
  return persistCollectionPresentation({ orderedIds: nextIds, mode: 'custom' });
}

async function applyCollectionSortMode() {
  const mode = String(byId('studentCollectionSortMode')?.value || 'custom').trim();
  return persistCollectionPresentation({ mode });
}


function openStudentDetailModal({ title, kicker = '學生前台詳情', html = '' }) {
  const overlay = byId('legacyModal');
  const titleEl = byId('legacyModalTitle');
  const kickerEl = byId('legacyModalKicker');
  const bodyEl = byId('legacyModalBody');
  if (!overlay || !titleEl || !kickerEl || !bodyEl) return;
  titleEl.textContent = title || '學生詳情';
  kickerEl.textContent = kicker;
  bodyEl.innerHTML = html || '<div class="student-empty-card">沒有可顯示的資料</div>';
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}


function buildAttrMeaningRows(student) {
  const safe = applyDataMigration(student || {});
  const attrs = safe.attributes || {};
  const total = Math.max(1, ATTR_KEYS.reduce((sum, key) => sum + Math.max(0, Number(attrs[key]) || 0), 0));
  const meaningMap = {
    metal: '精準 / 規則感',
    wood: '成長 / 延展性',
    water: '穩定 / 調節力',
    fire: '表現 / 主動性',
    earth: '韌性 / 持續度',
  };
  return ATTR_KEYS.map((key) => {
    const value = Math.max(0, Number(attrs[key]) || 0);
    const pct = Math.round((value / total) * 100);
    return `
      <div class="student-radar-row">
        <div class="student-radar-meta">
          <strong>${escapeHtml(ATTR_LABELS[key] || key)}</strong>
          <span>${pct}%｜${escapeHtml(meaningMap[key] || '')}</span>
        </div>
        <div class="student-radar-track"><div class="student-radar-fill" style="width:${Math.max(8, pct)}%"></div></div>
      </div>`;
  }).join('');
}

function buildRadarDetailHtml(student) {
  const safe = applyDataMigration(student || {});
  const attrs = safe.attributes || {};
  const lines = ATTR_KEYS.map((key) => {
    const label = ATTR_LABELS[key] || key;
    const value = Math.max(0, Number(attrs[key]) || 0);
    return `
      <div class="student-detail-line">
        <span class="student-detail-label">${escapeHtml(label)}</span>
        <span class="student-detail-value">${value}</span>
      </div>`;
  }).join('');
  const stage = getGrowthStage(safe.totalXP);
  const [topKey, topValue] = getTopAttrEntry(safe);
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">成長階段</h3>
        <div class="student-growth-stage"><strong>${escapeHtml(stage.title)}</strong><span>${escapeHtml(stage.subtitle)}</span><small>${escapeHtml(stage.progress)}</small></div>
        <div class="legacy-callout">目前最高能力指標：${escapeHtml(ATTR_LABELS[topKey] || topKey)} ${Number(topValue || 0)}。正式版可沿用這張卡做雷達圖放大與圖像介紹入口。</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">五種能力指標總覽</h3>
        <div class="student-detail-metrics">${lines}</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">能力來源分布</h3>
        <div class="student-detail-metrics">${buildAttrMeaningRows(safe)}</div>
      </div>
    </div>`;
}

function buildIndicatorCountsHtml(student) {
  const safe = applyDataMigration(student || {});
  return ATTR_KEYS.map((key) => {
    const info = ATTR_DETAIL_MAP[key] || { label: ATTR_LABELS[key] || key };
    const value = Math.max(0, Number(safe.attributes?.[key]) || 0);
    return `<button type="button" class="student-indicator-chip" data-indicator-key="${escapeHtml(key)}"><strong>${escapeHtml(info.label)}</strong><span>${value} 次</span></button>`;
  }).join('');
}

function buildIndicatorDetailHtml(student, attrKey) {
  const safe = applyDataMigration(student || {});
  const info = ATTR_DETAIL_MAP[attrKey] || { label: ATTR_LABELS[attrKey] || attrKey, summary: '尚未設定說明', items: [] };
  const value = Math.max(0, Number(safe.attributes?.[attrKey]) || 0);
  const recent = buildAttrEventSourceSummary(safe, attrKey);
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">${escapeHtml(info.label)}</h3>
        <div class="student-detail-line"><span class="student-detail-label">目前總次數</span><span class="student-detail-value">${value}</span></div>
        <div class="legacy-callout">${escapeHtml(info.summary)}</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">代表指標</h3>
        <ul class="student-bullet-list">${(info.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">近期獲得方式 / 來源細項</h3>
        <pre>${escapeHtml(recent.length ? recent.join('\n') : '近期尚無可辨識的該屬性來源，後續可再從 reward_events / logs 精細標註。')}</pre>
      </div>
    </div>`;
}

function showIndicatorDetail(attrKey) {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: `${ATTR_LABELS[attrKey] || attrKey} 指標詳情`, kicker: 'Attribute Indicator Detail', html: buildIndicatorDetailHtml(student, attrKey) });
}

function buildMatureTeamPickerHtml(student) {
  const safe = applyDataMigration(student || {});
  const items = getMatureCollectionItems(safe);
  const teamIds = getLeaderboardTeamIds(safe);
  if (!items.length) {
    return '<div class="student-empty-card">目前尚未持有成熟期異獸；當收藏快照標記為成熟期後，才能加入排行榜隊伍。</div>';
  }
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">排行榜隊伍說明</h3>
        <div class="legacy-callout">可從自己持有過的成熟期異獸中選最多 3 隻組成排行榜展示隊伍，並可調整左右順序。</div>
        <div class="student-detail-line"><span class="student-detail-label">目前隊伍</span><span class="student-detail-value">${teamIds.length ? `${teamIds.length} / 3` : '尚未設定'}</span></div>
      </div>
      <div class="student-detail-card student-team-picker-list">
        ${items.map((item, idx) => {
          const itemId = getCollectionItemId(item, item._collectionId);
          const picked = teamIds.includes(itemId);
          const teamIndex = teamIds.indexOf(itemId);
          const attrs = item?.stats && typeof item.stats === 'object' ? item.stats : safe.attributes || {};
          const topAttr = Object.entries(attrs).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0] || ['metal', 0];
          return `<div class="student-team-picker-item ${picked ? 'is-picked' : ''}">
            <div class="student-team-picker-glyph">${escapeHtml((item?.name || item?.hiddenEggId || '獸').slice(0,1))}</div>
            <div class="student-team-picker-copy">
              <strong>${escapeHtml(item?.name || item?.hiddenEggId || `成熟異獸 ${idx + 1}`)}</strong>
              <span>快照：${escapeHtml(ATTR_LABELS[topAttr[0]] || topAttr[0])} ${Number(topAttr[1] || 0)}</span>
              <small>${picked ? `目前隊伍第 ${teamIndex + 1} 位` : '尚未加入排行榜隊伍'}</small>
            </div>
            <div class="student-collection-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-team-toggle="${escapeHtml(itemId)}">${picked ? '移出隊伍' : '加入隊伍'}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-team-move="left" data-team-id="${escapeHtml(itemId)}" ${teamIndex <= 0 ? 'disabled' : ''}>往前</button>
              <button type="button" class="btn btn-ghost btn-sm" data-team-move="right" data-team-id="${escapeHtml(itemId)}" ${teamIndex < 0 || teamIndex === teamIds.length - 1 ? 'disabled' : ''}>往後</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

async function solidifyStudentCollectionSnapshots() {
  const student = ensureStudentLoaded();
  const { next, changed, readiness } = solidifyCollectionSnapshotsData(student);
  if (!changed) {
    openStudentDetailModal({ title: '收藏快照整備完成', kicker: 'Collection Snapshot Solidify', html: `<div class="student-detail-card"><h3 class="tech-font">收藏快照已完整</h3><div class="student-detail-line"><span class="student-detail-label">完整度</span><span class="student-detail-value">${readiness.ready} / ${readiness.total}</span></div><div class="legacy-callout">目前沒有缺失欄位，不需要再次寫入。</div></div>` });
    return student;
  }
  const saved = await saveStudentData(next, {
    token: getBoundToken() || currentState.currentToken || null,
    source: 'student_collection_snapshot_solidify',
    setCurrent: true,
    refreshAfterSave: false,
  });
  setCurrentStudent(saved, {
    serial: saved.serial || saved.card_seq || currentState.currentSerial || null,
    token: getBoundToken() || currentState.currentToken || null,
  });
  window.dispatchEvent(new CustomEvent('shanhai-v2-student-updated'));
  const finalReadiness = getCollectionSnapshotReadiness(saved);
  openStudentDetailModal({ title: '收藏快照整備完成', kicker: 'Collection Snapshot Solidify', html: `<div class="student-detail-grid"><div class="student-detail-card"><h3 class="tech-font">已補齊收藏快照欄位</h3><div class="student-detail-line"><span class="student-detail-label">本次補齊欄位數</span><span class="student-detail-value">${changed}</span></div><div class="student-detail-line"><span class="student-detail-label">目前完整度</span><span class="student-detail-value">${finalReadiness.ready} / ${finalReadiness.total}</span></div><div class="legacy-callout">已把缺失的雷達快照、階段、圖像索引與入藏時間補寫回學生資料。</div></div><div class="student-detail-card"><h3 class="tech-font">後續用途</h3><ul class="student-audit-list"><li>排行榜隊伍可直接使用收藏快照</li><li>收藏放大視窗可穩定顯示左圖右雷達</li><li>後續交換 / 寄宿系統可直接承接成熟期異獸資料</li></ul></div></div>` });
  return saved;
}

function showStudentReadinessAudit() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '學生端收尾巡檢', kicker: 'Student Readiness Audit', html: buildStudentReadinessAuditHtml(student) });
}

function showMatureTeamPicker() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '成熟期異獸隊伍設定', kicker: 'Leaderboard Team Picker', html: buildMatureTeamPickerHtml(student) });
}

function buildCollectionDetailHtml(student, targetId = '') {

  const safe = applyDataMigration(student || {});
  const merged = sortCollectionItems(safe, safe.collection_view_mode || 'custom').slice(0, 12);
  if (!merged.length) {
    return '<div class="student-empty-card">尚無可展示的隱藏蛋 / 收藏資料</div>';
  }
  return `
    <div class="student-detail-grid">${merged.map((item, idx) => {
      const id = String(item?.id || item?.hiddenEggId || `collection-${idx}`);
      const title = item?.name || item?.hiddenEggId || `收藏 ${idx + 1}`;
      const active = id && id === String(safe.active_hidden_egg?.id || safe.active_hidden_egg_id || '');
      const attrs = item?.stats && typeof item.stats === 'object' ? item.stats : safe.attributes || {};
      const topAttr = Object.entries(attrs).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0];
      return `
        <div class="student-detail-card ${active ? 'is-active' : ''}">
          <div class="student-detail-line"><span class="student-detail-label">名稱</span><span class="student-detail-value">${escapeHtml(title)}</span></div>
          <div class="student-detail-line"><span class="student-detail-label">狀態</span><span class="student-detail-value">${escapeHtml(item?.status || (active ? 'active' : 'stored'))}</span></div>
          <div class="student-detail-line"><span class="student-detail-label">是否啟用</span><span class="student-detail-value">${active ? '目前啟用中' : '收藏中'}</span></div>
          <div class="student-detail-line"><span class="student-detail-label">最高屬性快照</span><span class="student-detail-value">${escapeHtml((ATTR_LABELS[topAttr?.[0]] || topAttr?.[0] || '未設定'))} ${Number(topAttr?.[1] || 0)}</span></div>
          ${targetId && targetId === id ? '<div class="legacy-callout">這是你剛剛點選的收藏項目。</div>' : ''}
        </div>`;
    }).join('')}</div>`;
}

function showRadarDetail() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '能力雷達詳情', kicker: '學生能力總覽', html: buildRadarDetailHtml(student) });
}

function showCollectionDetail(targetId = '') {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '收藏展示詳情', kicker: '隱藏蛋 / 收藏展示', html: buildCollectionDetailHtml(student, targetId) });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getGrowthStage(totalXP) {
  const xp = Math.max(0, Number(totalXP) || 0);
  if (xp < 10) return { key: 'dust-box', title: '缺乏能量階段', subtitle: '貓咪版：佈滿灰塵的紙箱', progress: 'totalXP < 10' };
  if (xp < 100) return { key: 'clean-box', title: '屬性成長階段', subtitle: '貓咪版：乾淨的紙箱', progress: '10 <= totalXP < 100' };
  if (xp < 200) return { key: 'kitten', title: '破殼期', subtitle: '貓咪版：紙箱中的小貓', progress: '100 <= totalXP < 200' };
  if (xp < 300) return { key: 'young-cat', title: '成長期', subtitle: '貓咪版：青年小貓', progress: '200 <= totalXP < 300' };
  return { key: 'adult-cat', title: '成熟期', subtitle: '貓咪版：成年貓', progress: 'totalXP >= 300' };
}

function getGuideModeMeta(student) {
  const safe = applyDataMigration(student || {});
  const rawMode = String(safe.guide_mode || 'cat').trim();
  const normalized = rawMode === 'cat_sage' ? 'cat' : (rawMode || 'cat');
  const locked = safe.guide_mode_locked !== false;
  const table = {
    cat: {
      mode: 'cat',
      world: '貓咪版世界觀',
      partner: '智者貓咪',
      summary: '偏陪伴、鼓勵與日常照護式的學生引導。',
      tone: '柔和、安全、生活感',
    },
    baize: {
      mode: 'baize',
      world: '山海版世界觀',
      partner: '白澤',
      summary: '偏知識解說、冒險與山海圖鑑式的學生引導。',
      tone: '知識型、探索型、任務感',
    },
    neutral: {
      mode: 'neutral',
      world: '中性學習模式',
      partner: '學習助理',
      summary: '維持中性敘事，不特別偏貓咪或山海。',
      tone: '中性、穩定、通用',
    },
  };
  return { ...(table[normalized] || table.cat), locked, rawMode };
}

function getTopAttrEntry(student) {
  const attrs = applyDataMigration(student || {}).attributes || {};
  return Object.entries(attrs).sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0))[0] || ['metal', 0];
}

function getStudentGrowthVisual(stageKey, guideMode = 'cat') {
  const isCat = guideMode !== 'baize';
  const catTable = {
    'dust-box': { glyph: '📦', title: '佈滿灰塵的紙箱', description: '目前還在暖機期，前台圖像應呈現沉睡、等待能量的樣子。', fixedRule: '屬性仍可變動，圖片會跟著最高屬性調整。' },
    'clean-box': { glyph: '📦✨', title: '乾淨的紙箱', description: '已開始累積能量，前台圖像應呈現乾淨、帶有屬性氣質的紙箱。', fixedRule: 'totalXP < 100 時，最高屬性仍可改變圖像。' },
    kitten: { glyph: '🐱', title: '紙箱中的小貓', description: '進入破殼期，前台圖像應該讓學生感覺到正式孵化完成。', fixedRule: 'totalXP >= 100 後，屬性固定，後續不再因加分切換圖像。' },
    'young-cat': { glyph: '🐈', title: '青年小貓', description: '屬於成長期的展示圖像，應保留陪伴感與進步感。', fixedRule: '延續固定屬性，只更新數值與展示摘要。' },
    'adult-cat': { glyph: '🐈‍⬛', title: '成年貓', description: '成熟收藏階段，應保留進化完成的展示氛圍。', fixedRule: '成熟後應能列入收藏展示區並保留雷達圖快照。' },
  };
  const beastTable = {
    'dust-box': { glyph: '🥚', title: '缺乏能量的龍蛋', description: '山海版前台應呈現尚未甦醒的異獸蛋。', fixedRule: '屬性仍可變動，圖片會跟著最高屬性調整。' },
    'clean-box': { glyph: '🥚✨', title: '有屬性的龍蛋', description: '已帶有屬性氣質的蛋，前台圖像應和最高屬性連動。', fixedRule: 'totalXP < 100 時，最高屬性仍可改變圖像。' },
    kitten: { glyph: '🐉', title: '破殼中的異獸', description: '進入破殼期，前台應顯示小異獸而不是單純蛋。', fixedRule: 'totalXP >= 100 後，屬性固定，後續不再因加分切換圖像。' },
    'young-cat': { glyph: '🐲', title: '青年異獸', description: '代表已完成基礎成長，前台圖像應開始具備個體性。', fixedRule: '延續固定屬性，只更新數值與展示摘要。' },
    'adult-cat': { glyph: '🐲✨', title: '成熟異獸', description: '成熟收藏階段，應保留完成進化後的展示感。', fixedRule: '成熟後應能列入收藏展示區並保留雷達圖快照。' },
  };
  const table = isCat ? catTable : beastTable;
  return table[stageKey] || table['dust-box'];
}

function getLeaderboardTier(student) {
  const safe = applyDataMigration(student || {});
  const [topAttrKey, topAttrValue] = getTopAttrEntry(safe);
  const totalAttrs = ATTR_KEYS.reduce((sum, key) => sum + Math.max(0, Number(safe.attributes?.[key]) || 0), 0);
  const score = (Number(safe.totalXP) || 0) + totalAttrs + ((Array.isArray(safe.logs) ? safe.logs.length : 0) * 2);
  let tier = '新芽';
  let percentile = '前 80%';
  if (score >= 520) {
    tier = '傳說';
    percentile = '前 5%';
  } else if (score >= 340) {
    tier = '菁英';
    percentile = '前 15%';
  } else if (score >= 180) {
    tier = '進階';
    percentile = '前 35%';
  } else if (score >= 80) {
    tier = '穩定';
    percentile = '前 55%';
  }
  return { tier, percentile, score, topAttrKey, topAttrValue, totalAttrs };
}

function getLeaderboardRoadmap(score = 0) {
  const safeScore = Math.max(0, Number(score) || 0);
  const tiers = [
    { tier: '新芽', percentile: '前 80%', threshold: 0, copy: '剛開始累積成長能量，先穩定完成每日歷練。' },
    { tier: '穩定', percentile: '前 55%', threshold: 80, copy: '已經具備基本累積節奏，建議持續每日挑戰與商城養成。' },
    { tier: '進階', percentile: '前 35%', threshold: 180, copy: '開始進入前段班，建議強化最高屬性與收藏展示。' },
    { tier: '菁英', percentile: '前 15%', threshold: 340, copy: '已具備高成長力，接下來以 Boss、展示與稱號提升為主。' },
    { tier: '傳說', percentile: '前 5%', threshold: 520, copy: '已進入頂尖展示階段，可持續累積收藏與高階紀錄。' },
  ];
  let currentIndex = 0;
  tiers.forEach((item, idx) => {
    if (safeScore >= item.threshold) currentIndex = idx;
  });
  const next = tiers[currentIndex + 1] || null;
  return {
    current: tiers[currentIndex],
    next,
    remaining: next ? Math.max(0, next.threshold - safeScore) : 0,
    tiers: tiers.map((item, idx) => ({
      ...item,
      reached: safeScore >= item.threshold,
      isCurrent: idx === currentIndex,
      isNext: idx === currentIndex + 1,
      remaining: Math.max(0, item.threshold - safeScore),
    })),
  };
}

function getGuideSpotlightMeta(student) {
  const safe = applyDataMigration(student || {});
  const guideMeta = getGuideModeMeta(safe);
  const stage = getGrowthStage(safe.totalXP);
  const visual = getStudentGrowthVisual(stage.key, guideMeta.mode);
  const table = {
    cat: {
      glyph: '🐾',
      title: '智者貓咪',
      imageHint: '點開可查看貓咪夥伴、紙箱 / 小貓成長圖像與最近一次回覆。',
    },
    baize: {
      glyph: '📜',
      title: '白澤',
      imageHint: '點開可查看白澤夥伴、龍蛋 / 異獸成長圖像與世界觀摘要。',
    },
    neutral: {
      glyph: '✨',
      title: '學習助理',
      imageHint: '點開可查看中性學習夥伴與目前成長圖像。',
    },
  };
  return { ...(table[guideMeta.mode] || table.cat), guideMeta, stage, visual };
}

function scrollToStudentCoreSection(sectionId, focusId = '') {
  const target = byId(sectionId);
  if (!target) throw new Error(`找不到區塊：${sectionId}`);
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.classList.add('section-focus');
  window.setTimeout(() => target.classList.remove('section-focus'), 1400);
  if (focusId) {
    const focusEl = byId(focusId);
    if (focusEl) {
      window.setTimeout(() => {
        focusEl.focus?.();
        focusEl.select?.();
      }, 260);
    }
  }
}

function buildStudentFrontRankingPreview(student) {
  const safe = applyDataMigration(student || {});
  const ranking = getLeaderboardTier(safe);
  const roadmap = getLeaderboardRoadmap(ranking.score);
  const collectionCount = getMergedCollectionItems(safe).length;
  const logsCount = getUnifiedActivityCount(safe);
  const teamItems = getLeaderboardTeamItems(safe);
  const teamText = teamItems.length ? teamItems.map((item) => item?.name || item?.hiddenEggId || '未命名異獸').join(' / ') : '尚未設定成熟期隊伍';
  return [
    `排行階級：${ranking.tier}｜${ranking.percentile}`,
    `最高屬性：${ATTR_LABELS[ranking.topAttrKey] || ranking.topAttrKey} ${Number(ranking.topAttrValue || 0)}`,
    `五系總量：${ranking.totalAttrs}`,
    roadmap.next ? `距離下一階：${roadmap.next.tier} 還差 ${roadmap.remaining}` : '已達目前最高階級',
    `收藏展示：${collectionCount}`,
    `排行榜隊伍：${teamText}`,
    `事件紀錄：${logsCount}`,
    `目前稱號：${safe.title || safe.current_title || '未設定'}`,
  ].join('\n');
}

function renderStudentFrontOverview(student) {
  const safe = applyDataMigration(student || {});
  const nicknameEl = byId('studentFrontNickname');
  const badgeEl = byId('studentFrontWorldBadge');
  const subtitleEl = byId('studentFrontSubtitle');
  const stageEl = byId('studentFrontStageBadge');
  const coinsEl = byId('studentFrontCoins');
  const xpEl = byId('studentFrontXP');
  const titleEl = byId('studentFrontTitle');
  const gradeEl = byId('studentFrontGrade');
  const guideModeEl = byId('studentFrontGuideMode');
  const guideSummaryEl = byId('studentFrontGuideSummary');
  const guideGlyphEl = byId('studentFrontGuideGlyph');
  const guideHintEl = byId('studentFrontGuideImageHint');
  const rankingPreviewEl = byId('studentFrontRankingPreview');
  const stageQuickEl = byId('studentFrontStageQuickText');
  const radarQuickEl = byId('studentFrontRadarQuickText');
  const collectionQuickEl = byId('studentFrontCollectionQuickText');
  const activityQuickEl = byId('studentFrontActivityQuickText');
  const dailyEntryEl = byId('studentFrontDailyEntryText');
  const bossEntryEl = byId('studentFrontBossEntryText');
  const partnerEntryEl = byId('studentFrontPartnerEntryText');
  const shopEntryEl = byId('studentFrontShopEntryText');
  const collectionEntryEl = byId('studentFrontCollectionEntryText');
  const rankingEntryEl = byId('studentFrontRankingEntryText');
  const visualGlyphEl = byId('studentFrontStageVisualGlyph');
  const visualTitleEl = byId('studentFrontStageVisualTitle');
  const visualTextEl = byId('studentFrontStageVisualText');
  const storyDailyEl = byId('studentFrontStoryDaily');
  const storyDailyHintEl = byId('studentFrontStoryDailyHint');
  const storyBossEl = byId('studentFrontStoryBoss');
  const storyBossHintEl = byId('studentFrontStoryBossHint');
  const storyRankingEl = byId('studentFrontStoryRanking');
  const storyRankingHintEl = byId('studentFrontStoryRankingHint');
  const bridgePreviewEl = byId('teacherStudentBridgePreview');
  if (!nicknameEl) return;

  if (!student) {
    nicknameEl.textContent = '未載入學生';
    if (badgeEl) badgeEl.textContent = '模式未設定';
    if (subtitleEl) subtitleEl.textContent = '請先載入學生後，再檢查舊版前台體感是否對齊。';
    if (stageEl) stageEl.textContent = '尚未判定成長階段';
    if (coinsEl) coinsEl.textContent = '0';
    if (xpEl) xpEl.textContent = '0';
    if (titleEl) titleEl.textContent = '未設定';
    if (gradeEl) gradeEl.textContent = '未設定';
    if (guideModeEl) guideModeEl.textContent = 'cat';
    if (guideSummaryEl) guideSummaryEl.textContent = '智者貓咪｜安全、陪伴式的學生引導模式。';
    if (guideGlyphEl) guideGlyphEl.textContent = '🐾';
    if (guideHintEl) guideHintEl.textContent = '點擊可查看夥伴圖像、世界觀與最近一次回覆。';
    if (rankingPreviewEl) rankingPreviewEl.textContent = '尚未載入學生';
    if (stageQuickEl) stageQuickEl.textContent = '查看目前階段、圖像描述與屬性固定規則';
    if (radarQuickEl) radarQuickEl.textContent = '查看五種能力指標、來源與雷達詳情';
    if (collectionQuickEl) collectionQuickEl.textContent = '查看目前啟用中的收藏與展示順序';
    if (activityQuickEl) activityQuickEl.textContent = '查看近期事件、排行摘要與前台互動';
    if (dailyEntryEl) dailyEntryEl.textContent = '前往每日題目與今日進度';
    if (bossEntryEl) bossEntryEl.textContent = '前往 Boss 清單與挑戰結果';
    if (partnerEntryEl) partnerEntryEl.textContent = '查看世界觀、夥伴與最近回覆';
    if (shopEntryEl) shopEntryEl.textContent = '前往可購買商品與隱藏蛋切換';
    if (collectionEntryEl) collectionEntryEl.textContent = '查看目前收藏與展示排序';
    if (rankingEntryEl) rankingEntryEl.textContent = '查看目前排行階級與下一階段目標';
    if (visualGlyphEl) visualGlyphEl.textContent = '📦';
    if (visualTitleEl) visualTitleEl.textContent = '缺乏能量階段';
    if (visualTextEl) visualTextEl.textContent = '點擊可查看目前階段的圖像描述、收藏規則與屬性固定條件。';
    if (storyDailyEl) storyDailyEl.textContent = '等待載入學生';
    if (storyDailyHintEl) storyDailyHintEl.textContent = '先由老師查找學生，再回到學生前台檢查每日歷練入口。';
    if (storyBossEl) storyBossEl.textContent = '尚未載入 Boss 狀態';
    if (storyBossHintEl) storyBossHintEl.textContent = '會顯示挑戰摘要、最近結果與切換入口。';
    if (storyRankingEl) storyRankingEl.textContent = '尚未載入排行目標';
    if (storyRankingHintEl) storyRankingHintEl.textContent = '會顯示目前階級與距離下一階段差距。';
    if (bridgePreviewEl) bridgePreviewEl.textContent = '老師端：先查找學生，再進老師操作頁。\n學生端：帶 token 進入，才能讀取正式前台資料。';
    return;
  }

  const stage = getGrowthStage(safe.totalXP);
  const guideMeta = getGuideModeMeta(safe);
  const guideSpotlight = getGuideSpotlightMeta(safe);
  const ranking = getLeaderboardTier(safe);
  const roadmap = getLeaderboardRoadmap(ranking.score);
  const visual = getStudentGrowthVisual(stage.key, guideMeta.mode);
  const collectionCount = getMergedCollectionItems(safe).length;
  const logsCount = getUnifiedActivityCount(safe);
  const serial = safe.serial || safe.card_seq || '-';
  const nickname = safe.nickname || safe.display_name || safe.name || '未命名學生';
  const dailyCount = countLogs(safe, (item) => String(item?.detail || '').includes('每日'));
  const bossCount = countLogs(safe, (item) => String(item?.detail || '').includes('Boss'));
  const activeToken = String(safe.active_token || safe.page_token || '').trim() || '未綁定';
  nicknameEl.textContent = nickname;
  if (badgeEl) badgeEl.textContent = guideMeta.world;
  if (subtitleEl) subtitleEl.textContent = `${safe.name || nickname}｜卡序 ${serial}｜${guideMeta.partner} 正在陪伴這位學生。`;
  if (stageEl) stageEl.textContent = `${stage.title}｜${stage.subtitle}`;
  if (coinsEl) coinsEl.textContent = String(Number(safe.coins) || 0);
  if (xpEl) xpEl.textContent = String(Number(safe.totalXP) || 0);
  if (titleEl) titleEl.textContent = safe.title || safe.current_title || '未設定';
  if (gradeEl) gradeEl.textContent = safe.grade || safe.gradeLabel || '未設定';
  if (guideModeEl) guideModeEl.textContent = `${guideMeta.partner}｜${guideMeta.mode}${guideMeta.locked ? '｜locked' : '｜adaptive'}`;
  if (guideSummaryEl) guideSummaryEl.textContent = `${guideMeta.summary} 風格：${guideMeta.tone}。`;
  if (guideGlyphEl) guideGlyphEl.textContent = guideSpotlight.glyph;
  if (guideHintEl) guideHintEl.textContent = guideSpotlight.imageHint;
  if (rankingPreviewEl) rankingPreviewEl.textContent = buildStudentFrontRankingPreview(safe);
  if (stageQuickEl) stageQuickEl.textContent = `${visual.title}｜${visual.fixedRule}`;
  if (radarQuickEl) radarQuickEl.textContent = `最高屬性 ${ATTR_LABELS[ranking.topAttrKey] || ranking.topAttrKey} ${Number(ranking.topAttrValue || 0)}｜五系總量 ${ranking.totalAttrs}`;
  if (collectionQuickEl) collectionQuickEl.textContent = `收藏 ${collectionCount} 件｜目前啟用 ${safe.active_hidden_egg?.name || safe.active_hidden_egg_id || '無'}`;
  if (activityQuickEl) activityQuickEl.textContent = `近期事件 ${logsCount} 筆｜排行階級 ${ranking.tier} ${ranking.percentile}`;
  if (dailyEntryEl) dailyEntryEl.textContent = `今日紀錄 ${dailyCount} 筆｜前往每日題目與提交入口`;
  if (bossEntryEl) bossEntryEl.textContent = `Boss 紀錄 ${bossCount} 筆｜前往 Boss 清單與挑戰結果`;
  if (partnerEntryEl) partnerEntryEl.textContent = `${guideMeta.partner}｜${guideMeta.tone}｜查看最近回覆與圖像`;
  if (shopEntryEl) shopEntryEl.textContent = `${Number(safe.coins) || 0} 金幣｜前往商城與隱藏蛋切換`;
  if (collectionEntryEl) collectionEntryEl.textContent = `收藏 ${collectionCount} 件｜點開可放大並調整順序`;
  if (rankingEntryEl) rankingEntryEl.textContent = roadmap.next ? `${ranking.tier} → ${roadmap.next.tier} 還差 ${roadmap.remaining}` : `已達 ${ranking.tier} 最高階級`;
  if (visualGlyphEl) visualGlyphEl.textContent = visual.glyph;
  if (visualTitleEl) visualTitleEl.textContent = `${stage.title}｜${visual.title}`;
  if (visualTextEl) visualTextEl.textContent = `${visual.description} ${visual.fixedRule}`;
  if (storyDailyEl) storyDailyEl.textContent = dailyCount > 0 ? `今日歷練 ${dailyCount} 筆` : '今日尚未留下每日歷練紀錄';
  if (storyDailyHintEl) storyDailyHintEl.textContent = `金幣 ${Number(safe.coins) || 0}｜從首頁入口可回到每日面板並驗證回寫結果。`;
  if (storyBossEl) storyBossEl.textContent = bossCount > 0 ? `Boss 足跡 ${bossCount} 筆` : '今日尚未留下 Boss 挑戰紀錄';
  if (storyBossHintEl) storyBossHintEl.textContent = roadmap.next ? `目前 ${ranking.tier}｜朝 ${roadmap.next.tier} 邁進，還差 ${roadmap.remaining}。` : `目前已達 ${ranking.tier} 階級。`;
  if (storyRankingEl) storyRankingEl.textContent = `${ranking.tier}｜${ranking.percentile}`;
  if (storyRankingHintEl) storyRankingHintEl.textContent = `最高屬性 ${ATTR_LABELS[ranking.topAttrKey] || ranking.topAttrKey} ${Number(ranking.topAttrValue || 0)}｜五系總量 ${ranking.totalAttrs}`;
  if (bridgePreviewEl) bridgePreviewEl.textContent = [
    `老師正式入口：登入後以 serial / ntag 查到 ${nickname} (#${serial})，再進老師學生操作頁。`,
    `學生正式入口：刷 ntag / NFC 帶 token ${activeToken} 進學生正式頁，世界觀 ${guideMeta.world}｜${guideMeta.partner}。`,
    roadmap.next ? `同步檢查建議：先在老師頁完成寫入，再到學生正式頁驗每日 / Boss / 排行是否同步。` : `同步檢查建議：可直接驗收藏、排行與學生首頁互動。`,
  ].join('\n');
}

function buildStudentOverviewHtml(student) {
  const safe = applyDataMigration(student || {});
  const stage = getGrowthStage(safe.totalXP);
  const guideMeta = getGuideModeMeta(safe);
  const [topAttrKey, topAttrValue] = getTopAttrEntry(safe);
  const ranking = getLeaderboardTier(safe);
  const roadmap = getLeaderboardRoadmap(ranking.score);
  const token = String(safe.active_token || safe.page_token || '').trim() || '未綁定';
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">學生正式頁總覽</h3>
        <div class="student-detail-line"><span class="student-detail-label">正式姓名</span><span class="student-detail-value">${escapeHtml(safe.name || '未命名學生')}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">暱稱 / 顯示名稱</span><span class="student-detail-value">${escapeHtml(safe.nickname || safe.display_name || safe.name || '未設定')}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">卡序</span><span class="student-detail-value">${escapeHtml(safe.serial || safe.card_seq || '-')}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">年級</span><span class="student-detail-value">${escapeHtml(safe.grade || safe.gradeLabel || '未設定')}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">稱號</span><span class="student-detail-value">${escapeHtml(safe.title || safe.current_title || '未設定')}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">成長階段</span><span class="student-detail-value">${escapeHtml(stage.title)}｜${escapeHtml(stage.progress)}</span></div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">學生前台關鍵數值</h3>
        <div class="student-detail-line"><span class="student-detail-label">金幣</span><span class="student-detail-value">${Number(safe.coins) || 0}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">成長能量</span><span class="student-detail-value">${Number(safe.totalXP) || 0}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">最高屬性</span><span class="student-detail-value">${escapeHtml(ATTR_LABELS[topAttrKey] || topAttrKey)} ${Number(topAttrValue || 0)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">目前隱藏蛋</span><span class="student-detail-value">${escapeHtml(safe.active_hidden_egg?.name || safe.active_hidden_egg_id || '無')}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">世界觀 / AI</span><span class="student-detail-value">${escapeHtml(guideMeta.world)}｜${escapeHtml(guideMeta.partner)}</span></div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">正式入口規則 / 師生同步檢查</h3>
        <div class="student-detail-line"><span class="student-detail-label">老師端</span><span class="student-detail-value">登入後查 serial / ntag → 老師學生操作頁 → 事件寫入</span></div>
        <div class="student-detail-line"><span class="student-detail-label">學生端</span><span class="student-detail-value">刷 ntag / NFC 帶 token ${escapeHtml(token)} → 學生正式頁</span></div>
        <div class="student-detail-line"><span class="student-detail-label">排行節點</span><span class="student-detail-value">${escapeHtml(ranking.tier)}｜${roadmap.next ? `下一階 ${escapeHtml(roadmap.next.tier)} 還差 ${roadmap.remaining}` : '已達目前最高階級'}</span></div>
        <div class="legacy-callout">這裡用來檢查老師正式入口與學生正式入口各自分流，但共用同一位學生的暱稱、token、排行與世界觀資料。</div>
      </div>
    </div>`;
}

function buildStudentPartnerHtml(student) {
  const safe = applyDataMigration(student || {});
  const guideMeta = getGuideModeMeta(safe);
  const guideReply = String(byId('guideResultText')?.textContent || '尚未提問').trim();
  const spotlight = getGuideSpotlightMeta(safe);
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <div class="student-stage-hero">
          <div class="student-stage-hero-glyph">${escapeHtml(spotlight.glyph)}</div>
          <div class="student-stage-hero-copy">
            <h3 class="tech-font">${escapeHtml(spotlight.title)}｜${escapeHtml(guideMeta.world)}</h3>
            <p>${escapeHtml(guideMeta.summary)}</p>
            <small>${escapeHtml(spotlight.imageHint)}</small>
          </div>
        </div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">AI 夥伴 / 世界觀</h3>
        <div class="student-detail-line"><span class="student-detail-label">正式模式值</span><span class="student-detail-value">${escapeHtml(guideMeta.mode)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">世界觀</span><span class="student-detail-value">${escapeHtml(guideMeta.world)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">引導夥伴</span><span class="student-detail-value">${escapeHtml(guideMeta.partner)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">是否鎖定</span><span class="student-detail-value">${guideMeta.locked ? 'locked' : 'adaptive'}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">目前成長圖像</span><span class="student-detail-value">${escapeHtml(spotlight.visual.title)} ${escapeHtml(spotlight.visual.glyph)}</span></div>
        <div class="legacy-callout">${escapeHtml(guideMeta.summary)} 風格：${escapeHtml(guideMeta.tone)}。${escapeHtml(spotlight.visual.fixedRule)}</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">最近一次 AI 回覆預覽</h3>
        <pre>${escapeHtml(guideReply || '尚未提問')}</pre>
      </div>
    </div>`;
}

function buildTeamVisualCards(teamItems = []) {
  if (!teamItems.length) return '<div class="student-empty-card">尚未設定成熟期隊伍</div>';
  return `<div class="student-team-visual-grid">${teamItems.map((item, idx) => {
    const itemId = getCollectionItemId(item, item._collectionId);
    const attrs = item?.stats && typeof item.stats === 'object' ? item.stats : {};
    const topAttr = Object.entries(attrs).sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0))[0] || ['metal', 0];
    const glyph = String(item?.glyph || item?.emoji || item?.symbol || (item?.name || item?.hiddenEggId || '獸').slice(0, 1)).trim() || '獸';
    return `<button type="button" class="student-team-visual-card" data-lineup-open="${escapeHtml(itemId)}">
      <div class="student-team-visual-order">#${idx + 1}</div>
      <div class="student-team-visual-glyph">${escapeHtml(glyph)}</div>
      <div class="student-team-visual-name">${escapeHtml(item?.name || item?.hiddenEggId || '未命名異獸')}</div>
      <div class="student-team-visual-meta">${escapeHtml(ATTR_LABELS[topAttr[0]] || topAttr[0])} ${Number(topAttr[1] || 0)}</div>
    </button>`;
  }).join('')}</div>`;
}


function buildStudentRankingLineupHtml(student) {
  const safe = applyDataMigration(student || {});
  const teamItems = getLeaderboardTeamItems(safe);
  const readiness = getCollectionSnapshotReadiness(safe);
  const slots = [0, 1, 2].map((idx) => teamItems[idx] || null);
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">排行榜展示隊伍</h3>
        <div class="student-team-visual-grid student-team-visual-grid-fixed">${slots.map((item, idx) => item
          ? `<button type="button" class="student-team-visual-card is-fixed" data-lineup-open="${escapeHtml(getCollectionItemId(item, item._collectionId))}"><div class="student-team-visual-order">#${idx + 1}</div><div class="student-team-visual-glyph">${escapeHtml(String(item?.glyph || item?.emoji || item?.symbol || (item?.name || item?.hiddenEggId || '獸').slice(0, 1)).trim() || '獸')}</div><div class="student-team-visual-name">${escapeHtml(item?.name || item?.hiddenEggId || '未命名異獸')}</div><div class="student-team-visual-meta">${escapeHtml(item?.stageKey || 'adult-cat')}</div></button>`
          : `<div class="student-team-visual-card is-fixed is-empty"><div class="student-team-visual-order">#${idx + 1}</div><div class="student-team-visual-glyph">＋</div><div class="student-team-visual-name">尚未編入</div><div class="student-team-visual-meta">可到成熟隊伍設定加入</div></div>`).join('')}</div>
        <div class="legacy-callout">排行榜可固定顯示三個隊伍槽位；點選已編入的異獸卡可直接查看放大圖像與雷達快照。</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">上榜準備度</h3>
        <div class="student-detail-line"><span class="student-detail-label">成熟隊伍</span><span class="student-detail-value">${teamItems.length} / 3</span></div>
        <div class="student-detail-line"><span class="student-detail-label">收藏快照完整度</span><span class="student-detail-value">${readiness.ready} / ${readiness.total}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">狀態</span><span class="student-detail-value">${readiness.missing.length ? '建議先做快照整備' : '可直接展示排行榜隊伍'}</span></div>
        <pre>${escapeHtml(readiness.missing.length ? readiness.missing.slice(0, 6).map((row) => `${row.name}｜缺 ${[row.lacksStats ? '雷達' : '', row.lacksStage ? '階段' : '', row.lacksVisual ? '圖像' : '', row.lacksAt ? '時間' : ''].filter(Boolean).join('/')}`).join('\n') : '目前隊伍與收藏快照可直接承接排行榜顯示與縮圖放大。')}</pre>
      </div>
    </div>`;
}

function showStudentRankingLineupDetail() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '排行榜展示隊伍', kicker: 'Ranking Lineup', html: buildStudentRankingLineupHtml(student) });
}

function buildStudentExchangeHtml(student) {
  const safe = applyDataMigration(student || {});
  const teamItems = getLeaderboardTeamItems(safe);
  const matureCount = getMatureCollectionItems(safe).length;
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">交換神獸專區骨架</h3>
        <div class="student-detail-line"><span class="student-detail-label">成熟期異獸</span><span class="student-detail-value">${matureCount}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">目前展示隊伍</span><span class="student-detail-value">${teamItems.length ? `${teamItems.length} / 3` : '尚未設定'}</span></div>
        <div class="legacy-callout">未來可在這裡指定可交換異獸、交換條件屬性與數量，並串接異獸基因庫與競標機制。</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">目前可作為交換候選的成熟隊伍</h3>
        ${buildTeamVisualCards(teamItems)}
      </div>
    </div>`;
}

function buildStudentHostelHtml(student) {
  const safe = applyDataMigration(student || {});
  const stage = getGrowthStage(safe.totalXP);
  const guide = getGuideModeMeta(safe);
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">寄宿摘要</h3>
        <div class="student-detail-line"><span class="student-detail-label">目前成長階段</span><span class="student-detail-value">${escapeHtml(stage.title)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">世界觀模式</span><span class="student-detail-value">${escapeHtml(guide.world)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">前台啟用異獸</span><span class="student-detail-value">${escapeHtml(safe.active_hidden_egg?.name || safe.active_hidden_egg_id || '尚未設定')}</span></div>
        <div class="legacy-callout">正式版可在這裡承接寄宿中的照護回饋、暫存收益、返回時間與照護者紀錄。</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">保留欄位</h3>
        <pre>${escapeHtml(JSON.stringify({ hostel_status: safe.hostel_status || 'idle', hostel_reward_pending: safe.hostel_reward_pending || 0, hostel_partner: safe.hostel_partner || null }, null, 2))}</pre>
      </div>
    </div>`;
}

function showStudentExchangeDetail() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '交換神獸 / 基因庫骨架', kicker: 'Exchange & Gene Vault', html: buildStudentExchangeHtml(student) });
}

function showStudentHostelDetail() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '寄宿摘要 / 保留入口', kicker: 'Hostel Summary', html: buildStudentHostelHtml(student) });
}

function buildStudentRankingHtml(student) {
  const safe = applyDataMigration(student || {});
  const merged = getMergedCollectionItems(safe);
  const ranking = getLeaderboardTier(safe);
  const roadmap = getLeaderboardRoadmap(ranking.score);
  const recentLogs = buildUnifiedActivityLines(safe, 5);
  const teamItems = getLeaderboardTeamItems(safe);
  const scoreBreakdown = {
    xp: Number(safe.totalXP) || 0,
    attrs: Number(ranking.totalAttrs) || 0,
    logs: getUnifiedActivityCount(safe) * 2,
  };
  const ladderHtml = roadmap.tiers.map((item) => `
    <div class="student-ladder-step ${item.isCurrent ? 'is-current' : ''} ${item.isNext ? 'is-next' : ''}">
      <div class="student-ladder-head"><span>${escapeHtml(item.tier)}｜${escapeHtml(item.percentile)}</span><span>${item.threshold} 分</span></div>
      <div class="student-ladder-copy">${escapeHtml(item.isCurrent ? `目前所在階級。${item.copy}` : item.isNext ? `下一階級，還差 ${item.remaining} 分。${item.copy}` : item.reached ? '已跨過此階段。' : item.copy)}</div>
    </div>`).join('');
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">排行榜 / 展示摘要</h3>
        <div class="student-detail-line"><span class="student-detail-label">排行階級</span><span class="student-detail-value"><span class="student-tier-badge">${escapeHtml(ranking.tier)}｜${escapeHtml(ranking.percentile)}</span></span></div>
        <div class="student-detail-line"><span class="student-detail-label">排行分數</span><span class="student-detail-value">${Number(ranking.score || 0)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">最高屬性</span><span class="student-detail-value">${escapeHtml(ATTR_LABELS[ranking.topAttrKey] || ranking.topAttrKey)} ${Number(ranking.topAttrValue || 0)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">五系總量</span><span class="student-detail-value">${Number(ranking.totalAttrs || 0)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">收藏展示數</span><span class="student-detail-value">${merged.length}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">收藏快照整備</span><span class="student-detail-value">${getCollectionSnapshotReadiness(safe).ready} / ${getCollectionSnapshotReadiness(safe).total}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">下一階段</span><span class="student-detail-value">${roadmap.next ? `${escapeHtml(roadmap.next.tier)}｜還差 ${roadmap.remaining}` : '已達目前最高階級'}</span></div>
        <div class="legacy-callout">分數組成：XP ${scoreBreakdown.xp} + 五系 ${scoreBreakdown.attrs} + 事件 ${scoreBreakdown.logs}。</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">排行榜階段路線</h3>
        <div class="student-ladder">${ladderHtml}</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">排行榜展示隊伍</h3>
        ${buildTeamVisualCards(teamItems)}
        <div class="legacy-callout">排行榜可依這組成熟期異獸隊伍顯示不同的展示內容；點選隊伍成員可直接查看放大圖像與雷達快照。</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">收藏快照整備度</h3>
        ${(() => {
          const readiness = getCollectionSnapshotReadiness(safe);
          const missingText = readiness.missing.length
            ? readiness.missing.slice(0, 5).map((item) => `${item.name}｜缺 ${[item.lacksStats ? '雷達' : '', item.lacksStage ? '階段' : '', item.lacksVisual ? '圖像' : '', item.lacksAt ? '時間' : ''].filter(Boolean).join('/')}`).join('\n')
            : '所有收藏快照都已具備顯示排行榜與放大視窗所需的主要欄位。';
          return `<div class="student-detail-line"><span class="student-detail-label">可直接展示</span><span class="student-detail-value">${readiness.ready} / ${readiness.total}</span></div><pre>${escapeHtml(missingText)}</pre>`;
        })()}
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">近期事件（前台體感）</h3>
        <pre>${escapeHtml(recentLogs.length ? recentLogs.join('\n') : '尚無近期事件')}</pre>
      </div>
    </div>`;
}

function showStudentOverviewDetail() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '學生前台總覽', kicker: 'Student Front Overview', html: buildStudentOverviewHtml(student) });
}

function showStudentPartnerDetail() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: 'AI / 夥伴詳情', kicker: 'World & Guide', html: buildStudentPartnerHtml(student) });
}

function showStudentGuideSpotlight() {
  showStudentPartnerDetail();
}

function showStudentRankingDetail() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '排行 / 展示詳情', kicker: 'Ranking Preview', html: buildStudentRankingHtml(student) });
}

function buildStudentStageHtml(student) {
  const safe = applyDataMigration(student || {});
  const stage = getGrowthStage(safe.totalXP);
  const guideMeta = getGuideModeMeta(safe);
  const visual = getStudentGrowthVisual(stage.key, guideMeta.mode);
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <div class="student-stage-hero">
          <div class="student-stage-hero-glyph">${escapeHtml(visual.glyph)}</div>
          <div class="student-stage-hero-copy">
            <h3 class="tech-font">${escapeHtml(stage.title)}｜${escapeHtml(visual.title)}</h3>
            <p>${escapeHtml(visual.description)}</p>
            <small>${escapeHtml(stage.subtitle)}｜${escapeHtml(stage.progress)}</small>
          </div>
        </div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">圖像與固定規則</h3>
        <div class="student-detail-line"><span class="student-detail-label">世界觀模式</span><span class="student-detail-value">${escapeHtml(guideMeta.world)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">引導夥伴</span><span class="student-detail-value">${escapeHtml(guideMeta.partner)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">圖像規則</span><span class="student-detail-value">${escapeHtml(visual.fixedRule)}</span></div>
        <div class="legacy-callout">${escapeHtml(stage.key === 'adult-cat' ? '成熟後列入收藏展示；死亡後也應保留展示快照。' : '在 totalXP < 100 時，最高屬性仍可驅動圖像變化。')}</div>
      </div>
    </div>`;
}

function buildStudentCollectionSpotlightHtml(student, targetId = '') {
  const safe = applyDataMigration(student || {});
  const items = sortCollectionItems(safe, safe.collection_view_mode || 'custom');
  const activeId = String(safe.active_hidden_egg?.id || safe.active_hidden_egg_id || '').trim();
  const focused = items.find((item) => getCollectionItemId(item, item._collectionId) === String(targetId || '').trim())
    || items.find((item) => getCollectionItemId(item, item._collectionId) === activeId)
    || items[0];
  if (!focused) return '<div class="student-empty-card">尚無可放大的收藏項目</div>';
  const itemId = getCollectionItemId(focused, focused._collectionId);
  const attrs = focused?.stats && typeof focused.stats === 'object' ? focused.stats : safe.attributes || {};
  const orderIds = sortCollectionItems(safe, 'custom').map((item) => getCollectionItemId(item, item._collectionId)).filter(Boolean);
  const orderIndex = Math.max(0, orderIds.indexOf(itemId));
  const maxValue = Math.max(10, ...ATTR_KEYS.map((key) => Math.max(0, Number(attrs[key]) || 0)));
  return `
    <div class="student-spotlight-layout">
      <div class="student-detail-card">
        <div class="student-collection-spotlight student-collection-spotlight-wide">
          <div class="student-collection-spotlight-thumb student-collection-spotlight-hero">${escapeHtml((focused?.name || focused?.hiddenEggId || '?').slice(0, 1))}</div>
          <div class="student-stage-hero-copy">
            <h3 class="tech-font">${escapeHtml(focused?.name || focused?.hiddenEggId || '未命名收藏')}</h3>
            <p>${escapeHtml(itemId === activeId ? '這是目前前台正在啟用展示的收藏。' : '這是收藏展示中的一個縮圖項目。')}</p>
            <small>展示序位：第 ${orderIndex + 1} 張｜成熟期異獸可加入排行榜展示隊伍。</small>
          </div>
        </div>
      </div>
      <div class="student-detail-card ${itemId === activeId ? 'is-active' : ''}">
        <h3 class="tech-font">結算時五行五維雷達快照</h3>
        <div class="student-detail-metrics">${ATTR_KEYS.map((key) => {
          const value = Math.max(0, Number(attrs[key]) || 0);
          const pct = Math.max(8, Math.round((value / maxValue) * 100));
          return `<div class="student-radar-row"><div class="student-radar-meta"><strong>${escapeHtml(ATTR_LABELS[key] || key)}</strong><span>${value}</span></div><div class="student-radar-track"><div class="student-radar-fill" style="width:${pct}%"></div></div></div>`;
        }).join('')}</div>
        <div class="student-detail-line"><span class="student-detail-label">狀態</span><span class="student-detail-value">${escapeHtml(focused?.status || (itemId === activeId ? 'active' : 'stored'))}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">展示模式</span><span class="student-detail-value">${escapeHtml(safe.collection_view_mode || 'custom')}</span></div>
        <div class="legacy-callout">左側放大圖像，右側保留放入收藏當下的五行五維雷達快照。</div>
      </div>
    </div>`;
}

function buildStudentActivityHtml(student) {
  const safe = applyDataMigration(student || {});
  const ranking = getLeaderboardTier(safe);
  const roadmap = getLeaderboardRoadmap(ranking.score);
  const recentLogs = buildUnifiedActivityLines(safe, 8);
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <h3 class="tech-font">近期活動 / 排行入口</h3>
        <div class="student-detail-line"><span class="student-detail-label">排行階級</span><span class="student-detail-value"><span class="student-tier-badge">${escapeHtml(ranking.tier)}｜${escapeHtml(ranking.percentile)}</span></span></div>
        <div class="student-detail-line"><span class="student-detail-label">排行分數</span><span class="student-detail-value">${Number(ranking.score || 0)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">最高屬性</span><span class="student-detail-value">${escapeHtml(ATTR_LABELS[ranking.topAttrKey] || ranking.topAttrKey)} ${Number(ranking.topAttrValue || 0)}</span></div>
        <div class="student-detail-line"><span class="student-detail-label">下一階段</span><span class="student-detail-value">${roadmap.next ? `${escapeHtml(roadmap.next.tier)}｜還差 ${roadmap.remaining}` : '已達目前最高階級'}</span></div>
        <div class="legacy-callout">正式版排行榜可改成彈窗入口；目前先用這個詳情視窗承接舊版互動節奏。</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">近期事件</h3>
        <pre>${escapeHtml(recentLogs.length ? recentLogs.join('\n') : '尚無近期事件')}</pre>
      </div>
    </div>`;
}

function showStudentStageDetail() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '成長圖像 / 階段詳情', kicker: 'Growth Visual & Stage', html: buildStudentStageHtml(student) });
}

function showStudentCollectionSpotlight(targetId = '') {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '收藏展示 / 圖像放大', kicker: 'Collection Spotlight', html: buildStudentCollectionSpotlightHtml(student, targetId) });
}

function showStudentActivityDetail() {
  const student = ensureStudentLoaded();
  openStudentDetailModal({ title: '近期活動 / 排行入口', kicker: 'Activity & Ranking', html: buildStudentActivityHtml(student) });
}

function renderStudentRadar(student) {
  const mount = byId('studentRadarGrid');
  const stageEl = byId('studentGrowthStageText');
  const indicatorMount = byId('studentIndicatorCounts');
  if (!mount || !stageEl) return;
  const safe = applyDataMigration(student || {});
  const attrs = safe.attributes || {};
  const values = ATTR_KEYS.map((key) => ({ key, label: ATTR_LABELS[key] || key, value: Math.max(0, Number(attrs[key]) || 0) }));
  const maxValue = Math.max(10, ...values.map((row) => row.value));
  const stage = getGrowthStage(safe.totalXP);
  const guideMeta = getGuideModeMeta(safe);
  const visual = getStudentGrowthVisual(stage.key, guideMeta.mode);
  const top = getTopAttrEntry(safe);
  mount.innerHTML = `
    <div class="student-showcase-hero">
      <div class="student-showcase-glyph">${escapeHtml(visual.glyph)}</div>
      <div class="student-showcase-copy">
        <h3 class="tech-font">${escapeHtml(visual.title)}</h3>
        <p>${escapeHtml(visual.description)}</p>
        <small>最高屬性：${escapeHtml(ATTR_LABELS[top[0]] || top[0])} ${Number(top[1] || 0)}</small>
      </div>
    </div>
    <div class="student-showcase-radar">${values.map((row) => {
      const pct = Math.max(8, Math.round((row.value / maxValue) * 100));
      return `<div class="student-radar-row"><div class="student-radar-meta"><strong>${escapeHtml(row.label)}</strong><span>${row.value}</span></div><div class="student-radar-track"><div class="student-radar-fill" style="width:${pct}%"></div></div></div>`;
    }).join('')}</div>`;
  stageEl.innerHTML = `<strong>${escapeHtml(stage.title)}</strong><span>${escapeHtml(stage.subtitle)}</span><small>${escapeHtml(stage.progress)}</small>`;
  if (indicatorMount) indicatorMount.innerHTML = buildIndicatorCountsHtml(safe);
}

function renderStudentCollectionGallery(student) {
  const mount = byId('studentCollectionGallery');
  const sortSelect = byId('studentCollectionSortMode');
  if (!mount) return;
  const safe = applyDataMigration(student || {});
  const mode = String(sortSelect?.value || safe.collection_view_mode || 'custom').trim() || 'custom';
  if (sortSelect && sortSelect.value !== mode) sortSelect.value = mode;
  const merged = sortCollectionItems(safe, mode).slice(0, 8);
  if (!merged.length) {
    mount.innerHTML = '<div class="student-empty-card">尚無隱藏蛋 / 收藏縮圖可展示</div>';
    return;
  }
  const activeId = String(safe.active_hidden_egg?.id || safe.active_hidden_egg_id || '').trim();
  mount.innerHTML = merged.map((item, idx) => {
    const itemId = getCollectionItemId(item, `collection-${idx}`);
    const isActive = itemId && itemId === activeId;
    const title = item?.name || item?.hiddenEggId || `收藏 ${idx + 1}`;
    const status = item?.status || (isActive ? 'active' : 'stored');
    const attrs = item?.stats && typeof item.stats === 'object' ? item.stats : safe.attributes || {};
    const topAttr = Object.entries(attrs).sort((a,b) => Number(b[1]||0) - Number(a[1]||0))[0];
    return `
      <article class="student-collection-card ${isActive ? 'is-active' : ''}" data-collection-id="${escapeHtml(itemId)}" role="button" tabindex="0" aria-label="查看 ${escapeHtml(title)} 詳情">
        <div class="student-collection-thumb">${escapeHtml((title || '?').slice(0,1))}</div>
        <div class="student-collection-body">
          <div class="student-collection-title">${escapeHtml(title)}</div>
          <div class="student-collection-meta">狀態：${escapeHtml(status)}${isActive ? '｜目前啟用中' : ''}</div>
          <div class="student-collection-meta">快照：${escapeHtml((ATTR_LABELS[topAttr?.[0]] || topAttr?.[0] || '未設定'))} ${Number(topAttr?.[1] || 0)}</div>
          <div class="student-collection-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-collection-move="left" data-collection-id="${escapeHtml(itemId)}" ${idx === 0 ? 'disabled' : ''}>往前</button>
            <button type="button" class="btn btn-ghost btn-sm" data-collection-move="right" data-collection-id="${escapeHtml(itemId)}" ${idx === merged.length - 1 ? 'disabled' : ''}>往後</button>
          </div>
        </div>
      </article>`;
  }).join('');
}

function renderStudentMatureTeamSummary(student) {
  const el = byId('studentMatureTeamSummary');
  if (!el) return;
  const safe = applyDataMigration(student || {});
  const matureCount = getMatureCollectionItems(safe).length;
  const teamItems = getLeaderboardTeamItems(safe);
  if (!matureCount) {
    el.textContent = '目前尚未持有成熟期異獸，暫時無法設定排行榜隊伍。';
    return;
  }
  el.textContent = teamItems.length
    ? `成熟期異獸 ${matureCount} 隻｜排行榜隊伍：${teamItems.map((item) => item?.name || item?.hiddenEggId || '未命名異獸').join(' / ')}`
    : `成熟期異獸 ${matureCount} 隻｜尚未設定排行榜隊伍`;
}

function renderStudentActivity(student) {
  const el = byId('studentActivityText');
  if (!el) return;
  const safe = applyDataMigration(student || {});
  const lines = buildUnifiedActivityLines(safe, 8);
  el.textContent = lines.length
    ? lines.join('\n')
    : '尚無近期活動';
}

function renderStudentFutureSystemSummaries(student) {
  const exchangeEl = byId('studentExchangeSummary');
  const hostelEl = byId('studentHostelSummary');
  const safe = applyDataMigration(student || {});
  const teamItems = getLeaderboardTeamItems(safe);
  const readiness = getCollectionSnapshotReadiness(safe);
  if (exchangeEl) {
    exchangeEl.textContent = `成熟隊伍 ${teamItems.length ? teamItems.map((item) => item?.name || item?.hiddenEggId || '未命名異獸').join(' / ') : '尚未設定'}｜收藏快照完整 ${readiness.ready}/${readiness.total}｜${readiness.missing.length ? '可先做快照整備' : '可直接參與排行榜 / 交換'}`;
  }
  if (hostelEl) {
    const stage = getGrowthStage(safe.totalXP);
    hostelEl.textContent = `目前階段：${stage.title}｜寄宿狀態：${safe.hostel_status || 'idle'}｜待領回饋：${Number(safe.hostel_reward_pending || 0)}`;
  }
}

function renderStudentReadinessSummary(student) {
  const el = byId('studentReadinessSummary');
  if (!el) return;
  const audit = buildStudentReadinessAudit(student);
  const parts = [
    `快照 ${audit.collectionReady}/${audit.collectionTotal}`,
    `成熟隊伍 ${audit.teamCount}/3`,
    `每日 ${audit.dailyResetOk ? '正常' : '待檢查'}`,
    `Boss ${audit.bossResetOk ? '正常' : '待檢查'}`,
  ];
  if (!audit.tokenBound) parts.push('token 未綁定');
  el.textContent = parts.join('｜');
}

function renderStudentShopControls(student, shopItems = []) {
  const select = byId('studentShopSelect');
  const hint = byId('studentShopHint');
  const eggSelect = byId('studentHiddenEggSelect');
  const safe = applyDataMigration(student || {});
  if (select) {
    if (!shopItems.length) select.innerHTML = '<option value="">目前沒有可顯示商品</option>';
    else select.innerHTML = shopItems.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}｜${item.price} 金幣｜${escapeHtml(item.allowed ? '可購買' : item.blockedReason)}</option>`).join('');
  }
  if (hint) {
    hint.textContent = shopItems.length ? `目前共載入 ${shopItems.length} 件商品，會依年級 / 稱號 / 上架狀態自動過濾。` : '目前沒有可顯示商品';
  }
  const eggs = Array.isArray(safe.hidden_eggs) ? safe.hidden_eggs : [];
  if (eggSelect) {
    if (!eggs.length) eggSelect.innerHTML = '<option value="">尚無隱藏蛋可切換</option>';
    else eggSelect.innerHTML = eggs.map((egg) => {
      const active = String(egg?.id || egg?.hiddenEggId || '').trim() === String(safe.active_hidden_egg?.id || safe.active_hidden_egg_id || '').trim();
      return `<option value="${escapeHtml(egg.id || egg.hiddenEggId || '')}">${escapeHtml(egg.name || egg.hiddenEggId || '未命名隱藏蛋')}${active ? '｜目前啟用' : ''}</option>`;
    }).join('');
  }
}

function byId(id) {
  return document.getElementById(id);
}

function ensureStudentLoaded() {
  if (!currentState.studentData) {
    throw new Error('請先載入一位學生');
  }
  return currentState.studentData;
}

function getBoundToken() {
  const stateToken = String(currentState.currentToken || '').trim();
  const formToken = String(byId('studentTokenBindInput')?.value || '').trim();
  return stateToken || formToken;
}

function stopStudentIdleGuard() {
  if (studentIdleWarnTimer) window.clearTimeout(studentIdleWarnTimer);
  if (studentIdleTimer) window.clearTimeout(studentIdleTimer);
  studentIdleWarnTimer = null;
  studentIdleTimer = null;
}

function updateStudentSessionHint(message = '') {
  const el = byId('studentSessionHint');
  if (!el) return;
  el.textContent = message || '尚未綁定學生 token。';
}

function clearStudentTokenSession(reason = '已清除學生 token / session', { silent = false } = {}) {
  stopStudentIdleGuard();
  currentState.currentToken = null;
  const input = byId('studentTokenBindInput');
  if (input) input.value = '';
  updateStudentCoreSummary();
  updateStudentSessionHint(reason);
  if (!silent) renderStudentCoreResult('學生 token / session 已清除', { ok: true, code: 'student-token-cleared', message: reason });
}

function recordStudentActivity() {
  const token = getBoundToken();
  if (!token) {
    stopStudentIdleGuard();
    updateStudentSessionHint('尚未綁定學生 token。');
    return;
  }
  stopStudentIdleGuard();
  updateStudentSessionHint(`學生 token 已綁定，閒置 ${Math.round((Number(APP_CONFIG.studentIdleLogoutMs || 0) || 0) / 60000)} 分鐘後將自動清除。`);
  studentIdleWarnTimer = window.setTimeout(() => {
    updateStudentSessionHint('學生端即將自動清除 token / session，若仍在操作請繼續互動頁面。');
    setBanner('學生端即將因閒置清除 token / session。', 'warn');
  }, APP_CONFIG.studentIdleWarnMs);
  studentIdleTimer = window.setTimeout(() => {
    clearStudentTokenSession('學生端因閒置已自動清除 token / session。');
    showAlert('學生端已因閒置自動清除 token / session');
  }, APP_CONFIG.studentIdleLogoutMs);
}

function setBanner(message, variant = 'neutral') {
  const banner = byId('studentCoreBanner');
  if (!banner) return;
  banner.className = `notice-banner notice-${variant}`;
  banner.textContent = message || '';
}

function setStatusCard(cardId, valueId, hintId, valueText, hintText, variant = 'neutral') {
  const card = byId(cardId);
  const valueEl = byId(valueId);
  const hintEl = byId(hintId);
  if (card) card.className = `status-card status-${variant}`;
  if (valueEl) valueEl.textContent = valueText;
  if (hintEl) hintEl.textContent = hintText;
}

function fillOptionLabels(prefix, options = []) {
  for (let idx = 1; idx <= 4; idx += 1) {
    const label = byId(`${prefix}Option${idx}Label`);
    const radio = byId(`${prefix}Option${idx}`);
    const option = options[idx - 1];
    if (label) label.textContent = option?.text || `選項 ${idx}`;
    if (radio) radio.checked = idx === 1;
  }
}

function renderQuestionMeta(targetId, question = null, extra = []) {
  const el = byId(targetId);
  if (!el) return;
  if (!question) {
    el.textContent = '尚未載入';
    return;
  }
  const lines = [
    `年級：${question.grade || '-'}`,
    `學期：${question.semester || '-'}`,
    `群組：${question.audience || '-'}`,
    `單元：${question.unit || '-'}`,
    `題目ID：${question.id || '-'}`,
    ...extra,
    '選項：',
    ...((question.options || []).map((opt, idx) => `${idx + 1}. ${opt?.text || ''}`)),
    `正解：選項 ${question.answer || '-'}`,
  ];
  el.textContent = lines.join('\n');
}

function countLogs(student, matcher) {
  const logs = Array.isArray(student?.logs) ? student.logs : [];
  return logs.filter((item) => {
    try {
      return matcher(item || {});
    } catch (_error) {
      return false;
    }
  }).length;
}

function hasLogWithKeyword(student, keyword = '') {
  const safeKeyword = String(keyword || '').trim();
  if (!safeKeyword) return false;
  return countLogs(student, (item) => String(item?.detail || '').includes(safeKeyword)) > 0;
}

function verifyStudentRewardPersistence(beforeStudent, afterStudent, result, rewardType = 'daily_correct') {
  const before = applyDataMigration(beforeStudent || {});
  const after = applyDataMigration(afterStudent || {});
  if (!afterStudent || typeof afterStudent !== 'object') {
    throw new Error('學生流程回讀驗證失敗：canonical reread 缺少 student');
  }
  const beforeCoins = Number(before.coins) || 0;
  const afterCoins = Number(after.coins) || 0;
  const beforeXp = Number(before.totalXP) || 0;
  const afterXp = Number(after.totalXP) || 0;
  const rewardCoins = Math.max(0, Number(result?.reward?.coins ?? result?.reward?.coin ?? 0) || 0);
  const rewardXp = Math.max(0, Number(result?.reward?.xp ?? result?.reward?.totalXP ?? 0) || 0);
  const lines = [];

  if (result?.applied) {
    const expectedCoins = beforeCoins + rewardCoins;
    const expectedXp = beforeXp + rewardXp;
    if (afterCoins !== expectedCoins) throw new Error(`學生流程回讀驗證失敗：金幣預期 ${expectedCoins}，實際 ${afterCoins}`);
    if (afterXp !== expectedXp) throw new Error(`學生流程回讀驗證失敗：totalXP 預期 ${expectedXp}，實際 ${afterXp}`);
    lines.push('寫入驗證：成功');
    lines.push(`金幣：${beforeCoins} -> ${afterCoins}`);
    lines.push(`totalXP：${beforeXp} -> ${afterXp}`);
  } else if (result?.code === 'daily-limit' || result?.code === 'battle-limit') {
    if (afterCoins !== beforeCoins) throw new Error(`學生流程回讀驗證失敗：限制狀態下金幣應維持 ${beforeCoins}，實際 ${afterCoins}`);
    if (afterXp !== beforeXp) throw new Error(`學生流程回讀驗證失敗：限制狀態下 totalXP 應維持 ${beforeXp}，實際 ${afterXp}`);
    lines.push('寫入驗證：成功');
    lines.push(`限制狀態：${result.code}`);
    lines.push(`金幣維持：${afterCoins}`);
    lines.push(`totalXP 維持：${afterXp}`);
  } else {
    lines.push('寫入驗證：未套用獎勵（符合目前結果碼）');
    lines.push(`金幣：${afterCoins}`);
    lines.push(`totalXP：${afterXp}`);
  }

  const keyword = rewardType === 'boss_win' ? 'Boss' : '每日';
  const beforeMatched = countLogs(before, (item) => String(item?.detail || '').includes(keyword));
  const afterMatched = countLogs(after, (item) => String(item?.detail || '').includes(keyword));
  if (result?.applied && afterMatched < beforeMatched + 1) {
    throw new Error(`學生流程回讀驗證失敗：找不到新增的 ${keyword} 事件紀錄`);
  }
  if (result?.applied) lines.push(`事件紀錄：已新增 ${keyword} 紀錄`);
  return lines;
}

function verifyStudentShopPersistence(beforeStudent, afterStudent, result, item = {}) {
  const before = applyDataMigration(beforeStudent || {});
  const after = applyDataMigration(afterStudent || {});
  const outcome = result?.shopOutcome || {};
  const beforeCoins = Number(before.coins) || 0;
  const afterCoins = Number(after.coins) || 0;
  const price = Math.max(0, Number(item?.price ?? outcome?.price ?? 0) || 0);
  const expectedCoins = beforeCoins - price;
  if (afterCoins !== expectedCoins) throw new Error(`學生商城回讀驗證失敗：金幣預期 ${expectedCoins}，實際 ${afterCoins}`);
  const lines = ['寫入驗證：成功', `金幣：${beforeCoins} -> ${afterCoins}`];

  if (outcome.effectType === 'physical_reward') {
    const voucherId = String(outcome.voucherId || '').trim();
    const hasVoucher = (Array.isArray(after.collection) ? after.collection : []).some((entry) => entry?.type === 'voucher' && String(entry?.voucherId || '').trim() === voucherId);
    if (!hasVoucher) throw new Error('學生商城回讀驗證失敗：collection 找不到新憑證');
    lines.push(`憑證：${voucherId}`);
  } else if (outcome.effectType === 'hidden_egg') {
    const hiddenEggId = String(outcome.hiddenEggId || '').trim();
    const hasEgg = (Array.isArray(after.collection) ? after.collection : []).some((entry) => entry?.type === 'hidden_egg' && String(entry?.hiddenEggId || '').trim() === hiddenEggId)
      || (Array.isArray(after.hidden_eggs) ? after.hidden_eggs : []).some((entry) => String(entry?.hiddenEggId || '').trim() === hiddenEggId);
    if (!hasEgg) throw new Error('學生商城回讀驗證失敗：找不到新增的隱藏蛋');
    lines.push(`隱藏蛋：${hiddenEggId}`);
  }

  if (!hasLogWithKeyword(after, String(item?.name || outcome?.itemName || '').trim())) {
    throw new Error('學生商城回讀驗證失敗：找不到 shop_purchase 事件紀錄');
  }
  lines.push('事件紀錄：已同步寫入 logs');
  return lines;
}

function verifyHiddenEggActivationPersistence(beforeStudent, afterStudent, result, eggId = '') {
  const before = applyDataMigration(beforeStudent || {});
  const after = applyDataMigration(afterStudent || {});
  const beforeActive = String(before.active_hidden_egg?.id || before.active_hidden_egg_id || '').trim();
  const afterActive = String(after.active_hidden_egg?.id || after.active_hidden_egg_id || '').trim();
  const target = String(eggId || result?.activeHiddenEgg?.id || result?.activeHiddenEgg?.hiddenEggId || '').trim();
  if (!target) throw new Error('隱藏蛋啟用回讀驗證失敗：缺少目標隱藏蛋 ID');
  if (afterActive !== target) throw new Error(`隱藏蛋啟用回讀驗證失敗：目前啟用應為 ${target}，實際 ${afterActive || '空白'}`);
  if (!hasLogWithKeyword(after, target) && !hasLogWithKeyword(after, '隱藏蛋')) throw new Error('隱藏蛋啟用回讀驗證失敗：找不到啟用事件紀錄');
  return ['寫入驗證：成功', `原啟用：${beforeActive || '無'}`, `目前啟用：${afterActive}`, '事件紀錄：已同步寫入 logs'];
}

function buildPersistenceAwarePayload(payload, persistenceChecks = []) {
  if (!Array.isArray(persistenceChecks) || !persistenceChecks.length) return payload;
  return {
    ...(payload || {}),
    persistenceChecks,
  };
}

function updateStudentPreviews(student, shopItems = []) {
  const hiddenEggEl = byId('studentHiddenEggList');
  const shopPreviewEl = byId('studentShopPreviewText');
  const safe = applyDataMigration(student || {});

  if (hiddenEggEl) {
    const eggs = Array.isArray(safe.hidden_eggs) ? safe.hidden_eggs : [];
    hiddenEggEl.textContent = eggs.length
      ? eggs.map((egg, idx) => `${idx + 1}. ${egg.name || egg.hiddenEggId || '未命名隱藏蛋'}｜狀態 ${egg.status || 'incubating'}`).join('\n')
      : '尚無隱藏蛋 / 收藏資料';
  }

  if (shopPreviewEl) {
    const top = (shopItems || []).slice(0, 4).map((item, idx) => `${idx + 1}. ${item.name}｜${item.price} 金幣｜${item.allowed ? '可購買' : item.blockedReason}`);
    const lines = [
      `金幣：${Number(safe.coins) || 0}`,
      `稱號：${safe.title || safe.current_title || '無'}`,
      `年級：${safe.grade || safe.gradeLabel || '未設定'}`,
      `目前隱藏蛋：${safe.active_hidden_egg?.name || safe.active_hidden_egg_id || '無'}`,
      `收藏數：${Array.isArray(safe.collection) ? safe.collection.length : 0}`,
      ...(top.length ? ['可見商品：', ...top] : ['可見商品：尚未載入']),
    ];
    shopPreviewEl.textContent = lines.join('\n');
  }

  renderStudentRadar(safe);
  renderStudentCollectionGallery(safe);
  renderStudentMatureTeamSummary(safe);
  renderStudentActivity(safe);
  renderStudentFutureSystemSummaries(safe);
  renderStudentReadinessSummary(safe);
  renderStudentShopControls(safe, shopItems);
  renderStudentFrontOverview(safe);
}

async function refreshQuestionSelectors() {
  const student = currentState.studentData;
  const dailyUnitSelect = byId('dailyUnitSelect');
  const bossPickerSelect = byId('bossPickerSelect');

  if (dailyUnitSelect) {
    dailyUnitSelect.innerHTML = '<option value="">自動依年級抽題</option>';
  }
  if (bossPickerSelect) {
    bossPickerSelect.innerHTML = '<option value="">自動依年級選 Boss</option>';
  }
  currentDailyQuestion = null;
  currentBossRuntime = null;
  renderQuestionMeta('dailyQuestionMeta', null);
  renderQuestionMeta('bossQuestionMeta', null);
  if (byId('dailyQuestionInput')) byId('dailyQuestionInput').value = '';
  if (byId('bossIdInput')) byId('bossIdInput').value = '';

  if (!student) {
    currentState.studentShopItems = [];
    updateStudentPreviews(null, []);
    return;
  }

  const [units, bosses, shopItems] = await Promise.all([
    listGradeUnitsForStudent(student),
    listBossConfigs(),
    listTeacherShopCatalogForStudent(student),
  ]);

  if (dailyUnitSelect) {
    dailyUnitSelect.innerHTML = '<option value="">自動依年級抽題</option>' + units.map((unit) => `<option value="${String(unit).replace(/"/g, '&quot;')}">${unit}</option>`).join('');
  }

  if (bossPickerSelect) {
    const activeBosses = bosses.filter((row) => row.active !== false);
    bossPickerSelect.innerHTML = '<option value="">自動依年級選 Boss</option>' + activeBosses.map((row) => `<option value="${String(row.id || '').replace(/"/g, '&quot;')}">${row.name || row.id}</option>`).join('');
  }

  currentState.studentShopItems = shopItems;
  updateStudentPreviews(student, shopItems);
}

function updateStudentCoreSummary() {
  const data = currentState.studentData;
  if (!data) {
    byId('studentCoreName').textContent = '未載入';
    byId('studentCoreToken').textContent = '未設定';
    byId('studentCoreLastSettle').textContent = '尚未執行';
    byId('studentCoreActiveHiddenEgg').textContent = '無';
    setStatusCard('dailyStatusCard', 'dailyStatusValue', 'dailyStatusHint', '0 / 10', '尚未載入學生', 'neutral');
    setStatusCard('bossStatusCard', 'bossStatusValue', 'bossStatusHint', '未判定', '尚未載入學生', 'neutral');
    updateStudentPreviews(null, []);
    updateStudentSessionHint('尚未綁定學生 token。');
    if (byId('studentReadinessSummary')) byId('studentReadinessSummary').textContent = '尚未載入學生';
    setBanner('請先載入學生，才能測試學生核心流程。', 'neutral');
    return;
  }

  const currentBucket = noonResetKey();
  const dailyBucket = String(data.daily_quiz_date || data.today_quiz_reward_date || '').trim();
  const bossBucket = String(data.boss_battle_date || data.today_battle_date || '').trim();
  const dailyCount = isSameNoonBucket(dailyBucket || String(data.today_quiz_reward_count_date || '').trim()) ? Math.max(0, Number(data.today_quiz_reward_count) || 0) : 0;
  const dailyRemaining = Math.max(0, DAILY_LIMIT - dailyCount);
  const bossUsed = isSameNoonBucket(bossBucket || String(data.today_battle_used_date || '').trim()) ? Boolean(data.today_battle_used) : false;

  byId('studentCoreName').textContent = `${data.name || '未命名學生'} (${data.serial || data.card_seq || '-'})`;
  byId('studentCoreToken').textContent = getBoundToken() || '未設定';
  updateStudentSessionHint(getBoundToken() ? `學生 token 已綁定，閒置 ${Math.round((Number(APP_CONFIG.studentIdleLogoutMs || 0) || 0) / 60000)} 分鐘後將自動清除。` : '尚未綁定學生 token。');
  byId('studentCoreActiveHiddenEgg').textContent = String(data.active_hidden_egg?.name || data.active_hidden_egg_id || '無');
  if (byId('studentCollectionSortMode')) byId('studentCollectionSortMode').value = String(data.collection_view_mode || 'custom');
  updateStudentPreviews(data, currentState.studentShopItems || []);

  if (dailyRemaining > 0) {
    setStatusCard('dailyStatusCard', 'dailyStatusValue', 'dailyStatusHint', `${dailyCount} / ${DAILY_LIMIT}`, `每日挑戰於中午 12:00 重置；目前尚可再領 ${dailyRemaining} 次。`, 'ok');
  } else {
    setStatusCard('dailyStatusCard', 'dailyStatusValue', 'dailyStatusHint', `${dailyCount} / ${DAILY_LIMIT}`, '今日每日歷練獎勵已達上限，將於中午 12:00 重置。', 'warn');
  }

  if (bossUsed) {
    setStatusCard('bossStatusCard', 'bossStatusValue', 'bossStatusHint', '已使用', '今日 Boss 獎勵已領過，將於中午 12:00 重置。', 'warn');
  } else {
    setStatusCard('bossStatusCard', 'bossStatusValue', 'bossStatusHint', '可領取', '今日 Boss 獎勵尚未使用；中午 12:00 會重置。', 'ok');
  }
}

function buildResultSummary(payload = {}) {
  if (payload.applied) {
    const reward = payload.reward || {};
    const coins = reward.coins ?? reward.coin ?? 0;
    const xp = reward.xp ?? reward.totalXP ?? 0;
    return `結算成功：本次已套用獎勵。金幣 +${coins}，XP +${xp}。`;
  }
  if (payload.code === 'battle-limit') return '本次流程有正常執行，但今日 Boss 獎勵已領過，因此不再發放金幣與 XP。';
  if (payload.code === 'daily-limit') return '本次流程有正常執行，但今日每日歷練獎勵已達上限 10 題，因此不再發放金幣與 XP。';
  if (payload.code === 'wrong-answer') return '這次是答錯測試，只記錄結果，不進行後端結算。';
  if (payload.code === 'boss-lose') return '這次是 Boss 失敗測試，只記錄結果，不進行後端結算。';
  return payload.message || '流程已執行。';
}

function renderStudentCoreResult(title, payload) {
  const safePayload = JSON.parse(JSON.stringify(payload || {}));
  if (safePayload.student && typeof safePayload.student === 'object') {
    safePayload.student = applyDataMigration(safePayload.student);
  }
  if (safePayload.code === 'battle-limit' && safePayload.message) {
    safePayload.hint = '這代表今日 Boss 獎勵已領過，並不是流程沒有執行。';
  }
  if (safePayload.code === 'daily-limit' && safePayload.message) {
    safePayload.hint = '這代表今日每日歷練獎勵已達上限，並不是流程沒有執行。';
  }
  byId('studentCoreLastSettle').textContent = title;
  byId('studentCoreResultSummary').textContent = buildResultSummary(safePayload);
  byId('studentCoreResultText').textContent = JSON.stringify(safePayload, null, 2);

  if (safePayload.applied) setBanner(buildResultSummary(safePayload), 'success');
  else if (safePayload.code === 'battle-limit' || safePayload.code === 'daily-limit') setBanner(buildResultSummary(safePayload), 'warn');
  else setBanner(buildResultSummary(safePayload), 'neutral');
}

function applySettledStudent(result, token) {
  if (!result?.student || typeof result.student !== 'object') return;
  const nextStudent = applyDataMigration(result.student);
  setCurrentStudent(nextStudent, {
    serial: nextStudent.serial || nextStudent.card_seq || currentState.currentSerial || null,
    token: token || currentState.currentToken || null,
  });
  window.dispatchEvent(new CustomEvent('shanhai-v2-student-updated'));
}

export async function bindCurrentStudentToken() {
  ensureStudentLoaded();
  const token = String(byId('studentTokenBindInput').value || '').trim();
  if (!token) throw new Error('請輸入 token');
  currentState.currentToken = token;
  byId('studentCoreToken').textContent = token;
  recordStudentActivity();
  renderStudentCoreResult('已綁定 token', { token, message: '已完成 token 綁定，現在可測試每日答題與 Boss 結算。', code: 'token-bound' });
}

export async function clearBoundStudentToken() {
  clearStudentTokenSession('已手動清除學生 token / session。');
}

export async function loadDailyQuestionForCurrentStudent() {
  const student = ensureStudentLoaded();
  const unit = String(byId('dailyUnitSelect')?.value || '').trim();
  currentDailyQuestion = await getDailyQuestionForStudent(student, { unit });
  if (byId('dailyQuestionInput')) byId('dailyQuestionInput').value = currentDailyQuestion.question || '';
  fillOptionLabels('daily', currentDailyQuestion.options || []);
  renderQuestionMeta('dailyQuestionMeta', currentDailyQuestion, [`分流：${currentDailyQuestion.grade || '-'} / ${currentDailyQuestion.semester || '-'} / ${currentDailyQuestion.unit || '-'}`, `重置：每日中午 12:00`]);
  return currentDailyQuestion;
}

export async function loadBossQuestionForCurrentStudent() {
  const student = ensureStudentLoaded();
  const preferredBossId = String(byId('bossPickerSelect')?.value || '').trim();
  currentBossRuntime = await getBossRuntimeForStudent(student, { preferredBossId });
  if (byId('bossIdInput')) byId('bossIdInput').value = currentBossRuntime.bossId || '';
  renderQuestionMeta('bossQuestionMeta', currentBossRuntime.question, [`Boss：${currentBossRuntime.bossName || '-'}`, `屬性：${currentBossRuntime.attrKey || '-'}`, `重置：每日中午 12:00`]);
  return currentBossRuntime;
}

export async function runDailyQuizFlow() {
  const student = ensureStudentLoaded();
  const token = getBoundToken();
  const answerMode = byId('dailyAnswerSelect')?.value || 'correct';
  const questionText = String(byId('dailyQuestionInput')?.value || '').trim();
  if (!questionText) throw new Error('請先載入每日題目');

  if (answerMode !== 'correct') {
    const chosen = Number(document.querySelector('input[name="dailyOptionChoice"]:checked')?.value || 1);
    const logOnly = {
      ok: true,
      settled: false,
      code: 'wrong-answer',
      message: '本次為答錯測試，未進行後端結算。',
      question: questionText,
      quizId: currentDailyQuestion?.id || '',
      answer: currentDailyQuestion?.answer || null,
      selectedChoice: chosen,
      unit: currentDailyQuestion?.unit || '',
      grade: currentDailyQuestion?.grade || student.grade || '',
    };
    renderStudentCoreResult('每日答題（未結算）', logOnly);
    return logOnly;
  }

  if (!token) throw new Error('請先綁定學生 token，才能測試後端結算');

  const baselineStudent = applyDataMigration(JSON.parse(JSON.stringify(student || {})));
  const result = await settleRewardViaServer({
    token,
    type: 'daily_correct',
    meta: {
      source: 'v2_student_core',
      questionText,
      eventId: `daily:${student.serial || student.card_seq}:${Date.now()}`,
      quizId: currentDailyQuestion?.id || '',
      grade: currentDailyQuestion?.grade || student.grade || '',
      unit: currentDailyQuestion?.unit || String(byId('dailyUnitSelect')?.value || '').trim(),
      answer: currentDailyQuestion?.answer || null,
      options: currentDailyQuestion?.options || [],
    },
  });

  const dailySnapshot = await fetchValidationSnapshot({ serial: baselineStudent.serial || baselineStudent.card_seq, token });
  const reconciledDaily = await reconcileRewardMirror(dailySnapshot, token, 'daily_reward_reconcile');
  const persistenceChecks = verifyStudentRewardPersistence(baselineStudent, reconciledDaily || dailySnapshot.student || dailySnapshot.merged, result, 'daily_correct');
  applySettledStudent({ ...result, student: reconciledDaily || dailySnapshot.merged }, token);
  await syncStudentCorePanel();
  renderStudentCoreResult('每日答題（已結算）', buildPersistenceAwarePayload({ ...result, student: reconciledDaily || dailySnapshot.merged }, persistenceChecks));
  recordStudentActivity();
  return result;
}

export async function runBossBattleFlow() {
  const student = ensureStudentLoaded();
  const token = getBoundToken();
  const bossId = String(byId('bossIdInput')?.value || '').trim();
  const resultMode = byId('bossResultSelect')?.value || 'win';
  if (!bossId) throw new Error('請先載入 Boss 題目');

  if (resultMode !== 'win') {
    const logOnly = {
      ok: true,
      settled: false,
      code: 'boss-lose',
      message: '本次為 Boss 失敗測試，未進行後端結算。',
      bossId,
      bossName: currentBossRuntime?.bossName || '',
      gatekeeperQuizId: currentBossRuntime?.question?.id || '',
    };
    renderStudentCoreResult('Boss 對戰（未結算）', logOnly);
    return logOnly;
  }

  if (!token) throw new Error('請先綁定學生 token，才能測試後端結算');

  const baselineStudent = applyDataMigration(JSON.parse(JSON.stringify(student || {})));
  const result = await settleRewardViaServer({
    token,
    type: 'boss_win',
    meta: {
      source: 'v2_student_core',
      bossId,
      bossName: currentBossRuntime?.bossName || '',
      eventId: `boss:${student.serial || student.card_seq}:${bossId}:${Date.now()}`,
      gatekeeperQuizId: currentBossRuntime?.question?.id || '',
      grade: currentBossRuntime?.question?.grade || student.grade || '',
      unit: currentBossRuntime?.question?.unit || currentBossRuntime?.unit || '',
      answer: currentBossRuntime?.question?.answer || null,
      options: currentBossRuntime?.question?.options || [],
    },
  });

  const bossSnapshot = await fetchValidationSnapshot({ serial: baselineStudent.serial || baselineStudent.card_seq, token });
  const reconciledBoss = await reconcileRewardMirror(bossSnapshot, token, 'boss_reward_reconcile');
  const persistenceChecks = verifyStudentRewardPersistence(baselineStudent, reconciledBoss || bossSnapshot.student || bossSnapshot.merged, result, 'boss_win');
  applySettledStudent({ ...result, student: reconciledBoss || bossSnapshot.merged }, token);
  await syncStudentCorePanel();
  renderStudentCoreResult('Boss 對戰（已結算）', buildPersistenceAwarePayload({ ...result, student: reconciledBoss || bossSnapshot.merged }, persistenceChecks));
  recordStudentActivity();
  return result;
}

export async function buySelectedStudentShopItem() {
  const student = ensureStudentLoaded();
  const itemId = String(byId('studentShopSelect')?.value || '').trim();
  if (!itemId) throw new Error('請先選擇一個商城商品');
  const items = await listTeacherShopCatalogForStudent(student);
  const picked = items.find((item) => String(item.id || '').trim() === itemId);
  if (!picked) throw new Error('找不到指定商品');
  const baselineStudent = applyDataMigration(JSON.parse(JSON.stringify(student || {})));
  const activeToken = getBoundToken() || currentState.currentToken || null;
  const result = await buyShopCatalogItemForCurrentStudent(student, picked, { token: activeToken });
  const shopSnapshot = await fetchValidationSnapshot({ serial: baselineStudent.serial || baselineStudent.card_seq, token: activeToken });
  const persistenceChecks = verifyStudentShopPersistence(baselineStudent, shopSnapshot.student || shopSnapshot.merged, result, picked);
  applySettledStudent({ ...result, student: shopSnapshot.merged }, activeToken);
  await syncStudentCorePanel();
  recordStudentActivity();
  renderStudentCoreResult('學生商城購買（已寫入）', {
    ok: true,
    applied: true,
    code: 'student-shop-buy',
    message: `已替學生購買 ${picked.name}`,
    shopOutcome: result.shopOutcome || null,
    student: shopSnapshot.merged || currentState.studentData,
    persistenceChecks,
  });
  return result;
}

export async function activateSelectedHiddenEgg() {
  const student = ensureStudentLoaded();
  const eggId = String(byId('studentHiddenEggSelect')?.value || '').trim();
  if (!eggId) throw new Error('請先選擇一顆隱藏蛋');
  const baselineStudent = applyDataMigration(JSON.parse(JSON.stringify(student || {})));
  const activeToken = getBoundToken() || currentState.currentToken || null;
  const result = await activateHiddenEggForCurrentStudent(student, eggId, { token: activeToken });
  const eggSnapshot = await fetchValidationSnapshot({ serial: baselineStudent.serial || baselineStudent.card_seq, token: activeToken });
  const persistenceChecks = verifyHiddenEggActivationPersistence(baselineStudent, eggSnapshot.student || eggSnapshot.merged, result, eggId);
  applySettledStudent({ ...result, student: eggSnapshot.merged }, activeToken);
  await syncStudentCorePanel();
  recordStudentActivity();
  renderStudentCoreResult('隱藏蛋啟用（已寫入）', {
    ok: true,
    applied: true,
    code: 'hidden-egg-activated',
    message: `已啟用 ${result.activeHiddenEgg?.name || result.activeHiddenEgg?.hiddenEggId || eggId}`,
    activeHiddenEgg: result.activeHiddenEgg || null,
    student: shopSnapshot.merged || currentState.studentData,
    persistenceChecks,
  });
  return result;
}

export async function syncStudentCorePanel() {
  updateStudentCoreSummary();
  try {
    await refreshQuestionSelectors();
  } catch (error) {
    setBanner(error?.message || String(error), 'warn');
  }
}

export function bindStudentCoreEvents() {
  const bindBtn = byId('btnBindStudentToken');
  const clearTokenBtn = byId('btnStudentClearTokenSession');
  const dailyLoadBtn = byId('btnLoadDailyQuestion');
  const bossLoadBtn = byId('btnLoadBossQuestion');
  const dailyBtn = byId('btnRunDailyQuiz');
  const bossBtn = byId('btnRunBossBattle');
  const studentShopBtn = byId('btnStudentBuySelected');
  const activateEggBtn = byId('btnStudentActivateEgg');
  const radarBtn = byId('btnOpenStudentRadarDetail');
  const collectionBtn = byId('btnOpenStudentCollectionDetail');
  const overviewBtn = byId('btnOpenStudentOverview');
  const overviewAltBtn = byId('btnOpenStudentOverviewAlt');
  const partnerBtn = byId('btnOpenStudentPartnerDetail');
  const rankingBtn = byId('btnOpenStudentRankingDetail');
  const stageBtn = byId('btnOpenStudentStageDetail');
  const visualSpotlightBtn = byId('btnOpenStudentVisualSpotlight');
  const guideSpotlightBtn = byId('studentGuideSpotlightCard');
  const frontDailyBtn = byId('btnStudentFrontGoDaily');
  const frontBossBtn = byId('btnStudentFrontGoBoss');
  const frontPartnerBtn = byId('btnStudentFrontGoPartner');
  const frontShopBtn = byId('btnStudentFrontGoShop');
  const frontCollectionBtn = byId('btnStudentFrontGoCollection');
  const frontRankingBtn = byId('btnStudentFrontGoRanking');
  const dashGrowthBtn = byId('btnStudentDashGrowth');
  const dashDailyBossBtn = byId('btnStudentDashDailyBoss');
  const dashCollectionBtn = byId('btnStudentDashCollection');
  const dashAiBtn = byId('btnStudentDashAi');
  const radarPanelBtn = byId('btnOpenStudentRadarPanel');
  const collectionSpotlightBtn = byId('btnOpenStudentCollectionSpotlight');
  const collectionSpotlightMainBtn = byId('btnOpenStudentCollectionSpotlightMain');
  const matureTeamBtn = byId('btnOpenStudentMatureTeamPicker');
  const activityBtn = byId('btnOpenStudentActivityDetail');
  const radarGrid = byId('studentRadarGrid');
  const indicatorCounts = byId('studentIndicatorCounts');
  const collectionGallery = byId('studentCollectionGallery');
  const collectionSortSelect = byId('studentCollectionSortMode');
  const guideCard = byId('guideCard');

  bindBtn?.addEventListener('click', async () => {
    try {
      await bindCurrentStudentToken();
    } catch (error) {
      showAlert(error?.message || String(error), '綁定 token 失敗');
    }
  });

  clearTokenBtn?.addEventListener('click', async () => {
    try {
      await clearBoundStudentToken();
    } catch (error) {
      showAlert(error?.message || String(error), '清除學生 token 失敗');
    }
  });

  dailyLoadBtn?.addEventListener('click', async () => {
    try {
      await loadDailyQuestionForCurrentStudent();
    } catch (error) {
      showAlert(error?.message || String(error), '載入每日題目失敗');
    }
  });

  bossLoadBtn?.addEventListener('click', async () => {
    try {
      await loadBossQuestionForCurrentStudent();
    } catch (error) {
      showAlert(error?.message || String(error), '載入 Boss 題目失敗');
    }
  });

  dailyBtn?.addEventListener('click', async () => {
    try {
      await runDailyQuizFlow();
    } catch (error) {
      showAlert(error?.message || String(error), '每日答題測試失敗');
    }
  });

  bossBtn?.addEventListener('click', async () => {
    try {
      await runBossBattleFlow();
    } catch (error) {
      showAlert(error?.message || String(error), 'Boss 測試失敗');
    }
  });

  studentShopBtn?.addEventListener('click', async () => {
    try {
      await buySelectedStudentShopItem();
    } catch (error) {
      showAlert(error?.message || String(error), '學生商城購買失敗');
    }
  });

  activateEggBtn?.addEventListener('click', async () => {
    try {
      await activateSelectedHiddenEgg();
    } catch (error) {
      showAlert(error?.message || String(error), '啟用隱藏蛋失敗');
    }
  });

  radarBtn?.addEventListener('click', () => {
    try {
      showRadarDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '能力詳情開啟失敗');
    }
  });

  radarGrid?.addEventListener('click', () => {
    try {
      showRadarDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '能力詳情開啟失敗');
    }
  });

  radarGrid?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    try {
      showRadarDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '能力詳情開啟失敗');
    }
  });

  collectionBtn?.addEventListener('click', () => {
    try {
      showCollectionDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '收藏詳情開啟失敗');
    }
  });

  overviewBtn?.addEventListener('click', () => {
    try {
      showStudentOverviewDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '學生總覽開啟失敗');
    }
  });

  partnerBtn?.addEventListener('click', () => {
    try {
      showStudentPartnerDetail();
    } catch (error) {
      showAlert(error?.message || String(error), 'AI / 夥伴詳情開啟失敗');
    }
  });

  rankingBtn?.addEventListener('click', () => {
    try {
      showStudentRankingLineupDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '排行詳情開啟失敗');
    }
  });

  guideSpotlightBtn?.addEventListener('click', () => {
    try {
      showStudentGuideSpotlight();
    } catch (error) {
      showAlert(error?.message || String(error), '夥伴圖像詳情開啟失敗');
    }
  });

  guideSpotlightBtn?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    try {
      showStudentGuideSpotlight();
    } catch (error) {
      showAlert(error?.message || String(error), '夥伴圖像詳情開啟失敗');
    }
  });

  guideCard?.addEventListener('click', () => {
    try {
      showStudentGuideSpotlight();
    } catch (error) {
      showAlert(error?.message || String(error), '夥伴圖像詳情開啟失敗');
    }
  });

  frontDailyBtn?.addEventListener('click', () => {
    try {
      scrollToStudentCoreSection('studentDailyBossPanel', 'btnLoadDailyQuestion');
    } catch (error) {
      showAlert(error?.message || String(error), '前往每日歷練失敗');
    }
  });

  frontBossBtn?.addEventListener('click', () => {
    try {
      scrollToStudentCoreSection('studentDailyBossPanel', 'bossPickerSelect');
    } catch (error) {
      showAlert(error?.message || String(error), '前往 Boss 挑戰失敗');
    }
  });

  frontPartnerBtn?.addEventListener('click', () => {
    try {
      showStudentGuideSpotlight();
    } catch (error) {
      showAlert(error?.message || String(error), '前往 AI 夥伴失敗');
    }
  });

  frontShopBtn?.addEventListener('click', () => {
    try {
      scrollToStudentCoreSection('studentShopPanel', 'studentShopSelect');
    } catch (error) {
      showAlert(error?.message || String(error), '前往學生商城失敗');
    }
  });

  frontCollectionBtn?.addEventListener('click', () => {
    try {
      showStudentCollectionSpotlight();
      scrollToStudentCoreSection('studentRadarCollectionPanel');
    } catch (error) {
      showAlert(error?.message || String(error), '前往收藏展示失敗');
    }
  });

  frontRankingBtn?.addEventListener('click', () => {
    try {
      showStudentRankingLineupDetail();
      scrollToStudentCoreSection('studentActivityPanel');
    } catch (error) {
      showAlert(error?.message || String(error), '前往排行榜入口失敗');
    }
  });


  dashGrowthBtn?.addEventListener('click', () => {
    try {
      showStudentOverviewDetail();
      scrollToStudentCoreSection('studentOverviewPanel');
    } catch (error) {
      showAlert(error?.message || String(error), '前往養成總覽失敗');
    }
  });

  dashDailyBossBtn?.addEventListener('click', () => {
    try {
      scrollToStudentCoreSection('studentDailyBossPanel', 'btnLoadDailyQuestion');
    } catch (error) {
      showAlert(error?.message || String(error), '前往每日 / Boss 失敗');
    }
  });

  dashCollectionBtn?.addEventListener('click', () => {
    try {
      showStudentCollectionSpotlight();
      scrollToStudentCoreSection('studentRadarCollectionPanel');
    } catch (error) {
      showAlert(error?.message || String(error), '前往收藏 / 隊伍失敗');
    }
  });

  dashAiBtn?.addEventListener('click', () => {
    try {
      showStudentGuideSpotlight();
    } catch (error) {
      showAlert(error?.message || String(error), '前往 AI 夥伴失敗');
    }
  });

  stageBtn?.addEventListener('click', () => {
    try {
      showStudentStageDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '成長圖像詳情開啟失敗');
    }
  });

  visualSpotlightBtn?.addEventListener('click', () => {
    try {
      showStudentStageDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '成長圖像詳情開啟失敗');
    }
  });

  radarPanelBtn?.addEventListener('click', () => {
    try {
      showRadarDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '能力詳情開啟失敗');
    }
  });

  const openCollectionSpotlight = () => {
    try {
      showStudentCollectionSpotlight();
    } catch (error) {
      showAlert(error?.message || String(error), '收藏放大視窗開啟失敗');
    }
  };

  collectionSpotlightBtn?.addEventListener('click', openCollectionSpotlight);
  collectionSpotlightMainBtn?.addEventListener('click', openCollectionSpotlight);

  matureTeamBtn?.addEventListener('click', () => {
    try {
      showMatureTeamPicker();
    } catch (error) {
      showAlert(error?.message || String(error), '成熟期隊伍設定開啟失敗');
    }
  });

  activityBtn?.addEventListener('click', () => {
    try {
      showStudentActivityDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '近期活動詳情開啟失敗');
    }
  });

  byId('btnOpenStudentActivityDetailAlt')?.addEventListener('click', () => {
    try {
      showStudentActivityDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '近期活動詳情開啟失敗');
    }
  });

  byId('btnOpenStudentRankingLineup')?.addEventListener('click', () => {
    try {
      showStudentRankingLineupDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '排行榜隊伍開啟失敗');
    }
  });

  byId('btnSolidifyStudentCollectionSnapshots')?.addEventListener('click', async () => {
    try {
      await solidifyStudentCollectionSnapshots();
    } catch (error) {
      showAlert(error?.message || String(error), '收藏快照整備失敗');
    }
  });

  byId('btnOpenStudentReadinessAudit')?.addEventListener('click', () => {
    try {
      showStudentReadinessAudit();
    } catch (error) {
      showAlert(error?.message || String(error), '學生端巡檢開啟失敗');
    }
  });

  byId('btnOpenStudentExchangeDetail')?.addEventListener('click', () => {
    try {
      showStudentExchangeDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '交換詳情開啟失敗');
    }
  });

  byId('btnOpenStudentHostelDetail')?.addEventListener('click', () => {
    try {
      showStudentHostelDetail();
    } catch (error) {
      showAlert(error?.message || String(error), '寄宿詳情開啟失敗');
    }
  });

  indicatorCounts?.addEventListener('click', (event) => {
    const chip = event.target instanceof Element ? event.target.closest('[data-indicator-key]') : null;
    if (!chip) return;
    try {
      showIndicatorDetail(chip.getAttribute('data-indicator-key') || 'metal');
    } catch (error) {
      showAlert(error?.message || String(error), '學習指標詳情開啟失敗');
    }
  });

  indicatorCounts?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const chip = event.target instanceof Element ? event.target.closest('[data-indicator-key]') : null;
    if (!chip) return;
    event.preventDefault();
    try {
      showIndicatorDetail(chip.getAttribute('data-indicator-key') || 'metal');
    } catch (error) {
      showAlert(error?.message || String(error), '學習指標詳情開啟失敗');
    }
  });

  collectionGallery?.addEventListener('click', async (event) => {
    const moveBtn = event.target instanceof Element ? event.target.closest('[data-collection-move]') : null;
    if (moveBtn) {
      event.preventDefault();
      event.stopPropagation();
      try {
        await moveCollectionItem(moveBtn.getAttribute('data-collection-id') || '', moveBtn.getAttribute('data-collection-move') || 'right');
      } catch (error) {
        showAlert(error?.message || String(error), '收藏排序失敗');
      }
      return;
    }
    const card = event.target instanceof Element ? event.target.closest('[data-collection-id]') : null;
    if (!card) return;
    try {
      showStudentCollectionSpotlight(card.getAttribute('data-collection-id') || '');
    } catch (error) {
      showAlert(error?.message || String(error), '收藏詳情開啟失敗');
    }
  });

  collectionGallery?.addEventListener('keydown', async (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-collection-id]') : null;
    const moveBtn = event.target instanceof Element ? event.target.closest('[data-collection-move]') : null;
    if (moveBtn && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      try {
        await moveCollectionItem(moveBtn.getAttribute('data-collection-id') || '', moveBtn.getAttribute('data-collection-move') || 'right');
      } catch (error) {
        showAlert(error?.message || String(error), '收藏排序失敗');
      }
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!target) return;
    event.preventDefault();
    try {
      showStudentCollectionSpotlight(target.getAttribute('data-collection-id') || '');
    } catch (error) {
      showAlert(error?.message || String(error), '收藏詳情開啟失敗');
    }
  });

  byId('legacyModalBody')?.addEventListener('click', async (event) => {
    const lineupBtn = event.target instanceof Element ? event.target.closest('[data-lineup-open]') : null;
    if (lineupBtn) {
      try {
        showStudentCollectionSpotlight(lineupBtn.getAttribute('data-lineup-open') || '');
      } catch (error) {
        showAlert(error?.message || String(error), '排行榜隊伍詳情開啟失敗');
      }
      return;
    }
    const toggleBtn = event.target instanceof Element ? event.target.closest('[data-team-toggle]') : null;
    if (toggleBtn) {
      try {
        await toggleLeaderboardTeamItem(toggleBtn.getAttribute('data-team-toggle') || '');
        showMatureTeamPicker();
      } catch (error) {
        showAlert(error?.message || String(error), '成熟期隊伍設定失敗');
      }
      return;
    }
    const moveBtn = event.target instanceof Element ? event.target.closest('[data-team-move]') : null;
    if (moveBtn) {
      try {
        await moveLeaderboardTeamItem(moveBtn.getAttribute('data-team-id') || '', moveBtn.getAttribute('data-team-move') || 'right');
        showMatureTeamPicker();
      } catch (error) {
        showAlert(error?.message || String(error), '成熟期隊伍排序失敗');
      }
    }
  });

  collectionSortSelect?.addEventListener('change', async () => {
    try {
      await applyCollectionSortMode();
    } catch (error) {
      showAlert(error?.message || String(error), '收藏排序模式儲存失敗');
    }
  });

  window.addEventListener('shanhai-v2-student-updated', async () => {
    updateStudentCoreSummary();
    try {
      await refreshQuestionSelectors();
    } catch (_error) {
      // ignore refresh failure after student update
    }
  });

  ['click', 'keydown', 'pointerdown', 'touchstart'].forEach((eventName) => {
    window.addEventListener(eventName, recordStudentActivity, { passive: true });
  });

  updateStudentSessionHint(getBoundToken() ? `學生 token 已綁定，閒置 ${Math.round((Number(APP_CONFIG.studentIdleLogoutMs || 0) || 0) / 60000)} 分鐘後將自動清除。` : '尚未綁定學生 token。');
}
