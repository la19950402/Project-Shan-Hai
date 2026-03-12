import { APP_CONFIG, BUILD_TAG } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';
import { currentState, batchState, uiState, setPreviewAction, clearPreviewAction, resetCurrentStudent, resetBatchRuntimeState } from '../state.js?v=step24-r28-card-batch-workflow-20260312h';
import { getGuideConfig, getGuideMode } from '../domain/guide-mode.js?v=step24-r28-card-batch-workflow-20260312h';
import { getProfileLabels } from '../domain/profile.js?v=step24-r28-card-batch-workflow-20260312h';
import { buildTeacherScorePayload, applyTeacherScore, buildTeacherScorePreviewText, TEACHER_SCORE_PRESETS, ATTR_META, getTeacherActionPanel, getTeacherActionPreset, buildTeacherStatusPayload, applyTeacherStatus, formatTeacherActionResult, DEBUFF_INFO, BATCH_CARD_PRESETS, buildUnifiedActivityLines, getUnifiedActivityCount, buildUnifiedSourceStats } from '../domain/reward.js?v=step24-r28-card-batch-workflow-20260312h';
import { teacherLogin, teacherLogout, bindTeacherAuthState, validateTeacherEmail, mapTeacherLoginError } from '../services/auth-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { loadStudentBySerial, loadStudentByToken, loadStudentByNtag, renameCurrentStudent, saveGuideMode, saveStudentData, refreshCurrentStudent } from '../services/student-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { getStudentTokenSummary, reissueStudentToken, deactivateStudentToken, bindNtagToActiveToken, registerNewStudentCard } from '../services/card-admin-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { listItemCardPresets, saveItemCardPreset } from '../services/item-card-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { saveShopCatalogItem, listShopCatalogItems, listBuiltInShopPresets, deployBuiltInShopPreset, saveBossConfig, listBossConfigs, saveQuestionSetConfig, listQuestionSetConfigs, listQuizBankEntries, saveQuizEntry, toggleQuizEntryActive, deleteQuizEntry, importQuizBulk, previewSerialRange, runBatchAdminAction, getQuizGovernance, saveQuizGovernance, requestDeleteQuizEntry, approveDeleteQuizRequest, getTeacherGovernance, saveTeacherGovernance, parseTeacherScopeText, formatTeacherScopeText } from '../services/system-admin-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { askGuideViaServer } from '../services/guide-api.js?v=step24-r28-card-batch-workflow-20260312h';
import { runBatchScore, startBatchStudentSession, getBatchSessionSnapshot, touchBatchStudentSession, resetBatchStudentSession, applyBatchCardToActiveStudent, resolveBatchEffectFromScanKey } from './batch-controller.js?v=step24-r28-card-batch-workflow-20260312h';
import { buyPhysicalRewardFromForm, redeemVoucherFromForm, buyTeacherCatalogItemFromForm } from './shop-controller.js?v=step24-r28-card-batch-workflow-20260312h';
import { formatVoucherLine } from '../domain/voucher.js?v=step24-r28-card-batch-workflow-20260312h';
import { showAlert, bindFeedbackModal } from '../ui/feedback.js?v=step24-r28-card-batch-workflow-20260312h';
import { bindStudentCoreEvents, syncStudentCorePanel } from './student-core-controller.js?v=step24-r28-card-batch-workflow-20260312h';

function byId(id) {
  return document.getElementById(id);
}

const MODAL_SECTION_MAP = {
  'teacher-access-modal': 'teacherAccessSection',
  'teacher-student-modal': 'teacherStudentOpsSection',
  'batch-scan-modal': 'batchWorkflowSection',
  'shop-modal': 'shopVoucherSection',
  'card-admin-modal': 'cardAdminSection',
  'item-forge-modal': 'forgeSection',
  'logs-modal': 'teacherLogsSection',
  'system-zone-modal': 'systemZoneSection',
  'student-page-modal': 'studentCoreSection',
};
const SECTION_MODAL_MAP = Object.fromEntries(Object.entries(MODAL_SECTION_MAP).map(([modalId, sectionId]) => [sectionId, modalId]));

function openModal(id) {
  const modal = byId(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeModal(id) {
  const modal = byId(id);
  if (!modal) return;
  modal.classList.add('hidden');
  if (!document.querySelector('.modal-overlay:not(.hidden)')) {
    document.body.classList.remove('modal-open');
  }
}

window.openModal = openModal;
window.closeModal = closeModal;

function softenRawStatusText(root = document) {
  const replacements = new Map([
    ['尚未載入學生', '請先感應學生卡以開啟此功能'],
    ['未載入', '等待資料'],
    ['尚未載入', '等待資料'],
    ['尚未執行', '等待操作'],
    ['未設定', '尚未設定'],
    ['-', '等待同步'],
    ['[object Object]', '資料整理中'],
  ]);
  const selector = 'p, span, strong, div, small, pre';
  root.querySelectorAll(selector).forEach((el) => {
    if (el.children.length) return;
    const raw = String(el.textContent || '').trim();
    if (!raw || !replacements.has(raw)) return;
    el.textContent = replacements.get(raw);
  });
}

function mountSectionIntoModal(modalId, sectionId) {
  const body = byId(`${modalId}-body`);
  const section = byId(sectionId);
  if (!body || !section || body.dataset.mounted === 'true') return;
  section.classList.add('modal-section-content', 'legacy-hidden-zone');
  body.innerHTML = '';
  body.appendChild(section);
  body.dataset.mounted = 'true';
}

function setupDashboardModals() {
  Object.entries(MODAL_SECTION_MAP).forEach(([modalId, sectionId]) => mountSectionIntoModal(modalId, sectionId));
  document.querySelectorAll('[data-open-modal]').forEach((button) => {
    button.addEventListener('click', () => openModal(button.dataset.openModal));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal(overlay.id);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const active = document.querySelector('.modal-overlay:not(.hidden)');
    if (active) closeModal(active.id);
  });
  softenRawStatusText(document);
}

function on(id, eventName, handler, options) {
  const el = byId(id);
  if (!el) {
    console.warn(`[bootstrap] missing element: #${id}`);
    return null;
  }
  el.addEventListener(eventName, handler, options);
  return el;
}

function bindText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value ?? '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function buildUnifiedActivityFeedForHtml(data = {}, limit = 6) {
  return buildUnifiedActivityLines(data, limit).map((line) => ({ line }));
}

const TEACHER_ATTR_LABELS = {
  metal: '金｜精準',
  wood: '木｜成長',
  water: '水｜穩定',
  fire: '火｜表現',
  earth: '土｜韌性',
};

const TEACHER_STAGE_VISUALS = {
  'dust-box': { glyph: '📦', title: '缺乏能量階段', copy: '目前仍在起步期，主視覺以學生主體摘要為主。' },
  'clean-box': { glyph: '📦', title: '乾淨紙箱階段', copy: '屬性仍會隨最高能力變動，老師端可直接觀察目前學習指標重心。' },
  'kitten-box': { glyph: '🐱', title: '小貓破殼期', copy: '總 XP 已突破固定門檻，後續圖像屬性會固定，適合開始留意收藏快照。' },
  'young-cat': { glyph: '🐈', title: '青年小貓成長期', copy: '已進入中期成長，收藏、排行與隊伍內容會開始更有差異。' },
  'adult-cat': { glyph: '🐈‍⬛', title: '成熟期異獸', copy: '可放入排行榜展示隊伍，教師版學生狀態頁也會沿用這份收藏與隊伍摘要。' },
};

function getTeacherStageVisual(totalXP = 0) {
  const xp = Number(totalXP) || 0;
  if (xp >= 300) return { key: 'adult-cat', ...TEACHER_STAGE_VISUALS['adult-cat'] };
  if (xp >= 200) return { key: 'young-cat', ...TEACHER_STAGE_VISUALS['young-cat'] };
  if (xp >= 100) return { key: 'kitten-box', ...TEACHER_STAGE_VISUALS['kitten-box'] };
  if (xp >= 10) return { key: 'clean-box', ...TEACHER_STAGE_VISUALS['clean-box'] };
  return { key: 'dust-box', ...TEACHER_STAGE_VISUALS['dust-box'] };
}

function getTeacherAttrEntries(student = {}) {
  const attrs = student?.attributes || {};
  return Object.keys(TEACHER_ATTR_LABELS).map((key) => ({
    key,
    label: TEACHER_ATTR_LABELS[key],
    value: Math.max(0, Number(attrs[key]) || 0),
  }));
}

function buildTeacherCollectionSummary(student = {}) {
  const collection = Array.isArray(student?.collection) ? student.collection : [];
  const matureCount = collection.filter((item) => Number(item?.snapshotTotalXP || item?.totalXP || 0) >= 300 || /adult|成熟/i.test(String(item?.stageKey || item?.stage_key || ''))).length;
  const teamIds = Array.isArray(student?.leaderboard_team_ids) ? student.leaderboard_team_ids.map((value) => String(value || '').trim()).filter(Boolean) : [];
  const activeEgg = student?.active_hidden_egg?.name || student?.active_hidden_egg_id || '無';
  return [
    `收藏展示：${collection.length} 件`,
    `成熟期異獸：${matureCount} 隻`,
    `排行榜隊伍：${teamIds.length ? teamIds.join(' / ') : '尚未設定'}`,
    `目前啟用展示：${activeEgg}`,
    '教師端保留收藏 / 排行摘要；每日挑戰與 Boss 仍由學生端自行操作。',
  ].join('\n');
}

function renderTeacherStudentShell(student = currentState.studentData) {
  const glyphEl = byId('teacherStudentVisualGlyph');
  const titleEl = byId('teacherStudentVisualTitle');
  const textEl = byId('teacherStudentVisualText');
  const bridgeEl = byId('teacherStudentBridgeHint');
  const topEl = byId('teacherStudentTopAttr');
  const radarEl = byId('teacherStudentRadarRows');
  const indicatorEl = byId('teacherStudentIndicatorSummary');
  const collectionEl = byId('teacherStudentCollectionSummary');
  const shellHintEl = byId('teacherStudentShellHint');
  const serialEl = byId('teacherStudentHeroSerial');
  const gradeEl = byId('teacherStudentHeroGrade');
  const statusEl = byId('teacherStudentHeroStatus');
  const coinEl = byId('teacherStudentHeroCoins');
  const titleBadgeEl = byId('teacherStudentHeroTitleBadge');
  if (!glyphEl && !titleEl && !radarEl && !indicatorEl && !collectionEl) return;
  if (!student) {
    if (glyphEl) glyphEl.textContent = '📦';
    if (titleEl) titleEl.textContent = '請先感應學生卡';
    if (textEl) textEl.textContent = '載入後將顯示異獸主視覺、五維雷達、進化能量與收藏摘要。';
    if (bridgeEl) bridgeEl.textContent = '尚未建立學生頁網址 / NTAG 入口。';
    if (topEl) topEl.textContent = '最高屬性：等待同步';
    if (serialEl) serialEl.textContent = '卡序 #---';
    if (gradeEl) gradeEl.textContent = '年級 / 班級 待同步';
    if (statusEl) statusEl.textContent = '狀態待同步';
    if (coinEl) coinEl.textContent = '金幣 0';
    if (titleBadgeEl) titleBadgeEl.textContent = '稱號待同步';
    if (radarEl) radarEl.innerHTML = '<div class="student-empty-card">請先感應學生卡以開啟五維雷達</div>';
    if (indicatorEl) indicatorEl.innerHTML = '<div class="student-empty-card">五行獎勵累積次數會顯示在這裡</div>';
    if (collectionEl) collectionEl.textContent = '收藏與排行榜摘要會在載入學生後顯示。';
    if (shellHintEl) shellHintEl.textContent = '教師版學生狀態頁會保持學生主畫面閱讀順序：上方學生資訊、左異獸、右雷達、下方進化與收藏。';
    return;
  }
  const stage = getTeacherStageVisual(student?.totalXP);
  const entries = getTeacherAttrEntries(student);
  const maxValue = Math.max(1, ...entries.map((entry) => entry.value));
  const top = [...entries].sort((a, b) => b.value - a.value)[0] || { key: 'metal', label: TEACHER_ATTR_LABELS.metal, value: 0 };
  const activeToken = String(currentState.currentToken || student?.active_token || student?.page_token || '').trim();
  const url = buildStudentPageUrl(activeToken);
  const debuffText = Object.entries(student.debuffs || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${DEBUFF_INFO[k]?.label || k}x${v}`).join('、') || '健康';
  if (glyphEl) glyphEl.textContent = stage.glyph;
  if (titleEl) titleEl.textContent = student?.name || '未命名學生';
  if (textEl) textEl.textContent = `${stage.title}｜${stage.copy}`;
  if (bridgeEl) bridgeEl.textContent = url ? `學生頁網址已建立，可直接寫入 NTAG：${url}` : '尚未建立學生頁網址，補卡 / 寫卡後可直接以 NTAG 帶入學生端。';
  if (topEl) topEl.textContent = `最高屬性：${top.label} ${top.value}`;
  if (serialEl) serialEl.textContent = `卡序 #${student.serial || student.card_seq || '---'}`;
  if (gradeEl) gradeEl.textContent = `${student.grade || '未設定'}年級${student.class_name ? `｜${student.class_name}` : ''}`;
  if (statusEl) statusEl.textContent = debuffText;
  if (coinEl) coinEl.textContent = `金幣 ${Number(student.coins || 0)}`;
  if (titleBadgeEl) titleBadgeEl.textContent = student.title || student.current_title || '守護位階：初階守護員';
  if (radarEl) radarEl.innerHTML = entries.map((entry) => {
    const pct = Math.max(8, Math.round((entry.value / maxValue) * 100));
    return `<button type="button" class="teacher-student-radar-row teacher-student-radar-action" data-click-target="btnOpenStudentAttrDetailMain"><div class="teacher-student-radar-meta"><strong>${escapeHtml(entry.label)}</strong><span>${Number(entry.value || 0)}</span></div><div class="teacher-student-radar-track"><div class="teacher-student-radar-fill" style="width:${pct}%"></div></div></button>`;
  }).join('');
  if (indicatorEl) indicatorEl.innerHTML = entries.map((entry) => `<button type="button" class="teacher-student-indicator-chip teacher-student-indicator-action" data-click-target="btnOpenStudentAttrDetailMain"><strong>${escapeHtml(entry.label)}</strong><span>累積 ${Number(entry.value || 0)} 次</span><small>點擊查看學習指標與獲得方式</small></button>`).join('');
  if (collectionEl) collectionEl.textContent = buildTeacherCollectionSummary(student);
  if (shellHintEl) shellHintEl.textContent = '教師版學生狀態頁：先看年級、卡序、姓名、狀態、稱號與金幣，再看異獸與五維雷達，下方查看進化能量與收藏摘要。';
}


function getAttrTitle(attrKey, panel) {
  const label = ATTR_META[attrKey]?.label || attrKey;
  const panelLabel = panel?.attrFocus?.[attrKey]?.label;
  if (panel?.id && panel.id !== 'general' && panelLabel) return `${label}｜${panelLabel}`;
  return ATTR_META[attrKey]?.panelTitle || `${label}｜${panelLabel || '教師加分'}`;
}

function detectLegacyActionPanel(student = currentState.studentData) {
  const className = String(student?.class_name || student?.className || student?.grade || '').trim();
  if (/科展團隊/.test(className)) return 'science';
  if (/學習扶助/.test(className)) return 'support';
  return 'general';
}

function activateLegacyActionPanel(panelKey = 'general') {
  const resolvedPanel = getTeacherActionPanel(panelKey);
  renderLegacyActionBoard(resolvedPanel.id);
  populateTeacherScorePresets(resolvedPanel.id);
  document.querySelectorAll('.legacy-panel-switch[data-action-panel]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.actionPanel === resolvedPanel.id);
  });
  const panelText = byId('legacyCurrentPanelText');
  if (panelText) panelText.textContent = resolvedPanel.title || '一般學習加分面板';
  const panelBadge = byId('legacyPanelBadge');
  if (panelBadge) panelBadge.textContent = resolvedPanel.title || '一般面板';
  updateLegacyFlowStrip();
  return resolvedPanel.id;
}

function updateLegacyCockpitSummary() {
  const data = currentState.studentData;
  const build = byId('legacyBuildTagText');
  if (build) build.textContent = BUILD_TAG;
  const meta = byId('legacyStudentMetaText');
  const tokenEl = byId('legacyCurrentTokenText');
  const urlEl = byId('legacyStudentUrlPreview');
  if (!data) {
    if (meta) meta.textContent = '未載入學生';
    if (tokenEl) tokenEl.textContent = '未綁定';
    if (urlEl) urlEl.textContent = '請先載入學生';
    updateLegacyFlowStrip({ result: '尚未執行寫入驗證' });
    return;
  }
  const serial = data.serial || data.card_seq || '-';
  const className = data.grade || data.class_name || '-';
  const status = Object.entries(data.debuffs || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${DEBUFF_INFO[key]?.label || key}x${value}`).join('、') || '健康';
  const activeToken = String(currentState.currentToken || data.active_token || data.page_token || '').trim();
  const url = buildStudentPageUrl(activeToken) || '尚未建立';
  if (meta) meta.textContent = `${data.name || '未命名學生'} / #${serial} / ${className} / ${status}`;
  if (tokenEl) tokenEl.textContent = activeToken || '未綁定';
  if (urlEl) urlEl.textContent = url;
  updateLegacyFlowStrip();
}

function updateLegacyFlowStrip({ result = null } = {}) {
  const data = currentState.studentData;
  const studentEl = byId('legacyFlowStudent');
  const panelEl = byId('legacyFlowPanel');
  const actionEl = byId('legacyFlowAction');
  const resultEl = byId('legacyFlowResult');
  const panel = getTeacherActionPanel(byId('legacyActionBoard')?.dataset.panelKey || detectLegacyActionPanel(data));
  if (studentEl) {
    studentEl.textContent = data
      ? `${data.name || '未命名學生'} / #${data.serial || data.card_seq || '-'} / ${data.grade || data.class_name || '-'}`
      : '尚未載入學生';
  }
  if (panelEl) panelEl.textContent = panel?.title || '一般學習加分面板';
  const reason = String(byId('scoreReasonInput')?.value || '').trim();
  const attr = String(byId('scoreAttrSelect')?.value || '').trim();
  const amount = String(byId('scoreValueInput')?.value || '0').trim();
  const actionSummary = reason
    ? `${reason} / ${attr || '-'} / +${amount} XP`
    : '可直接加分 / 狀態 / 商品 / NTAG';
  if (actionEl) actionEl.textContent = actionSummary;
  if (resultEl) {
    if (result) resultEl.textContent = result;
    else resultEl.textContent = String(byId('teacherOpsResultSummary')?.textContent || '尚未執行寫入驗證').trim() || '尚未執行寫入驗證';
  }
}

function buildScorePersistenceLines(saved, payload) {
  const action = saved?.lastTeacherAction || {};
  if (action.type !== 'teacher_score') {
    throw new Error('資料回讀驗證失敗：缺少 teacher_score 寫入結果');
  }
  const actualXp = Number(saved?.totalXP) || 0;
  const actualAttr = Number(saved?.attributes?.[payload.attrKey]) || 0;
  const expectedXp = Number(action.afterXP);
  const expectedAttr = Number(action.afterAttr);
  if (actualXp !== expectedXp) {
    throw new Error(`資料回讀驗證失敗：totalXP 預期 ${expectedXp}，實際 ${actualXp}`);
  }
  if (actualAttr !== expectedAttr) {
    throw new Error(`資料回讀驗證失敗：${payload.attrKey} 預期 ${expectedAttr}，實際 ${actualAttr}`);
  }
  const match = hasTeacherRewardPersistence(saved, {
    type: 'teacher_score',
    eventId: action.eventId,
    reason: payload.reason,
    attrKey: payload.attrKey,
    amount: payload.amount,
  });
  if (!match.matched) throw new Error('資料回讀驗證失敗：teacher_score 未同步寫入 reward_events / logs');
  return [
    '寫入驗證：成功',
    `totalXP：${actualXp}`,
    `${payload.attrKey}：${actualAttr}`,
    `事件紀錄：已同步寫入 ${buildTeacherPersistenceTrailLabel(match)}`,
  ];
}

function buildStatusPersistenceLines(saved, payload) {
  const action = saved?.lastTeacherAction || {};
  if (action.type !== 'teacher_status') {
    throw new Error('資料回讀驗證失敗：缺少 teacher_status 寫入結果');
  }
  const actualStacks = Number(saved?.debuffs?.[payload.statusKey]) || 0;
  const expectedStacks = Number(action.afterStacks);
  if (actualStacks !== expectedStacks) {
    throw new Error(`資料回讀驗證失敗：${payload.statusKey} 層數預期 ${expectedStacks}，實際 ${actualStacks}`);
  }
  const hasIssue = Array.isArray(saved?.learning_issues) && saved.learning_issues.some((item) => {
    return item?.statusKey === payload.statusKey
      && Number(item?.stacks || 0) === Number(payload.stacks || 0)
      && String(item?.reason || '').includes(payload.reason);
  });
  if (!hasIssue) throw new Error('資料回讀驗證失敗：learning_issues 未同步寫入');
  const match = hasTeacherRewardPersistence(saved, {
    type: 'teacher_status',
    eventId: action.eventId,
    reason: payload.reason,
    statusKey: payload.statusKey,
    stacks: payload.stacks,
  });
  if (!match.matched) throw new Error('資料回讀驗證失敗：teacher_status 未同步寫入 reward_events / logs');
  return [
    '寫入驗證：成功',
    `${payload.statusKey}：${actualStacks} 層`,
    'learning_issues：已同步寫入',
    `事件紀錄：已同步寫入 ${buildTeacherPersistenceTrailLabel(match)}`,
  ];
}

function hasLogContaining(saved, actionType, keyword = '') {
  return Array.isArray(saved?.logs) && saved.logs.some((item) => item?.action_type === actionType && String(item?.detail || '').includes(keyword));
}

function findVoucherInCollection(saved, voucherId) {
  const target = String(voucherId || '').trim();
  return (Array.isArray(saved?.collection) ? saved.collection : []).find((item) => item?.type === 'voucher' && String(item?.voucherId || '').trim() === target) || null;
}

function buildVoucherGrantPersistenceLines(saved, { beforeCoins = 0, voucherId = '', itemName = '', price = 0 } = {}) {
  const actualCoins = Number(saved?.coins) || 0;
  const expectedCoins = Number(beforeCoins || 0);
  if (actualCoins !== expectedCoins) throw new Error(`資料回讀驗證失敗：老師贈送不應扣金幣，預期 ${expectedCoins}，實際 ${actualCoins}`);
  const voucher = findVoucherInCollection(saved, voucherId);
  if (!voucher) throw new Error('資料回讀驗證失敗：collection 找不到新憑證');
  if (!hasLogContaining(saved, 'teacher_shop_grant', itemName || voucherId)) throw new Error('資料回讀驗證失敗：teacher_shop_grant logs 未同步寫入');
  return ['寫入驗證：成功', `金幣：${actualCoins}（本次未扣）`, `憑證：${voucherId}`, `贈送：${itemName || '實體商品'}${price ? `（原定價 ${price} 金幣）` : ''}`, 'collection：已同步寫入 voucher', '事件紀錄：已同步寫入 logs'];
}

function buildHiddenEggGrantPersistenceLines(saved, { beforeCoins = 0, hiddenEggId = '', itemName = '', price = 0 } = {}) {
  const actualCoins = Number(saved?.coins) || 0;
  const expectedCoins = Number(beforeCoins || 0);
  if (actualCoins !== expectedCoins) throw new Error(`資料回讀驗證失敗：老師贈送不應扣金幣，預期 ${expectedCoins}，實際 ${actualCoins}`);
  const hasEgg = (Array.isArray(saved?.collection) ? saved.collection : []).some((item) => item?.type === 'hidden_egg' && String(item?.hiddenEggId || '').trim() === String(hiddenEggId || '').trim());
  if (!hasEgg) throw new Error('資料回讀驗證失敗：collection 找不到隱藏蛋紀錄');
  if (!hasLogContaining(saved, 'teacher_shop_grant', itemName || hiddenEggId)) throw new Error('資料回讀驗證失敗：teacher_shop_grant logs 未同步寫入');
  return ['寫入驗證：成功', `金幣：${actualCoins}（本次未扣）`, `隱藏蛋：${hiddenEggId}`, `贈送：${itemName || '隱藏蛋'}${price ? `（原定價 ${price} 金幣）` : ''}`, 'collection：已同步寫入 hidden_egg', '事件紀錄：已同步寫入 logs'];
}

function buildVoucherRedeemPersistenceLines(saved, { voucherId = '' } = {}) {
  const voucher = findVoucherInCollection(saved, voucherId);
  if (!voucher) throw new Error('資料回讀驗證失敗：collection 找不到指定憑證');
  if (voucher.status !== 'redeemed') throw new Error(`資料回讀驗證失敗：憑證狀態應為 redeemed，實際 ${voucher.status || '未設定'}`);
  if (!hasLogContaining(saved, 'voucher_redeem', voucherId)) throw new Error('資料回讀驗證失敗：voucher_redeem logs 未同步寫入');
  return ['寫入驗證：成功', `憑證：${voucherId}`, '狀態：redeemed', '事件紀錄：已同步寫入 logs'];
}

function buildTokenReissuePersistenceLines(saved, { newToken = '', oldToken = '', ntagId = '' } = {}) {
  const activeToken = String(saved?.active_token || saved?.page_token || '').trim();
  if (activeToken !== String(newToken || '').trim()) throw new Error(`資料回讀驗證失敗：active token 預期 ${newToken}，實際 ${activeToken || '空白'}`);
  if (!hasLogContaining(saved, 'token_admin', newToken)) throw new Error('資料回讀驗證失敗：token_admin logs 未同步寫入');
  return ['寫入驗證：成功', `active token：${activeToken}`, `舊 token：${oldToken || '無'}`, `ntag：${ntagId || '未綁定'}`, '事件紀錄：已同步寫入 logs'];
}

function buildTokenDeactivatePersistenceLines(saved, { token = '' } = {}) {
  const activeToken = String(saved?.active_token || saved?.page_token || '').trim();
  if (activeToken == String(token || '').trim()) throw new Error('資料回讀驗證失敗：停用後仍指向舊 token');
  if (!hasLogContaining(saved, 'token_admin', token)) throw new Error('資料回讀驗證失敗：token_admin logs 未同步寫入');
  return ['寫入驗證：成功', `目前 active token：${activeToken || '未設定'}`, `已停用 token：${token}`, '事件紀錄：已同步寫入 logs'];
}

function buildBindNtagPersistenceLines(saved, { token = '', ntagId = '' } = {}) {
  if (String(saved?.last_bound_ntag || '').trim() !== String(ntagId || '').trim()) throw new Error(`資料回讀驗證失敗：last_bound_ntag 預期 ${ntagId}，實際 ${saved?.last_bound_ntag || '空白'}`);
  if (!hasLogContaining(saved, 'token_admin', ntagId)) throw new Error('資料回讀驗證失敗：token_admin logs 未同步寫入');
  return ['寫入驗證：成功', `active token：${token}`, `ntag：${ntagId}`, '學生主檔：已同步記錄 last_bound_ntag', '事件紀錄：已同步寫入 logs'];
}

function getAuditGrowthStage(totalXP = 0) {
  const xp = Math.max(0, Number(totalXP) || 0);
  if (xp < 10) return '缺乏能量的蛋 / 紙箱';
  if (xp < 100) return '有屬性的蛋 / 乾淨紙箱';
  if (xp < 200) return '破殼期 / 紙箱中的小貓';
  if (xp < 300) return '成長期 / 青年小貓';
  return '成熟期 / 成年形態';
}

function getTopAttrSummary(data = {}) {
  const attrs = data?.attributes && typeof data.attributes === 'object' ? data.attributes : {};
  const top = Object.entries(attrs).sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0))[0] || ['fire', 0];
  const label = ATTR_META[top[0]]?.label || top[0] || '未設定';
  return `${label} ${Number(top[1] || 0)}`;
}

function buildRecentLogLines(data = {}, limit = 6) {
  const lines = buildUnifiedActivityLines(data, limit);
  return lines.length ? lines : ['尚無近期事件'];
}

