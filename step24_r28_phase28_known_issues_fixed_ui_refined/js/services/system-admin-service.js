import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { COLLECTIONS, LEGACY_DOCS } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';
import { db } from './firebase.js?v=step24-r28-card-batch-workflow-20260312h';
import { applyDataMigration, fetchStudentBySerial, saveStudentData } from './student-service.js?v=step24-r28-card-batch-workflow-20260312h';
import { normalizeSerial } from '../domain/serial.js?v=step24-r28-card-batch-workflow-20260312h';
import { safeJsonParse } from '../utils/runtime-safety.js?v=step24-r28-card-batch-workflow-20260312h';

const LEGACY_GRADE_ORDER = ['1上', '1下', '2上', '2下', '3上', '3下', '4上', '4下', '5上', '5下', '6上', '6下', '學習扶助班'];
const LEGACY_BOSS_DOC_ID = LEGACY_DOCS.bossRuntime;
const LEGACY_QSET_META_DOC_ID = LEGACY_DOCS.quizGroupMeta;
const LEGACY_GOVERNANCE_DOC_ID = LEGACY_DOCS.quizGovernance || LEGACY_QSET_META_DOC_ID;

const QUIZ_AUDIENCE_META = {
  grade3: { id: 'grade3', label: '三年級', order: 3 },
  grade4: { id: 'grade4', label: '四年級', order: 4 },
  grade5: { id: 'grade5', label: '五年級', order: 5 },
  grade6: { id: 'grade6', label: '六年級', order: 6 },
  support: { id: 'support', label: '學習扶助', order: 99 },
};

function normalizeAudience(value) {
  const safe = String(value || '').trim();
  if (/學習扶助/.test(safe) || safe === 'support') return 'support';
  const match = safe.match(/[3456]/);
  if (match?.[0]) return `grade${match[0]}`;
  return safe || '';
}

function normalizeSemester(value) {
  const safe = String(value || '').trim();
  return safe === '下' ? '下' : '上';
}

function buildGradeLabel(audience, semester) {
  const aud = normalizeAudience(audience);
  if (aud === 'support') return '學習扶助班';
  const num = String(aud || '').replace(/^grade/, '');
  return num ? `${num}${normalizeSemester(semester)}` : '';
}

function deriveAudienceSemesterFromGrade(value) {
  const safe = String(value || '').trim();
  if (!safe) return { audience: '', semester: '上', gradeLabel: '' };
  if (/學習扶助/.test(safe)) return { audience: 'support', semester: '上', gradeLabel: '學習扶助班' };
  const match = safe.match(/([3456]).*?(上|下)?/);
  const audience = match?.[1] ? `grade${match[1]}` : normalizeAudience(safe);
  const semester = normalizeSemester(match?.[2] || '上');
  return { audience, semester, gradeLabel: safe || buildGradeLabel(audience, semester) };
}

function buildQuestionSetId({ audience = '', semester = '上', unit = '', mode = 'daily' } = {}) {
  return [normalizeAudience(audience), normalizeSemester(semester), String(unit || '').trim().toUpperCase(), String(mode || 'daily').trim() || 'daily'].filter(Boolean).join('__');
}

function normalizeEmailList(values = []) {
  const source = Array.isArray(values) ? values : String(values || '').split(/[\n,;]+/);
  const out = [];
  const seen = new Set();
  source.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean).forEach((item) => {
    if (seen.has(item)) return;
    seen.add(item);
    out.push(item);
  });
  return out;
}

function normalizeDeleteRequest(id, row = {}) {
  return {
    id: String(id || row.id || row.quizId || '').trim(),
    quizId: String(row.quizId || id || '').trim(),
    question: String(row.question || '').trim(),
    requestedBy: String(row.requestedBy || '').trim(),
    requestedByUid: String(row.requestedByUid || '').trim(),
    requestedAt: Number(row.requestedAt || row.updatedAt || 0) || Date.now(),
    status: String(row.status || 'pending').trim() || 'pending',
    approvedBy: String(row.approvedBy || '').trim(),
    approvedAt: Number(row.approvedAt || 0) || 0,
  };
}

const SHOP_BUILTIN_PRESETS = {
  azure_kirin_egg: {
    id: 'azure_kirin_egg',
    name: '🌊 碧瀾麒麟蛋',
    desc: '購買後會進入孵化紀錄；沿用原本的經驗累積與進化節奏，最終可轉化為水屬性隱藏異獸「碧瀾麒麟」，提供 100 點隱藏積分。',
    cost: 100,
    quantity: null,
    active: true,
    effectType: 'hidden_egg',
    hiddenEggId: 'azure_kirin',
    builtIn: true,
  },
};

function randomId(prefix = 'cfg') {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `${prefix}_${Array.from(bytes, (n) => chars[n % chars.length]).join('')}`;
}

function normalizeGrade(value) {
  return String(value || '').trim();
}

function normalizeShopItem(id, row = {}) {
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

function buildShopPayload({
  id = null,
  name,
  price,
  description = '',
  active = true,
  minGrade = '',
  requiredTitle = '',
  voucherOnly = true,
  effectType = 'physical_reward',
  hiddenEggId = '',
  quantity = null,
  actorUid = null,
} = {}) {
  const safeName = String(name || '').trim();
  const safePrice = Math.max(0, Number(price) || 0);
  if (!safeName) throw new Error('請輸入商品名稱');
  if (safePrice <= 0) throw new Error('商品價格必須大於 0');
  if (String(effectType) === 'hidden_egg' && !String(hiddenEggId || '').trim()) throw new Error('隱藏蛋商品必須指定 hiddenEggId');
  const itemId = String(id || randomId('shop')).trim();
  return {
    id: itemId,
    name: safeName,
    price: safePrice,
    cost: safePrice,
    description: String(description || '').trim(),
    desc: String(description || '').trim(),
    active: active !== false,
    minGrade: normalizeGrade(minGrade),
    requiredTitle: String(requiredTitle || '').trim(),
    voucherOnly: voucherOnly !== false,
    effectType: String(effectType || 'physical_reward').trim() || 'physical_reward',
    hiddenEggId: String(hiddenEggId || '').trim(),
    quantity: quantity === null || quantity === undefined || quantity === '' ? null : Math.max(0, Number(quantity) || 0),
    updatedAt: Date.now(),
    updatedBy: actorUid || null,
    serverUpdatedAt: serverTimestamp(),
  };
}

export async function saveShopCatalogItem(args = {}) {
  const payload = buildShopPayload(args);
  const ref = doc(db, COLLECTIONS.shopCatalog, payload.id);
  const current = await getDoc(ref);
  const createdAt = current.exists() ? (current.data()?.createdAt || Date.now()) : Date.now();
  await setDoc(ref, { ...payload, createdAt }, { merge: true });
  return payload;
}

export async function deployBuiltInShopPreset(presetId, actorUid = null) {
  const preset = SHOP_BUILTIN_PRESETS[String(presetId || '').trim()];
  if (!preset) throw new Error('找不到指定的內建商品預設');
  return saveShopCatalogItem({
    id: preset.id,
    name: preset.name,
    price: preset.cost,
    description: preset.desc,
    active: true,
    voucherOnly: false,
    effectType: preset.effectType,
    hiddenEggId: preset.hiddenEggId,
    quantity: preset.quantity,
    actorUid,
  });
}

export async function listShopCatalogItems() {
  const qs = await getDocs(query(collection(db, COLLECTIONS.shopCatalog), orderBy('updatedAt', 'desc'), limit(100)));
  const rows = qs.docs.map((snap) => normalizeShopItem(snap.id, snap.data()));
  return rows;
}

export function listBuiltInShopPresets() {
  return Object.values(SHOP_BUILTIN_PRESETS).map((row) => normalizeShopItem(row.id, row));
}


function normalizeLegacyQuestionSetRow(id, row = {}) {
  const derived = deriveAudienceSemesterFromGrade(row.grade || row.gradeLabel || row.audience || '');
  const audience = normalizeAudience(row.audience || derived.audience);
  const semester = normalizeSemester(row.semester || derived.semester || '上');
  const gradeLabel = String(row.gradeLabel || row.grade || buildGradeLabel(audience, semester)).trim();
  return {
    id: String(id || row.id || row.questionSetId || '').trim(),
    questionSetId: String(row.questionSetId || id || row.id || '').trim(),
    name: String(row.name || '').trim() || [QUIZ_AUDIENCE_META[audience]?.label || gradeLabel || '未分類', `${semester}學期`, String(row.unit || '').trim()].filter(Boolean).join(' '),
    audience,
    semester,
    grade: gradeLabel,
    gradeLabel,
    unit: String(row.unit || '').trim().toUpperCase(),
    className: String(row.className || '').trim(),
    mode: ['daily', 'boss', 'helper'].includes(String(row.mode || '').trim()) ? String(row.mode || '').trim() : 'daily',
    updatedAt: Number(row.updatedAt) || Number(row.timestamp) || 0,
  };
}

export async function saveBossConfig({
  id = null,
  name,
  attrKey,
  questionSetId,
  active = true,
  actorUid = null,
} = {}) {
  const safeName = String(name || '').trim();
  const safeAttr = String(attrKey || '').trim();
  const safeQuestionSetId = String(questionSetId || '').trim();
  if (!safeName) throw new Error('請輸入 Boss 名稱');
  if (!safeAttr) throw new Error('請選擇 Boss 屬性');
  if (!safeQuestionSetId) throw new Error('請輸入題庫 ID');
  const bossId = String(id || randomId('boss')).trim();
  const payload = {
    id: bossId,
    bossId,
    name: safeName,
    attrKey: safeAttr,
    typeKey: safeAttr,
    questionSetId: safeQuestionSetId,
    gatekeeperQuizId: safeQuestionSetId,
    active: active !== false,
    updatedAt: Date.now(),
    updatedBy: actorUid || null,
  };
  const ref = doc(db, COLLECTIONS.quizBank, LEGACY_BOSS_DOC_ID);
  const snap = await getDoc(ref);
  const base = snap.exists() ? (snap.data() || {}) : {};
  const current = base.v2BossConfigs && typeof base.v2BossConfigs === 'object' ? base.v2BossConfigs : {};
  current[bossId] = payload;
  await setDoc(ref, { ...base, v2BossConfigs: current, updatedAt: Date.now() }, { merge: true });
  return payload;
}

export async function listBossConfigs() {
  const ref = doc(db, COLLECTIONS.quizBank, LEGACY_BOSS_DOC_ID);
  const snap = await getDoc(ref).catch(() => null);
  const data = snap && snap.exists() ? (snap.data() || {}) : {};
  const rowMap = new Map();
  const pushRow = (raw = {}, fallbackId = '') => {
    const normalized = {
      id: String(fallbackId || raw?.id || raw?.bossId || '').trim(),
      name: String(raw?.name || '未命名 Boss').trim(),
      attrKey: String(raw?.attrKey || raw?.typeKey || 'fire').trim(),
      questionSetId: String(raw?.questionSetId || raw?.gatekeeperQuizId || '').trim(),
      active: raw?.active !== false,
      updatedAt: Number(raw?.updatedAt) || Number(raw?.timestamp) || 0,
    };
    if (!normalized.id) return;
    const current = rowMap.get(normalized.id);
    if (!current || normalized.updatedAt >= current.updatedAt) rowMap.set(normalized.id, normalized);
  };

  const map = data.v2BossConfigs && typeof data.v2BossConfigs === 'object' ? data.v2BossConfigs : {};
  Object.entries(map).forEach(([id, row]) => pushRow(row, id));

  const legacyList = Array.isArray(data.bosses) ? data.bosses : [];
  legacyList.forEach((row, idx) => pushRow(row, `legacy_boss_${idx + 1}`));

  if (!rowMap.size && data && (data.name || data.bossId || data.id)) {
    pushRow(data, 'legacy_boss');
  }
  return Array.from(rowMap.values()).sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
}

export async function saveQuestionSetConfig({
  id = null,
  name,
  grade,
  audience = '',
  semester = '上',
  unit = '',
  className = '',
  mode = 'daily',
  actorUid = null,
} = {}) {
  const derived = deriveAudienceSemesterFromGrade(grade);
  const safeAudience = normalizeAudience(audience || derived.audience || grade);
  const safeSemester = normalizeSemester(semester || derived.semester || '上');
  const safeGrade = String(grade || derived.gradeLabel || buildGradeLabel(safeAudience, safeSemester)).trim();
  const safeUnit = String(unit || '').trim().toUpperCase();
  const safeMode = ['daily', 'boss', 'helper'].includes(String(mode || '').trim()) ? String(mode || '').trim() : 'daily';
  if (!safeAudience) throw new Error('請選擇年級群組');
  if (!safeUnit) throw new Error('請輸入單元');
  const questionSetId = String(id || buildQuestionSetId({ audience: safeAudience, semester: safeSemester, unit: safeUnit, mode: safeMode })).trim();
  const payload = {
    id: questionSetId,
    questionSetId,
    name: String(name || '').trim() || [QUIZ_AUDIENCE_META[safeAudience]?.label || safeGrade, `${safeSemester}學期`, safeUnit, safeMode === 'boss' ? 'Boss' : (safeMode === 'helper' ? '學習扶助' : '每日訓練')].filter(Boolean).join(' '),
    audience: safeAudience,
    semester: safeSemester,
    grade: safeGrade,
    gradeLabel: safeGrade,
    unit: safeUnit,
    className: String(className || '').trim(),
    mode: safeMode,
    gatekeeperQuizId: questionSetId,
    updatedAt: Date.now(),
    updatedBy: actorUid || null,
  };
  const ref = doc(db, COLLECTIONS.quizBank, LEGACY_QSET_META_DOC_ID);
  const snap = await getDoc(ref);
  const base = snap.exists() ? (snap.data() || {}) : {};
  const groups = base.groups && typeof base.groups === 'object' ? base.groups : {};
  groups[questionSetId] = payload;
  await setDoc(ref, { ...base, groups, updatedAt: Date.now() }, { merge: true });
  return payload;
}

export async function listQuestionSetConfigs() {
  const [metaSnap, quizRows] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.quizBank, LEGACY_QSET_META_DOC_ID)).catch(() => null),
    listQuizBankEntries().catch(() => []),
  ]);
  const out = new Map();
  if (metaSnap && metaSnap.exists()) {
    const data = metaSnap.data() || {};
    const groups = data.groups && typeof data.groups === 'object' ? data.groups : {};
    Object.entries(groups).forEach(([id, row]) => {
      const normalized = normalizeLegacyQuestionSetRow(id, row);
      if (normalized.grade && normalized.unit) out.set(normalized.id, normalized);
    });
  }
  quizRows.forEach((row) => {
    const normalized = normalizeQuizRow('', row);
    if (!normalized.grade || !normalized.unit) return;
    const derivedId = normalized.questionSetId || buildQuestionSetId({ audience: normalized.audience, semester: normalized.semester, unit: normalized.unit, mode: normalized.mode });
    if (!out.has(derivedId)) {
      out.set(derivedId, normalizeLegacyQuestionSetRow(derivedId, {
        id: derivedId,
        questionSetId: derivedId,
        name: `${normalized.grade} ${normalized.unit}`.trim(),
        grade: normalized.grade,
        audience: normalized.audience,
        semester: normalized.semester,
        unit: normalized.unit,
        className: '',
        mode: normalized.mode,
        updatedAt: Number(normalized.updatedAt) || Number(normalized.timestamp) || 0,
      }));
    }
  });
  return Array.from(out.values()).sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
}