function buildUnifiedSourceBreakdownLines(data = {}, limit = 4) {
  const rows = buildUnifiedSourceStats(data, 9999).slice(0, Math.max(1, Number(limit) || 4));
  return rows.length
    ? rows.map((item, idx) => `${idx + 1}. ${item.label} x${Number(item.count || 0)}`)
    : ['尚無事件來源分布'];
}

function buildTeacherResultMetaLines(student = currentState.studentData) {
  if (!student) return ['學生：未載入'];
  return [
    `學生：${student.name || '未命名學生'} (#${student.serial || student.card_seq || '-'})`,
    `暱稱：${student.nickname || student.name || '未設定'}｜金幣：${Number(student.coins || 0)}｜totalXP：${Number(student.totalXP || 0)}`,
    `事件總數：${getUnifiedActivityCount(student)}｜來源分布：${buildUnifiedSourceBreakdownLines(student, 3).join('；')}`,
  ];
}

function buildTeacherOpsDetail(detail, { student = currentState.studentData, extraLines = [] } = {}) {
  const bodyLines = Array.isArray(detail)
    ? detail.flatMap((item) => String(item ?? '').split('\n'))
    : String(detail || '尚未執行').split('\n');
  return [...buildTeacherResultMetaLines(student), ...extraLines, ...bodyLines].filter(Boolean).join('\n');
}

function buildIssueLines(data = {}, limit = 5) {
  const issues = Array.isArray(data?.learning_issues) ? data.learning_issues.slice(-limit).reverse() : [];
  if (!issues.length) return ['尚無學習問題紀錄'];
  return issues.map((item, idx) => `${idx + 1}. ${DEBUFF_INFO[item?.statusKey]?.label || item?.statusKey || '狀態'} x${Number(item?.stacks || 0)}｜${item?.reason || '未填原因'}`);
}

function buildSupportZoneReport(student = currentState.studentData) {
  if (!student) return '請先由老師正式入口載入學生，再產生學習輔助摘要。';
  const data = student || {};
  const classLabel = String(data.class_name || data.className || data.grade || '').trim() || '未設定班級';
  const supportClass = /學習扶助/.test(classLabel) ? '是' : '否';
  const attrs = data.attributes || {};
  const attrLines = Object.entries(attrs).map(([key, value]) => `${ATTR_META[key]?.label || key}：${Number(value || 0)}`);
  const debuffLines = Object.entries(data.debuffs || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${DEBUFF_INFO[key]?.label || key} x${value}`);
  return [
    '【學習輔助專區｜學生表現輸出】',
    `學生：${data.name || '未命名學生'} (#${data.serial || data.card_seq || '-'})`,
    `暱稱：${data.nickname || data.name || '未設定'}｜年級/班別：${classLabel}｜學習扶助班：${supportClass}`,
    `稱號：${data.title || data.current_title || '未設定'}｜金幣：${Number(data.coins || 0)}｜totalXP：${Number(data.totalXP || 0)}`,
    `成長階段：${getAuditGrowthStage(data.totalXP)}｜最高能力：${getTopAttrSummary(data)}`,
    `統一事件數：${getUnifiedActivityCount(data)}｜來源分布：${buildUnifiedSourceBreakdownLines(data, 4).join('；')}`,
    '五種能力指標：',
    ...attrLines,
    `目前狀態：${debuffLines.length ? debuffLines.join('、') : '健康'}`,
    '學習問題紀錄：',
    ...buildIssueLines(data),
    '近期事件紀錄：',
    ...buildRecentLogLines(data),
  ].join('\n');
}

function buildScienceZoneReport(student = currentState.studentData) {
  if (!student) return '請先由老師正式入口載入學生，再產生科展團隊摘要。';
  const data = student || {};
  const classLabel = String(data.class_name || data.className || data.grade || '').trim() || '未設定班級';
  const scienceClass = /科展團隊/.test(classLabel) ? '是' : '否';
  const attrs = data.attributes || {};
  const attrPairs = Object.entries(attrs).sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0));
  const topThree = attrPairs.slice(0, 3).map(([key, value], idx) => `${idx + 1}. ${ATTR_META[key]?.label || key} ${Number(value || 0)}`);
  return [
    '【科展團隊專區｜研究追蹤摘要】',
    `學生：${data.name || '未命名學生'} (#${data.serial || data.card_seq || '-'})`,
    `暱稱：${data.nickname || data.name || '未設定'}｜年級/班別：${classLabel}｜科展團隊：${scienceClass}`,
    `稱號：${data.title || data.current_title || '未設定'}｜成長階段：${getAuditGrowthStage(data.totalXP)}`,
    `總經驗：${Number(data.totalXP || 0)}｜金幣：${Number(data.coins || 0)}｜最高能力：${getTopAttrSummary(data)}`,
    `統一事件數：${getUnifiedActivityCount(data)}｜來源分布：${buildUnifiedSourceBreakdownLines(data, 4).join('；')}`,
    '能力排序：',
    ...(topThree.length ? topThree : ['尚無能力資料']),
    `收藏 / 隱藏蛋：${Array.isArray(data.collection) ? data.collection.length : 0}｜目前啟用：${data.active_hidden_egg?.name || data.active_hidden_egg_id || '無'}`,
    '近期研究 / 表現紀錄：',
    ...buildRecentLogLines(data, 8),
  ].join('\n');
}

function refreshSpecialZoneReports() {
  const supportEl = byId('supportZoneReportText');
  const scienceEl = byId('scienceZoneReportText');
  if (supportEl) supportEl.textContent = buildSupportZoneReport(currentState.studentData);
  if (scienceEl) scienceEl.textContent = buildScienceZoneReport(currentState.studentData);
}

function buildStudentPageUrl(token = currentState.currentToken || currentState.studentData?.active_token || currentState.studentData?.page_token || '') {
  const safeToken = String(token || '').trim();
  if (!safeToken) return '';
  const base = window.location.href.split('#')[0];
  return `${base}#t=${encodeURIComponent(safeToken)}`;
}

async function copyTextToClipboard(text) {
  const safeText = String(text || '').trim();
  if (!safeText) throw new Error('沒有可複製的內容');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(safeText);
    return;
  }
  const helper = document.createElement('textarea');
  helper.value = safeText;
  helper.setAttribute('readonly', 'readonly');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(helper);
  if (!ok) throw new Error('裝置不支援複製，請手動複製欄位內容');
}

async function writeStudentUrlToNfc(url) {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) throw new Error('缺少可寫入的學生頁網址');
  if (!('NDEFReader' in window)) throw new Error('裝置不支援 Web NFC');
  if (!window.isSecureContext) throw new Error('Web NFC 需要 HTTPS 安全環境');
  const writer = new NDEFReader();
  await writer.write({ records: [{ recordType: 'url', data: safeUrl }] });
}


async function readNfcUidOnce() {
  if (!('NDEFReader' in window)) throw new Error('裝置不支援 Web NFC');
  if (!window.isSecureContext) throw new Error('Web NFC 需要 HTTPS 安全環境');
  const reader = new NDEFReader();
  let controller = null;
  if ('AbortController' in window) controller = new AbortController();
  await reader.scan(controller ? { signal: controller.signal } : undefined);
  return await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      try { controller?.abort(); } catch (_error) {}
      reject(new Error('讀取新卡 UID 逾時，請把新卡靠近手機 NFC 感應區'));
    }, 12000);
    const cleanup = () => {
      window.clearTimeout(timer);
      try { controller?.abort(); } catch (_error) {}
    };
    reader.onreadingerror = () => {
      cleanup();
      reject(new Error('讀取新卡 UID 失敗，請重新貼近 NFC 感應區'));
    };
    reader.onreading = (event) => {
      cleanup();
      const serialNumber = String(event?.serialNumber || '').trim();
      if (!serialNumber) {
        reject(new Error('已感應到卡片，但裝置未提供 UID / serialNumber'));
        return;
      }
      resolve(serialNumber);
    };
  });
}

function buildNewCardRegistrationPayload() {
  return {
    serial: String(byId('newCardSerialInput')?.value || '').trim(),
    grade: String(byId('newCardGradeInput')?.value || '').trim(),
    className: String(byId('newCardClassInput')?.value || '').trim(),
    displayName: String(byId('newCardNameInput')?.value || '').trim(),
    ntagId: String(byId('newCardUidInput')?.value || '').trim(),
    actorUid: currentState.teacherUser?.uid || null,
  };
}

function renderNewCardRegistrationResult(title, detail) {
  const textValue = Array.isArray(detail) ? detail.join('\n') : String(detail || '');
  const output = byId('newCardRegistrationText');
  if (output) output.textContent = textValue || '尚未建立新卡';
  renderTeacherOpsResult(title, textValue);
}

async function handleReadNewCardUid() {
  ensureTeacherLoggedIn();
  const uid = await readNfcUidOnce();
  if (byId('newCardUidInput')) byId('newCardUidInput').value = uid;
  renderNewCardRegistrationResult('已讀取新卡 UID', ['狀態：成功', `UID / NTAG：${uid}`, '下一步：輸入年級與卡序後，執行註冊新卡 / 發卡。']);
  showAlert(`已讀取新卡 UID：${uid}`);
}

async function handleReadCardAdminUid() {
  ensureTeacherLoggedIn();
  const uid = await readNfcUidOnce();
  if (byId('cardAdminNtagInput')) byId('cardAdminNtagInput').value = uid;
  renderCardWorkflowPreview();
  renderCardFieldCheck();
  renderTeacherOpsResult('已讀取補卡新卡 UID', ['狀態：成功', `新卡 UID / NTAG：${uid}`, '下一步：確認卡序學生後，執行一鍵補卡 / 重綁；完成後會自動改發新 token 並寫入學生頁 NFC。'].join('\n'));
  showAlert(`已讀取補卡新卡 UID：${uid}`);
}

async function handleRegisterNewCard({ writeNfc = false } = {}) {
  ensureTeacherLoggedIn();
  const payload = buildNewCardRegistrationPayload();
  assertTeacherCanRegisterCard(payload);
  const result = await registerNewStudentCard(payload);
  const studentUrl = buildStudentPageUrl(result.token);
  const lines = [
    '狀態：成功',
    `學生：${result.studentName} (#${result.serial})`,
    `年級：${result.grade}${result.className ? `｜班級：${result.className}` : ''}`,
    `UID / NTAG：${result.ntagId}`,
    `active token：${result.token}`,
    '防呆：serial / UID 已做重複檢查',
    `學生頁網址：${studentUrl || '尚未建立'}`,
    '資料：students / student_pages / tokens 已同步建立',
  ];
  let nfcStatus = '未執行 NFC 寫入';
  if (writeNfc) {
    if (!studentUrl) throw new Error('學生頁網址尚未建立，無法寫入 NFC');
    await writeStudentUrlToNfc(studentUrl);
    nfcStatus = '已把學生頁網址寫入 NFC';
  }
  lines.push(`NFC：${nfcStatus}`);
  renderNewCardRegistrationResult(writeNfc ? '新卡註冊並寫入 NFC 完成' : '新卡註冊 / 發卡完成', lines);
  updateStudentSummary();
  renderTeacherNtagPanel();
  showAlert(writeNfc ? '已完成新卡註冊並寫入 NFC' : '已完成新卡註冊 / 發卡');
}

function renderTeacherNtagPanel() {
  const output = byId('teacherNtagText');
  const urlInput = byId('studentUrlOutput');
  if (!output) return;
  const data = currentState.studentData;
  if (!data) {
    const msg = '請先載入學生。這裡會顯示 active token、學生頁網址與 NFC 寫入狀態。';
    output.textContent = msg;
    if (urlInput) urlInput.value = '';
    updateLegacyCockpitSummary();
    return;
  }
  const serial = data.serial || data.card_seq || '-';
  const activeToken = String(currentState.currentToken || data.active_token || data.page_token || '').trim();
  const url = buildStudentPageUrl(activeToken);
  const lastBound = String(data.last_bound_ntag || '').trim() || '未綁定';
  if (urlInput) urlInput.value = url;
  output.textContent = [
    `學生：${data.name || '未命名學生'} (#${serial})`,
    `active token：${activeToken || '未設定'}`,
    `最近綁定 ntag：${lastBound}`,
    `學生頁網址：${url || '尚未建立'}`,
    `NFC 能力：${'NDEFReader' in window ? (window.isSecureContext ? '可嘗試寫入' : '需要 HTTPS') : '此裝置不支援 Web NFC'}`,
  ].join('\n');
  updateLegacyCockpitSummary();
}

function renderLegacyActionBoard(panelKey = 'general') {
  const panel = getTeacherActionPanel(panelKey);
  const board = byId('legacyActionBoard');
  const hint = byId('legacyActionHintText');
  const modeHint = byId('actionGridModeHint');
  if (!board) return;
  board.dataset.panelKey = panel?.id || 'general';
  if (hint) hint.textContent = panel?.hint || '直接沿用舊版事件與面板。';
  if (modeHint) modeHint.innerHTML = `<span style="font-weight:700;">目前使用 ${escapeHtml(panel?.title || '一般學習加分面板')}</span>。`;
  document.querySelectorAll('.legacy-panel-switch[data-action-panel]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.actionPanel === panel.id);
  });
  const recommendedAttr = Object.keys(panel?.attrFocus || {})[0] || Object.keys(panel?.actions || {})[0] || '';
  const cards = Object.entries(panel?.actions || {}).map(([attrKey, list]) => {
    const summary = panel?.attrFocus?.[attrKey]?.summary || '直接沿用舊版事件描述與對應 XP。';
    const actions = (list || []).map((item, index) => `
      <button type="button" class="action-btn legacy-action-btn ${attrKey === recommendedAttr ? 'is-recommended' : ''}" data-panel="${panel.id}" data-attr="${attrKey}" data-index="${index}">
        <span class="action-desc">${escapeHtml(item.reason || item.desc || '未命名事件')}</span>
        <span class="action-value">+${Number(item.amount || item.val || 0)} XP</span>
      </button>`).join('\n');
    return `
      <div class="attr-card">
        <h4 class="tech-font">${escapeHtml(getAttrTitle(attrKey, panel))}</h4>
        <div class="attr-summary">${escapeHtml(summary)}</div>
        ${actions || '<div class="action-help-note">尚未定義事件</div>'}
      </div>`;
  }).join('\n');
  board.innerHTML = `
    <div class="legacy-callout"><strong>${escapeHtml(panel?.title || '老師加分面板')}</strong><br/>${escapeHtml(panel?.hint || '')}</div>
    <div class="action-grid">${cards || '<div class="glass-panel">目前沒有可用事件。</div>'}</div>
    <div class="action-help-note">提示：載入學生後，點一下事件會直接寫入資料庫；若還沒載入學生，會先把內容套到右側手動表單，再開啟舊版式加分視窗。</div>`;
}

function applyPresetToForm(preset) {
  if (!preset) return;
  if (byId('scoreAttrSelect')) byId('scoreAttrSelect').value = preset.attrKey;
  if (byId('scoreValueInput')) byId('scoreValueInput').value = String(preset.amount || 1);
  if (byId('scoreReasonInput')) byId('scoreReasonInput').value = preset.reason || '';
  updateLegacyFlowStrip();
}

let cachedShopCatalogForTeacher = [];
let cachedQuizGovernance = { admins: [], editors: [], deleteRequests: [] };
let cachedTeacherGovernance = { admins: [], scopes: [] };

function getTeacherEmail() { return String(currentState.teacherUser?.email || '').trim().toLowerCase(); }
function isQuizAdmin() { const email = getTeacherEmail(); return !!email && Array.isArray(cachedQuizGovernance.admins) && cachedQuizGovernance.admins.includes(email); }
function canEditQuizBank() { const email = getTeacherEmail(); if (!email) return false; const editors = Array.isArray(cachedQuizGovernance.editors) ? cachedQuizGovernance.editors : []; const admins = Array.isArray(cachedQuizGovernance.admins) ? cachedQuizGovernance.admins : []; return !editors.length || editors.includes(email) || admins.includes(email); }

function isTeacherScopeAdmin() { const email = getTeacherEmail(); return !!email && Array.isArray(cachedTeacherGovernance.admins) && cachedTeacherGovernance.admins.includes(email); }
function getTeacherScopeRulesForCurrentUser() { const email = getTeacherEmail(); const rules = Array.isArray(cachedTeacherGovernance.scopes) ? cachedTeacherGovernance.scopes : []; return email ? rules.filter((row) => String(row.email || '').trim().toLowerCase() === email) : []; }
function getTeacherScopeSummary() {
  const email = getTeacherEmail();
  if (!email) return ['目前未登入老師'];
  if (isTeacherScopeAdmin()) return [`目前登入：${email}`, '權限：管理員，可跨班 / 跨卡序查找與操作'];
  const rules = getTeacherScopeRulesForCurrentUser();
  if (!rules.length) return [`目前登入：${email}`, '權限：未設定範圍，暫採開放模式'];
  const classes = [...new Set(rules.flatMap((row) => Array.isArray(row.classes) ? row.classes : []).filter(Boolean))];
  const ranges = [...new Set(rules.flatMap((row) => Array.isArray(row.serialRanges) ? row.serialRanges.map((range) => `${range.start}-${range.end}`) : []).filter(Boolean))];
  return [`目前登入：${email}`, '權限：非管理員，僅可查找 / 操作下列範圍', `班級：${classes.length ? classes.join('、') : '未限制班級'}`, `卡序：${ranges.length ? ranges.join('、') : '未限制卡序'}`];
}
function matchesTeacherClassScope(student = {}, classes = []) {
  if (!Array.isArray(classes) || !classes.length) return false;
  const pool = [student.class_name, student.className, student.grade, student.gradeLabel].map((v) => String(v || '').trim()).filter(Boolean);
  return classes.some((allowed) => pool.some((value) => value === allowed || value.includes(allowed) || allowed.includes(value)));
}
function matchesTeacherSerialScope(student = {}, serialRanges = []) {
  if (!Array.isArray(serialRanges) || !serialRanges.length) return false;
  const serial = Number(String(student.serial || student.card_seq || '').replace(/\D/g, ''));
  if (!Number.isFinite(serial) || serial <= 0) return false;
  return serialRanges.some((range) => {
    const start = Number(String(range?.start || '').replace(/\D/g, ''));
    const end = Number(String(range?.end || '').replace(/\D/g, ''));
    return Number.isFinite(start) && Number.isFinite(end) && serial >= Math.min(start, end) && serial <= Math.max(start, end);
  });
}
function teacherCanAccessStudent(student = {}) {
  if (!currentState.teacherUser) return false;
  if (isTeacherScopeAdmin()) return true;
  const rules = getTeacherScopeRulesForCurrentUser();
  if (!rules.length) return true;
  return rules.some((rule) => {
    const hasClass = Array.isArray(rule.classes) && rule.classes.length;
    const hasRange = Array.isArray(rule.serialRanges) && rule.serialRanges.length;
    if (!hasClass && !hasRange) return true;
    return matchesTeacherClassScope(student, rule.classes) || matchesTeacherSerialScope(student, rule.serialRanges);
  });
}
function teacherCanManageSerialRange(startSerial, endSerial) {
  if (!currentState.teacherUser) return false;
  if (isTeacherScopeAdmin()) return true;
  const rules = getTeacherScopeRulesForCurrentUser();
  if (!rules.length) return true;
  const start = Number(String(startSerial || '').replace(/\D/g, ''));
  const end = Number(String(endSerial || '').replace(/\D/g, ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) return false;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  return rules.some((rule) => Array.isArray(rule.serialRanges) && rule.serialRanges.some((range) => {
    const rs = Number(String(range?.start || '').replace(/\D/g, ''));
    const re = Number(String(range?.end || '').replace(/\D/g, ''));
    return Number.isFinite(rs) && Number.isFinite(re) && low >= Math.min(rs, re) && high <= Math.max(rs, re);
  }));
}
function assertTeacherCanAccessStudent(student, actionLabel = '查找學生') {
  if (!teacherCanAccessStudent(student)) {
    const serial = student?.serial || student?.card_seq || '-';
    const classLabel = String(student?.class_name || student?.className || student?.grade || student?.gradeLabel || '未設定').trim();
    throw new Error(`目前老師權限不足，不能${actionLabel}：#${serial}／${classLabel}`);
  }
}
function assertTeacherCanManageRange(startSerial, endSerial, actionLabel = '使用批次工具') {
  if (!teacherCanManageSerialRange(startSerial, endSerial)) throw new Error(`目前老師權限不足，不能${actionLabel}此卡序區間`);
}
function assertTeacherCanRegisterCard({ serial = '', grade = '', className = '' } = {}) {
  if (isTeacherScopeAdmin()) return;
  const rules = getTeacherScopeRulesForCurrentUser();
  if (!rules.length) return;
  assertTeacherCanAccessStudent({ serial, card_seq: serial, grade, class_name: className || grade }, '註冊 / 發卡到此範圍');
}
function renderTeacherGovernance() {
  const adminsInput = byId('teacherScopeAdminsInput');
  const rulesInput = byId('teacherScopeRulesInput');
  const textEl = byId('teacherGovernanceText');
  const scopeEl = byId('teacherAccessScopeText');
  if (adminsInput) adminsInput.value = (cachedTeacherGovernance.admins || []).join('\n');
  if (rulesInput) rulesInput.value = formatTeacherScopeText(cachedTeacherGovernance.scopes || []);
  const rules = Array.isArray(cachedTeacherGovernance.scopes) ? cachedTeacherGovernance.scopes : [];
  if (textEl) textEl.textContent = [...getTeacherScopeSummary(), `管理員名單：${(cachedTeacherGovernance.admins || []).length}`, `規則筆數：${rules.length}`, ...rules.slice(0, 10).map((rule, idx) => `${idx + 1}. ${rule.email}｜班級 ${Array.isArray(rule.classes) && rule.classes.length ? rule.classes.join(',') : '-'}｜卡序 ${Array.isArray(rule.serialRanges) && rule.serialRanges.length ? rule.serialRanges.map((range) => `${range.start}-${range.end}`).join(',') : '-'}`)].join('\n');
  if (scopeEl) scopeEl.textContent = getTeacherScopeSummary().join('\n');
}
async function refreshTeacherGovernance() {
  cachedTeacherGovernance = await getTeacherGovernance().catch(() => ({ admins: [], scopes: [] }));
  renderTeacherGovernance();
  return cachedTeacherGovernance;
}
async function handleSaveTeacherGovernance() {
  ensureTeacherLoggedIn();
  if (cachedTeacherGovernance.admins?.length && !isTeacherScopeAdmin()) throw new Error('只有管理員可以調整老師權限範圍');
  const governance = await saveTeacherGovernance({ admins: byId('teacherScopeAdminsInput')?.value || '', scopes: parseTeacherScopeText(byId('teacherScopeRulesInput')?.value || '') });
  cachedTeacherGovernance = governance;
  renderTeacherGovernance();
  renderTeacherOpsResult('老師權限範圍已儲存', [`管理員：${(governance.admins || []).length}`, `規則：${(governance.scopes || []).length}`].join('\n'));
}
function audienceLabel(audience = '') { return ({ grade3: '三年級', grade4: '四年級', grade5: '五年級', grade6: '六年級', support: '學習扶助' }[String(audience || '').trim()] || String(audience || '').trim() || '-'); }
function syncGradeLabelFromSelectors(force = false) { const audience = String(byId('questionSetAudienceSelect')?.value || '').trim(); const semester = String(byId('questionSetSemesterSelect')?.value || '上').trim() || '上'; const gradeEl = byId('questionSetGradeInput'); if (!gradeEl) return ''; if (!force && String(gradeEl.value || '').trim()) return String(gradeEl.value || '').trim(); gradeEl.value = audience === 'support' ? '學習扶助班' : `${String(audience || '').replace('grade', '')}${semester}`; return gradeEl.value; }
function renderQuizGovernance() { const govText = byId('quizGovernanceText'); const editorsInput = byId('quizEditorsInput'); const adminsInput = byId('quizAdminsInput'); const deleteSelect = byId('quizDeleteRequestSelect'); const deleteText = byId('quizDeleteRequestText'); if (editorsInput) editorsInput.value = (cachedQuizGovernance.editors || []).join('\n'); if (adminsInput) adminsInput.value = (cachedQuizGovernance.admins || []).join('\n'); if (govText) govText.textContent = [`目前登入：${getTeacherEmail() || '未登入'}`, `我的權限：${isQuizAdmin() ? '管理員' : (canEditQuizBank() ? '可建置老師' : '未授權')}`, `可建置名單：${(cachedQuizGovernance.editors || []).length}`, `管理員名單：${(cachedQuizGovernance.admins || []).length}`].join('\n'); const pending = (cachedQuizGovernance.deleteRequests || []).filter((item) => item.status === 'pending'); if (deleteSelect) { deleteSelect.innerHTML = pending.length ? '<option value=>請選擇待批准題目</option>' : '<option value=>目前沒有待批准申請</option>'; pending.forEach((item) => { const opt = document.createElement('option'); opt.value = item.quizId; opt.textContent = `${item.quizId}｜${String(item.question || '').slice(0, 18)}${String(item.question || '').length > 18 ? '…' : ''}｜${item.requestedBy || '未知老師'}`; deleteSelect.appendChild(opt); }); } if (deleteText) deleteText.textContent = pending.length ? pending.map((item, idx) => `${idx + 1}. ${item.quizId}｜${item.question}｜申請者 ${item.requestedBy || '-'}｜${new Date(item.requestedAt).toLocaleString('zh-TW')}`).join('\n') : '目前沒有待批准刪除申請'; }
let cachedQuizEntries = [];
let cachedQuestionSets = [];

function parseGradeNumber(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function openLegacyModal({ title, kicker = 'Legacy Flow', html = '' }) {
  const overlay = byId('legacyModal');
  const titleEl = byId('legacyModalTitle');
  const kickerEl = byId('legacyModalKicker');
  const bodyEl = byId('legacyModalBody');
  if (!overlay || !titleEl || !bodyEl) return;
  titleEl.textContent = title || '系統視窗';
  if (kickerEl) kickerEl.textContent = kicker || 'Legacy Flow';
  bodyEl.innerHTML = html || '<div class="legacy-callout">沒有可顯示的內容。</div>';
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeLegacyModal() {
  const overlay = byId('legacyModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

function bindLegacyModal() {
  const overlay = byId('legacyModal');
  const closeBtn = byId('legacyModalClose');
  if (!overlay) return;
  closeBtn?.addEventListener('click', closeLegacyModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeLegacyModal();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.classList.contains('hidden')) closeLegacyModal();
  });
}

function buildLegacyStudentInfoHtml() {
  const data = currentState.studentData;
  if (!data) return '<div class="legacy-callout">請先查找學生，才能開啟舊版式操作視窗。</div>';
  const logs = buildUnifiedActivityFeedForHtml(data, 6);
  const issues = Array.isArray(data.learning_issues) ? data.learning_issues.slice(-6).reverse() : [];
  const status = Object.entries(data.debuffs || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${DEBUFF_INFO[key]?.label || key} x${value}`).join('、') || '健康';
  const attrs = Object.entries(data.attributes || {}).map(([key, value]) => `${key}: ${Number(value) || 0}`).join('<br/>') || '尚未建立';
  const logHtml = logs.length ? logs.map((item) => `<div class="legacy-info-item">${escapeHtml(item.line || '未命名事件')}</div>`).join('\n') : '<div class="legacy-info-item">尚無事件紀錄</div>';
  const issueHtml = issues.length ? issues.map((item) => `<div class="legacy-info-item"><strong>${escapeHtml(DEBUFF_INFO[item.statusKey]?.label || item.statusKey || '學習問題')}</strong>${escapeHtml(item.reason || '未填寫')}<br/>層數：${Number(item.stacks) || 0}</div>`).join('\n') : '<div class="legacy-info-item">尚無學習問題</div>';
  return `
    <div class="legacy-modal-layout">
      <div class="legacy-side-stack">
        <div class="glass-panel">
          <h3 class="tech-font">學生核心摘要</h3>
          <div class="legacy-info-list">
            <div class="legacy-info-item"><strong>暱稱 / 卡序</strong>${escapeHtml(data.name || '未命名學生')} / #${escapeHtml(data.serial || data.card_seq || '-')}</div>
            <div class="legacy-info-item"><strong>年級 / 班級</strong>${escapeHtml(data.grade || data.class_name || '-')}</div>
            <div class="legacy-info-item"><strong>稱號 / 狀態</strong>${escapeHtml(data.title || data.current_title || '未設定')} / ${escapeHtml(status)}</div>
            <div class="legacy-info-item"><strong>金幣 / totalXP</strong>${Number(data.coins) || 0} / ${Number(data.totalXP) || 0}</div>
            <div class="legacy-info-item"><strong>目前 token</strong>${escapeHtml(currentState.currentToken || data.active_token || data.page_token || '未綁定')}</div>
          </div>
        </div>
        <div class="glass-panel">
          <h3 class="tech-font">五行 / 能力指標摘要</h3>
          <div class="legacy-info-item">${attrs}</div>
        </div>
      </div>
      <div class="legacy-main-stack">
        <div class="glass-panel">
          <h3 class="tech-font">老師操作主流程</h3>
          <div class="legacy-callout">查學生 → 同頁操作 → 明確回饋 → 同步更新 XP、金幣、屬性、狀態、事件紀錄。這一輪把新版互動拉回舊版操作感，避免只剩測試台。</div>
          <div class="legacy-grid">
            <div class="legacy-info-item"><strong>手動加分</strong>${escapeHtml(byId('scoreReasonInput')?.value || '未填')} / ${escapeHtml(byId('scoreAttrSelect')?.value || '-')} / +${escapeHtml(byId('scoreValueInput')?.value || '0')} XP</div>
            <div class="legacy-info-item"><strong>狀態調整</strong>${escapeHtml(byId('statusPresetSelect')?.value || '-')} / ${escapeHtml(byId('statusReasonInput')?.value || '未填')} / ${escapeHtml(byId('statusStacksInput')?.value || '0')} 層</div>
            <div class="legacy-info-item"><strong>商城 / 憑證</strong>${escapeHtml(byId('shopItemNameInput')?.value || '未填商品')} / 價格 ${escapeHtml(byId('shopItemPriceInput')?.value || '0')}</div>
            <div class="legacy-info-item"><strong>卡務 / NTAG</strong>${escapeHtml(byId('cardAdminNtagInput')?.value || '未填 NTAG')}</div>
          </div>
        </div>
        <div class="glass-panel">
          <h3 class="tech-font">近期事件紀錄</h3>
          <div class="legacy-info-list">${logHtml}</div>
        </div>
        <div class="glass-panel">
          <h3 class="tech-font">學習問題 / 狀態紀錄</h3>
          <div class="legacy-info-list">${issueHtml}</div>
        </div>
      </div>
    </div>`;
}

function buildScoreModalHtml() {
  const data = currentState.studentData;
  if (!data) return '<div class="legacy-callout">請先查找學生，再開啟加分視窗。</div>';
  const reason = byId('scoreReasonInput')?.value || '未填寫加分事件';
  const attr = byId('scoreAttrSelect')?.value || '-';
  const xp = byId('scoreValueInput')?.value || '0';
  const preview = currentState.previewAction?.type === 'teacher_score' ? buildTeacherScorePreviewText(data, currentState.previewAction.payload) : '尚未執行預覽，可先按主頁的「預覽加分」。';
  const boardHtml = byId('legacyActionBoard')?.innerHTML || '';
  return `
    <div class="glass-panel"><h3 class="tech-font">舊版式加分操作</h3><div class="legacy-callout">這個視窗保留舊版「先看操作內容，再決定是否直接入帳」的操作感；正式寫入仍走新版 services / domain。</div></div>
    <div class="legacy-grid">
      <div class="glass-panel"><h3 class="tech-font">目前設定</h3><div class="legacy-info-list"><div class="legacy-info-item"><strong>學生</strong>${escapeHtml(data.name || '未命名學生')} / #${escapeHtml(data.serial || data.card_seq || '-')}</div><div class="legacy-info-item"><strong>事件</strong>${escapeHtml(reason)}</div><div class="legacy-info-item"><strong>屬性 / XP</strong>${escapeHtml(attr)} / +${escapeHtml(xp)}</div></div></div>
      <div class="glass-panel"><h3 class="tech-font">預覽結果</h3><pre>${escapeHtml(preview)}</pre></div>
    </div>
    <div class="glass-panel legacy-action-section"><h3 class="tech-font">舊版事件快捷面板</h3>${boardHtml || '<div class="legacy-callout">主頁尚未建立快捷面板。</div>'}</div>`;
}

function buildStatusModalHtml() {
  const data = currentState.studentData;
  if (!data) return '<div class="legacy-callout">請先查找學生，再開啟狀態視窗。</div>';
  return `
    <div class="glass-panel"><h3 class="tech-font">狀態 / 學習問題視窗</h3><div class="legacy-callout">負面狀態與學習問題必須同時留下教師紀錄，而不只是遊戲圖示。這裡顯示目前準備要寫入的內容。</div></div>
    <div class="legacy-grid">
      <div class="glass-panel"><div class="legacy-info-item"><strong>學生</strong>${escapeHtml(data.name || '未命名學生')}</div><div class="legacy-info-item"><strong>狀態</strong>${escapeHtml(byId('statusPresetSelect')?.value || '-')}</div><div class="legacy-info-item"><strong>層數</strong>${escapeHtml(byId('statusStacksInput')?.value || '0')}</div><div class="legacy-info-item"><strong>原因</strong>${escapeHtml(byId('statusReasonInput')?.value || '未填寫')}</div></div>
      <div class="glass-panel"><h3 class="tech-font">目前狀態摘要</h3><pre>${escapeHtml(document.querySelector('[data-bind="status"]')?.textContent || '健康')}</pre></div>
    </div>`;
}

function buildBatchModalHtml() {
  const snapshot = getBatchSessionSnapshot();
  const presetEl = byId('batchCardPresetSelect');
  const presetText = presetEl?.selectedOptions?.[0]?.textContent || '未選擇';
  const auditText = byId('batchAuditText')?.textContent || buildBatchAuditText();
  const fieldCheckText = byId('batchFieldCheckText')?.textContent || buildBatchFieldCheckText();
  const resultBoardHtml = byId('batchResultBoard')?.innerHTML || buildBatchResultBoardHtml();
  return `
    <div class="glass-panel"><h3 class="tech-font">批量掃描工作流</h3><div class="legacy-callout">舊版規則：學生卡先鎖定 10 秒掃描窗，再感應道具卡；再次感應道具卡會重新計時，切到下一張學生卡則開新循環。</div></div>
    <div class="legacy-grid">
      <div class="glass-panel"><div class="legacy-info-item"><strong>目前學生</strong>${escapeHtml(snapshot.studentName || '等待學生卡')} / #${escapeHtml(snapshot.serial || '-')}</div><div class="legacy-info-item"><strong>剩餘時限</strong>${(Number(snapshot.timeLeftMs || 0) / 1000).toFixed(1)}s</div><div class="legacy-info-item"><strong>連續次數</strong>${Number(snapshot.comboCount || 0)}</div><div class="legacy-info-item"><strong>待套用道具</strong>${escapeHtml(presetText)}</div></div>
      <div class="glass-panel"><h3 class="tech-font">最近批量結果</h3><pre>${escapeHtml(byId('batchScanResultText')?.textContent || '尚未套用道具卡')}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">批量盤查摘要</h3><pre>${escapeHtml(auditText)}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">現場確認清單</h3><pre>${escapeHtml(fieldCheckText)}</pre></div>
    </div>
    <div class="glass-panel legacy-action-section"><h3 class="tech-font">成功回饋 / 老師確認</h3>${resultBoardHtml}</div>`;
}

function buildCardAdminModalHtml() {
  const summary = byId('tokenSummaryText')?.textContent || '尚未載入 token 摘要';
  const workflow = byId('cardWorkflowText')?.textContent || buildCardWorkflowText();
  const actionStripHtml = byId('cardActionStrip')?.innerHTML || buildCardActionStripHtml();
  const fieldCheck = byId('cardFieldCheckText')?.textContent || buildCardFieldCheckText();
  const ntagSummary = byId('teacherNtagText')?.textContent || '尚未載入 NFC / NTAG 摘要';
  return `
    <div class="glass-panel"><h3 class="tech-font">卡務與補卡視窗</h3><div class="legacy-callout">這一區繼續沿用舊版原則：補卡 / 重綁 / 重發 token 時，舊 token 必須失效，新 token 才能成為唯一有效入口。</div></div>
    <div class="legacy-grid">
      <div class="glass-panel"><h3 class="tech-font">Token 摘要</h3><pre>${escapeHtml(summary)}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">補卡流程</h3><pre>${escapeHtml(workflow)}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">現場確認清單</h3><pre>${escapeHtml(fieldCheck)}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">NFC / NTAG / 學生頁</h3><pre>${escapeHtml(ntagSummary)}</pre></div>
    </div>
    <div class="glass-panel legacy-action-section"><h3 class="tech-font">卡務一鍵流程步驟板</h3>${actionStripHtml}</div>`;
}

function buildForgeModalHtml() {
  const mode = byId('forgeModeSelect')?.value || 'xp';
  const summary = byId('forgeCardListText')?.textContent || '尚未載入自訂道具卡';
  return `
    <div class="glass-panel"><h3 class="tech-font">道具卡鑄造視窗</h3><div class="legacy-callout">道具卡會寫入 item_cards，之後再由批量掃描 / NFC 工作流套用。這一輪先把舊版的視窗操作感搬回來。</div></div>
    <div class="legacy-grid">
      <div class="glass-panel"><div class="legacy-info-item"><strong>模式</strong>${escapeHtml(mode)}</div><div class="legacy-info-item"><strong>名稱</strong>${escapeHtml(byId('forgeNameInput')?.value || '未填寫')}</div><div class="legacy-info-item"><strong>描述</strong>${escapeHtml(byId('forgeReasonInput')?.value || '未填寫')}</div></div>
      <div class="glass-panel"><h3 class="tech-font">目前卡片清單</h3><pre>${escapeHtml(summary)}</pre></div>
    </div>`;
}

function buildLogsModalHtml() {
  return `
    <div class="legacy-grid">
      <div class="glass-panel"><h3 class="tech-font">操作結果</h3><pre>${escapeHtml(byId('teacherOpsResultText')?.textContent || '尚未執行')}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">事件紀錄</h3><pre>${escapeHtml(byId('teacherStudentLogText')?.textContent || '尚無事件紀錄')}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">學習問題</h3><pre>${escapeHtml(byId('teacherIssueText')?.textContent || '尚無學習問題')}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">批量摘要</h3><pre>${escapeHtml(document.querySelector('[data-bind="batchSummary"]')?.textContent || '尚未執行')}</pre></div>
    </div>`;
}

function buildStudentModalHtml() {
  const guideText = byId('guideResultText')?.textContent || '尚未提問';
  const frontSummary = byId('studentFrontRankingPreview')?.textContent || '尚未載入學生';
  const guideSummary = byId('studentFrontGuideSummary')?.textContent || '尚未載入 AI / 世界觀摘要';
  const bridgeSummary = byId('teacherStudentBridgePreview')?.textContent || '尚未建立師生正式入口與同步摘要';
  const storyBlocks = [
    [byId('studentFrontStoryDaily')?.textContent || '今日任務', byId('studentFrontStoryDailyHint')?.textContent || ''],
    [byId('studentFrontStoryBoss')?.textContent || 'Boss 追蹤', byId('studentFrontStoryBossHint')?.textContent || ''],
    [byId('studentFrontStoryRanking')?.textContent || '排行進度', byId('studentFrontStoryRankingHint')?.textContent || ''],
  ].map(([title, copy]) => `<div class="student-front-quick-card"><div class="student-front-quick-title">${escapeHtml(title)}</div><div class="student-front-quick-copy">${escapeHtml(copy)}</div></div>`).join('');
  const data = currentState.studentData || {};
  const attrs = data.attributes || {};
  const topEntry = Object.entries(attrs).sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0))[0] || ['metal', 0];
  const stageGlyph = byId('studentFrontGuideGlyph')?.textContent || '🐾';
  const activityText = byId('studentActivityText')?.textContent || '尚無近期活動';
  const collectionText = byId('studentHiddenEggList')?.textContent || '尚未載入';
  const quickCards = [
    ['每日歷練', '每日題目 / 每日限制 / 回讀驗證'],
    ['Boss 挑戰', 'Boss 分流 / battle-limit / 結算驗證'],
    ['AI 夥伴', '世界觀 / 圖像 / 最近一次回覆'],
    ['收藏展示', '縮圖放大 / 排序 / 啟用中收藏'],
  ].map(([title, copy]) => `<div class="student-front-quick-card"><div class="student-front-quick-title">${escapeHtml(title)}</div><div class="student-front-quick-copy">${escapeHtml(copy)}</div></div>`).join('');
  return `
    <div class="student-detail-grid">
      <div class="student-detail-card">
        <div class="student-stage-hero">
          <div class="student-stage-hero-glyph">${escapeHtml(stageGlyph)}</div>
          <div class="student-stage-hero-copy">
            <h3 class="tech-font">${escapeHtml(byId('studentFrontNickname')?.textContent || byId('studentCoreName')?.textContent || '未載入學生')}</h3>
            <p>${escapeHtml(byId('studentFrontGuideMode')?.textContent || 'cat')}｜${escapeHtml(byId('studentFrontGuideSummary')?.textContent || '尚未載入前台摘要')}</p>
            <small>${escapeHtml(byId('studentFrontStageBadge')?.textContent || '-')}｜最高能力 ${escapeHtml(ATTR_META[topEntry[0]]?.label || topEntry[0])} ${Number(topEntry[1] || 0)}</small>
          </div>
        </div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">學生前台工作艙</h3>
        <div class="legacy-info-list">
          <div class="legacy-info-item"><strong>世界觀</strong>${escapeHtml(byId('studentFrontWorldBadge')?.textContent || '未設定')}</div>
          <div class="legacy-info-item"><strong>金幣 / XP</strong>${escapeHtml(byId('studentFrontCoins')?.textContent || '0')} / ${escapeHtml(byId('studentFrontXP')?.textContent || '0')}</div>
          <div class="legacy-info-item"><strong>稱號 / 年級</strong>${escapeHtml(byId('studentFrontTitle')?.textContent || '未設定')} / ${escapeHtml(byId('studentFrontGrade')?.textContent || '未設定')}</div>
          <div class="legacy-info-item"><strong>目前隱藏蛋</strong>${escapeHtml(byId('studentCoreActiveHiddenEgg')?.textContent || '無')}</div>
        </div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">首頁入口艙</h3>
        <div class="student-front-quick-grid">${quickCards}</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">首頁故事線</h3>
        <div class="student-front-quick-grid">${storyBlocks}</div>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">正式入口規則 / 師生同步</h3>
        <pre>${escapeHtml(bridgeSummary)}</pre>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">排行 / 展示摘要</h3>
        <pre>${escapeHtml(frontSummary)}</pre>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">AI / 世界觀摘要</h3>
        <pre>${escapeHtml(guideSummary)}</pre><pre>${escapeHtml(guideText)}</pre>
      </div>
      <div class="student-detail-card">
        <h3 class="tech-font">近期活動 / 收藏</h3>
        <pre>${escapeHtml(activityText)}</pre>
        <pre>${escapeHtml(collectionText)}</pre>
      </div>
    </div>`;
}

function buildTeacherStudentBridgeHtml() {
  const data = currentState.studentData;
  if (!data) return '<div class="legacy-callout">請先由老師登入後以卡序或 ntag 查找學生，再檢查老師正式入口與學生正式入口是否對到同一位學生。</div>';
  const serial = data.serial || data.card_seq || '-';
  const token = currentState.currentToken || data.active_token || data.page_token || '未綁定';
  const nickname = data.nickname || data.display_name || data.name || '未命名學生';
  return `
    <div class="legacy-modal-layout">
      <div class="legacy-side-stack">
        <div class="glass-panel">
          <h3 class="tech-font">老師正式入口</h3>
          <div class="legacy-info-list">
            <div class="legacy-info-item"><strong>老師 session</strong>${escapeHtml(currentState.teacherUser?.email || currentState.teacherUser?.uid || '未登入')}</div>
            <div class="legacy-info-item"><strong>查找方式</strong>登入後依 serial / ntag 查找學生</div>
            <div class="legacy-info-item"><strong>目前查找結果</strong>${escapeHtml(nickname)} / #${escapeHtml(serial)}</div>
            <div class="legacy-info-item"><strong>主要工作台</strong>老師學生操作頁 / 事件紀錄 / 商品 / 卡務</div>
          </div>
        </div>
        <div class="glass-panel">
          <h3 class="tech-font">學生正式入口</h3>
          <div class="legacy-info-list">
            <div class="legacy-info-item"><strong>進入方式</strong>刷 ntag / NFC 帶出 token 後進學生正式頁</div>
            <div class="legacy-info-item"><strong>token</strong>${escapeHtml(token)}</div>
            <div class="legacy-info-item"><strong>世界觀摘要</strong>${escapeHtml(byId('studentFrontGuideSummary')?.textContent || '尚未載入')}</div>
            <div class="legacy-info-item"><strong>前台排行</strong>${escapeHtml(byId('studentFrontRankingPreview')?.textContent || '尚未載入')}</div>
          </div>
        </div>
      </div>
      <div class="legacy-main-stack">
        <div class="glass-panel">
          <h3 class="tech-font">師生視圖一致性檢查</h3>
          <pre>${escapeHtml(byId('teacherStudentBridgePreview')?.textContent || '尚未建立正式入口摘要')}</pre>
        </div>
        <div class="glass-panel">
          <h3 class="tech-font">切換順序</h3>
          <div class="legacy-callout">老師端與學生端不是共用同一個正式入口；老師先在老師頁完成查找與寫入，再用同一位學生的 token 驗證學生正式頁是否同步。</div>
          <div class="legacy-grid">
            <div class="legacy-info-item"><strong>第 1 步</strong>老師登入後依 serial 或 ntag 查找學生</div>
            <div class="legacy-info-item"><strong>第 2 步</strong>在老師學生操作頁執行加分、狀態、商品或卡務</div>
            <div class="legacy-info-item"><strong>第 3 步</strong>學生刷 ntag / NFC 帶 token 進正式頁，檢查首頁、排行、收藏與 AI</div>
            <div class="legacy-info-item"><strong>第 4 步</strong>重整後再次確認資料沒有只停留在畫面</div>
          </div>
        </div>
      </div>
    </div>`;
}

function buildSystemZoneSummaryHtml() {
  return `
    <div class="legacy-grid">
      <div class="glass-panel"><h3 class="tech-font">商品設置區</h3><pre>${escapeHtml(byId('shopConfigListText')?.textContent || '尚未載入')}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">Boss 設置區</h3><pre>${escapeHtml(byId('bossConfigListText')?.textContent || '尚未載入')}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">題庫 / 命題</h3><pre>${escapeHtml(byId('questionSetListText')?.textContent || '尚未載入')}</pre></div>
      <div class="glass-panel"><h3 class="tech-font">批次調整</h3><pre>${escapeHtml(byId('batchAdminPreviewText')?.textContent || '尚未預覽')}

${escapeHtml(byId('batchAdminResultText')?.textContent || '尚未執行')}</pre></div>
    </div>`;
}

function buildShopConfigModalHtml() {
  return `<div class="glass-panel"><h3 class="tech-font">商品設置視窗</h3><div class="legacy-callout">老師端可在這裡建立商品、上下架、設定價格與限制。這一輪已真的寫入 shop_catalog。</div><pre>${escapeHtml(byId('shopConfigListText')?.textContent || '尚未載入')}</pre></div>`;
}

function buildBossConfigModalHtml() {
  return `<div class="glass-panel"><h3 class="tech-font">Boss 設置視窗</h3><div class="legacy-callout">Boss 可指定屬性與題庫，之後再接每日重置與學生端挑戰入口。這一輪只寫入 quiz_bank/_BATTLE_TOWER_BOSS_，不再額外寫入新版 boss_configs。</div><pre>${escapeHtml(byId('bossConfigListText')?.textContent || '尚未載入')}</pre></div>`;
}

function buildQuestionSetModalHtml() {
  return `<div class="glass-panel"><h3 class="tech-font">題庫 / 命題視窗</h3><div class="legacy-callout">題庫主邏輯已回到舊版：年級 + 單元分流，題目放在 quiz_bank；題庫群組資訊只寫到 quiz_bank/_QUESTION_SET_META_，不再額外寫入新版 question_sets。</div><pre>${escapeHtml(byId('questionSetListText')?.textContent || '尚未載入')}</pre></div>`;
}

function buildBatchAdminModalHtml() {
  return `<div class="glass-panel"><h3 class="tech-font">批次調整視窗</h3><div class="legacy-callout">先預覽影響範圍，再執行批次調整。這一輪已支援年級提升、指定年級、每日重置、成長重置、完全重置。</div><pre>${escapeHtml(byId('batchAdminPreviewText')?.textContent || '尚未預覽')}

${escapeHtml(byId('batchAdminResultText')?.textContent || '尚未執行')}</pre></div>`;
}

function renderSimpleList(preId, title, rows = [], formatter = null) {
  const el = byId(preId);
  if (!el) return;
  if (!rows.length) {
    el.textContent = `尚無${title}`;
    return;
  }
  el.textContent = rows.map((row, idx) => formatter ? formatter(row, idx) : `${idx + 1}. ${JSON.stringify(row)}`).join('\n');
}

async function refreshTeacherShopCatalog() {
  const select = byId('teacherShopCatalogSelect');
  const detailEl = byId('teacherShopCatalogText');
  if (!currentState.studentData) {
    cachedShopCatalogForTeacher = [];
    if (select) select.innerHTML = '<option value="">請先查找學生</option>';
    if (detailEl) detailEl.textContent = '請先查找學生，再載入可贈送商品。';
    return [];
  }

  const studentGradeNum = parseGradeNumber(currentState.studentData.grade || currentState.studentData.gradeLabel || '');
  const studentTitle = String(currentState.studentData.title || currentState.studentData.current_title || '').trim();
  const rows = await listShopCatalogItems().catch(() => []);
  cachedShopCatalogForTeacher = rows.map((item) => {
    let blockedReason = '';
    if (item.active === false) blockedReason = '未上架';
    else if (item.quantity !== null && item.quantity !== undefined && Number(item.quantity) <= 0) blockedReason = '已售罄';
    else {
      const reqGradeNum = parseGradeNumber(item.minGrade);
      if (reqGradeNum && studentGradeNum && studentGradeNum < reqGradeNum) blockedReason = `需 ${item.minGrade} 以上`;
      else if (String(item.requiredTitle || '').trim() && studentTitle !== String(item.requiredTitle || '').trim()) blockedReason = `需稱號 ${item.requiredTitle}`;
    }
    return { ...item, allowed: !blockedReason, blockedReason: blockedReason || '可贈送' };
  });

  if (select) {
    select.innerHTML = '<option value="">請選擇要贈送的商品</option>';
    cachedShopCatalogForTeacher.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name}｜${item.price} 金幣｜${item.effectType}${item.allowed ? '' : `｜${item.blockedReason}`}`;
      select.appendChild(opt);
    });
  }
  if (detailEl) {
    detailEl.textContent = cachedShopCatalogForTeacher.length
      ? cachedShopCatalogForTeacher.map((item, idx) => `${idx + 1}. ${item.name}｜${item.price} 金幣｜效果 ${item.effectType}${item.hiddenEggId ? `｜蛋種 ${item.hiddenEggId}` : ''}｜${item.allowed ? '可贈送' : item.blockedReason}`).join('\n')
      : 'shop_catalog 目前沒有可用商品';
  }
  return cachedShopCatalogForTeacher;
}

function renderQuizManagementList(rows = cachedQuizEntries) {
  const quizListEl = byId('questionSetListText');
  const selectEl = byId('quizEntrySelect');
  if (selectEl) {
    selectEl.innerHTML = '<option value="">請選擇題目</option>';
    rows.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.id;
      const answer = item.options.findIndex((opt) => opt?.isCorrect) + 1;
      opt.textContent = `${audienceLabel(item.audience)}｜${item.semester || '-'}｜${item.unit}｜${item.question.slice(0, 24)}${item.question.length > 24 ? '…' : ''}｜正解 ${answer || 1}｜${item.isActive ? '已派發' : '未開放'}${item.deleteRequestStatus === 'pending' ? '｜待刪除批准' : ''}`;
      selectEl.appendChild(opt);
    });
  }
  if (quizListEl) {
    if (!rows.length) {
      quizListEl.textContent = '尚未載入題庫清單';
      return;
    }
    const grouped = new Map();
    rows.forEach((item) => {
      const key = `${audienceLabel(item.audience)}｜${item.semester || '-'}｜${item.unit}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    const lines = [];
    grouped.forEach((groupRows, key) => {
      lines.push(`【${key}】共 ${groupRows.length} 題`);
      groupRows.slice(0, 8).forEach((item, idx) => {
        const answer = item.options.findIndex((opt) => opt?.isCorrect) + 1;
        lines.push(`  ${idx + 1}. ${item.question}｜正解 ${answer || 1}｜${item.isActive ? '已派發' : '未開放'}${item.deleteRequestStatus === 'pending' ? '｜待刪除批准' : ''}`);
      });
      if (groupRows.length > 8) lines.push(`  ...尚有 ${groupRows.length - 8} 題`);
    });
    quizListEl.textContent = lines.join('\n');
  }
}

function syncQuestionSetNameFromInputs(force = false) {
  const audience = String(byId('questionSetAudienceSelect')?.value || '').trim();
  const semester = String(byId('questionSetSemesterSelect')?.value || '上').trim();
  const unit = String(byId('questionSetUnitInput')?.value || '').trim();
  const mode = String(byId('questionSetModeSelect')?.value || 'daily').trim();
  syncGradeLabelFromSelectors(force);
  const nameEl = byId('questionSetNameInput');
  if (!nameEl) return;
  if (!force && String(nameEl.value || '').trim()) return;
  const modeLabel = mode === 'boss' ? 'Boss' : (mode === 'helper' ? '學習扶助' : '每日訓練');
  nameEl.value = [audienceLabel(audience), `${semester}學期`, unit, modeLabel].filter(Boolean).join(' ');
}

function loadQuizBulkTemplate() {
  const lines = [
    '4上	CH1	太陽從哪邊升起？	東	西	南	北	1',
    '4上	CH2	植物製造養分主要需要什麼？	陽光	鐵塊	塑膠	玻璃	1',
    '5下	U3	水蒸氣遇冷後會變成什麼？	水滴	沙子	石頭	火焰	1',
  ].join('\n');
  if (byId('quizBulkImportInput')) byId('quizBulkImportInput').value = lines;
  renderTeacherOpsResult('已載入批量題庫範例', lines);
}

function populateBossQuestionSetSelect(rows = cachedQuestionSets) {
  const select = byId('bossConfigQuestionSetSelect');
  if (!select) return;
  const currentValue = String(byId('bossConfigQuestionSetInput')?.value || '').trim();
  select.innerHTML = '<option value="">請選擇題庫（年級＋單元）</option>';
  rows.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.grade}｜${item.unit}｜${item.mode}｜${item.name}`;
    if (item.id === currentValue) opt.selected = true;
    select.appendChild(opt);
  });
}