function normalizeQuizOptions(options = [], answerIndex = 0) {
  return options.slice(0, 4).map((opt, idx) => {
    if (typeof opt === 'string') return { text: opt.trim(), isCorrect: idx === answerIndex };
    const text = String(opt?.text || '').trim();
    const isCorrect = typeof opt?.isCorrect === 'boolean' ? opt.isCorrect : idx === answerIndex;
    return { text, isCorrect };
  });
}

function normalizeQuizRow(id, row = {}) {
  const options = Array.isArray(row.options) ? row.options : [];
  let answerIndex = options.findIndex((opt) => !!opt?.isCorrect);
  if (answerIndex < 0) {
    const answerRaw = Number(row.answer);
    if (Number.isFinite(answerRaw)) answerIndex = answerRaw >= 1 ? answerRaw - 1 : answerRaw;
  }
  if (answerIndex < 0) answerIndex = 0;
  const normalized = normalizeQuizOptions(options.length ? options : [row.option1, row.option2, row.option3, row.option4], answerIndex);
  const derived = deriveAudienceSemesterFromGrade(row.grade || row.gradeLabel || row.audience || '');
  const audience = normalizeAudience(row.audience || derived.audience);
  const semester = normalizeSemester(row.semester || derived.semester || '上');
  const gradeLabel = String(row.gradeLabel || row.grade || buildGradeLabel(audience, semester)).trim() || '未分類';
  const mode = ['daily', 'boss', 'helper'].includes(String(row.mode || '').trim()) ? String(row.mode || '').trim() : 'daily';
  return {
    id: String(id || row.id || '').trim(),
    audience,
    semester,
    grade: gradeLabel,
    gradeLabel,
    unit: String(row.unit || '').trim().toUpperCase() || '未分類',
    mode,
    questionSetId: String(row.questionSetId || buildQuestionSetId({ audience, semester, unit: row.unit || '', mode })).trim(),
    question: String(row.question || '').trim(),
    options: normalized,
    answer: answerIndex + 1,
    isActive: row.isActive === true,
    createdBy: String(row.createdBy || row.updatedBy || '').trim(),
    deleteRequestStatus: String(row.deleteRequestStatus || '').trim(),
    timestamp: Number(row.timestamp) || 0,
    updatedAt: Number(row.updatedAt) || 0,
  };
}

export async function listQuizBankEntries() {
  const snapshot = await getDocs(collection(db, COLLECTIONS.quizBank));
  const rows = [];
  snapshot.forEach((docSnap) => {
    if (docSnap.id === LEGACY_BOSS_DOC_ID || docSnap.id === LEGACY_QSET_META_DOC_ID) return;
    rows.push(normalizeQuizRow(docSnap.id, docSnap.data()));
  });
  rows.sort((a, b) => (QUIZ_AUDIENCE_META[a.audience]?.order || 999) - (QUIZ_AUDIENCE_META[b.audience]?.order || 999) || String(a.semester || '上').localeCompare(String(b.semester || '上'), 'zh-Hant') || String(a.unit).localeCompare(String(b.unit), 'zh-Hant') || (b.timestamp - a.timestamp));
  return rows;
}

export async function saveQuizEntry({ id = null, grade, audience = '', semester = '上', unit, question, options, answer = 1, isActive = false, mode = 'daily', questionSetId = '', actorUid = null } = {}) {
  const derived = deriveAudienceSemesterFromGrade(grade);
  const safeAudience = normalizeAudience(audience || derived.audience || grade);
  const safeSemester = normalizeSemester(semester || derived.semester || '上');
  const safeGrade = String(grade || derived.gradeLabel || buildGradeLabel(safeAudience, safeSemester)).trim();
  const safeUnit = String(unit || '').trim().toUpperCase();
  const safeQuestion = String(question || '').trim();
  if (!safeAudience) throw new Error('請選擇年級群組');
  if (!safeUnit) throw new Error('請輸入單元');
  if (!safeQuestion) throw new Error('請輸入題目');
  const safeAnswer = Math.max(1, Math.min(4, Number(answer) || 1));
  const normalized = normalizeQuizOptions(options || [], safeAnswer - 1);
  if (normalized.length !== 4 || normalized.some((opt) => !opt.text)) throw new Error('請完整輸入四個選項');
  const safeMode = ['daily', 'boss', 'helper'].includes(String(mode || '').trim()) ? String(mode || '').trim() : 'daily';
  const payload = {
    audience: safeAudience,
    semester: safeSemester,
    grade: safeGrade,
    gradeLabel: safeGrade,
    unit: safeUnit,
    mode: safeMode,
    questionSetId: String(questionSetId || buildQuestionSetId({ audience: safeAudience, semester: safeSemester, unit: safeUnit, mode: safeMode })).trim(),
    question: safeQuestion,
    options: normalized,
    isActive: isActive === true,
    updatedAt: Date.now(),
    updatedBy: actorUid || null,
    createdBy: actorUid || null,
  };
  if (id) {
    const ref = doc(db, COLLECTIONS.quizBank, id);
    const oldSnap = await getDoc(ref);
    await setDoc(ref, { ...payload, timestamp: oldSnap.exists() ? (oldSnap.data()?.timestamp || Date.now()) : Date.now() }, { merge: true });
    return normalizeQuizRow(id, { ...(oldSnap.exists() ? oldSnap.data() : {}), ...payload });
  }
  const ref = await addDoc(collection(db, COLLECTIONS.quizBank), { ...payload, timestamp: Date.now() });
  return normalizeQuizRow(ref.id, { ...payload, answer: safeAnswer });
}