function getFilteredQuizEntries() {
  const grade = String(byId('quizFilterGradeInput')?.value || '').trim();
  const audience = String(byId('quizFilterAudienceSelect')?.value || '').trim();
  const semester = String(byId('quizFilterSemesterSelect')?.value || '').trim();
  const unit = String(byId('quizFilterUnitInput')?.value || '').trim();
  const keyword = String(byId('quizFilterKeywordInput')?.value || '').trim().toLowerCase();
  return cachedQuizEntries.filter((item) => {
    if (audience && String(item.audience || '').trim() !== audience) return false;
    if (semester && String(item.semester || '').trim() !== semester) return false;
    if (grade && !String(item.grade || '').includes(grade)) return false;
    if (unit && !String(item.unit || '').includes(unit)) return false;
    if (keyword) {
      const hay = `${item.question} ${item.options.map((opt) => opt?.text || '').join('\n')}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });
}

function clearQuizEditor() {
  if (byId('quizEditingIdInput')) byId('quizEditingIdInput').value = '';
  if (byId('quizQuestionInput')) byId('quizQuestionInput').value = '';
  if (byId('quizOption1Input')) byId('quizOption1Input').value = '';
  if (byId('quizOption2Input')) byId('quizOption2Input').value = '';
  if (byId('quizOption3Input')) byId('quizOption3Input').value = '';
  if (byId('quizOption4Input')) byId('quizOption4Input').value = '';
  if (byId('quizAnswerSelect')) byId('quizAnswerSelect').value = '1';
  if (byId('quizActiveInput')) byId('quizActiveInput').value = 'false';
  if (byId('questionSetAudienceSelect')) byId('questionSetAudienceSelect').value = 'grade5';
  if (byId('questionSetSemesterSelect')) byId('questionSetSemesterSelect').value = '上';
  if (byId('questionSetUnitInput')) byId('questionSetUnitInput').value = 'CH1';
  syncGradeLabelFromSelectors(true);
}

async function refreshSystemZoneLists() {
  const [shopItems, builtInShopPresets, bosses, quizGroups, quizEntries, governance] = await Promise.all([
    listShopCatalogItems().catch(() => []),
    Promise.resolve(listBuiltInShopPresets()).catch(() => []),
    listBossConfigs().catch(() => []),
    listQuestionSetConfigs().catch(() => []),
    listQuizBankEntries().catch(() => []),
    getQuizGovernance().catch(() => ({ admins: [], editors: [], deleteRequests: [] })),
  ]);
  cachedQuizEntries = quizEntries;
  cachedQuestionSets = quizGroups;
  cachedQuizGovernance = governance || { admins: [], editors: [], deleteRequests: [] };

  const shopRows = [];
  if (builtInShopPresets.length) {
    shopRows.push('[內建可部署商品]');
    builtInShopPresets.forEach((item, idx) => {
      shopRows.push(`${idx + 1}. ${item.name}｜${item.price} 金幣｜效果 ${item.effectType}${item.hiddenEggId ? `｜蛋種 ${item.hiddenEggId}` : ''}`);
    });
    shopRows.push('');
  }
  if (shopItems.length) {
    shopRows.push('[目前 shop_catalog]');
    shopItems.forEach((item, idx) => {
      const qty = item.quantity === null || item.quantity === undefined ? '不限量' : item.quantity;
      shopRows.push(`${idx + 1}. ${item.name}｜${item.price} 金幣｜${item.active ? '上架' : '下架'}｜效果 ${item.effectType}${item.hiddenEggId ? `｜蛋種 ${item.hiddenEggId}` : ''}｜數量 ${qty}`);
    });
  }
  byId('shopConfigListText').textContent = shopRows.length ? shopRows.join('\n') : '尚無商品';

  renderSimpleList('bossConfigListText', 'Boss', bosses, (item, idx) => `${idx + 1}. ${item.name}｜屬性 ${item.attrKey}｜題庫 ${item.questionSetId}｜${item.active ? '啟用' : '停用'}｜中午 12:00 重置`);
  populateBossQuestionSetSelect(quizGroups);
  renderSimpleList('questionSetListText', '題庫群組', quizGroups, (item, idx) => `${idx + 1}. ${item.name}｜群組 ${audienceLabel(item.audience)}｜學期 ${item.semester || '-'}｜顯示年級 ${item.grade}｜單元 ${item.unit || '-'}｜用途 ${item.mode}`);
  renderQuizManagementList(getFilteredQuizEntries());
  renderQuizGovernance();
  await refreshTeacherShopCatalog();
}

async function handleSaveShopConfig() {
  ensureTeacherLoggedIn();
  const effectType = byId('shopConfigEffectSelect')?.value || 'physical_reward';
  const saved = await saveShopCatalogItem({
    name: byId('shopConfigNameInput')?.value,
    price: byId('shopConfigPriceInput')?.value,
    description: byId('shopConfigDescInput')?.value,
    minGrade: byId('shopConfigMinGradeInput')?.value,
    requiredTitle: byId('shopConfigTitleInput')?.value,
    active: byId('shopConfigActiveInput')?.checked !== false,
    voucherOnly: effectType === 'physical_reward',
    effectType,
    hiddenEggId: byId('shopConfigHiddenEggSelect')?.value,
    quantity: byId('shopConfigQuantityInput')?.value,
    actorUid: currentState.teacherUser?.uid || null,
  });
  await refreshSystemZoneLists();
  renderTeacherOpsResult('商品設定已儲存', [`商品：${saved.name}`, `價格：${saved.price}`, `效果：${saved.effectType}`, `蛋種：${saved.hiddenEggId || '-'}`, `狀態：${saved.active ? '上架' : '下架'}`].join('\n'));
}

async function handleDeployAzureKirinEgg() {
  ensureTeacherLoggedIn();
  const saved = await deployBuiltInShopPreset('azure_kirin_egg', currentState.teacherUser?.uid || null);
  await refreshSystemZoneLists();
  renderTeacherOpsResult('已部署舊版隱藏蛋', [`商品：${saved.name}`, `效果：${saved.effectType}`, `蛋種：${saved.hiddenEggId}`, `價格：${saved.price} 金幣`].join('\n'));
}

async function handleSaveBossConfig() {
  ensureTeacherLoggedIn();
  const saved = await saveBossConfig({
    name: byId('bossConfigNameInput')?.value,
    attrKey: byId('bossConfigAttrSelect')?.value,
    questionSetId: byId('bossConfigQuestionSetInput')?.value || byId('bossConfigQuestionSetSelect')?.value,
    active: byId('bossConfigActiveInput')?.checked !== false,
    actorUid: currentState.teacherUser?.uid || null,
  });
  await refreshSystemZoneLists();
  renderTeacherOpsResult('Boss 設定已儲存', [`Boss：${saved.name}`, `屬性：${saved.attrKey}`, `題庫：${saved.questionSetId}`, `狀態：${saved.active ? '啟用' : '停用'}`].join('\n'));
}

async function handleSaveQuestionSet() {
  ensureTeacherLoggedIn();
  if (!canEditQuizBank()) throw new Error('目前帳號未列入可建置老師 / 管理員名單，暫不可建立題庫');
  const audience = byId('questionSetAudienceSelect')?.value;
  const semester = byId('questionSetSemesterSelect')?.value || '上';
  const grade = byId('questionSetGradeInput')?.value || syncGradeLabelFromSelectors(true);
  const unit = byId('questionSetUnitInput')?.value;
  const mode = byId('questionSetModeSelect')?.value;
  const name = byId('questionSetNameInput')?.value || `${audienceLabel(audience)} ${semester}學期 ${String(unit || '').trim()}`.trim();
  const editingId = String(byId('quizEditingIdInput')?.value || '').trim() || null;
  const questionSet = await saveQuestionSetConfig({ name, grade, audience, semester, unit, className: byId('questionSetClassInput')?.value, mode, actorUid: currentState.teacherUser?.uid || null });
  const quizSaved = await saveQuizEntry({ id: editingId, grade, audience, semester, unit, mode, questionSetId: questionSet.id, question: byId('quizQuestionInput')?.value, options: [byId('quizOption1Input')?.value, byId('quizOption2Input')?.value, byId('quizOption3Input')?.value, byId('quizOption4Input')?.value], answer: byId('quizAnswerSelect')?.value, isActive: String(byId('quizActiveInput')?.value) === 'true', actorUid: currentState.teacherUser?.uid || null });
  await refreshSystemZoneLists();
  if (byId('quizEntrySelect')) byId('quizEntrySelect').value = quizSaved.id;
  renderTeacherOpsResult(editingId ? '題目已更新' : '題庫與題目已儲存', [`題組：${questionSet.name}`, `群組：${audienceLabel(questionSet.audience)}`, `學期：${questionSet.semester}`, `單元：${questionSet.unit}`, `用途：${questionSet.mode}`, `題目ID：${quizSaved.id}`].join('\n'));
}

function loadSelectedQuizIntoEditor() {
  const selectedId = String(byId('quizEntrySelect')?.value || '').trim();
  const selected = cachedQuizEntries.find((item) => item.id === selectedId);
  if (!selected) throw new Error('請先選擇題目');
  if (byId('quizEditingIdInput')) byId('quizEditingIdInput').value = selected.id;
  if (byId('questionSetAudienceSelect')) byId('questionSetAudienceSelect').value = selected.audience || 'grade5';
  if (byId('questionSetSemesterSelect')) byId('questionSetSemesterSelect').value = selected.semester || '上';
  if (byId('questionSetGradeInput')) byId('questionSetGradeInput').value = selected.grade || '';
  if (byId('questionSetUnitInput')) byId('questionSetUnitInput').value = selected.unit || 'CH1';
  const matchedSet = cachedQuestionSets.find((item) => String(item.id || '') === String(selected.questionSetId || '')) || cachedQuestionSets.find((item) => String(item.grade || '') === String(selected.grade || '') && String(item.unit || '') === String(selected.unit || ''));
  if (byId('questionSetNameInput')) byId('questionSetNameInput').value = matchedSet?.name || `${selected.grade || ''} ${selected.unit || ''}`.trim();
  if (byId('questionSetModeSelect')) byId('questionSetModeSelect').value = matchedSet?.mode || selected.mode || 'daily';
  if (byId('quizQuestionInput')) byId('quizQuestionInput').value = selected.question || '';
  if (byId('quizOption1Input')) byId('quizOption1Input').value = selected.options?.[0]?.text || '';
  if (byId('quizOption2Input')) byId('quizOption2Input').value = selected.options?.[1]?.text || '';
  if (byId('quizOption3Input')) byId('quizOption3Input').value = selected.options?.[2]?.text || '';
  if (byId('quizOption4Input')) byId('quizOption4Input').value = selected.options?.[3]?.text || '';
  const answer = selected.options.findIndex((opt) => opt?.isCorrect) + 1;
  if (byId('quizAnswerSelect')) byId('quizAnswerSelect').value = String(answer || selected.answer || 1);
  if (byId('quizActiveInput')) byId('quizActiveInput').value = selected.isActive ? 'true' : 'false';
  renderTeacherOpsResult('已載入題目到編輯器', [`題目ID：${selected.id}`, `年級：${selected.grade}`, `單元：${selected.unit}`, `題目：${selected.question}`].join('\n'));
}

async function handleToggleSelectedQuiz() {
  ensureTeacherLoggedIn();
  const selectedId = String(byId('quizEntrySelect')?.value || '').trim();
  const selected = cachedQuizEntries.find((item) => item.id === selectedId);
  if (!selected) throw new Error('請先選擇題目');
  await toggleQuizEntryActive(selected.id, !selected.isActive);
  await refreshSystemZoneLists();
  renderTeacherOpsResult('題目上架狀態已切換', [`題目ID：${selected.id}`, `題目：${selected.question}`, `狀態：${selected.isActive ? '改為未開放' : '改為已派發'}`].join('\n'));
}

async function handleDeleteSelectedQuiz() {
  ensureTeacherLoggedIn();
  const selectedId = String(byId('quizEntrySelect')?.value || '').trim();
  const selected = cachedQuizEntries.find((item) => item.id === selectedId);
  if (!selected) throw new Error('請先選擇題目');
  if (isQuizAdmin()) {
    await deleteQuizEntry(selected.id);
    clearQuizEditor();
    await refreshSystemZoneLists();
    renderTeacherOpsResult('題目已由管理員刪除', [`題目ID：${selected.id}`, `題目：${selected.question}`].join('\n'));
    return;
  }
  const request = await requestDeleteQuizEntry(selected.id, { requesterEmail: getTeacherEmail(), requesterUid: currentState.teacherUser?.uid || '' });
  await refreshSystemZoneLists();
  renderTeacherOpsResult('已送出刪除申請', [`題目ID：${request.quizId}`, `題目：${request.question}`, '狀態：待管理員批准'].join('\n'));
}

function handleApplyQuizFilter() {
  const rows = getFilteredQuizEntries();
  renderQuizManagementList(rows);
  renderTeacherOpsResult('題庫篩選完成', `目前顯示 ${rows.length} 題。`);
}

function handleResetQuizFilter() {
  if (byId('quizFilterAudienceSelect')) byId('quizFilterAudienceSelect').value = '';
  if (byId('quizFilterSemesterSelect')) byId('quizFilterSemesterSelect').value = '';
  if (byId('quizFilterGradeInput')) byId('quizFilterGradeInput').value = '';
  if (byId('quizFilterUnitInput')) byId('quizFilterUnitInput').value = '';
  if (byId('quizFilterKeywordInput')) byId('quizFilterKeywordInput').value = '';
  renderQuizManagementList(cachedQuizEntries);
  renderTeacherOpsResult('已清除題庫篩選', `目前顯示 ${cachedQuizEntries.length} 題。`);
}

function handleExportQuizTsv() {
  const rows = getFilteredQuizEntries();
  const lines = rows.map((item) => {
    const answer = item.options.findIndex((opt) => opt?.isCorrect) + 1;
    const opts = [0,1,2,3].map((idx) => item.options?.[idx]?.text || '');
    return [item.grade, item.unit, item.question, ...opts, String(answer || item.answer || 1)].join('\t');
  });
  const output = lines.length ? lines.join('\n') : '目前篩選沒有題目';
  if (byId('quizBulkImportInput')) byId('quizBulkImportInput').value = output;
  renderTeacherOpsResult('已匯出目前篩選題庫', output);
}

async function handleImportQuestionBulk() {
  ensureTeacherLoggedIn();
  if (!canEditQuizBank()) throw new Error('目前帳號未列入可建置老師 / 管理員名單，暫不可批量匯入');
  const count = await importQuizBulk(byId('quizBulkImportInput')?.value || '');
  await refreshSystemZoneLists();
  renderTeacherOpsResult('批量題庫匯入完成', `成功匯入 ${count} 題。格式已恢復為：年級 / 單元 / 題目 / 四個選項 / 正解。`);
}

async function handleSaveQuizGovernance() {
  ensureTeacherLoggedIn();
  const email = getTeacherEmail();
  if (cachedQuizGovernance.admins?.length && !isQuizAdmin()) throw new Error('只有管理員可以調整命題權限');
  const governance = await saveQuizGovernance({ editors: byId('quizEditorsInput')?.value || '', admins: byId('quizAdminsInput')?.value || email });
  cachedQuizGovernance = { ...cachedQuizGovernance, ...governance, deleteRequests: cachedQuizGovernance.deleteRequests || [] };
  renderQuizGovernance();
  renderTeacherOpsResult('命題權限已儲存', [`可建置老師：${(governance.editors || []).length}`, `管理員：${(governance.admins || []).length}`].join('\n'));
}

async function handleApproveDeleteQuiz() {
  ensureTeacherLoggedIn();
  if (!isQuizAdmin()) throw new Error('只有管理員可以批准刪除題目');
  const quizId = String(byId('quizDeleteRequestSelect')?.value || '').trim();
  if (!quizId) throw new Error('請先選擇待批准的刪除申請');
  const approved = await approveDeleteQuizRequest(quizId, { approverEmail: getTeacherEmail() });
  clearQuizEditor();
  await refreshSystemZoneLists();
  renderTeacherOpsResult('已批准並刪除題目', [`題目ID：${approved.quizId}`, `批准者：${approved.approvedBy || getTeacherEmail()}`].join('\n'));
}

async function handlePreviewBatchAdmin() {
  ensureTeacherLoggedIn();
  assertTeacherCanManageRange(byId('batchAdminStartInput')?.value, byId('batchAdminEndInput')?.value, '預覽批次影響範圍');
  const rows = await previewSerialRange(byId('batchAdminStartInput')?.value, byId('batchAdminEndInput')?.value);
  const previewEl = byId('batchAdminPreviewText');
  if (previewEl) previewEl.textContent = rows.map((row) => row.found ? `✔ ${row.serial}｜${row.name}｜年級 ${row.grade || '-'}｜XP ${row.totalXP}` : `✖ ${row.serial}｜查無學生`).join('\n');
  renderTeacherOpsResult('批次預覽完成', `共預覽 ${rows.length} 筆，找到 ${rows.filter((row) => row.found).length} 位學生。`);
}

async function handleRunBatchAdmin() {
  ensureTeacherLoggedIn();
  assertTeacherCanManageRange(byId('batchAdminStartInput')?.value, byId('batchAdminEndInput')?.value, '執行批次調整');
  const results = await runBatchAdminAction({
    startSerial: byId('batchAdminStartInput')?.value,
    endSerial: byId('batchAdminEndInput')?.value,
    action: byId('batchAdminActionSelect')?.value,
    targetGrade: byId('batchAdminTargetGradeInput')?.value,
  });
  const resultEl = byId('batchAdminResultText');
  if (resultEl) resultEl.textContent = results.map((row) => row.ok ? `✔ ${row.serial}｜${row.name}｜年級 ${row.grade || '-'}｜XP ${row.totalXP}` : `✖ ${row.serial}｜${row.error || '失敗'}`).join('\n');
  renderTeacherOpsResult('批次調整完成', `成功 ${results.filter((row) => row.ok).length} / 失敗 ${results.filter((row) => !row.ok).length}`);
}

let teacherIdleTimer = null;
let teacherWarnTimer = null;
let batchScanTicker = null;

function ensureTeacherLoggedIn() {
  if (!currentState.teacherUser) throw new Error('請先登入老師帳號');
}

function ensureStudentLoadedForTeacherOps() {
  ensureTeacherLoggedIn();
  if (!currentState.studentData) throw new Error('請先查找學生');
  assertTeacherCanAccessStudent(currentState.studentData, '操作目前學生');
}

function clearTeacherSensitiveState() {
  resetCurrentStudent();
  resetBatchRuntimeState();
  if (byId('tokenInput')) byId('tokenInput').value = '';
  if (byId('studentTokenBindInput')) byId('studentTokenBindInput').value = '';
  if (byId('cardAdminNtagInput')) byId('cardAdminNtagInput').value = '';
  if (byId('newCardUidInput')) byId('newCardUidInput').value = '';
  if (byId('newCardSerialInput')) byId('newCardSerialInput').value = '';
  if (byId('newCardGradeInput')) byId('newCardGradeInput').value = '';
  if (byId('newCardClassInput')) byId('newCardClassInput').value = '';
  if (byId('newCardNameInput')) byId('newCardNameInput').value = '';
  if (byId('deactivateTokenInput')) byId('deactivateTokenInput').value = '';
}


function stopTeacherIdleGuard() {
  if (teacherIdleTimer) clearTimeout(teacherIdleTimer);
  if (teacherWarnTimer) clearTimeout(teacherWarnTimer);
  teacherIdleTimer = null;
  teacherWarnTimer = null;
}

function recordTeacherActivity() {
  if (!currentState.teacherUser) return;
  stopTeacherIdleGuard();
  teacherWarnTimer = window.setTimeout(() => {
    renderTeacherOpsResult('即將自動登出', '老師端閒置即將超時，若仍在操作請繼續互動頁面。');
  }, APP_CONFIG.teacherIdleWarnMs);
  teacherIdleTimer = window.setTimeout(async () => {
    try {
      await teacherLogout();
      clearTeacherSensitiveState();
      updateStudentSummary();
      renderTeacherOpsResult('已自動登出', '老師端超時後已清除 session、目前學生快取、批量模式狀態與 token 暫存。');
      showAlert('老師端已因閒置自動登出');
      updateTeacherOpsStatus();
      setActivePageTab('teacher-entry');
    } catch (error) {
      console.error(error);
    }
  }, APP_CONFIG.teacherIdleLogoutMs);
}

function formatBatchHistoryEntry(entry = {}) {
  const at = entry.at ? new Date(Number(entry.at)).toLocaleTimeString('zh-TW', { hour12: false }) : '--:--:--';
  if (entry.type === 'student_cycle') return `${at}｜學生卡 #${entry.serial || '-'}｜${entry.studentName || '未命名學生'}｜開啟 10 秒循環`;
  if (entry.type === 'card_xp') return `${at}｜道具卡｜${entry.effectLabel || '-'}｜${entry.studentName || '-'}｜combo ${Number(entry.comboCount || 0)}`;
  if (entry.type === 'card_debuff') return `${at}｜狀態卡｜${entry.effectLabel || '-'}｜${entry.studentName || '-'}｜combo ${Number(entry.comboCount || 0)}`;
  return `${at}｜${entry.type || 'event'}｜${entry.studentName || entry.serial || '-'}`;
}

function renderBatchStudentSnapshot(snapshot = null) {
  const targetIds = ['batchStudentSnapshotText', 'batchArenaStudentSnapshotText'];
  const lines = !snapshot
    ? ['尚未開啟批量學生循環', '請先感應學生卡，再於 10 秒內感應道具卡。']
    : [
        `學生：${snapshot.name || '未命名學生'} (#${snapshot.serial || '-'})`,
        `年級 / 班別：${snapshot.grade || '-'}`,
        `稱號：${snapshot.title || '未設定'}`,
        `總 XP：${Number(snapshot.totalXP || 0)}`,
        `金幣：${Number(snapshot.coins || 0)}`,
        `狀態：${snapshot.statusText || '健康'}`,
      ];
  targetIds.forEach((id) => {
    const el = byId(id);
    if (el) el.textContent = lines.join('\n');
  });
}

function renderBatchHistory(history = []) {
  const targetIds = ['batchScanHistoryText', 'batchArenaHistoryText'];
  const text = Array.isArray(history) && history.length
    ? history.slice().reverse().map((entry) => formatBatchHistoryEntry(entry)).join('\n')
    : '尚無批量掃描履歷';
  targetIds.forEach((id) => {
    const el = byId(id);
    if (el) el.textContent = text;
  });
}

function refreshBatchScanPanel() {
  const snapshot = getBatchSessionSnapshot();
  const modeLabel = snapshot.scanModeEnabled ? '掃描模式開啟' : '掃描模式未開啟';
  const waitLabel = snapshot.waitingFor === 'reward' ? '等待道具卡 / 下一位學生卡' : '等待學生卡';
  const statusText = !snapshot.scanModeEnabled
    ? `${modeLabel}｜請先開啟掃描模式`
    : (!snapshot.serial
      ? `${modeLabel}｜${waitLabel}`
      : (snapshot.expired
        ? `${modeLabel}｜學生 ${snapshot.studentName || snapshot.serial} 已逾時，請重新感應學生卡`
        : `${modeLabel}｜學生 ${snapshot.studentName || snapshot.serial} 已鎖定，可連續感應道具卡或直接切下一位學生`));
  const timerText = `${(Number(snapshot.timeLeftMs || 0) / 1000).toFixed(1)}s`;
  const comboText = `${Number(snapshot.comboCount || 0)}`;
  const resultFallback = snapshot.effect ? `上次套用：${snapshot.effect.label || snapshot.effect.reason || snapshot.effect.statusKey}` : '';

  const ids = ['batchScanStatusText', 'batchArenaStatusText'];
  ids.forEach((id) => { const el = byId(id); if (el) el.textContent = statusText; });
  ['batchScanTimerText', 'batchArenaTimerText'].forEach((id) => { const el = byId(id); if (el) el.textContent = timerText; });
  ['batchScanComboText', 'batchArenaComboText'].forEach((id) => { const el = byId(id); if (el) el.textContent = comboText; });
  const resultEl = byId('batchScanResultText');
  if (resultEl && resultFallback && !resultEl.textContent.trim()) resultEl.textContent = resultFallback;
  const arenaResultEl = byId('batchArenaResultText');
  if (arenaResultEl && resultFallback && !arenaResultEl.textContent.trim()) arenaResultEl.textContent = resultFallback;

  const nameText = snapshot.studentName || '等待學生卡';
  const serialText = snapshot.serial ? `#${snapshot.serial}` : '#-';
  const heroHint = !snapshot.scanModeEnabled
    ? '請先點選開啟掃描模式，再依序感應學生卡與獎勵卡。'
    : (!snapshot.serial
      ? '掃描模式已開啟：請先感應學生卡。'
      : (snapshot.expired
        ? '掃描窗已關閉，請重新感應學生卡以開啟新循環。'
        : (snapshot.waitingFor === 'reward'
          ? '學生已鎖定：可在 10 秒內連續感應道具卡，或直接感應下一位學生卡。'
          : '請先感應學生卡以開啟新循環。')));
  const nameEls = ['batchArenaStudentName', 'batchArenaHeroName'];
  nameEls.forEach((id) => { const el = byId(id); if (el) el.textContent = nameText; });
  const serialEl = byId('batchArenaStudentSerial'); if (serialEl) serialEl.textContent = serialText;
  const hintEl = byId('batchArenaHeroHint'); if (hintEl) hintEl.textContent = heroHint;

  const progressTrack = byId('batchArenaProgressBar')?.parentElement;
  const progressBar = byId('batchArenaProgressBar');
  const ratio = Math.max(0, Math.min(1, Number(snapshot.timeLeftMs || 0) / Number(APP_CONFIG.batchWindowMs || 10000)));
  if (progressBar) progressBar.style.width = `${(ratio * 100).toFixed(1)}%`;
  if (progressTrack) {
    progressTrack.classList.toggle('is-warning', ratio <= 0.5 && ratio > 0.25);
    progressTrack.classList.toggle('is-danger', ratio <= 0.25);
  }

  renderBatchStudentSnapshot(snapshot.snapshot || null);
  renderBatchHistory(snapshot.history || []);
  renderBatchAuditPreview();
  renderBatchFieldCheck();
  renderBatchResultBoard();
}


function bindSystemZoneTabs() {
  const tabs = [...document.querySelectorAll('[data-system-tab]')];
  const panes = [...document.querySelectorAll('[data-system-pane]')];
  if (!tabs.length || !panes.length) return;
  const activate = (key) => {
    const target = String(key || '').trim() || 'overview';
    tabs.forEach((tab) => tab.classList.toggle('is-active', tab.getAttribute('data-system-tab') === target));
    panes.forEach((pane) => pane.classList.toggle('is-active', pane.getAttribute('data-system-pane') === target));
  };
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.getAttribute('data-system-tab')));
  });
  document.querySelectorAll('[data-system-target]').forEach((button) => {
    button.addEventListener('click', () => activate(button.getAttribute('data-system-target') || 'overview'));
  });
  const active = tabs.find((tab) => tab.classList.contains('is-active'))?.getAttribute('data-system-tab') || 'overview';
  activate(active);
}

function syncBuildBadges() {
  const tag = BUILD_TAG || 'dev-build';
  if (byId('heroBuildTag')) byId('heroBuildTag').textContent = tag;
  if (byId('buildTagText')) byId('buildTagText').textContent = tag;
  if (byId('buildPhaseText') && !String(byId('buildPhaseText').textContent || '').trim()) {
    byId('buildPhaseText').textContent = '整合中';
  }
}
function startBatchTicker() {
  if (batchScanTicker) clearInterval(batchScanTicker);
  batchScanTicker = window.setInterval(() => {
    refreshBatchScanPanel();
  }, 100);
}

function syncBatchArenaPresetOptions() {
  const source = byId('batchCardPresetSelect');
  const target = byId('batchArenaPresetSelect');
  if (!source || !target) return;
  const current = String(target.value || source.value || '');
  target.innerHTML = source.innerHTML;
  if (current) target.value = current;
  if (!target.value && source.value) target.value = source.value;
}

function syncBatchArenaControlsFromMain() {
  const studentInput = byId('batchScanStudentInput');
  const arenaStudentInput = byId('batchArenaStudentInput');
  const modeSelect = byId('batchCardModeSelect');
  const arenaModeSelect = byId('batchArenaModeSelect');
  if (arenaStudentInput && studentInput) arenaStudentInput.value = studentInput.value || '';
  if (arenaModeSelect && modeSelect) arenaModeSelect.value = modeSelect.value || 'xp';
  syncBatchArenaPresetOptions();
}

function syncMainBatchControlsFromArena() {
  const studentInput = byId('batchScanStudentInput');
  const arenaStudentInput = byId('batchArenaStudentInput');
  const modeSelect = byId('batchCardModeSelect');
  const arenaModeSelect = byId('batchArenaModeSelect');
  const presetSelect = byId('batchCardPresetSelect');
  const arenaPresetSelect = byId('batchArenaPresetSelect');
  if (studentInput && arenaStudentInput) studentInput.value = arenaStudentInput.value || '';
  if (modeSelect && arenaModeSelect) modeSelect.value = arenaModeSelect.value || 'xp';
  populateBatchCardPresets();
  syncBatchArenaPresetOptions();
  if (presetSelect && arenaPresetSelect) {
    presetSelect.value = arenaPresetSelect.value || presetSelect.value || '';
    syncBatchArenaPresetOptions();
  }
}

function openBatchArena() {
  syncBatchArenaControlsFromMain();
  syncBatchSignalInputsFromMain();
  const overlay = byId('batchArena');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('batch-arena-open');
  refreshBatchScanPanel();
}

function closeBatchArena() {
  const overlay = byId('batchArena');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('batch-arena-open');
}

let batchFxTimer = null;
function triggerBatchSuccessFx(result) {
  const fx = byId('batchArenaFx');
  const titleEl = byId('batchArenaFxTitle');
  const detailEl = byId('batchArenaFxDetail');
  const logEl = byId('batchArenaFxLog');
  const pulseEl = byId('batchArenaPulse');
  if (titleEl) {
    if (result?.effect?.mode === 'debuff') titleEl.textContent = `狀態命中｜${result?.effect?.label || result?.effect?.statusKey || 'DEBUFF'}`;
    else titleEl.textContent = `+${Number(result?.action?.xpAdded || result?.effect?.amount || 0)} XP`;
  }
  if (detailEl) {
    const line = result?.effect?.mode === 'debuff'
      ? `${result?.studentName || '學生'} 受到 ${result?.effect?.label || result?.effect?.statusKey || '狀態'}，已同步寫入資料庫。`
      : `${result?.studentName || '學生'} 獲得 ${result?.effect?.label || result?.effect?.reason || '加分道具'}，XP 與事件紀錄已同步更新。`;
    detailEl.textContent = line;
  }
  if (logEl) {
    const action = result?.action || {};
    logEl.textContent = [
      `學生：${result?.studentName || '-'} (#${result?.serial || '-'})`,
      `道具：${result?.effect?.label || result?.effect?.reason || result?.effect?.statusKey || '-'}`,
      result?.effect?.mode === 'debuff'
        ? `狀態層數：${action.beforeStacks ?? 0} -> ${action.afterStacks ?? 0}`
        : `XP：${action.beforeXP ?? 0} -> ${action.afterXP ?? 0}`,
      `連續次數：${result?.comboCount ?? 0}`,
    ].join('\n');
  }
  if (pulseEl) {
    pulseEl.classList.add('is-hot');
    window.setTimeout(() => pulseEl.classList.remove('is-hot'), 900);
  }
  if (!fx) return;
  fx.classList.remove('is-active');
  void fx.offsetWidth;
  fx.classList.add('is-active');
  fx.setAttribute('aria-hidden', 'false');
  if (batchFxTimer) clearTimeout(batchFxTimer);
  batchFxTimer = window.setTimeout(() => {
    fx.classList.remove('is-active');
    fx.setAttribute('aria-hidden', 'true');
  }, 1300);
}


function syncBatchSignalInputsFromMain() {
  const source = byId('batchScanSignalInput');
  const target = byId('batchArenaSignalInput');
  if (source && target) target.value = source.value || '';
}

function syncBatchSignalInputsFromArena() {
  const source = byId('batchArenaSignalInput');
  const target = byId('batchScanSignalInput');
  if (source && target) target.value = source.value || '';
}

async function resolveBatchStudentFromInput(rawKey) {
  const safeKey = String(rawKey || '').trim();
  if (!safeKey) throw new Error('請先輸入學生卡序 / ntag / token');
  try {
    const student = await loadStudentByNtag(safeKey);
    assertTeacherCanAccessStudent(student, '批量掃描學生');
    return { student, loadedVia: 'ntag / token' };
  } catch (_error) {
    const student = await loadStudentBySerial(safeKey);
    assertTeacherCanAccessStudent(student, '批量掃描學生');
    return { student, loadedVia: 'serial / card_seq' };
  }
}

async function handleBatchScanSignal({ fromArena = false } = {}) {
  ensureTeacherLoggedIn();
  if (fromArena) syncMainBatchControlsFromArena();
  if (!batchState.scanModeEnabled) throw new Error('請先開啟掃描模式，再依序感應學生卡與獎勵卡');
  const rawInput = fromArena ? byId('batchArenaSignalInput') : byId('batchScanSignalInput');
  const rawKey = String(rawInput?.value || '').trim();
  if (!rawKey) throw new Error('請先輸入掃描到的學生卡 / ntag / token / 道具卡 ID');

  const liveSnapshot = getBatchSessionSnapshot();
  if (liveSnapshot.serial && !liveSnapshot.expired) touchBatchStudentSession();

  const effect = await resolveBatchEffectFromScanKey(rawKey).catch((error) => {
    const message = String(error?.message || '');
    if (/找不到道具卡|缺少道具卡 id/.test(message)) return null;
    if (/停用/.test(message)) {
      const detail = ['狀態：失敗', `掃描碼：${rawKey}`, `原因：${message}`, '處理：請改掃有效道具卡，或直接掃下一位學生卡。'].join('\n');
      if (byId('batchScanResultText')) byId('batchScanResultText').textContent = detail;
      if (byId('batchArenaResultText')) byId('batchArenaResultText').textContent = detail;
      renderTeacherOpsResult('批量掃描遇到停用道具卡', detail);
      throw new Error(message);
    }
    throw error;
  });

  if (effect) {
    const currentSnapshot = getBatchSessionSnapshot();
    if (!currentSnapshot.serial || currentSnapshot.waitingFor !== 'reward') {
      throw new Error('目前不在等待獎勵卡階段，請先感應學生卡');
    }
    const result = await applyBatchCardToActiveStudent({ effectOverride: effect, mode: effect.mode, presetKey: effect.key || '' });
    const verificationLines = Array.isArray(result.persistenceChecks) && result.persistenceChecks.length
      ? result.persistenceChecks
      : (result.effect?.mode === 'debuff'
        ? buildStatusPersistenceLines(result.student, { statusKey: result.effect.statusKey, stacks: result.effect.stacks, reason: result.effect.reason })
        : buildScorePersistenceLines(result.student, { attrKey: result.effect.attrKey, amount: result.effect.amount, reason: result.effect.reason }));
    updateStudentSummary();
    const action = result.action || {};
    const detail = [
      `狀態：成功`,
      `學生：${result.studentName} (#${result.serial})`,
      `掃描卡：${rawKey}`,
      `道具：${result.effect?.label || result.effect?.reason || result.effect?.statusKey || result.effect?.key || '-'}`,
      result.effect?.mode === 'debuff'
        ? `狀態層數：${action.beforeStacks} -> ${action.afterStacks} ( +${action.stacksAdded} )`
        : `XP：${action.beforeXP} -> ${action.afterXP} ( +${action.xpAdded} )`,
      `連續次數：${result.comboCount}`,
      `新時限：${(result.timeLeftMs / 1000).toFixed(1)}s`,
      '下一步：可繼續感應道具卡，或直接感應下一位學生卡',
      ...(Array.isArray(result.persistenceChecks) && result.persistenceChecks.length ? result.persistenceChecks : verificationLines),
    ].join('\n');
    if (byId('batchScanResultText')) byId('batchScanResultText').textContent = detail;
    if (byId('batchArenaResultText')) byId('batchArenaResultText').textContent = detail;
    renderTeacherOpsResult('批量掃描已套用（掃描碼）', detail);
    triggerBatchSuccessFx(result);
    showAlert(`批量掃描成功：${result.studentName}`);
  } else {
    let resolvedStudent = null;
    try {
      resolvedStudent = await resolveBatchStudentFromInput(rawKey);
    } catch (error) {
      const detail = [
        '狀態：失敗',
        `掃描碼：${rawKey}`,
        '原因：查無對應學生卡 / ntag / token，也不是可用的道具卡',
        `系統訊息：${error?.message || String(error)}`,
        '處理：請確認是學生卡、有效 token/ntag，或已上架的道具卡。',
      ].join('\n');
      if (byId('batchScanResultText')) byId('batchScanResultText').textContent = detail;
      if (byId('batchArenaResultText')) byId('batchArenaResultText').textContent = detail;
      renderTeacherOpsResult('批量掃描查無對應卡片', detail);
      throw error;
    }
    const { student, loadedVia } = resolvedStudent;
    batchState.scanModeEnabled = true;
    startBatchStudentSession(student, { token: currentState.currentToken });
  const toggleBtn = byId('btnBatchToggleMode');
  if (toggleBtn) toggleBtn.textContent = '關閉掃描模式';
    updateStudentSummary();
    const detail = [
      `學生：${student.name || '未命名學生'} (#${student.serial || student.card_seq || '-'})`,
      `掃描來源：${rawKey}`,
      `辨識方式：${loadedVia}`,
      '狀態：已鎖定學生，10 秒內可連續感應道具卡',
      '下一步：可直接感應對應道具卡；若換下一位學生，直接感應新學生卡即可',
    ].join('\n');
    if (byId('batchScanResultText')) byId('batchScanResultText').textContent = detail;
    if (byId('batchArenaResultText')) byId('batchArenaResultText').textContent = detail;
    renderTeacherOpsResult('已由掃描碼開啟批量新循環', detail);
  }

  if (rawInput) rawInput.value = '';
  if (fromArena) syncBatchSignalInputsFromArena(); else syncBatchSignalInputsFromMain();
  refreshBatchScanPanel();
}

function bindBatchArena() {
  const overlay = byId('batchArena');
  const closeBtn = byId('btnBatchArenaClose');
  if (!overlay) return;
  closeBtn?.addEventListener('click', closeBatchArena);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeBatchArena();
  });
  const arenaStudentInput = byId('batchArenaStudentInput');
  const studentInput = byId('batchScanStudentInput');
  arenaStudentInput?.addEventListener('input', () => {
    if (studentInput) studentInput.value = arenaStudentInput.value;
  });
  const arenaSignalInput = byId('batchArenaSignalInput');
  const signalInput = byId('batchScanSignalInput');
  arenaSignalInput?.addEventListener('input', () => {
    if (signalInput) signalInput.value = arenaSignalInput.value;
  });
  signalInput?.addEventListener('input', () => {
    if (arenaSignalInput && overlay && !overlay.classList.contains('hidden')) arenaSignalInput.value = signalInput.value;
  });
  studentInput?.addEventListener('input', () => {
    if (arenaStudentInput && overlay && !overlay.classList.contains('hidden')) arenaStudentInput.value = studentInput.value;
  });
  const arenaModeSelect = byId('batchArenaModeSelect');
  const modeSelect = byId('batchCardModeSelect');
  arenaModeSelect?.addEventListener('change', () => {
    if (modeSelect) modeSelect.value = arenaModeSelect.value;
    populateBatchCardPresets();
    syncBatchArenaPresetOptions();
  });
  modeSelect?.addEventListener('change', () => {
    if (arenaModeSelect) arenaModeSelect.value = modeSelect.value;
    syncBatchArenaPresetOptions();
  });
  byId('batchArenaPresetSelect')?.addEventListener('change', () => {
    const presetSelect = byId('batchCardPresetSelect');
    if (presetSelect) presetSelect.value = byId('batchArenaPresetSelect')?.value || '';
  });
  byId('btnBatchArenaLaunch')?.addEventListener('click', async () => {
    try {
      syncMainBatchControlsFromArena();
      await handleBatchScanStudent();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('批量專屬頁啟動失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '批量掃描失敗');
    }
  });
  byId('btnBatchArenaSignal')?.addEventListener('click', async () => {
    try {
      await handleBatchScanSignal({ fromArena: true });
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('批量掃描碼處理失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '批量掃描失敗');
    }
  });
  byId('btnBatchArenaApply')?.addEventListener('click', async () => {
    try {
      syncMainBatchControlsFromArena();
      await handleApplyBatchCard();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('套用道具卡失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '批量掃描失敗');
    }
  });
  [arenaStudentInput, arenaSignalInput].forEach((input) => input?.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    try {
      if (input === arenaSignalInput) await handleBatchScanSignal({ fromArena: true });
      else { syncMainBatchControlsFromArena(); await handleBatchScanStudent(); }
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('批量掃描輸入失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '批量掃描失敗');
    }
  }));
}

function inferTeacherPaneFromSummary(summary = '', detail = '') {
  const text = `${summary}
${detail}`;
  if (/商品|憑證|兌現|贈送/.test(text)) return 'shop';
  if (/卡務|補卡|token|ntag|NFC|寫入學生頁/.test(text)) return 'card';
  if (/狀態|學習問題|debuff|中毒|冰凍|麻痺|混亂/.test(text)) return 'status';
  if (/事件紀錄|學習輔助|科展|摘要/.test(text)) return 'logs';
  return 'score';
}

function buildTeacherResultCards(summary = '', detail = '', options = {}) {
  const student = currentState.studentData || {};
  const ok = options.ok === false ? false : !/失敗/.test(String(summary || ''));
  const firstUsefulLine = String(detail || '').split('\n').map((line) => line.trim()).find(Boolean) || '尚未執行寫入驗證';
  const trail = /reward_events \/ logs|reward_events \+ logs|logs/.test(detail) ? firstUsefulLine : '寫入後會在這裡顯示驗證摘要';
  return [
    {
      label: '學生',
      value: student?.name ? `${student.name} / #${student.serial || student.card_seq || '-'}` : '尚未載入',
      hint: student?.name ? `XP ${Number(student.totalXP) || 0}｜金幣 ${Number(student.coins) || 0}` : '請先查找學生',
      ok,
    },
    {
      label: '操作',
      value: summary || '待命',
      hint: `目前頁籤：${document.querySelector('.teacher-op-tab.is-active')?.textContent?.trim() || inferTeacherPaneFromSummary(summary, detail)}`,
      ok,
    },
    {
      label: '驗證',
      value: ok ? '已寫入 / 待確認' : '操作失敗',
      hint: trail,
      ok,
    },
  ];
}

function renderTeacherResultCards(summary = '', detail = '', options = {}) {
  const host = byId('teacherOpsResultCards');
  if (!host) return;
  const cards = buildTeacherResultCards(summary, detail, options);
  host.innerHTML = cards.map((card) => `
    <div class="teacher-result-card ${card.ok ? 'is-ok' : 'is-fail'}">
      <span class="teacher-result-label">${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.hint)}</small>
    </div>
  `).join('');
}

function renderTeacherOpsResult(summary, detail, options = {}) {
  const summaryEl = byId('teacherOpsResultSummary');
  const detailEl = byId('teacherOpsResultText');
  const chipEl = byId('teacherOpsResultChip');
  const metaEl = byId('teacherOpsResultMeta');
  const detailText = buildTeacherOpsDetail(detail, options);
  const ok = options.ok === false ? false : !String(summary || '').includes('失敗');
  if (summaryEl) summaryEl.textContent = summary || '尚未執行';
  if (detailEl) detailEl.textContent = detailText;
  if (chipEl) chipEl.textContent = ok ? '成功 / 待確認' : '失敗';
  const student = currentState.studentData;
  if (metaEl) {
    metaEl.textContent = student
      ? `學生：${student.name || '未命名學生'} / #${student.serial || student.card_seq || '-'} / XP ${Number(student.totalXP) || 0} / 金幣 ${Number(student.coins) || 0} / 階段 ${getAuditGrowthStage(student.totalXP)}`
      : '尚未載入學生，請先查找學生再執行老師端操作。';
  }
  renderTeacherResultCards(summary, detailText, { ...options, ok });
  setTeacherOpPane(options.pane || inferTeacherPaneFromSummary(summary, detailText));
  updateLegacyFlowStrip({ result: summary || '尚未執行寫入驗證' });
  refreshTeacherInlineLogPreview();
}

function populateTeacherScorePresets(panelKey = 'general') {
  const select = byId('scorePresetSelect');
  if (!select) return;
  const panel = getTeacherActionPanel(panelKey);
  select.dataset.panelKey = panel.id;
  select.innerHTML = '<option value="">手動輸入</option>';
  Object.entries(panel.actions || {}).forEach(([attrKey, list]) => {
    list.forEach((item, index) => {
      const amount = Number(item.amount || item.val || 0);
      const reason = item.reason || item.desc || '未命名事件';
      const opt = document.createElement('option');
      opt.value = `${attrKey}:${index}`;
      opt.dataset.attrKey = attrKey;
      opt.dataset.amount = String(amount);
      opt.dataset.reason = reason;
      opt.dataset.panelKey = panel.id;
      opt.textContent = `${ATTR_META[attrKey]?.label || attrKey}｜${reason} (+${amount})`;
      select.appendChild(opt);
    });
  });
  if (select.dataset.boundChange !== 'true') {
    select.addEventListener('change', () => {
      const opt = select.selectedOptions?.[0];
      if (!opt || !opt.dataset.attrKey) return;
      if (byId('scoreAttrSelect')) byId('scoreAttrSelect').value = opt.dataset.attrKey;
      if (byId('scoreValueInput')) byId('scoreValueInput').value = opt.dataset.amount || '1';
      if (byId('scoreReasonInput')) byId('scoreReasonInput').value = opt.dataset.reason || '';
    });
    select.dataset.boundChange = 'true';
  }
}




function setTeacherOpPane(paneKey = 'score') {
  const normalized = String(paneKey || 'score').trim() || 'score';
  document.querySelectorAll('.teacher-op-tab[data-op-pane]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.opPane === normalized);
  });
  document.querySelectorAll('.teacher-op-shortcut[data-op-shortcut]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.opShortcut === normalized);
  });
  document.querySelectorAll('.teacher-op-pane[data-op-pane]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.opPane === normalized);
  });
  const status = byId('teacherOpInlineStatus');
  const active = document.querySelector(`.teacher-op-tab[data-op-pane="${normalized}"]`);
  if (status) status.textContent = `目前頁籤：${active?.textContent?.trim() || normalized}`;
}

function focusTeacherOpsWorkspace(paneKey = 'score', behavior = 'smooth') {
  setTeacherOpPane(paneKey);
  const section = byId('teacherStudentOpsSection');
  if (section) section.scrollIntoView({ behavior, block: 'start' });
}

function refreshTeacherInlineLogPreview() {
  const preview = byId('teacherOpsInlineLogPreview');
  const events = Array.isArray(currentState.unifiedEvents) ? currentState.unifiedEvents : [];
  if (!preview) return;
  if (!currentState.studentData) {
    preview.textContent = '尚未載入學生';
    return;
  }
  if (!events.length) {
    preview.textContent = '目前學生尚無事件紀錄';
    return;
  }
  preview.textContent = events.slice(0, 5).map((event, index) => `${index + 1}. ${formatUnifiedEventLine(event)}`).join('\n');
}

function bindTeacherOpTabs() {
  document.querySelectorAll('.teacher-op-tab[data-op-pane]').forEach((button) => {
    button.addEventListener('click', () => setTeacherOpPane(button.dataset.opPane || 'score'));
  });
  document.querySelectorAll('.teacher-op-shortcut[data-op-shortcut]').forEach((button) => {
    button.addEventListener('click', () => setTeacherOpPane(button.dataset.opShortcut || 'score'));
  });
  document.querySelectorAll('[data-nav-target="shopVoucherSection"]').forEach((button) => {
    button.addEventListener('click', () => setTeacherOpPane('shop'));
  });
  document.querySelectorAll('[data-nav-target="cardAdminSection"]').forEach((button) => {
    button.addEventListener('click', () => setTeacherOpPane('card'));
  });
  document.querySelectorAll('[data-nav-target="teacherLogsSection"]').forEach((button) => {
    button.addEventListener('click', () => setTeacherOpPane('logs'));
  });
  byId('btnOpenScoreModal')?.addEventListener('click', () => setTeacherOpPane('score'));
  byId('btnOpenStatusModal')?.addEventListener('click', () => setTeacherOpPane('status'));
  byId('btnOpenLogsModal')?.addEventListener('click', () => setTeacherOpPane('logs'));
  byId('openDebuffBtn')?.addEventListener('click', () => setTeacherOpPane('status'));
}

function bindLegacyCockpitQuickActions() {
  document.querySelectorAll('.quick-open[data-click-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.clickTarget;
      if (!targetId) return;
      const target = byId(targetId);
      if (!target) {
        console.warn('[legacy-cockpit] missing click target:', targetId);
        return;
      }
      target.click();
    });
  });
}

let legacyNavButtons = [];
let legacyNavSections = [];


const NAV_TO_PAGE_TAB = {
  teacherAccessSection: 'teacher-entry',
  teacherStudentOpsSection: 'teacher-system',
  shopVoucherSection: 'teacher-system',
  cardAdminSection: 'teacher-system',
  batchWorkflowSection: 'teacher-system',
  forgeSection: 'teacher-system',
  teacherLogsSection: 'teacher-system',
  systemZoneSection: 'system-zone',
  studentCoreSection: 'student-page',
};



function syncTeacherSystemSwitcher(targetId = 'teacherStudentOpsSection') {
  document.querySelectorAll('[data-teacher-system-target]').forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute('data-teacher-system-target') === targetId);
  });
  const hintEl = byId('teacherSystemSwitcherHint');
  if (!hintEl) return;
  const hints = {
    teacherStudentOpsSection: '目前工作區：教師版學生狀態頁。對齊舊版邏輯：先看學生主體，再做老師操作。',
    shopVoucherSection: '目前工作區：商品 / 憑證。老師端以贈送與兌現為主，不把學生前台購買流程混進來。',
    cardAdminSection: '目前工作區：卡務 / NTAG。補卡、發卡、重綁與寫入學生頁網址維持在同一條工作鏈。',
    batchWorkflowSection: '目前工作區：批量掃描。學生卡 → 10 秒內道具卡 → 同一位學生可連掃多張道具卡。',
    teacherLogsSection: '目前工作區：事件紀錄。可直接回看統一事件流與老師操作結果。',
  };
  hintEl.textContent = hints[targetId] || hints.teacherStudentOpsSection;
}

function bindTeacherSystemSwitcher() {
  document.querySelectorAll('[data-teacher-system-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-teacher-system-target') || 'teacherStudentOpsSection';
      syncTeacherSystemSwitcher(targetId);
      setActiveNavSection(targetId, { scroll: true });
    });
  });
}

function syncStudentFrontSwitcher(targetId = 'studentCoreSection') {
  document.querySelectorAll('[data-student-front-target]').forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute('data-student-front-target') === targetId);
  });
  const hintEl = byId('studentFrontSwitcherHint');
  if (!hintEl) return;
  const hints = {
    studentCoreSection: '學生端第一屏順序：先看養成總覽，再往每日 / Boss、收藏 / 排行與 AI 互動延伸。',
    studentDailyBossPanel: '目前焦點：每日 / Boss。這一區保留給學生自己挑戰與結算。',
    studentRadarCollectionPanel: '目前焦點：收藏 / 雷達。左異獸、右雷達、下方指標與成熟隊伍都集中在這裡。',
    studentActivityPanel: '目前焦點：排行 / 活動。可快速看到近期事件、排行摘要與隊伍內容。',
    studentFutureSystemsPanel: '目前焦點：交換 / 寄宿。先保留入口與摘要，後續規則再往內補。',
    guideResultPanel: '目前焦點：AI 對話。掃 NTAG 進學生頁後，也能直接接到 AI 夥伴與世界觀互動。',
  };
  hintEl.textContent = hints[targetId] || hints.studentCoreSection;
}

function bindStudentFrontSwitcher() {
  document.querySelectorAll('[data-student-front-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-student-front-target') || 'studentCoreSection';
      syncStudentFrontSwitcher(targetId);
      setActivePageTab('student-page');
      const target = byId(targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function updateMainPageTabHint(tabKey) {
  const hintEl = byId('mainPageTabHint');
  if (!hintEl) return;
  const hints = {
    'teacher-entry': '目前位於老師登入入口。登入後可進入老師系統頁，再查卡或掃卡開啟學生資料。',
    'teacher-system': '目前分頁：老師系統頁。查到學生後，會以教師版學生狀態頁承接學生主體，再加上老師工具列。',
    'system-zone': '目前分頁：獨立系統區。題庫、Boss、批次工具與治理權限集中在這裡。',
    'student-page': '目前分頁：學生端頁面。掃描已寫入網址的 NTAG 後，會直接進學生狀態頁。',
    acceptance: '',
  };
  hintEl.textContent = hints[tabKey] || hints['teacher-entry'];
}

function setActivePageTab(tabKey = 'teacher-entry', { scroll = false } = {}) {
  const normalized = String(tabKey || '').trim() || 'teacher-entry';
  document.querySelectorAll('[data-page-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute('data-page-tab') === normalized);
  });
  document.querySelectorAll('[data-page-pane]').forEach((pane) => {
    pane.classList.toggle('page-pane-hidden', pane.getAttribute('data-page-pane') !== normalized);
  });
  updateMainPageTabHint(normalized);
  if (scroll) {
    byId('heroBuildTag')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function bindMainPageTabs() {
  const tabs = [...document.querySelectorAll('[data-page-tab]')];
  if (!tabs.length) return;
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    setActivePageTab(tab.getAttribute('data-page-tab') || 'teacher-entry', { scroll: true });
  }));
}

function bindPageTabJumps() {
  document.querySelectorAll('[data-page-tab-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const tabKey = button.getAttribute('data-page-tab-jump') || 'teacher-entry';
      setActivePageTab(tabKey, { scroll: true });
    });
  });
}

function setActiveNavSection(targetId, { scroll = false } = {}) {
  if (!targetId) return;
  const pageTab = NAV_TO_PAGE_TAB[targetId];
  if (pageTab) setActivePageTab(pageTab);
  if (!legacyNavButtons.length || !legacyNavSections.length) {
    legacyNavButtons = [...document.querySelectorAll('[data-nav-target]')];
    legacyNavSections = legacyNavButtons.map((button) => document.getElementById(button.getAttribute('data-nav-target'))).filter(Boolean);
  }
  legacyNavButtons.forEach((button) => button.classList.toggle('is-active', button.getAttribute('data-nav-target') === targetId));
  legacyNavSections.forEach((section) => section.classList.toggle('section-focus', section.id === targetId));
  if (pageTab === 'teacher-system') syncTeacherSystemSwitcher(targetId);
  if (pageTab === 'student-page') syncStudentFrontSwitcher(targetId);
  const modalId = SECTION_MODAL_MAP[targetId];
  if (modalId) {
    openModal(modalId);
    const target = document.getElementById(targetId);
    if (scroll) target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (scroll) {
    const target = document.getElementById(targetId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function bindLegacyStyleNavigation() {
  const navButtons = [...document.querySelectorAll('[data-nav-target]')];
  const sections = navButtons.map((button) => document.getElementById(button.getAttribute('data-nav-target'))).filter(Boolean);
  legacyNavButtons = navButtons;
  legacyNavSections = sections;
  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-nav-target');
      if (!targetId) return;
      setActiveNavSection(targetId, { scroll: true });
    });
  });
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible?.target?.id) setActiveNavSection(visible.target.id);
  }, { threshold: [0.25, 0.45, 0.7] });
  sections.forEach((section) => observer.observe(section));
  if (sections[0]) setActiveNavSection(sections[0].id);
}