export async function toggleQuizEntryActive(id, active) {
  if (!String(id || '').trim()) throw new Error('缺少題目 ID');
  await updateDoc(doc(db, COLLECTIONS.quizBank, id), { isActive: !!active, updatedAt: Date.now() });
}

export async function deleteQuizEntry(id) {
  if (!String(id || '').trim()) throw new Error('缺少題目 ID');
  await deleteDoc(doc(db, COLLECTIONS.quizBank, id));
}

export async function importQuizBulk(raw) {
  const safe = String(raw || '').trim();
  if (!safe) throw new Error('請先貼上批量題庫內容');
  const entries = [];
  if (safe.startsWith('[')) {
    const parsedResult = safeJsonParse(safe, '批量題庫 JSON');
    if (!parsedResult.ok) throw parsedResult.error;
    const parsed = parsedResult.value;
    if (!Array.isArray(parsed)) throw new Error('JSON 必須是陣列');
    parsed.forEach((item, idx) => {
      const normalized = normalizeQuizRow('', item);
      if (!normalized.question || normalized.options.some((opt) => !opt.text)) throw new Error(`第 ${idx + 1} 筆 JSON 缺少題目或選項`);
      entries.push(normalized);
    });
  } else {
    safe.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line, idx) => {
      const cols = line.split('\t');
      if (cols.length < 8) throw new Error(`第 ${idx + 1} 行欄位不足，需 8 欄`);
      const [grade, unit, question, o1, o2, o3, o4, answerRaw] = cols;
      const answer = Number(String(answerRaw).trim());
      if (!(answer >= 1 && answer <= 4)) throw new Error(`第 ${idx + 1} 行正解需填 1-4`);
      entries.push(normalizeQuizRow('', {
        grade,
        unit,
        question,
        options: [o1, o2, o3, o4],
        answer,
        isActive: false,
      }));
    });
  }
  const batch = writeBatch(db);
  entries.forEach((entry) => {
    const ref = doc(collection(db, COLLECTIONS.quizBank));
    batch.set(ref, {
      grade: entry.grade,
      unit: entry.unit,
      question: entry.question,
      options: entry.options,
      isActive: false,
      timestamp: Date.now(),
      updatedAt: Date.now(),
    });
  });
  await batch.commit();
  return entries.length;
}