function buildBatchSerialList() {
  const manual = String(byId('batchSerialInput')?.value || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const from = String(byId('batchSerialFromInput')?.value || '').trim();
  const to = String(byId('batchSerialToInput')?.value || '').trim();
  if (!from || !to) return manual;
  const start = Number(from.replace(/\D/g, ''));
  const end = Number(to.replace(/\D/g, ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) return manual;
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  const width = Math.max(String(lower).length, String(upper).length, 3);
  const range = [];
  for (let i = lower; i <= upper; i += 1) range.push(String(i).padStart(width, '0'));
  return [...manual, ...range];
}

function updateGuideCard(data) {
  const guide = getGuideConfig(data);
  const avatar = byId('guideAvatar');
  const title = byId('guideTitle');
  const subtitle = byId('guideSubtitle');
  const description = byId('guideDescription');
  const modeBadge = byId('guideModeBadge');
  const lockBadge = byId('guideLockBadge');
  const question = byId('guideQuestionInput');
  const askBtn = byId('btnAskGuide');
  const label = byId('guideQuestionLabel');

  if (avatar) {
    avatar.src = guide.imageUrl;
    avatar.alt = guide.title;
  }
  if (title) title.textContent = guide.title;
  if (subtitle) subtitle.textContent = guide.subtitle;
  if (description) description.textContent = guide.description;
  if (modeBadge) modeBadge.textContent = guide.mode;
  if (lockBadge) lockBadge.textContent = data?.guide_mode_locked === false ? 'unlocked' : 'locked';
  if (question) question.placeholder = guide.placeholder;
  if (askBtn) askBtn.textContent = guide.buttonLabel;
  if (label) label.textContent = `${guide.title} 問題`;
}

function updateTeacherOpsStatus() {
  bindText('[data-bind="opAction"]', uiState.lastAction || '系統待命');
  bindText('[data-bind="opBusy"]', uiState.isSaving ? '忙碌中' : '待命');
  bindText('[data-bind="opLastSync"]', uiState.lastSyncAt ? new Date(uiState.lastSyncAt).toLocaleString('zh-TW') : '-');
  bindText('[data-bind="batchSummary"]',
    `總數 ${batchState.summary.total} / 成功 ${batchState.summary.success} / 失敗 ${batchState.summary.failed} / 跳過 ${batchState.summary.skipped}`);
  const btn = byId('btnRunBatch');
  if (btn) btn.disabled = batchState.isRunning;
  const teacherStatus = byId('teacherSessionText');
  if (teacherStatus) teacherStatus.textContent = currentState.teacherUser ? `已登入：${currentState.teacherUser.email || currentState.teacherUser.uid}` : '未登入';
  const protectedIds = ['btnLoadStudent','btnLoadByToken','btnLoadByNtag','btnBatchArenaLaunch','btnBatchArenaSignal','btnBatchArenaApply','btnRename','btnSaveGuideMode','btnPreviewScore','btnApplyScoreDirect','btnApplyStatus','btnRunBatch','btnBuyPhysicalReward','btnRefreshTeacherShopCatalog','btnBuyCatalogItem','btnRedeemVoucher','btnBatchScanStudent','btnBatchProcessSignal','btnApplyBatchCard','btnRefreshBatchResultBoard','btnCopyBatchResultBoard','btnResetBatchCycle','btnRefreshBatchAudit','btnCopyBatchAudit','btnRefreshBatchFieldCheck','btnCopyBatchFieldCheck','btnReissueToken','btnBindNtag','btnDeactivateToken','btnRefreshTokenSummary','btnReadNewCardUid','btnRegisterNewCard','btnRegisterNewCardAndWriteNfc','btnPreviewCardWorkflow','btnRunCardWorkflow','btnCopyCardWorkflow','btnRefreshCardActionStrip','btnCopyCardActionStrip','btnRefreshCardFieldCheck','btnCopyCardFieldCheck','btnCopyStudentUrl','btnWriteStudentNfc','btnRefreshNtagPanel','btnSaveForgeCard','btnRefreshForgeCards','btnSaveShopConfig','btnDeployAzureKirinEgg','btnRefreshShopConfig','btnSaveBossConfig','btnRefreshBossConfig','btnSaveQuestionSet','btnImportQuestionBulk','btnRefreshQuestionSet','btnApplyQuizFilter','btnResetQuizFilter','btnLoadSelectedQuiz','btnToggleSelectedQuiz','btnDeleteSelectedQuiz','btnExportQuizTsv','btnPreviewBatchAdmin','btnRunBatchAdmin','btnRefreshSupportZone','btnCopySupportZone','btnRefreshScienceZone','btnCopyScienceZone'];
  protectedIds.forEach((id) => { const el = byId(id); if (el) el.disabled = !currentState.teacherUser || (id === 'btnRunBatch' ? batchState.isRunning : false); });
  renderTeacherGovernance();
  refreshTeacherInlineLogPreview();
}



function updateStudentSummary() {
  const data = currentState.studentData;
  if (!data) {
    bindText('[data-bind="serial"]', '未載入');
    bindText('[data-bind="name"]', '未載入');
    bindText('[data-bind="coins"]', '0');
    bindText('[data-bind="xp"]', '0');
    bindText('[data-bind="guideMode"]', '智者貓咪');
    bindText('[data-bind="source"]', '-');
    updateGuideCard({ guide_mode: 'cat', guide_mode_locked: true });
    renderCollection();
    renderTeacherOpsResult('尚未執行', '尚未執行');
    renderTokenSummary();
    renderCardWorkflowPreview();
    renderCardFieldCheck();
    renderTeacherNtagPanel();
    renderBatchAuditPreview();
    renderBatchFieldCheck();
    updateLegacyCockpitSummary();
    renderTeacherStudentShell();
    syncStudentCorePanel();
    refreshSpecialZoneReports();
    refreshTeacherInlineLogPreview();
    updateTeacherOpsStatus();
    return;
  }

  const labels = getProfileLabels(data);
  const guide = getGuideConfig(data);
  bindText('[data-bind="serial"]', data.serial || data.card_seq || '-');
  bindText('[data-bind="name"]', data.name || '未命名學生');
  bindText('[data-bind="coins"]', `${data.coins ?? 0}`);
  bindText('[data-bind="xp"]', `${data.totalXP ?? 0} (${labels.xp})`);
  bindText('[data-bind="guideMode"]', guide.title);
  bindText('[data-bind="source"]', currentState.currentToken ? 'student_pages + students' : 'students');
  byId('renameInput').value = data.name || '';
  byId('guideModeSelect').value = getGuideMode(data);
  updateGuideCard(data);
  renderCollection();
  bindText('[data-bind="nickname"]', data.name || '未命名學生');
  bindText('[data-bind="grade"]', data.grade || data.class_name || '-');
  bindText('[data-bind="title"]', data.title || data.current_title || '未設定');
  bindText('[data-bind="status"]', Object.entries(data.debuffs || {}).filter(([,v]) => Number(v) > 0).map(([k,v]) => `${DEBUFF_INFO[k]?.label || k}x${v}`).join('、') || '健康');
  bindText('[data-bind="attrs"]', Object.entries(data.attributes || {}).map(([k,v]) => `${k}:${Number(v)||0}`).join(' / ') || '-');
  activateLegacyActionPanel(detectLegacyActionPanel(data));
  renderTeacherNtagPanel();
  renderTeacherStudentLogs();
  renderTokenSummary().then((summary) => { renderCardWorkflowPreview(summary); renderCardFieldCheck(summary); }).catch(() => { renderCardWorkflowPreview(); renderCardFieldCheck(); });
  updateLegacyCockpitSummary();
  renderTeacherStudentShell(data);
  refreshTeacherShopCatalog().catch(() => {});
  syncStudentCorePanel();
  refreshSpecialZoneReports();
  refreshTeacherInlineLogPreview();
  updateTeacherOpsStatus();
  refreshBatchScanPanel();
}


function renderCollection() {
  const el = byId('collectionText');
  const data = currentState.studentData;
  if (!el) return;
  if (!data) {
    el.textContent = '尚未載入';
    return;
  }
  const collection = Array.isArray(data.collection) ? data.collection : [];
  if (!collection.length) {
    el.textContent = '目前沒有收藏或憑證';
    return;
  }
  el.textContent = collection.map((item, index) => {
    if (item?.type === 'voucher') {
      return `#${index + 1}\n${formatVoucherLine(item)}`;
    }
    return `#${index + 1}\n${JSON.stringify(item, null, 2)}`;
  }).join('\n\n----------------\n\n');
}


function renderTeacherStudentLogs() {
  const logEl = byId('teacherStudentLogText');
  const issueEl = byId('teacherIssueText');
  const data = currentState.studentData;
  if (logEl) {
    const lines = buildUnifiedActivityLines(data, 12);
    logEl.textContent = lines.length ? lines.join('\n') : '尚無事件紀錄';
  }
  if (issueEl) {
    const issues = Array.isArray(data?.learning_issues) ? data.learning_issues.slice(-8).reverse() : [];
    issueEl.textContent = issues.length ? issues.map((item) => `${DEBUFF_INFO[item.statusKey]?.label || item.statusKey || '紀錄'}｜${item.reason || ''}｜+${Number(item.stacks) || 0}`).join('\n') : '尚無學習問題紀錄';
  }
}

async function renderTokenSummary() {
  const el = byId('tokenSummaryText');
  if (!el) return null;
  const serial = currentState.studentData?.serial || currentState.studentData?.card_seq;
  if (!serial) {
    el.textContent = '尚未載入學生';
    return null;
  }
  try {
    const summary = await getStudentTokenSummary(serial);
    const tokenLines = summary.tokens.length
      ? summary.tokens.slice(0, 10).map((item, index) => {
          const status = item.active === false ? 'inactive' : 'active';
          return `#${index + 1} ${item.id}｜${status}｜ntag:${item.ntagId || '-'}｜issued:${item.issuedAt ? new Date(item.issuedAt).toLocaleString('zh-TW') : '-'}`;
        }).join('\n')
      : '尚無 token 紀錄';
    el.textContent = [
      `學生：${summary.student.name || '未命名學生'} (#${summary.serial})`,
      `目前 active token：${summary.activeToken || '未設定'}`,
      `總 token 數：${summary.tokens.length}`,
      '---',
      tokenLines,
    ].join('\n');
    return summary;
  } catch (error) {
    el.textContent = `卡務摘要讀取失敗：${error?.message || error}`;
    return null;
  }
}

function resolveCardWorkflowRuntime(summary = null) {
  const summaryStudent = summary?.student || null;
  const fallbackStudent = currentState.studentData || null;
  const student = summaryStudent || fallbackStudent;
  const serialInput = normalizeSerial(String(byId('cardWorkflowSerialInput')?.value || '').trim());
  const serial = serialInput || normalizeSerial(student?.serial || student?.card_seq) || null;
  return { serial, student };
}

function renderCardWorkflowStudentSummary(summary = null) {
  const el = byId('cardWorkflowStudentText');
  if (!el) return;
  const { serial, student } = resolveCardWorkflowRuntime(summary);
  if (!serial || !student) {
    el.textContent = '尚未依卡序查找補卡學生';
    return;
  }
  const activeToken = String(summary?.activeToken || student?.active_token || student?.page_token || '').trim();
  const tokens = Array.isArray(summary?.tokens) ? summary.tokens : [];
  const activeCount = tokens.filter((item) => item?.active !== false).length || (activeToken ? 1 : 0);
  const inactiveCount = tokens.filter((item) => item?.active === false).length;
  el.textContent = [
    `學生：${student.name || '未命名學生'} (#${serial})`,
    `年級 / 班級：${student.grade || student.class_name || '-'}`,
    `暱稱 / 顯示：${student.name || '未命名學生'}｜${student.display_name || student.displayName || student.name || '-'}`,
    `active token：${activeToken || '未設定'}`,
    `token：有效 ${activeCount}｜失效 ${inactiveCount}`,
    `目前舊卡 UID / NTAG：${student.last_bound_ntag || '未設定'}`,
    `新卡 UID / NTAG：${String(byId('cardAdminNtagInput')?.value || '').trim() || '未輸入'}`,
  ].join('\n');
}

async function resolveCardWorkflowSummary({ requireTarget = true } = {}) {
  const { serial } = resolveCardWorkflowRuntime();
  if (!serial) {
    if (requireTarget) throw new Error('請先輸入補卡卡序，或先載入學生');
    return null;
  }
  const summary = await getStudentTokenSummary(serial);
  renderCardWorkflowStudentSummary(summary);
  if (byId('cardWorkflowSerialInput')) byId('cardWorkflowSerialInput').value = summary.serial || serial;
  return summary;
}

function getCardWorkflowMode(summary = null) {
  const { student } = resolveCardWorkflowRuntime(summary);
  const safeStudent = student || {};
  const safeNtag = String(byId('cardAdminNtagInput')?.value || '').trim();
  const activeToken = String(summary?.activeToken || currentState.currentToken || student?.active_token || student?.page_token || '').trim();
  const tokens = Array.isArray(summary?.tokens) ? summary.tokens : [];
  const activeCount = tokens.filter((item) => item?.active !== false).length || (activeToken ? 1 : 0);
  const hasBoundNtag = Boolean(safeStudent.last_bound_ntag);
  if (!activeToken && !activeCount) {
    return { key: 'issue', label: '發卡 / 建立學生入口', detail: '尚未存在有效 token，先建立新的學生正式入口。' };
  }
  if (safeNtag && (!hasBoundNtag || safeNtag !== String(safeStudent.last_bound_ntag || '').trim())) {
    return { key: 'rebind', label: '補卡 / 重綁新卡', detail: `已輸入新 NTAG ${safeNtag}，建議補發新 token 後直接綁新卡。` };
  }
  return { key: 'reissue', label: '補發新 token', detail: '目前已有入口，但建議重發新 token 並停用舊卡。' };
}

function buildCardActionStripHtml(summary = null) {
  const { serial, student } = resolveCardWorkflowRuntime(summary);
  if (!student) return '<div class="legacy-callout">請先由老師正式入口載入學生，再產生卡務步驟板。</div>';
  const safeSerial = serial || '-';
  const safeNtag = String(byId('cardAdminNtagInput')?.value || '').trim();
  const activeToken = String(summary?.activeToken || currentState.currentToken || student?.active_token || student?.page_token || '').trim();
  const tokens = Array.isArray(summary?.tokens) ? summary.tokens : [];
  const inactiveToken = String(byId('deactivateTokenInput')?.value || tokens.find((item) => item?.active === false)?.id || '').trim();
  const mode = getCardWorkflowMode(summary);
  const issueDone = Boolean(activeToken);
  const bindDone = safeNtag ? String(student.last_bound_ntag || '').trim() === safeNtag : Boolean(student.last_bound_ntag);
  const verifyReady = Boolean(buildStudentPageUrl(activeToken));
  const stages = [
    {
      title: '步驟 1｜確認工作模式',
      state: mode.label,
      detail: `學生 ${student.name || '未命名學生'} (#${safeSerial})｜${mode.detail}`,
    },
    {
      title: '步驟 2｜補發 / 發卡',
      state: issueDone ? '已有有效 token' : '尚未建立 token',
      detail: `現用 token：${activeToken || '未設定'}${inactiveToken ? `｜待停用舊 token：${inactiveToken}` : ''}`,
    },
    {
      title: '步驟 3｜綁定新 NTAG / NFC',
      state: safeNtag ? (bindDone ? '已對到目前學生設定' : '待寫入新卡') : '尚未輸入新卡',
      detail: `目前綁定：${student.last_bound_ntag || '未設定'}｜待綁定：${safeNtag || '未輸入'}`,
    },
    {
      title: '步驟 4｜學生正式入口驗證',
      state: verifyReady ? '可進行實測' : '待建立學生頁網址',
      detail: `學生頁網址：${buildStudentPageUrl(activeToken) || '尚未建立'}｜要求：新卡可進，舊卡不可進`,
    },
  ];
  return `<div class="legacy-grid">${stages.map((item) => `<div class="glass-panel"><h3 class="tech-font">${escapeHtml(item.title)}</h3><div class="legacy-info-item"><strong>${escapeHtml(item.state)}</strong><br/>${escapeHtml(item.detail)}</div></div>`).join('')}</div>`;
}

function renderCardActionStrip(summary = null) {
  const el = byId('cardActionStrip');
  if (!el) return;
  el.innerHTML = buildCardActionStripHtml(summary);
}

function buildBatchResultBoardText() {
  const snapshot = getBatchSessionSnapshot();
  const resultText = byId('batchScanResultText')?.textContent || '尚未套用道具卡';
  const lastHistory = Array.isArray(snapshot.history) && snapshot.history.length ? snapshot.history[snapshot.history.length - 1] : null;
  const effectLabel = snapshot.effect?.label || snapshot.effect?.reason || snapshot.effect?.statusKey || '尚未套用';
  const verification = /寫入驗證：成功/.test(resultText) ? '已通過' : '待驗證';
  return [
    '【批量成功回饋 / 老師確認】',
    `學生：${snapshot.studentName || '等待學生卡'} (#${snapshot.serial || '-'})`,
    `最近道具：${effectLabel}`,
    `連續次數：${Number(snapshot.comboCount || 0)}｜剩餘：${(Number(snapshot.timeLeftMs || 0) / 1000).toFixed(1)}s`,
    `寫入驗證：${verification}`,
    `最近履歷：${lastHistory ? formatBatchHistoryEntry(lastHistory) : '尚無履歷'}`,
    '老師下一步：',
    snapshot.serial
      ? (snapshot.expired ? '請重新感應學生卡，開啟下一輪 10 秒掃描窗。' : '確認成功回饋後，可繼續掃道具卡或切到下一位學生。')
      : '請先感應學生卡，建立新的批量循環。',
    '---',
    resultText,
  ].join('\n');
}

function buildBatchRunResultText(results = [], summary = batchState.summary) {
  const rows = Array.isArray(results) ? results : [];
  const okRows = rows.filter((item) => item?.ok);
  const failedRows = rows.filter((item) => !item?.ok);
  const recentSuccess = okRows.slice(-5).map((item, idx) => {
    const checks = Array.isArray(item?.persistenceChecks) ? item.persistenceChecks.join('｜') : '未附驗證';
    return `${idx + 1}. #${item?.serial || '-'}｜${item?.name || '未命名學生'}｜XP ${Number(item?.xp || 0)}｜${checks}`;
  });
  const recentFailed = failedRows.slice(-5).map((item, idx) => `${idx + 1}. #${item?.serial || '-'}｜${item?.error || '未知錯誤'}`);
  return [
    '【批量加分統一結果】',
    `總數：${Number(summary?.total || 0)}｜成功：${Number(summary?.success || 0)}｜失敗：${Number(summary?.failed || 0)}｜跳過：${Number(summary?.skipped || 0)}`,
    `成功率：${Number(summary?.total || 0) > 0 ? `${Math.round((Number(summary?.success || 0) / Number(summary?.total || 1)) * 100)}%` : '0%'}`,
    '最近成功：',
    ...(recentSuccess.length ? recentSuccess : ['尚無成功項目']),
    '最近失敗：',
    ...(recentFailed.length ? recentFailed : ['尚無失敗項目']),
  ].join('\n');
}

function buildBatchResultBoardHtml() {
  const snapshot = getBatchSessionSnapshot();
  const resultText = byId('batchScanResultText')?.textContent || '尚未套用道具卡';
  const effectLabel = snapshot.effect?.label || snapshot.effect?.reason || snapshot.effect?.statusKey || '尚未套用';
  const verification = /寫入驗證：成功/.test(resultText) ? '寫入驗證已通過' : '尚待寫入驗證';
  const sourceStats = snapshot.snapshot ? buildUnifiedSourceBreakdownLines(snapshot.snapshot, 2).join('<br/>') : '尚無學生事件資料';
  const actionHint = snapshot.serial
    ? (snapshot.expired ? '掃描窗已結束，請重新感應學生卡。' : '現場可直接連續掃道具卡，或直接掃下一位學生卡開新循環。')
    : '請先感應學生卡。';
  const cards = [
    { title: '目前循環', body: `${snapshot.studentName || '等待學生卡'} / #${snapshot.serial || '-'}<br/>剩餘 ${(Number(snapshot.timeLeftMs || 0) / 1000).toFixed(1)}s｜combo ${Number(snapshot.comboCount || 0)}` },
    { title: '最近道具', body: `${effectLabel}<br/>${snapshot.expired ? '掃描窗已逾時' : '掃描窗仍開啟中'}` },
    { title: '寫入驗證', body: `${verification}<br/>檢查 XP / 狀態 / reward_events / logs 是否同步。` },
    { title: '事件來源', body: `${sourceStats}` },
    { title: '老師下一步', body: actionHint },
  ];
  return `<div class="legacy-grid">${cards.map((item) => `<div class="glass-panel"><h3 class="tech-font">${escapeHtml(item.title)}</h3><div class="legacy-info-item">${item.body}</div></div>`).join('')}</div>`;
}

function renderBatchResultBoard() {
  const el = byId('batchResultBoard');
  if (!el) return;
  el.innerHTML = buildBatchResultBoardHtml();
}

function buildCardWorkflowText(summary = null) {
  const { serial, student } = resolveCardWorkflowRuntime(summary);
  const safeNtag = String(byId('cardAdminNtagInput')?.value || '').trim();
  if (!student) return '請先由老師正式入口載入學生，再進行補卡 / 重綁盤查。';
  const safeSerial = serial || '-';
  const activeToken = String(summary?.activeToken || currentState.currentToken || student?.active_token || student?.page_token || '').trim();
  const tokens = Array.isArray(summary?.tokens) ? summary.tokens : [];
  const inactiveCount = tokens.filter((item) => item?.active === false).length;
  const activeCount = tokens.filter((item) => item?.active !== false).length;
  return [
    '【卡務 / 補卡工作流盤查】',
    `學生：${student.name || '未命名學生'} (#${safeSerial})`,
    `目前 active token：${activeToken || '未設定'}`,
    `token 總數：${tokens.length || 0}｜有效：${activeCount || (activeToken ? 1 : 0)}｜失效：${inactiveCount || 0}`,
    `目前綁定 NTAG：${student.last_bound_ntag || '未設定'}`,
    `待寫入新 NTAG：${safeNtag || '未輸入'}`,
    '建議順序：',
    `1. ${activeToken ? '補發 / 重發新 token（舊 token 轉失效）' : '發卡 / 建立新的 active token'}`,
    `2. ${safeNtag ? `將新 NTAG ${safeNtag} 綁到新的 active token` : '如有新卡，輸入 NTAG / NFC 識別後再執行重綁'}`,
    '3. 一鍵補卡 / 重綁後，會把學生頁網址切到新 token，並優先嘗試寫入新卡 NFC',
    '4. 以學生正式入口（ntag / NFC 帶 token）驗證新卡可讀、舊卡不可再用',
  ].join('\n');
}

async function renderCardWorkflowPreview(summary = null) {
  const el = byId('cardWorkflowText');
  if (!el) return;
  el.textContent = buildCardWorkflowText(summary);
  renderCardWorkflowStudentSummary(summary);
  renderCardActionStrip(summary);
}

function buildCardFieldCheckText(summary = null) {
  const { serial, student } = resolveCardWorkflowRuntime(summary);
  if (!student) return '請先由老師正式入口載入學生，再檢查補卡 / 重綁現場確認。';
  const safeSerial = serial || '-';
  const safeNtag = String(byId('cardAdminNtagInput')?.value || '').trim();
  const activeToken = String(summary?.activeToken || currentState.currentToken || student?.active_token || student?.page_token || '').trim();
  const tokens = Array.isArray(summary?.tokens) ? summary.tokens : [];
  const oldToken = String(byId('deactivateTokenInput')?.value || tokens.find((item) => item?.active === false)?.id || '').trim();
  const studentUrl = buildStudentPageUrl(activeToken) || '尚未建立';
  return [
    '【卡務現場確認】',
    `學生：${student.name || '未命名學生'} (#${safeSerial})`,
    `老師正式入口：已載入 / ${serial}`,
    `學生正式入口：${activeToken ? '已有 active token' : '尚未建立 token'}`,
    `現用 token：${activeToken || '未設定'}`,
    `待停用舊 token：${oldToken || '尚未指定'}`,
    `待綁新 NTAG：${safeNtag || '未輸入'}`,
    `學生頁網址：${studentUrl}`,
    '現場順序：',
    `1. ${activeToken ? '先補發新 token，再確認舊 token 已轉失效' : '先建立新的 active token'}`,
    `2. ${safeNtag ? `把新卡 ${safeNtag} 綁到 active token` : '如有新卡，先輸入 NTAG / NFC 識別'}`,
    '3. 一鍵補卡 / 重綁完成後，確認學生頁網址已切到新 token，並完成 NFC 寫卡',
    '4. 以學生正式入口實測：新卡可進，舊卡不可進',
  ].join('\n');
}

function renderCardFieldCheck(summary = null) {
  const el = byId('cardFieldCheckText');
  if (!el) return;
  el.textContent = buildCardFieldCheckText(summary);
}

function buildBatchFieldCheckText() {
  const snapshot = getBatchSessionSnapshot();
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const last = history.length ? history[history.length - 1] : null;
  const resultText = byId('batchScanResultText')?.textContent || '尚未套用道具卡';
  return [
    '【批量現場確認】',
    `目前學生：${snapshot.studentName || '等待學生卡'} (#${snapshot.serial || '-'})`,
    `掃描模式：${snapshot.scanModeEnabled ? '已開啟' : '未開啟'}`,
    `學生循環：${snapshot.serial ? (snapshot.expired ? '已逾時，需重掃學生卡' : '已鎖定，可連續掃道具卡或直接切下一張學生卡') : '尚未鎖定學生卡'}`,
    `剩餘秒數：${(Number(snapshot.timeLeftMs || 0) / 1000).toFixed(1)}s`,
    `每位學生 combo：${Number(snapshot.comboCount || 0)}`,
    `最近道具：${snapshot.effect?.label || snapshot.effect?.reason || snapshot.effect?.statusKey || '尚未套用'}`,
    `最近履歷：${last ? formatBatchHistoryEntry(last) : '尚無履歷'}`,
    '現場順序：',
    `1. ${snapshot.serial ? '已掃學生卡，可在 10 秒內掃道具卡' : '先掃學生卡 / serial / ntag / token 開新循環'}`,
    `2. ${snapshot.serial && !snapshot.expired ? '掃道具卡後應看到成功回饋，並重新計時' : '若已逾時，先重掃學生卡'}`,
    '3. 換下一位學生卡時，combo 應重新以該學生獨立計算',
    '4. 若結果顯示成功，需同時確認 XP / 狀態 / reward_events / logs 已同步寫入',
    '最近結果：',
    resultText,
  ].join('\n');
}

function renderBatchFieldCheck() {
  const el = byId('batchFieldCheckText');
  if (!el) return;
  el.textContent = buildBatchFieldCheckText();
}

function buildBatchAuditText() {
  const snapshot = getBatchSessionSnapshot();
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const last = history.length ? history[history.length - 1] : null;
  return [
    '【批量掃描 / NTAG 工作流盤查】',
    `目前學生：${snapshot.studentName || '等待學生卡'} (#${snapshot.serial || '-'})`,
    `掃描模式：${snapshot.scanModeEnabled ? '已開啟' : '未開啟'}｜等待：${snapshot.waitingFor === 'reward' ? '道具卡 / 下一位學生卡' : '學生卡'}`,
    `掃描窗：${snapshot.serial ? (snapshot.expired ? '已逾時' : '開啟中') : '未啟動'}｜剩餘：${(Number(snapshot.timeLeftMs || 0) / 1000).toFixed(1)}s`,
    `連續次數：${Number(snapshot.comboCount || 0)}（每位學生獨立）`,
    `最近道具：${snapshot.effect?.label || snapshot.effect?.reason || snapshot.effect?.statusKey || '尚未套用'}`,
    `履歷筆數：${history.length}`,
    `最近事件：${last ? formatBatchHistoryEntry(last) : '尚無履歷'}`,
    '檢查順序：',
    '1. 先掃學生卡 / serial / ntag / token 開新循環',
    '2. 10 秒內掃道具卡，成功後重新計時',
    '3. 若掃下一位學生卡，應直接切到新循環，不沿用前一位學生的 combo',
    '4. 若已逾時，先重新感應學生卡再套用道具卡',
  ].join('\n');
}

function renderBatchAuditPreview() {
  const el = byId('batchAuditText');
  if (!el) return;
  el.textContent = buildBatchAuditText();
}

let cachedForgeCards = [];

function syncForgeModeFields() {
  const mode = byId('forgeModeSelect')?.value === 'debuff' ? 'debuff' : 'xp';
  byId('forgeXpFields')?.classList.toggle('hidden', mode !== 'xp');
  byId('forgeDebuffFields')?.classList.toggle('hidden', mode !== 'debuff');
}

async function refreshForgeCardList() {
  const listEl = byId('forgeCardListText');
  try {
    const rows = await listItemCardPresets();
    cachedForgeCards = rows.filter((item) => item.active !== false);
    if (listEl) {
      listEl.textContent = cachedForgeCards.length
        ? cachedForgeCards.map((item, index) => `#${index + 1} ${item.name}｜${item.mode === 'debuff' ? `${item.statusKey} x${item.stacks}` : `${item.attrKey} +${item.amount}XP`}｜${item.reason}`).join('\n')
        : '尚未載入自訂道具卡';
    }
    populateBatchCardPresets();
  } catch (error) {
    if (listEl) listEl.textContent = `道具卡清單讀取失敗：${error?.message || error}`;
  }
}

function hidePreview() {
  byId('previewPanel')?.classList.add('hidden');
  clearPreviewAction();
}

function showPreview(text) {
  byId('previewText').textContent = text;
  byId('previewPanel')?.classList.remove('hidden');
}

async function handleTeacherLogin() {
  const emailInput = byId('teacherEmail');
  const passwordInput = byId('teacherPassword');
  const loginButton = byId('btnTeacherLogin');
  const rawEmail = emailInput?.value || '';
  const password = passwordInput?.value || '';
  if (!rawEmail || !password) throw new Error('請輸入管理者 Email 與密碼');

  const { ok, email } = validateTeacherEmail(rawEmail);
  if (emailInput) emailInput.value = email;
  if (!ok) {
    throw new Error('管理者 Email 格式不正確。請輸入完整 Email，例如 teacher@example.com。');
  }

  const originalText = loginButton?.textContent || '老師登入';
  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent = '登入中...';
  }

  try {
    await teacherLogin(email, password);
    try { localStorage.setItem('adminEmail', email); } catch (_) {}
    if (passwordInput) passwordInput.value = '';
    showAlert('老師登入成功');
    updateTeacherOpsStatus();
    setActivePageTab('teacher-system', { scroll: true });
    syncTeacherSystemSwitcher('teacherStudentOpsSection');
    setActiveNavSection('teacherStudentOpsSection', { scroll: true });
    renderTeacherOpsResult('已進入老師系統頁', '舊版流程：登入封面 → 老師系統頁 → 查卡號或掃描卡片 → 教師版學生狀態頁。');
  } catch (error) {
    throw new Error(mapTeacherLoginError(error));
  } finally {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = originalText;
    }
  }
}