export async function getQuizGovernance() {
  const snap = await getDoc(doc(db, COLLECTIONS.quizBank, LEGACY_QSET_META_DOC_ID)).catch(() => null);
  const data = snap && snap.exists() ? (snap.data() || {}) : {};
  const governance = data.governance && typeof data.governance === 'object' ? data.governance : {};
  return {
    admins: normalizeEmailList(governance.admins || []),
    editors: normalizeEmailList(governance.editors || []),
    deleteRequests: Object.entries(governance.deleteRequests && typeof governance.deleteRequests === 'object' ? governance.deleteRequests : {}).map(([id, row]) => normalizeDeleteRequest(id, row)).sort((a, b) => (Number(b.requestedAt) || 0) - (Number(a.requestedAt) || 0)),
  };
}

export async function saveQuizGovernance({ admins = [], editors = [] } = {}) {
  const ref = doc(db, COLLECTIONS.quizBank, LEGACY_QSET_META_DOC_ID);
  const snap = await getDoc(ref).catch(() => null);
  const base = snap && snap.exists() ? (snap.data() || {}) : {};
  const currentGov = base.governance && typeof base.governance === 'object' ? base.governance : {};
  const governance = {
    ...currentGov,
    admins: normalizeEmailList(admins),
    editors: normalizeEmailList(editors),
  };
  await setDoc(ref, { ...base, governance, updatedAt: Date.now() }, { merge: true });
  return governance;
}

export async function requestDeleteQuizEntry(id, { requesterEmail = '', requesterUid = '' } = {}) {
  const safeId = String(id || '').trim();
  if (!safeId) throw new Error('缺少題目 ID');
  const quizSnap = await getDoc(doc(db, COLLECTIONS.quizBank, safeId));
  if (!quizSnap.exists()) throw new Error('找不到指定題目');
  const quizData = normalizeQuizRow(safeId, quizSnap.data());
  const ref = doc(db, COLLECTIONS.quizBank, LEGACY_QSET_META_DOC_ID);
  const snap = await getDoc(ref).catch(() => null);
  const base = snap && snap.exists() ? (snap.data() || {}) : {};
  const currentGov = base.governance && typeof base.governance === 'object' ? base.governance : {};
  const deleteRequests = currentGov.deleteRequests && typeof currentGov.deleteRequests === 'object' ? currentGov.deleteRequests : {};
  deleteRequests[safeId] = {
    quizId: safeId,
    question: quizData.question,
    requestedBy: String(requesterEmail || '').trim().toLowerCase(),
    requestedByUid: String(requesterUid || '').trim(),
    requestedAt: Date.now(),
    status: 'pending',
  };
  await setDoc(ref, { ...base, governance: { ...currentGov, deleteRequests }, updatedAt: Date.now() }, { merge: true });
  await updateDoc(doc(db, COLLECTIONS.quizBank, safeId), { deleteRequestStatus: 'pending', updatedAt: Date.now() });
  return normalizeDeleteRequest(safeId, deleteRequests[safeId]);
}