async function handleLoadStudent() {
  ensureTeacherLoggedIn();
  const serial = byId('serialInput').value.trim();
  const student = await loadStudentBySerial(serial);
  try { assertTeacherCanAccessStudent(student, '查找學生'); } catch (error) { resetCurrentStudent(); updateStudentSummary(); throw error; }
  updateStudentSummary();
  setActivePageTab('teacher-system');
  focusTeacherOpsWorkspace('score');
  renderTeacherOpsResult(
    '已依卡序載入學生',
    [
      `學生：${student.name || '未命名學生'} (#${student.serial || student.card_seq || '-'})`,
      '查找模式：serial / card_seq / 舊資料相容查找',
      `總 XP：${Number(student.totalXP) || 0}`,
      `金幣：${Number(student.coins) || 0}`,
    ].join('\n')
  );
}

async function handleLoadStudentByToken() {
  ensureTeacherLoggedIn();
  const token = byId('tokenInput').value.trim();
  const student = await loadStudentByToken(token);
  try { assertTeacherCanAccessStudent(student, '用 token 查找學生'); } catch (error) { resetCurrentStudent(); updateStudentSummary(); throw error; }
  updateStudentSummary();
  setActivePageTab('teacher-system');
  focusTeacherOpsWorkspace('score');
  renderTeacherOpsResult('已用 token 載入學生', [`學生：${student.name || '未命名學生'} (#${student.serial || student.card_seq || '-'})`, '查找模式：student_pages token', `總 XP：${Number(student.totalXP) || 0}`, `金幣：${Number(student.coins) || 0}`].join('\n'));
}



async function handleLoadStudentByNtag() {
  ensureTeacherLoggedIn();
  const ntag = byId('ntagInput').value.trim();
  const student = await loadStudentByNtag(ntag);
  try { assertTeacherCanAccessStudent(student, '用 ntag 查找學生'); } catch (error) { resetCurrentStudent(); updateStudentSummary(); throw error; }
  updateStudentSummary();
  setActivePageTab('teacher-system');
  focusTeacherOpsWorkspace('score');
  renderTeacherOpsResult('已依 ntag 載入學生', [`學生：${student.name || '未命名學生'} (#${student.serial || student.card_seq || '-'})`, `NTAG：${ntag || '-'}`, `總 XP：${Number(student.totalXP) || 0}`, `金幣：${Number(student.coins) || 0}`].join('\n'));
}

async function handleCardWorkflowLookup() {
  ensureTeacherLoggedIn();
  const summary = await resolveCardWorkflowSummary({ requireTarget: true });
  await renderCardWorkflowPreview(summary);
  renderCardFieldCheck(summary);
  renderTeacherOpsResult('已依卡序載入補卡學生', byId('cardWorkflowStudentText')?.textContent || '已更新');
}

async function handlePreviewCardWorkflow() {
  ensureTeacherLoggedIn();
  const summary = await resolveCardWorkflowSummary({ requireTarget: true });
  if (currentState.currentSerial && currentState.currentSerial === summary?.serial) await renderTokenSummary();
  await renderCardWorkflowPreview(summary);
  renderCardFieldCheck(summary);
  renderTeacherOpsResult('卡務工作流已更新', byId('cardWorkflowText')?.textContent || '已更新');
}

async function handleRunCardWorkflow() {
  ensureTeacherLoggedIn();
  const summary = await resolveCardWorkflowSummary({ requireTarget: true });
  const serial = summary?.serial;
  if (!serial) throw new Error('請先輸入補卡卡序，再執行補卡 / 重綁');
  const safeNtag = String(byId('cardAdminNtagInput')?.value || '').trim();
  if (!safeNtag) throw new Error('補卡 / 重綁請先讀取或輸入「新卡 UID / NTAG」');
  const result = await reissueStudentToken(serial, {
    actorUid: currentState.teacherUser?.uid || null,
    ntagId: safeNtag,
    reason: '老師補卡 / 重綁新卡',
    deactivateExisting: true,
  });
  const verificationLines = buildTokenReissuePersistenceLines(result.student, {
    newToken: result.newToken,
    oldToken: result.oldToken,
    ntagId: safeNtag,
  });
  const studentUrl = buildStudentPageUrl(result.newToken);
  let nfcLine = 'NFC：尚未寫入';
  if (!studentUrl) throw new Error('補卡後找不到學生頁網址，無法完成寫卡');
  try {
    await writeStudentUrlToNfc(studentUrl);
    nfcLine = 'NFC：已把學生頁網址寫入新卡';
  } catch (error) {
    nfcLine = `NFC：寫入失敗，請手動寫入 ${studentUrl}`;
  }
  if (currentState.currentSerial === serial) {
    await loadStudentByToken(result.newToken);
    updateStudentSummary();
    await renderTokenSummary();
  }
  const refreshedSummary = await resolveCardWorkflowSummary({ requireTarget: true });
  await renderCardWorkflowPreview(refreshedSummary);
  renderCardFieldCheck(refreshedSummary);
  const deactivateInput = byId('deactivateTokenInput');
  if (deactivateInput) deactivateInput.value = result.oldToken || '';
  const detail = [
    `學生：${result.studentName} (#${result.serial})`,
    `舊卡 UID / NTAG：${result.oldUid || '未記錄'}`,
    `新卡 UID / NTAG：${safeNtag}`,
    `舊 token：${result.oldToken || '無'}`,
    `新 token：${result.newToken}`,
    `學生頁：${studentUrl}`,
    nfcLine,
    ...verificationLines,
  ].join('\n');
  renderTeacherOpsResult('補卡 / 重綁完成', ['補卡正式流程：卡序查找 → 感應新卡 UID → 停用舊卡 / 舊 token → 改發新 token → 寫入學生頁 NFC', detail].join('\n'));
  showAlert(`卡務完成：${result.studentName}`);
}

function handleResetBatchCycle() {
  ensureTeacherLoggedIn();
  resetBatchStudentSession();
  refreshBatchScanPanel();
  const detail = buildBatchAuditText();
  renderTeacherOpsResult('已清除批量循環', detail);
}

async function handleCopyBatchAudit() {
  await copyTextToClipboard(byId('batchAuditText')?.textContent || '');
}

async function handleCopyBatchFieldCheck() {
  await copyTextToClipboard(byId('batchFieldCheckText')?.textContent || '');
}

async function handleCopyCardWorkflow() {
  await copyTextToClipboard(byId('cardWorkflowText')?.textContent || '');
}

async function handleCopyCardActionStrip() {
  await copyTextToClipboard(byId('cardActionStrip')?.textContent || '');
}

async function handleCopyCardFieldCheck() {
  await copyTextToClipboard(byId('cardFieldCheckText')?.textContent || '');
}

async function handleCopyBatchResultBoard() {
  await copyTextToClipboard(buildBatchResultBoardText());
}

function handleToggleBatchScanMode() {
  ensureTeacherLoggedIn();
  batchState.scanModeEnabled = !batchState.scanModeEnabled;
  if (!batchState.scanModeEnabled) {
    resetBatchStudentSession();
    if (byId('batchScanResultText')) byId('batchScanResultText').textContent = '掃描模式已關閉';
    if (byId('batchArenaResultText')) byId('batchArenaResultText').textContent = '掃描模式已關閉';
    renderTeacherOpsResult('已關閉掃描模式', '下次請重新點選「開啟掃描模式」，再依序感應學生卡與獎勵卡。');
  } else {
    batchState.waitingFor = 'student';
    renderTeacherOpsResult('已開啟掃描模式', '正式流程：學生卡 → 獎勵卡 → 新學生卡 → 對應獎勵卡。');
  }
  const btn = byId('btnBatchToggleMode');
  if (btn) btn.textContent = batchState.scanModeEnabled ? '關閉掃描模式' : '開啟掃描模式';
  refreshBatchScanPanel();
}

async function handleBatchScanStudent() {
  ensureTeacherLoggedIn();
  const rawKey = byId('batchScanStudentInput').value.trim();
  if (!rawKey) throw new Error('請先輸入學生卡序 / ntag / token');
  const { student, loadedVia } = await resolveBatchStudentFromInput(rawKey);
  batchState.scanModeEnabled = true;
  startBatchStudentSession(student, { token: currentState.currentToken });
  const toggleBtn = byId('btnBatchToggleMode');
  if (toggleBtn) toggleBtn.textContent = '關閉掃描模式';
  updateStudentSummary();
  refreshBatchScanPanel();
  const detail = [
    `學生：${student.name || '未命名學生'} (#${student.serial || student.card_seq || '-'})`,
    `辨識方式：${loadedVia}`,
    '狀態：已鎖定學生，10 秒內可連續感應道具卡',
    '正式流程：學生卡 → 道具卡（可連續）→ 下一位學生卡 → 對應道具卡',
  ].join('\n');
  if (byId('batchScanResultText')) byId('batchScanResultText').textContent = detail;
  if (byId('batchArenaResultText')) byId('batchArenaResultText').textContent = detail;
  renderTeacherOpsResult('已開啟批量掃描新循環', detail);
}

async function handleApplyBatchCard() {
  ensureTeacherLoggedIn();
  const mode = byId('batchCardModeSelect').value;
  const presetKey = byId('batchCardPresetSelect').value;
  const result = await applyBatchCardToActiveStudent({ mode, presetKey });
  const verificationLines = Array.isArray(result.persistenceChecks) && result.persistenceChecks.length
    ? result.persistenceChecks
    : (result.effect?.mode === 'debuff'
      ? buildStatusPersistenceLines(result.student, { statusKey: result.effect.statusKey, stacks: result.effect.stacks, reason: result.effect.reason })
      : buildScorePersistenceLines(result.student, { attrKey: result.effect.attrKey, amount: result.effect.amount, reason: result.effect.reason }));
  updateStudentSummary();
  const action = result.action || {};
  const effectName = result.effect?.label || result.effect?.reason || result.effect?.statusKey || '未命名道具';
  const detail = [
    `狀態：成功`,
    `學生：${result.studentName} (#${result.serial})`,
    `道具：${effectName}`,
    `類型：${result.effect?.mode === 'debuff' ? '負面狀態' : '加分'}`,
    action.type === 'teacher_score' ? `XP：${action.beforeXP} -> ${action.afterXP} ( +${action.xpAdded} )` : `狀態層數：${action.beforeStacks} -> ${action.afterStacks} ( +${action.stacksAdded} )`,
    `連續次數：${result.comboCount}`,
    `新時限：${(result.timeLeftMs / 1000).toFixed(1)}s`,
    '下一步：可繼續感應道具卡，或直接感應下一位學生卡',
    ...verificationLines,
  ].join('\n');
  if (byId('batchScanResultText')) byId('batchScanResultText').textContent = detail;
  renderTeacherOpsResult('批量掃描已套用', detail);
  showAlert(`批量掃描成功：${result.studentName}`);
}

function populateBatchCardPresets() {
  const modeEl = byId('batchCardModeSelect');
  const presetEl = byId('batchCardPresetSelect');
  if (!modeEl || !presetEl) return;
  const render = () => {
    const mode = modeEl.value === 'debuff' ? 'debuff' : 'xp';
    const list = BATCH_CARD_PRESETS[mode] || [];
    presetEl.innerHTML = '';
    list.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.key;
      opt.textContent = `內建｜${item.label}`;
      presetEl.appendChild(opt);
    });
    cachedForgeCards
      .filter((item) => item.mode === mode && item.active !== false)
      .forEach((item) => {
        const opt = document.createElement('option');
        opt.value = `custom:${item.id}`;
        opt.textContent = `自訂｜${item.name}`;
        presetEl.appendChild(opt);
      });
  };
  modeEl.onchange = render;
  render();
}

async function handleRename() {
  ensureStudentLoadedForTeacherOps();
  const nextName = byId('renameInput').value.trim();
  const next = await renameCurrentStudent(nextName, currentState.studentData, {
    token: currentState.currentToken,
    refreshAfterSave: true,
  });
  updateStudentSummary();
  showAlert(`已更新名字：${next.name}`);
}

async function handleSaveGuideMode() {
  ensureStudentLoadedForTeacherOps();
  const guideMode = byId('guideModeSelect').value;
  const next = await saveGuideMode(currentState.studentData, guideMode, {
    token: currentState.currentToken,
    refreshAfterSave: true,
  });
  updateStudentSummary();
  showAlert(`已儲存 AI 夥伴：${getGuideConfig(next).title}`);
}

async function handlePreviewScore() {
  ensureStudentLoadedForTeacherOps();
  const payload = buildTeacherScorePayload({
    student: currentState.studentData,
    reason: byId('scoreReasonInput').value.trim(),
    amount: byId('scoreValueInput').value,
    attrKey: byId('scoreAttrSelect').value,
  });

  setPreviewAction({
    type: 'teacher_score',
    payload,
  });

  showPreview(buildTeacherScorePreviewText(currentState.studentData, payload));
}

async function handleConfirmScore() {
  ensureStudentLoadedForTeacherOps();
  if (!currentState.previewAction || currentState.previewAction.type !== 'teacher_score') {
    throw new Error('沒有待確認的加分');
  }

  const next = applyTeacherScore(currentState.studentData, currentState.previewAction.payload, { source: 'teacher_preview_confirm' });
  const saved = await saveStudentData(next, {
    token: currentState.currentToken,
    source: 'teacher_score',
    refreshAfterSave: true,
  });
  const verificationLines = buildScorePersistenceLines(saved, currentState.previewAction.payload);
  updateStudentSummary();
  hidePreview();
  renderTeacherOpsResult(
    `已成功加分給 ${saved.name || '未命名學生'}`,
    `${formatTeacherActionResult(saved, saved.lastTeacherAction)}
${verificationLines.join('\n')}`
  );
  showAlert('加分成功');
}

async function handleApplyScoreDirect() {
  ensureStudentLoadedForTeacherOps();
  const payload = buildTeacherScorePayload({
    student: currentState.studentData,
    reason: byId('scoreReasonInput').value.trim(),
    amount: byId('scoreValueInput').value,
    attrKey: byId('scoreAttrSelect').value,
  });
  const next = applyTeacherScore(currentState.studentData, payload, { source: 'teacher_direct' });
  const saved = await saveStudentData(next, {
    token: currentState.currentToken,
    source: 'teacher_score_direct',
    refreshAfterSave: true,
  });
  const verificationLines = buildScorePersistenceLines(saved, payload);
  updateStudentSummary();
  hidePreview();
  renderTeacherOpsResult(
    `已直接入帳給 ${saved.name || '未命名學生'}`,
    `${formatTeacherActionResult(saved, saved.lastTeacherAction)}
${verificationLines.join('\n')}`
  );
  showAlert('加分成功');
}

async function handleApplyLegacyPreset(panelKey, attrKey, index) {
  const preset = getTeacherActionPreset(panelKey, attrKey, index);
  if (!preset) throw new Error('找不到對應的舊版事件');
  applyPresetToForm(preset);
  if (!currentState.teacherUser || !currentState.studentData) {
    renderTeacherOpsResult('已將舊版事件套入表單', [
      `面板：${preset.panelTitle}`,
      `事件：${preset.reason}`,
      `屬性：${preset.attrKey}`,
      `XP：+${preset.amount}`,
      '提示：請先登入老師並載入學生，再點一次即可直接入帳。',
    ].join('\n'));
    openLegacyModal({ title: '舊版式加分視窗', kicker: preset.panelTitle, html: buildScoreModalHtml() });
    showAlert('已將舊版事件套入表單');
    return null;
  }
  const payload = buildTeacherScorePayload({
    student: currentState.studentData,
    reason: preset.reason,
    amount: preset.amount,
    attrKey: preset.attrKey,
  });
  const next = applyTeacherScore(currentState.studentData, payload, { source: `legacy_panel:${preset.panelKey}` });
  const saved = await saveStudentData(next, {
    token: currentState.currentToken,
    source: `legacy_action_panel:${preset.panelKey}`,
    refreshAfterSave: true,
  });
  updateStudentSummary();
  renderTeacherOpsResult(
    `已由 ${preset.panelTitle} 套用到 ${saved.name || '未命名學生'}`,
    `${formatTeacherActionResult(saved, saved.lastTeacherAction)}\n面板：${preset.panelTitle}`
  );
  updateLegacyFlowStrip({ result: `已由 ${preset.panelTitle} 完成寫入驗證` });
  showAlert(`已套用：${preset.reason}`);
  return saved;
}

async function handleApplyStatus() {
  ensureStudentLoadedForTeacherOps();
  const payload = buildTeacherStatusPayload({
    student: currentState.studentData,
    statusKey: byId('statusPresetSelect').value,
    stacks: byId('statusStacksInput').value,
    reason: byId('statusReasonInput').value.trim(),
  });
  const next = applyTeacherStatus(currentState.studentData, payload, { source: 'teacher_status_manual' });
  const saved = await saveStudentData(next, {
    token: currentState.currentToken,
    source: 'teacher_status',
    refreshAfterSave: true,
  });
  const verificationLines = buildStatusPersistenceLines(saved, payload);
  updateStudentSummary();
  renderTeacherOpsResult(
    `已寫入狀態給 ${saved.name || '未命名學生'}`,
    `${formatTeacherActionResult(saved, saved.lastTeacherAction)}
${verificationLines.join('\n')}`
  );
  const statusMeta = DEBUFF_INFO[payload.statusKey];
  showAlert(`已寫入狀態：${statusMeta?.label || payload.statusKey}`);
}



async function handleReissueToken() {
  ensureStudentLoadedForTeacherOps();
  const serial = currentState.studentData.serial || currentState.studentData.card_seq;
  const ntagId = byId('cardAdminNtagInput').value.trim();
  const result = await reissueStudentToken(serial, {
    actorUid: currentState.teacherUser?.uid || null,
    ntagId,
    reason: ntagId ? '老師補卡 / 重發 token 並換新卡' : '老師補發新 token',
  });
  const saved = await loadStudentByToken(result.newToken);
  updateStudentSummary();
  if (byId('tokenInput')) byId('tokenInput').value = result.newToken;
  const verificationLines = buildTokenReissuePersistenceLines(saved, { newToken: result.newToken, oldToken: result.oldToken, ntagId: result.ntagId });
  const lines = [
    '狀態：成功',
    `學生：${result.studentName} (#${result.serial})`,
    `舊 token：${result.oldToken || '無'}`,
    `新 token：${result.newToken}`,
    `停用舊 token 數：${result.deactivatedCount}`,
    `舊卡 UID / NTAG：${result.oldUid || '未記錄'}`,
    `新卡 UID / NTAG：${result.ntagId || '未綁定'}`,
    ...verificationLines,
  ];
  if (result.ntagId) {
    const studentUrl = buildStudentPageUrl(result.newToken);
    if (studentUrl) {
      try {
        await writeStudentUrlToNfc(studentUrl);
        lines.push(`學生頁：${studentUrl}`);
        lines.push('NFC：已把學生頁網址寫入新卡');
      } catch (error) {
        lines.push(`學生頁：${studentUrl}`);
        lines.push(`NFC：寫入失敗，請手動寫入 ${studentUrl}`);
      }
    }
  }
  renderTeacherOpsResult('已完成補卡 / 重發 token', lines.join('\n'));
  showAlert(`已補發新 token：${result.newToken}`);
}

async function handleDeactivateToken() {
  ensureStudentLoadedForTeacherOps();
  const serial = currentState.studentData.serial || currentState.studentData.card_seq;
  const token = byId('deactivateTokenInput').value.trim() || currentState.currentToken || currentState.studentData.active_token || currentState.studentData.page_token;
  const result = await deactivateStudentToken(serial, token, {
    actorUid: currentState.teacherUser?.uid || null,
    reason: '老師手動停用舊卡',
  });
  const saved = await loadStudentBySerial(serial);
  updateStudentSummary();
  const verificationLines = buildTokenDeactivatePersistenceLines(saved, { token: result.token });
  renderTeacherOpsResult('已停用 token', [
    '狀態：成功',
    `學生：${result.studentName} (#${result.serial})`,
    `停用 token：${result.token}`,
    '結果：舊 token 已失效，不可繼續讀取 / 寫入',
    ...verificationLines,
  ].join('\n'));
  showAlert(`已停用 token：${result.token}`);
}

async function handleBindNtag() {
  ensureStudentLoadedForTeacherOps();
  const serial = currentState.studentData.serial || currentState.studentData.card_seq;
  const ntagId = byId('cardAdminNtagInput').value.trim();
  const result = await bindNtagToActiveToken(serial, ntagId, {
    actorUid: currentState.teacherUser?.uid || null,
  });
  const saved = await loadStudentBySerial(serial);
  updateStudentSummary();
  const verificationLines = buildBindNtagPersistenceLines(saved, { token: result.token, ntagId: result.ntagId });
  renderTeacherOpsResult('已綁定新 ntag / NFC', [
    '狀態：成功',
    `學生：${result.studentName} (#${result.serial})`,
    `token：${result.token}`,
    `ntag：${result.ntagId}`,
    ...verificationLines,
  ].join('\n'));
  showAlert(`已綁定 ntag：${result.ntagId}`);
}

async function handleSaveForgeCard() {
  ensureTeacherLoggedIn();
  const mode = byId('forgeModeSelect').value === 'debuff' ? 'debuff' : 'xp';
  const payload = mode === 'debuff'
    ? {
        mode,
        name: byId('forgeNameInput').value.trim(),
        reason: byId('forgeReasonInput').value.trim(),
        statusKey: byId('forgeDebuffSelect').value,
        stacks: byId('forgeStacksInput').value,
        actorUid: currentState.teacherUser?.uid || null,
      }
    : {
        mode,
        name: byId('forgeNameInput').value.trim(),
        reason: byId('forgeReasonInput').value.trim(),
        attrKey: byId('forgeAttrSelect').value,
        amount: byId('forgeAmountInput').value,
        actorUid: currentState.teacherUser?.uid || null,
      };
  const saved = await saveItemCardPreset(payload);
  await refreshForgeCardList();
  await refreshSystemZoneLists();
  renderTeacherOpsResult('已建立自訂道具卡', [
    '狀態：成功',
    `道具卡：${saved.name}`,
    `類型：${saved.mode === 'debuff' ? '負面狀態' : '加分'}`,
    saved.mode === 'debuff' ? `效果：${saved.statusKey} x${saved.stacks}` : `效果：${saved.attrKey} +${saved.amount}XP`,
    `說明：${saved.reason}`,
    '批量掃描：已同步到道具卡預設清單',
  ].join('\n'));
  showAlert(`已建立道具卡：${saved.name}`);
}

async function handleAskGuide() {
  const question = byId('guideQuestionInput').value.trim();
  const guide = getGuideConfig(currentState.studentData || {});
  const reply = await askGuideViaServer({
    message: question,
    guideMode: guide.mode,
    profileMode: guide.profileMode,
  });
  byId('guideResultText').textContent = reply || '（沒有回覆）';
}

async function handleRunBatch() {
  ensureTeacherLoggedIn();
  const serialList = buildBatchSerialList();

  const reason = byId('batchReasonInput').value.trim();
  const amount = Number(byId('batchValueInput').value || 0);
  const attrKey = byId('scoreAttrSelect').value;

  byId('batchResultText').textContent = '執行中...';
  updateTeacherOpsStatus();

  const results = await runBatchScore({
    serialList,
    reason,
    amount,
    attrKey,
    onProgress: (_item, all, summary) => {
      byId('batchResultText').textContent = buildBatchRunResultText(all, summary);
      updateTeacherOpsStatus();
    },
  });

  byId('batchResultText').textContent = buildBatchRunResultText(results, batchState.summary);
  renderTeacherOpsResult(`批量加分完成：成功 ${batchState.summary.success} / 失敗 ${batchState.summary.failed}`, byId('batchResultText').textContent, {
    extraLines: ['路徑：batch_score → reward_events + logs fallback'],
  });
  updateStudentSummary();
}

async function handleBuyPhysicalReward() {
  ensureStudentLoadedForTeacherOps();
  const itemName = byId('shopItemNameInput').value.trim();
  const itemId = byId('shopItemIdInput').value.trim();
  const price = Number(byId('shopItemPriceInput').value || 0);
  const beforeCoins = Number(currentState.studentData?.coins) || 0;
  const saved = await buyPhysicalRewardFromForm({ itemName, price, itemId });
  updateStudentSummary();
  const voucherId = String(saved.lastVoucherId || '').trim();
  const verificationLines = buildVoucherGrantPersistenceLines(saved, { beforeCoins, voucherId, itemName, price });
  renderTeacherOpsResult('已免費贈送實體商品並建立憑證', [
    `學生：${saved.name || '未命名學生'}`,
    `商品：${itemName}`,
    `贈送：免費${price ? `（原定價 ${price} 金幣）` : ''}`,
    `憑證：${voucherId || '已建立'}`,
    ...verificationLines,
  ].join('\n'));
  showAlert(`已免費贈送實體商品，並建立憑證：${voucherId || '已建立'}`);
}

async function handleBuyCatalogItem() {
  ensureStudentLoadedForTeacherOps();
  const itemId = String(byId('teacherShopCatalogSelect')?.value || '').trim();
  const item = cachedShopCatalogForTeacher.find((row) => row.id === itemId);
  if (!item) throw new Error('請先選擇商品');
  const beforeCoins = Number(currentState.studentData?.coins) || 0;
  const saved = await buyTeacherCatalogItemFromForm(item);
  updateStudentSummary();
  await refreshTeacherShopCatalog();
  const outcome = saved.shopOutcome || {};
  const verificationLines = outcome.voucherId
    ? buildVoucherGrantPersistenceLines(saved, { beforeCoins, voucherId: outcome.voucherId, itemName: item.name, price: item.price })
    : (outcome.hiddenEggId
      ? buildHiddenEggGrantPersistenceLines(saved, { beforeCoins, hiddenEggId: outcome.hiddenEggId, itemName: item.name, price: item.price })
      : ['寫入驗證：已完成基本回讀']);
  renderTeacherOpsResult('商品已免費贈送給學生', [
    `學生：${saved.name || currentState.studentData?.name || '未命名學生'}`,
    `商品：${item.name}`,
    `效果：${item.effectType}`,
    `贈送：免費${item.price ? `（原定價 ${item.price} 金幣）` : ''}`,
    `憑證：${outcome.voucherId || '-'}`,
    `隱藏蛋：${outcome.hiddenEggId || '-'}`,
    ...verificationLines,
  ].join('\n'));
}

async function handleRedeemVoucher() {
  ensureStudentLoadedForTeacherOps();
  const voucherId = byId('redeemVoucherIdInput').value.trim();
  const saved = await redeemVoucherFromForm(voucherId, currentState.teacherUser?.uid || null);
  updateStudentSummary();
  const verificationLines = buildVoucherRedeemPersistenceLines(saved, { voucherId });
  renderTeacherOpsResult('已兌現實體商品憑證', [
    `學生：${saved.name || '未命名學生'}`,
    `憑證：${voucherId}`,
    ...verificationLines,
  ].join('\n'));
  showAlert(`已兌現憑證：${voucherId}`);
}

function getEntryStudentTokenFromUrl() {
  const rawHash = String(window.location.hash || '').trim();
  const rawSearch = window.location.search || '';
  const hashMatch = rawHash.match(/(?:#|&|\?)t=([^&]+)/i) || rawHash.match(/(?:#|&|\?)token=([^&]+)/i);
  if (hashMatch?.[1]) return decodeURIComponent(hashMatch[1]);
  const params = new URLSearchParams(rawSearch);
  return String(params.get('token') || params.get('t') || '').trim();
}

async function applyConvergedEntryFlow() {
  const token = getEntryStudentTokenFromUrl();
  const bridgeEl = byId('teacherStudentBridgePreview');
  if (token) {
    const student = await loadStudentByToken(token);
    currentState.currentToken = token;
    const tokenInput = byId('studentTokenBindInput');
    const tokenBadge = byId('studentCoreToken');
    if (tokenInput) tokenInput.value = token;
    if (tokenBadge) tokenBadge.textContent = token;
    updateStudentSummary();
    await syncStudentCorePanel();
    setActivePageTab('student-page');
    syncStudentFrontSwitcher('studentCoreSection');
    setActiveNavSection('studentCoreSection', { scroll: true });
    renderTeacherOpsResult('已依 NTAG / 學生網址進入學生端', [
      `學生：${student.name || '未命名學生'} (#${student.serial || student.card_seq || '-'})`,
      `token：${token}`,
      '入口：掃描已寫入學生網址的 NTAG → 學生端學生狀態頁',
      '可用內容：每日挑戰 / Boss / 養成狀態 / 收藏 / AI 對話',
    ].join('\n'));
    if (bridgeEl) bridgeEl.textContent = `老師端：登入封面 → 老師系統頁 → 查卡 / 掃卡 → 教師版學生狀態頁\n學生端：掃描已寫入網址的 NTAG → 學生狀態頁\n目前 token：${token}`;
    return;
  }
  setActivePageTab('teacher-entry');
  syncTeacherSystemSwitcher('teacherStudentOpsSection');
  syncStudentFrontSwitcher('studentCoreSection');
  setActiveNavSection('teacherAccessSection');
  if (bridgeEl) bridgeEl.textContent = '老師端：登入封面 → 老師系統頁 → 查卡號或掃描卡片 → 教師版學生狀態頁\n學生端：掃描已寫入網址的 NTAG → 學生端學生狀態頁';
}

function runStartupStep(label, fn) {
  try {
    const result = fn();
    if (result && typeof result.catch === 'function') {
      result.catch((error) => {
        console.error(`[startup] ${label} failed:`, error);
      });
    }
    return result;
  } catch (error) {
    console.error(`[startup] ${label} failed:`, error);
    return null;
  }
}

export function bootstrapApp() {
  runStartupStep('bindTeacherAuthState', () => bindTeacherAuthState(() => {
    updateTeacherOpsStatus();
    refreshTeacherGovernance();
  }));
  runStartupStep('populateTeacherScorePresets', () => populateTeacherScorePresets('general'));
  runStartupStep('renderLegacyActionBoard', () => renderLegacyActionBoard('general'));
  runStartupStep('updateLegacyFlowStrip', () => updateLegacyFlowStrip());
  runStartupStep('setTeacherOpPane', () => setTeacherOpPane('score'));
  runStartupStep('syncForgeModeFields', () => syncForgeModeFields());
  runStartupStep('populateBatchCardPresets', () => populateBatchCardPresets());
  runStartupStep('refreshForgeCardList', () => refreshForgeCardList());
  runStartupStep('updateStudentSummary', () => updateStudentSummary());
  runStartupStep('refreshTeacherGovernance', () => refreshTeacherGovernance());
  runStartupStep('updateLegacyCockpitSummary', () => updateLegacyCockpitSummary());
  runStartupStep('bindStudentCoreEvents', () => bindStudentCoreEvents());
  runStartupStep('bindFeedbackModal', () => bindFeedbackModal());
  runStartupStep('bindLegacyModal', () => bindLegacyModal());
  runStartupStep('bindBatchArena', () => bindBatchArena());
  runStartupStep('bindLegacyCockpitQuickActions', () => bindLegacyCockpitQuickActions());
  runStartupStep('bindTeacherOpTabs', () => bindTeacherOpTabs());
  runStartupStep('bindLegacyStyleNavigation', () => bindLegacyStyleNavigation());
  runStartupStep('bindSystemZoneTabs', () => bindSystemZoneTabs());
  runStartupStep('bindMainPageTabs', () => bindMainPageTabs());
  runStartupStep('bindTeacherSystemSwitcher', () => bindTeacherSystemSwitcher());
  runStartupStep('bindStudentFrontSwitcher', () => bindStudentFrontSwitcher());
  runStartupStep('applyConvergedEntryFlow', () => applyConvergedEntryFlow());
  runStartupStep('setupDashboardModals', () => setupDashboardModals());

  document.querySelectorAll('.legacy-panel-switch[data-action-panel]').forEach((button) => {
    button.addEventListener('click', () => {
      activateLegacyActionPanel(button.dataset.actionPanel || 'general');
      recordTeacherActivity();
    });
  });

  document.addEventListener('click', async (event) => {
    const actionButton = event.target instanceof Element ? event.target.closest('.legacy-action-btn[data-panel][data-attr][data-index]') : null;
    if (!actionButton) return;
    event.preventDefault();
    document.querySelectorAll('.legacy-action-btn.is-armed').forEach((button) => button.classList.remove('is-armed'));
    actionButton.classList.add('is-armed');
    try {
      await handleApplyLegacyPreset(actionButton.dataset.panel, actionButton.dataset.attr, Number(actionButton.dataset.index));
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('舊版事件套用失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '舊版事件套用失敗');
    }
  });
  ['scoreReasonInput','scoreValueInput','scoreAttrSelect'].forEach((id) => {
    byId(id)?.addEventListener('input', () => updateLegacyFlowStrip());
    byId(id)?.addEventListener('change', () => updateLegacyFlowStrip());
  });
  runStartupStep('syncBuildBadges', () => syncBuildBadges());
  runStartupStep('startBatchTicker', () => startBatchTicker());

  try {
    const savedAdminEmail = localStorage.getItem('adminEmail') || '';
    const teacherEmailInput = byId('teacherEmail');
    if (teacherEmailInput && savedAdminEmail) teacherEmailInput.value = savedAdminEmail;
  } catch (_) {}

  byId('teacherPassword')?.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    try {
      await handleTeacherLogin();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '老師登入失敗');
    }
  });

  ['click','keydown','pointerdown','touchstart'].forEach((eventName) => window.addEventListener(eventName, recordTeacherActivity, { passive: true }));

  on('btnTeacherLogin', 'click', async () => {
    try {
      await handleTeacherLogin();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '老師登入失敗');
    }
  });


  on('btnGoTeacherEntryFlow', 'click', () => {
    setActivePageTab('teacher-entry', { scroll: true });
    syncTeacherSystemSwitcher('teacherStudentOpsSection');
    setActiveNavSection('teacherAccessSection', { scroll: true });
  });

  on('btnGoStudentEntryFlow', 'click', () => {
    setActivePageTab('student-page', { scroll: true });
    syncStudentFrontSwitcher('studentCoreSection');
    setActiveNavSection('studentCoreSection', { scroll: true });
  });

  on('btnTeacherLogout', 'click', async () => {
    try {
      await teacherLogout();
    } catch (error) {
      console.warn('[dashboard] teacher logout fallback:', error);
    } finally {
      stopTeacherIdleGuard();
      clearTeacherSensitiveState();
      updateStudentSummary();
      renderTeacherOpsResult('已登出', '已清除 session、目前學生快取、批量模式狀態與 token 暫存。');
      showAlert('已登出');
      updateTeacherOpsStatus();
      window.setTimeout(() => {
        window.location.href = './login.html';
      }, 180);
    }
  });

  on('btnRefreshSupportZone', 'click', () => {
    try {
      ensureStudentLoadedForTeacherOps();
      refreshSpecialZoneReports();
      renderTeacherOpsResult('學習輔助摘要已更新', byId('supportZoneReportText')?.textContent || '已更新');
    } catch (error) {
      showAlert(error?.message || String(error), '學習輔助摘要更新失敗');
    }
  });

  on('btnCopySupportZone', 'click', async () => {
    try {
      ensureStudentLoadedForTeacherOps();
      await copyTextToClipboard(byId('supportZoneReportText')?.textContent || '');
      renderTeacherOpsResult('學習輔助摘要已複製', byId('supportZoneReportText')?.textContent || '');
    } catch (error) {
      showAlert(error?.message || String(error), '複製學習輔助摘要失敗');
    }
  });

  on('btnRefreshScienceZone', 'click', () => {
    try {
      ensureStudentLoadedForTeacherOps();
      refreshSpecialZoneReports();
      renderTeacherOpsResult('科展摘要已更新', byId('scienceZoneReportText')?.textContent || '已更新');
    } catch (error) {
      showAlert(error?.message || String(error), '科展摘要更新失敗');
    }
  });

  on('btnCopyScienceZone', 'click', async () => {
    try {
      ensureStudentLoadedForTeacherOps();
      await copyTextToClipboard(byId('scienceZoneReportText')?.textContent || '');
      renderTeacherOpsResult('科展摘要已複製', byId('scienceZoneReportText')?.textContent || '');
    } catch (error) {
      showAlert(error?.message || String(error), '複製科展摘要失敗');
    }
  });

  on('btnLoadStudent', 'click', async () => {
    try {
      await handleLoadStudent();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '載入學生失敗');
    }
  });

  on('btnLoadByNtag', 'click', async () => {
    try {
      await handleLoadStudentByNtag();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), 'ntag 載入失敗');
    }
  });

  on('btnLoadByToken', 'click', async () => {
    try {
      await handleLoadStudentByToken();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), 'token 載入失敗');
    }
  });

  on('btnRename', 'click', async () => {
    try {
      await handleRename();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '改名失敗');
    }
  });

  on('btnSaveGuideMode', 'click', async () => {
    try {
      await handleSaveGuideMode();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '儲存 AI 夥伴失敗');
    }
  });

  on('btnPreviewScore', 'click', async () => {
    try {
      await handlePreviewScore();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '預覽加分失敗');
    }
  });

  on('btnApplyScoreDirect', 'click', async () => {
    try {
      await handleApplyScoreDirect();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('直接入帳失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '直接入帳失敗');
    }
  });

  on('btnConfirmScore', 'click', async () => {
    try {
      await handleConfirmScore();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '加分失敗');
    }
  });

  on('btnCancelScore', 'click', () => {
    hidePreview();
  });

  on('btnApplyStatus', 'click', async () => {
    try {
      await handleApplyStatus();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('寫入狀態失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '寫入狀態失敗');
    }
  });


  on('btnBatchToggleMode', 'click', () => {
    try {
      handleToggleBatchScanMode();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('掃描模式切換失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '掃描模式切換失敗');
    }
  });

  on('btnBatchScanStudent', 'click', async () => {
    try {
      await handleBatchScanStudent();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('批量掃描開啟失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '批量掃描開啟失敗');
    }
  });

  on('btnBatchProcessSignal', 'click', async () => {
    try {
      await handleBatchScanSignal({ fromArena: false });
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('批量掃描碼處理失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '批量掃描失敗');
    }
  });

  on('btnApplyBatchCard', 'click', async () => {
    try {
      await handleApplyBatchCard();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('批量掃描套用失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '批量掃描套用失敗');
    }
  });

  ['batchScanStudentInput', 'batchScanSignalInput'].forEach((id) => {
    on(id, 'keydown', async (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      try {
        if (id === 'batchScanSignalInput') await handleBatchScanSignal({ fromArena: false });
        else await handleBatchScanStudent();
        recordTeacherActivity();
      } catch (error) {
        renderTeacherOpsResult('批量掃描輸入失敗', error?.message || String(error));
        showAlert(error?.message || String(error), '批量掃描失敗');
      }
    });
  });


  byId('forgeModeSelect')?.addEventListener('change', () => {
    syncForgeModeFields();
  });

  byId('cardAdminNtagInput')?.addEventListener('input', () => {
    renderCardWorkflowPreview();
    renderCardActionStrip();
    renderCardFieldCheck();
  });

  byId('cardWorkflowSerialInput')?.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    try {
      await handleCardWorkflowLookup();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('依卡序查找補卡學生失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '補卡查找失敗');
    }
  });


  byId('btnReadCardAdminUid')?.addEventListener('click', async () => {
    try {
      await handleReadCardAdminUid();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('讀取補卡新卡 UID 失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '讀取補卡新卡 UID 失敗');
    }
  });

  byId('btnReadNewCardUid')?.addEventListener('click', async () => {
    try {
      await handleReadNewCardUid();
      recordTeacherActivity();
    } catch (error) {
      renderNewCardRegistrationResult('讀取新卡 UID 失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '讀取新卡 UID 失敗');
    }
  });

  byId('btnRegisterNewCard')?.addEventListener('click', async () => {
    try {
      await handleRegisterNewCard({ writeNfc: false });
      recordTeacherActivity();
    } catch (error) {
      renderNewCardRegistrationResult('新卡註冊 / 發卡失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '新卡註冊失敗');
    }
  });

  byId('btnRegisterNewCardAndWriteNfc')?.addEventListener('click', async () => {
    try {
      await handleRegisterNewCard({ writeNfc: true });
      recordTeacherActivity();
    } catch (error) {
      renderNewCardRegistrationResult('新卡註冊並寫入 NFC 失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '新卡註冊 / NFC 寫入失敗');
    }
  });

  byId('btnCardWorkflowLookup')?.addEventListener('click', async () => {
    try {
      await handleCardWorkflowLookup();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('依卡序查找補卡學生失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '補卡查找失敗');
    }
  });

  byId('btnRefreshTokenSummary')?.addEventListener('click', async () => {
    try {
      await renderTokenSummary();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '卡務摘要讀取失敗');
    }
  });

  byId('btnPreviewCardWorkflow')?.addEventListener('click', async () => {
    try {
      await handlePreviewCardWorkflow();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('卡務流程預覽失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '卡務預覽失敗');
    }
  });

  byId('btnRunCardWorkflow')?.addEventListener('click', async () => {
    try {
      await handleRunCardWorkflow();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('補卡 / 重綁失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '卡務執行失敗');
    }
  });

  byId('btnCopyCardWorkflow')?.addEventListener('click', async () => {
    try {
      await handleCopyCardWorkflow();
      recordTeacherActivity();
      showAlert('已複製卡務摘要');
    } catch (error) {
      showAlert(error?.message || String(error), '複製卡務摘要失敗');
    }
  });

  byId('btnRefreshCardActionStrip')?.addEventListener('click', async () => {
    try {
      const summary = await renderTokenSummary();
      renderCardActionStrip(summary);
      recordTeacherActivity();
      showAlert('已更新卡務步驟板');
    } catch (error) {
      showAlert(error?.message || String(error), '卡務步驟板更新失敗');
    }
  });

  byId('btnCopyCardActionStrip')?.addEventListener('click', async () => {
    try {
      await handleCopyCardActionStrip();
      recordTeacherActivity();
      showAlert('已複製卡務步驟板');
    } catch (error) {
      showAlert(error?.message || String(error), '複製卡務步驟板失敗');
    }
  });

  byId('btnRefreshCardFieldCheck')?.addEventListener('click', async () => {
    try {
      const summary = await renderTokenSummary();
      renderCardActionStrip(summary);
      renderCardFieldCheck(summary);
      recordTeacherActivity();
      showAlert('已更新卡務現場確認');
    } catch (error) {
      showAlert(error?.message || String(error), '卡務現場確認更新失敗');
    }
  });

  byId('btnCopyCardFieldCheck')?.addEventListener('click', async () => {
    try {
      await handleCopyCardFieldCheck();
      recordTeacherActivity();
      showAlert('已複製卡務現場確認');
    } catch (error) {
      showAlert(error?.message || String(error), '複製卡務現場確認失敗');
    }
  });

  byId('btnRefreshBatchResultBoard')?.addEventListener('click', () => {
    try {
      renderBatchResultBoard();
      recordTeacherActivity();
      showAlert('已更新成功回饋板');
    } catch (error) {
      showAlert(error?.message || String(error), '成功回饋板更新失敗');
    }
  });

  byId('btnCopyBatchResultBoard')?.addEventListener('click', async () => {
    try {
      await handleCopyBatchResultBoard();
      recordTeacherActivity();
      showAlert('已複製成功回饋板');
    } catch (error) {
      showAlert(error?.message || String(error), '複製成功回饋板失敗');
    }
  });

  byId('btnRefreshBatchAudit')?.addEventListener('click', () => {
    try {
      renderBatchAuditPreview();
      renderTeacherOpsResult('批量盤查已更新', byId('batchAuditText')?.textContent || '已更新');
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '批量盤查更新失敗');
    }
  });

  byId('btnResetBatchCycle')?.addEventListener('click', () => {
    try {
      handleResetBatchCycle();
      recordTeacherActivity();
      showAlert('已清除目前批量循環');
    } catch (error) {
      showAlert(error?.message || String(error), '清除批量循環失敗');
    }
  });

  byId('btnCopyBatchAudit')?.addEventListener('click', async () => {
    try {
      await handleCopyBatchAudit();
      recordTeacherActivity();
      showAlert('已複製批量盤查');
    } catch (error) {
      showAlert(error?.message || String(error), '複製批量盤查失敗');
    }
  });

  byId('btnRefreshBatchFieldCheck')?.addEventListener('click', () => {
    try {
      renderBatchFieldCheck();
      recordTeacherActivity();
      showAlert('已更新批量現場確認');
    } catch (error) {
      showAlert(error?.message || String(error), '批量現場確認更新失敗');
    }
  });

  byId('btnCopyBatchFieldCheck')?.addEventListener('click', async () => {
    try {
      await handleCopyBatchFieldCheck();
      recordTeacherActivity();
      showAlert('已複製批量現場確認');
    } catch (error) {
      showAlert(error?.message || String(error), '複製批量現場確認失敗');
    }
  });

  byId('btnReissueToken')?.addEventListener('click', async () => {
    try {
      await handleReissueToken();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('補發 token 失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '補發 token 失敗');
    }
  });

  byId('btnDeactivateToken')?.addEventListener('click', async () => {
    try {
      await handleDeactivateToken();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('停用 token 失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '停用 token 失敗');
    }
  });

  byId('btnBindNtag')?.addEventListener('click', async () => {
    try {
      await handleBindNtag();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('綁定 ntag 失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '綁定 ntag 失敗');
    }
  });

  byId('btnSaveForgeCard')?.addEventListener('click', async () => {
    try {
      await handleSaveForgeCard();
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('建立道具卡失敗', error?.message || String(error));
      showAlert(error?.message || String(error), '建立道具卡失敗');
    }
  });

  byId('btnOpenTeacherActionModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '老師操作總覽', kicker: 'Teacher Console', html: buildLegacyStudentInfoHtml() });
    recordTeacherActivity();
  });

  byId('btnOpenScoreModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '舊版式加分視窗', kicker: 'Teacher Score', html: buildScoreModalHtml() });
    recordTeacherActivity();
  });

  byId('btnOpenStatusModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '狀態 / 學習問題視窗', kicker: 'Teacher Status', html: buildStatusModalHtml() });
    recordTeacherActivity();
  });

  byId('btnOpenLogsModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '事件紀錄視窗', kicker: 'Teacher Logs', html: buildLogsModalHtml() });
    recordTeacherActivity();
  });

  byId('btnOpenBatchModal')?.addEventListener('click', () => {
    openBatchArena();
    recordTeacherActivity();
  });

  byId('btnOpenCardAdminModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '卡務 / 補卡視窗', kicker: 'Card Admin', html: buildCardAdminModalHtml() });
    recordTeacherActivity();
  });

  byId('btnOpenForgeModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '道具卡鑄造視窗', kicker: 'Item Forge', html: buildForgeModalHtml() });
    recordTeacherActivity();
  });

  const openStudentPreview = () => {
    openLegacyModal({ title: '學生正式頁預覽', kicker: 'Student Front', html: buildStudentModalHtml() });
    recordTeacherActivity();
  };

  byId('btnOpenStudentModal')?.addEventListener('click', openStudentPreview);
  byId('btnOpenStudentFrontPreview')?.addEventListener('click', openStudentPreview);
  byId('btnOpenTeacherStudentBridge')?.addEventListener('click', () => {
    openLegacyModal({ title: '正式入口規則 / 師生同步總覽', kicker: 'Entry Sync Preview', html: buildTeacherStudentBridgeHtml() });
  });

  byId('btnRefreshForgeCards')?.addEventListener('click', async () => {
    try {
      await refreshForgeCardList();
  await refreshSystemZoneLists();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '重載道具卡失敗');
    }
  });

  byId('btnSaveShopConfig')?.addEventListener('click', async () => {
    try {
      await handleSaveShopConfig();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '商品設定失敗');
    }
  });

  byId('btnDeployAzureKirinEgg')?.addEventListener('click', async () => {
    try {
      await handleDeployAzureKirinEgg();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '隱藏蛋部署失敗');
    }
  });

  byId('btnRefreshShopConfig')?.addEventListener('click', async () => {
    try {
      await refreshSystemZoneLists();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '商品清單讀取失敗');
    }
  });

  byId('btnSaveBossConfig')?.addEventListener('click', async () => {
    try {
      await handleSaveBossConfig();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), 'Boss 設定失敗');
    }
  });

  byId('btnRefreshBossConfig')?.addEventListener('click', async () => {
    try {
      await refreshSystemZoneLists();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), 'Boss 清單讀取失敗');
    }
  });

  byId('bossConfigQuestionSetSelect')?.addEventListener('change', (event) => {
    if (byId('bossConfigQuestionSetInput')) byId('bossConfigQuestionSetInput').value = event.target?.value || '';
  });
  byId('questionSetAudienceSelect')?.addEventListener('change', () => { syncGradeLabelFromSelectors(true); syncQuestionSetNameFromInputs(true); });
  byId('questionSetSemesterSelect')?.addEventListener('change', () => { syncGradeLabelFromSelectors(true); syncQuestionSetNameFromInputs(true); });
  byId('questionSetGradeInput')?.addEventListener('change', () => syncQuestionSetNameFromInputs(false));
  byId('questionSetUnitInput')?.addEventListener('change', () => syncQuestionSetNameFromInputs(false));
  byId('questionSetModeSelect')?.addEventListener('change', () => syncQuestionSetNameFromInputs(false));
  byId('btnLoadQuizTemplate')?.addEventListener('click', loadQuizBulkTemplate);
  byId('btnFillQuestionSetName')?.addEventListener('click', () => {
    syncQuestionSetNameFromInputs(true);
    renderTeacherOpsResult('已回填題庫名稱', byId('questionSetNameInput')?.value || '');
  });

  byId('btnSaveQuestionSet')?.addEventListener('click', async () => {
    try {
      await handleSaveQuestionSet();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '題庫設定失敗');
    }
  });

  byId('btnImportQuestionBulk')?.addEventListener('click', async () => {
    try {
      await handleImportQuestionBulk();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '批量題庫匯入失敗');
    }
  });

  byId('btnRefreshQuestionSet')?.addEventListener('click', async () => {
    try {
      await refreshSystemZoneLists();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '題庫清單讀取失敗');
    }
  });

  byId('btnClearQuizEditor')?.addEventListener('click', () => {
    clearQuizEditor();
  });

  byId('btnApplyQuizFilter')?.addEventListener('click', () => {
    try {
      handleApplyQuizFilter();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '題庫篩選失敗');
    }
  });

  byId('btnResetQuizFilter')?.addEventListener('click', () => {
    try {
      handleResetQuizFilter();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '清除題庫篩選失敗');
    }
  });

  byId('btnLoadSelectedQuiz')?.addEventListener('click', () => {
    try {
      loadSelectedQuizIntoEditor();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '載入題目失敗');
    }
  });

  byId('btnToggleSelectedQuiz')?.addEventListener('click', async () => {
    try {
      await handleToggleSelectedQuiz();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '切換題目狀態失敗');
    }
  });

  byId('btnDeleteSelectedQuiz')?.addEventListener('click', async () => {
    try {
      await handleDeleteSelectedQuiz();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '刪除題目失敗');
    }
  });

  byId('btnExportQuizTsv')?.addEventListener('click', () => {
    try {
      handleExportQuizTsv();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '匯出題庫失敗');
    }
  });

  byId('btnPreviewBatchAdmin')?.addEventListener('click', async () => {
    try {
      await handlePreviewBatchAdmin();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '批次預覽失敗');
    }
  });

  byId('btnRunBatchAdmin')?.addEventListener('click', async () => {
    try {
      await handleRunBatchAdmin();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '批次調整失敗');
    }
  });

  byId('btnOpenSystemSummaryModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '老師獨立系統區總覽', kicker: 'System Zone', html: buildSystemZoneSummaryHtml() });
    recordTeacherActivity();
  });

  byId('btnOpenShopConfigModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '商品設置視窗', kicker: 'Shop Config', html: buildShopConfigModalHtml() });
    recordTeacherActivity();
  });

  byId('btnOpenBossConfigModal')?.addEventListener('click', () => {
    openLegacyModal({ title: 'Boss 設置視窗', kicker: 'Boss Config', html: buildBossConfigModalHtml() });
    recordTeacherActivity();
  });

  byId('btnOpenQuestionSetModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '題庫 / 命題視窗', kicker: 'Question Sets', html: buildQuestionSetModalHtml() });
    recordTeacherActivity();
  });

  byId('btnOpenBatchAdminModal')?.addEventListener('click', () => {
    openLegacyModal({ title: '批次調整視窗', kicker: 'Batch Admin', html: buildBatchAdminModalHtml() });
    recordTeacherActivity();
  });

  on('btnAskGuide', 'click', async () => {
    try {
      await handleAskGuide();
    } catch (error) {
      showAlert(error?.message || String(error), 'AI 對話失敗');
    }
  });

  on('btnRunBatch', 'click', async () => {
    try {
      await handleRunBatch();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '批量加分失敗');
      updateTeacherOpsStatus();
    }
  });

  on('btnBuyPhysicalReward', 'click', async () => {
    try {
      await handleBuyPhysicalReward();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '購買實體商品失敗');
    }
  });

  byId('btnRefreshTeacherShopCatalog')?.addEventListener('click', async () => {
    try {
      await refreshTeacherShopCatalog();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '載入商品清單失敗');
    }
  });

  byId('btnBuyCatalogItem')?.addEventListener('click', async () => {
    try {
      await handleBuyCatalogItem();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '商品套用失敗');
    }
  });

  on('btnRedeemVoucher', 'click', async () => {
    try {
      await handleRedeemVoucher();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '兌現憑證失敗');
    }
  });

  byId('btnCopyStudentUrl')?.addEventListener('click', async () => {
    try {
      ensureStudentLoadedForTeacherOps();
      const url = buildStudentPageUrl();
      if (!url) throw new Error('目前學生沒有 active token，請先補發或載入有效 token');
      await copyTextToClipboard(url);
      renderTeacherOpsResult('已複製學生頁網址', [`學生：${currentState.studentData?.name || '未命名學生'}`, `網址：${url}`, '用途：可貼到 NFC 工具或提供老師備援寫卡'].join('\n'));
      renderTeacherNtagPanel();
      showAlert('已複製學生頁網址');
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '複製學生頁網址失敗');
    }
  });

  byId('btnWriteStudentNfc')?.addEventListener('click', async () => {
    try {
      ensureStudentLoadedForTeacherOps();
      const url = buildStudentPageUrl();
      if (!url) throw new Error('目前學生沒有 active token，請先補發或載入有效 token');
      await writeStudentUrlToNfc(url);
      renderTeacherOpsResult('已寫入學生頁網址到 NFC', [`學生：${currentState.studentData?.name || '未命名學生'}`, `網址：${url}`, 'NFC：寫入完成，可直接用學生卡開啟學生正式頁'].join('\n'));
      renderTeacherNtagPanel();
      showAlert('學生頁網址已寫入 NFC');
      recordTeacherActivity();
    } catch (error) {
      renderTeacherOpsResult('寫入學生頁網址到 NFC 失敗', error?.message || String(error));
      showAlert(error?.message || String(error), 'NFC 寫入失敗');
    }
  });

  byId('btnRefreshNtagPanel')?.addEventListener('click', () => {
    try {
      renderTeacherNtagPanel();
      recordTeacherActivity();
    } catch (error) {
      showAlert(error?.message || String(error), '刷新 NFC 摘要失敗');
    }
  });
}