export async function approveDeleteQuizRequest(id, { approverEmail = '' } = {}) {
  const safeId = String(id || '').trim();
  if (!safeId) throw new Error('缺少刪除申請 ID');
  const ref = doc(db, COLLECTIONS.quizBank, LEGACY_QSET_META_DOC_ID);
  const snap = await getDoc(ref).catch(() => null);
  const base = snap && snap.exists() ? (snap.data() || {}) : {};
  const currentGov = base.governance && typeof base.governance === 'object' ? base.governance : {};
  const deleteRequests = currentGov.deleteRequests && typeof currentGov.deleteRequests === 'object' ? currentGov.deleteRequests : {};
  if (!deleteRequests[safeId]) throw new Error('找不到待批准的刪除申請');
  deleteRequests[safeId] = {
    ...deleteRequests[safeId],
    status: 'approved',
    approvedBy: String(approverEmail || '').trim().toLowerCase(),
    approvedAt: Date.now(),
  };
  await deleteDoc(doc(db, COLLECTIONS.quizBank, safeId));
  await setDoc(ref, { ...base, governance: { ...currentGov, deleteRequests }, updatedAt: Date.now() }, { merge: true });
  return normalizeDeleteRequest(safeId, deleteRequests[safeId]);
}
function parseSerialRange(startSerial, endSerial) {
  const start = Number(String(startSerial || '').replace(/\D/g, ''));
  const end = Number(String(endSerial || '').replace(/\D/g, ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) throw new Error('請輸入有效卡序區間');
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const out = [];
  for (let n = low; n <= high; n += 1) out.push(normalizeSerial(String(n)));
  return out;
}

export async function previewSerialRange(startSerial, endSerial) {
  const serials = parseSerialRange(startSerial, endSerial);
  const rows = await Promise.all(serials.map(async (serial) => {
    try {
      const student = await fetchStudentBySerial(serial);
      return { serial, found: true, name: student.name || '未命名學生', grade: student.grade || student.gradeLabel || '', totalXP: Number(student.totalXP) || 0 };
    } catch (_error) {
      return { serial, found: false, name: '', grade: '', totalXP: 0 };
    }
  }));
  return rows;
}

function appendBatchLog(student, detail) {
  const next = applyDataMigration(student);
  next.logs = Array.isArray(next.logs) ? next.logs : [];
  next.logs.push({ log_id: `batch_admin:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), action_type: 'batch_admin', detail });
  if (next.logs.length > 200) next.logs = next.logs.slice(-200);
  return next;
}

export async function runBatchAdminAction({ startSerial, endSerial, action, targetGrade = '' } = {}) {
  const serials = parseSerialRange(startSerial, endSerial);
  const results = [];
  for (const serial of serials) {
    try {
      const student = await fetchStudentBySerial(serial);
      let next = applyDataMigration(student);
      if (action === 'promote_grade') {
        next.grade = String((Number(next.grade) || 0) + 1);
        next = appendBatchLog(next, `[批次工具] 年級提升至 ${next.grade}`);
      } else if (action === 'set_grade') {
        if (!String(targetGrade || '').trim()) throw new Error('請輸入指定年級');
        next.grade = String(targetGrade).trim();
        next = appendBatchLog(next, `[批次工具] 指定年級為 ${next.grade}`);
      } else if (action === 'reset_daily') {
        next.daily_quiz = null;
        next.daily_quiz_date = null;
        next.boss_battle = null;
        next.boss_battle_date = null;
        next = appendBatchLog(next, '[批次工具] 輕度重置：每日狀態 / Boss 冷卻');
      } else if (action === 'reset_growth') {
        next.attributes = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
        next.totalXP = 0;
        next.coins = 0;
        next = appendBatchLog(next, '[批次工具] 中度重置：成長資料歸零');
      } else if (action === 'reset_full') {
        const identity = { serial: next.serial, card_seq: next.card_seq, name: next.name, nickname: next.nickname, grade: next.grade, className: next.className, title: next.title, active_token: next.active_token, page_token: next.page_token };
        next = applyDataMigration(identity);
        next = appendBatchLog(next, '[批次工具] 完全重置：回到初始進度，保留學生身份資料');
      } else {
        throw new Error('不支援的批次動作');
      }
      const saved = await saveStudentData(next, { source: `batch_admin:${action}`, refreshAfterSave: true });
      results.push({ serial, ok: true, name: saved.name || '未命名學生', grade: saved.grade || '', totalXP: Number(saved.totalXP) || 0 });
    } catch (error) {
      results.push({ serial, ok: false, error: error?.message || String(error) });
    }
  }
  return results;
}


const LEGACY_TEACHER_GOV_DOC_ID = LEGACY_DOCS.teacherGovernance || '_TEACHER_ACCESS_GOVERNANCE_';

function normalizeRangeToken(raw = '') {
  const safe = String(raw || '').trim();
  if (!safe) return null;
  const parts = safe.split(/\s*-\s*/);
  if (parts.length === 1) {
    const serial = normalizeSerial(parts[0]);
    return serial ? { start: serial, end: serial } : null;
  }
  const start = normalizeSerial(parts[0]);
  const end = normalizeSerial(parts[1]);
  if (!start || !end) return null;
  return Number(start) <= Number(end) ? { start, end } : { start: end, end: start };
}

function normalizeSerialRangeList(values = []) {
  const source = Array.isArray(values) ? values : String(values || '').split(/[\n,;]+/);
  const out = [];
  const seen = new Set();
  source.forEach((item) => {
    const parsed = normalizeRangeToken(item);
    if (!parsed) return;
    const key = `${parsed.start}-${parsed.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(parsed);
  });
  return out;
}

function normalizeClassList(values = []) {
  const source = Array.isArray(values) ? values : String(values || '').split(/[\n,;]+/);
  const out = [];
  const seen = new Set();
  source.map((v) => String(v || '').trim()).filter(Boolean).forEach((item) => {
    if (seen.has(item)) return;
    seen.add(item);
    out.push(item);
  });
  return out;
}

function normalizeTeacherScopeRule(row = {}) {
  const email = String(row.email || '').trim().toLowerCase();
  if (!email) return null;
  const classes = normalizeClassList(row.classes || row.classNames || []);
  const serialRanges = normalizeSerialRangeList(row.serialRanges || row.ranges || []);
  const note = String(row.note || '').trim();
  return { email, classes, serialRanges, note };
}

function serializeTeacherScopeRules(values = []) {
  return (Array.isArray(values) ? values : []).map((row) => normalizeTeacherScopeRule(row)).filter(Boolean);
}

export function parseTeacherScopeText(text = '') {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [email = '', classText = '', rangeText = '', note = ''] = line.split(/	+/);
    const classes = classText ? classText.split(',').map((v) => v.trim()).filter(Boolean) : [];
    const serialRanges = rangeText ? rangeText.split(',').map((v) => v.trim()).filter(Boolean) : [];
    return normalizeTeacherScopeRule({ email, classes, serialRanges, note });
  }).filter(Boolean);
}

export function formatTeacherScopeText(rules = []) {
  return serializeTeacherScopeRules(rules)
    .map((rule) => [rule.email, rule.classes.join(','), rule.serialRanges.map((range) => `${range.start}-${range.end}`).join(','), rule.note || ''].join('\t'))
    .join('\n');
}

function normalizeTeacherGovernanceDoc(row = {}) {
  return {
    admins: normalizeEmailList(row.admins || []),
    scopes: serializeTeacherScopeRules(row.scopes || row.rules || []),
    updatedAt: Number(row.updatedAt || 0) || 0,
  };
}

export async function getTeacherGovernance() {
  const ref = doc(db, COLLECTIONS.quizBank, LEGACY_TEACHER_GOV_DOC_ID);
  const snap = await getDoc(ref);
  return normalizeTeacherGovernanceDoc(snap.exists() ? snap.data() : {});
}

export async function saveTeacherGovernance({ admins = [], scopes = [] } = {}) {
  const normalized = normalizeTeacherGovernanceDoc({ admins, scopes });
  const ref = doc(db, COLLECTIONS.quizBank, LEGACY_TEACHER_GOV_DOC_ID);
  await setDoc(ref, {
    id: LEGACY_TEACHER_GOV_DOC_ID,
    type: 'teacher_governance',
    admins: normalized.admins,
    scopes: normalized.scopes,
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
  }, { merge: true });
  return normalized;
}
