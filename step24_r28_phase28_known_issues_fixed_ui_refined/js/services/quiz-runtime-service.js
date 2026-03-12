import { listBossConfigs, listQuestionSetConfigs, listQuizBankEntries } from "./system-admin-service.js?v=step24-r28-card-batch-workflow-20260312h";

function parseGradeNumber(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function deriveStudentAudience(student = {}) {
  const raw = String(student?.grade || student?.gradeLabel || student?.class_name || student?.className || '').trim();
  if (/學習扶助/.test(raw)) return 'support';
  const num = parseGradeNumber(raw);
  return Number.isFinite(num) && num >= 3 && num <= 6 ? `grade${num}` : '';
}

function deriveStudentSemester(student = {}) {
  const raw = String(student?.grade || student?.gradeLabel || '').trim();
  if (/下/.test(raw)) return '下';
  return '上';
}

function sameGradeLike(a, b) {
  const sa = String(a || '').trim();
  const sb = String(b || '').trim();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const na = parseGradeNumber(sa);
  const nb = parseGradeNumber(sb);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

function dayBucketAtNoon(now = new Date()) {
  const d = new Date(now);
  const noon = new Date(d);
  noon.setHours(12, 0, 0, 0);
  if (d.getTime() < noon.getTime()) {
    noon.setDate(noon.getDate() - 1);
  }
  return noon.toISOString().slice(0, 10);
}

function pickDeterministic(rows = [], seed = '') {
  if (!rows.length) return null;
  const safeSeed = String(seed || 'seed');
  let acc = 0;
  for (const ch of safeSeed) acc += ch.charCodeAt(0);
  return rows[acc % rows.length] || rows[0];
}

export async function loadDailyAssignmentForStudent(student, { unit = '' } = {}) {
  const safeGrade = String(student?.grade || student?.gradeLabel || '').trim();
  const audience = deriveStudentAudience(student);
  const semester = deriveStudentSemester(student);
  if (!safeGrade && !audience) throw new Error('學生資料缺少年級，無法分配每日題目');
  const [quizGroups, quizEntries] = await Promise.all([
    listQuestionSetConfigs().catch(() => []),
    listQuizBankEntries().catch(() => []),
  ]);
  const dailySets = quizGroups.filter((row) => row?.mode === 'daily' && ((!audience && sameGradeLike(row?.grade, safeGrade)) || String(row?.audience || '').trim() === audience) && String(row?.semester || '上').trim() === semester);
  const availableUnits = Array.from(new Set([
    ...dailySets.map((row) => String(row?.unit || '').trim()).filter(Boolean),
    ...quizEntries.filter((row) => row?.isActive && (((!audience) && sameGradeLike(row?.grade, safeGrade)) || String(row?.audience || '').trim() === audience) && String(row?.semester || '上').trim() === semester).map((row) => String(row?.unit || '').trim()).filter(Boolean),
  ]));
  const preferredUnit = String(unit || '').trim() || availableUnits[0] || '';
  const candidateRows = quizEntries.filter((row) => row?.isActive && (((!audience) && sameGradeLike(row?.grade, safeGrade)) || String(row?.audience || '').trim() === audience) && String(row?.semester || '上').trim() === semester && (!preferredUnit || String(row?.unit || '').trim() === preferredUnit));
  const picked = pickDeterministic(candidateRows, `${student?.serial || student?.card_seq || ''}:${preferredUnit}:${dayBucketAtNoon()}`);
  return {
    grade: safeGrade,
    unit: preferredUnit,
    availableUnits,
    question: picked,
    questionCount: candidateRows.length,
    source: 'quiz_bank',
    audience,
    semester,
    dateKey: dayBucketAtNoon(),
  };
}

export async function loadBossAssignmentsForStudent(student) {
  const safeGrade = String(student?.grade || student?.gradeLabel || '').trim();
  const audience = deriveStudentAudience(student);
  const semester = deriveStudentSemester(student);
  if (!safeGrade && !audience) throw new Error('學生資料缺少年級，無法分配 Boss');
  const [bosses, quizGroups] = await Promise.all([
    listBossConfigs().catch(() => []),
    listQuestionSetConfigs().catch(() => []),
  ]);
  const setMap = new Map(quizGroups.map((row) => [String(row?.id || '').trim(), row]));
  return bosses
    .filter((boss) => boss?.active !== false)
    .map((boss) => {
      const questionSet = setMap.get(String(boss?.questionSetId || '').trim()) || null;
      const gradeMatch = questionSet ? ((((String(questionSet?.audience || '').trim() === audience) || (!audience && sameGradeLike(questionSet?.grade, safeGrade))) && String(questionSet?.semester || '上').trim() === semester)) : true;
      return {
        id: String(boss?.id || '').trim(),
        name: String(boss?.name || '').trim() || '未命名 Boss',
        attrKey: String(boss?.attrKey || '').trim() || 'fire',
        questionSetId: String(boss?.questionSetId || '').trim(),
        questionSet,
        allowed: gradeMatch,
        blockedReason: gradeMatch ? '' : `需年級 ${questionSet?.grade || '未指定'}`,
      };
    })
    .filter((row) => row.allowed);
}


export async function listGradeUnitsForStudent(student) {
  const result = await loadDailyAssignmentForStudent(student).catch(() => ({ availableUnits: [] }));
  return Array.isArray(result.availableUnits) ? result.availableUnits : [];
}

export async function getDailyQuestionForStudent(student, { unit = '' } = {}) {
  const result = await loadDailyAssignmentForStudent(student, { unit });
  const question = result.question;
  if (!question) {
    throw new Error(`找不到 ${result.grade || student?.grade || '目前年級'}${result.unit ? ` / ${result.unit}` : ''} 的每日題目`);
  }
  const answer = Number(question.answer) || (Array.isArray(question.options) ? (question.options.findIndex((opt) => !!opt?.isCorrect) + 1) : 1) || 1;
  return {
    id: String(question.id || '').trim(),
    grade: result.grade,
    unit: result.unit,
    question: String(question.question || '').trim(),
    options: Array.isArray(question.options) ? question.options.map((opt) => ({ text: String(opt?.text || '').trim(), isCorrect: !!opt?.isCorrect })) : [],
    answer,
    source: result.source || 'quiz_bank',
    dateKey: result.dateKey || '',
  };
}

export async function getBossRuntimeForStudent(student, { preferredBossId = '' } = {}) {
  const bosses = await loadBossAssignmentsForStudent(student);
  if (!bosses.length) throw new Error('目前沒有可用的 Boss 設定');
  const pickedBoss = bosses.find((row) => row.id === String(preferredBossId || '').trim()) || bosses[0];
  if (!pickedBoss) throw new Error('找不到符合條件的 Boss');

  const quizEntries = await listQuizBankEntries().catch(() => []);
  const desiredUnit = String(pickedBoss.questionSet?.unit || '').trim();
  const safeGrade = String(student?.grade || student?.gradeLabel || pickedBoss.questionSet?.grade || '').trim();
  const audience = deriveStudentAudience(student) || String(pickedBoss.questionSet?.audience || '').trim();
  const semester = deriveStudentSemester(student) || String(pickedBoss.questionSet?.semester || '上').trim();
  const candidateRows = quizEntries.filter((row) => row?.isActive && (((!audience) && sameGradeLike(row?.grade, safeGrade)) || String(row?.audience || '').trim() === audience) && String(row?.semester || '上').trim() === semester && (!desiredUnit || String(row?.unit || '').trim() === desiredUnit));
  const pickedQuestion = pickDeterministic(candidateRows, `${student?.serial || student?.card_seq || ''}:${pickedBoss.id}:${dayBucketAtNoon()}`);
  if (!pickedQuestion) {
    throw new Error(`Boss ${pickedBoss.name || pickedBoss.id} 尚未綁定可用題目`);
  }
  const answer = Number(pickedQuestion.answer) || (Array.isArray(pickedQuestion.options) ? (pickedQuestion.options.findIndex((opt) => !!opt?.isCorrect) + 1) : 1) || 1;
  return {
    bossId: pickedBoss.id,
    bossName: pickedBoss.name,
    attrKey: pickedBoss.attrKey,
    unit: desiredUnit,
    question: {
      id: String(pickedQuestion.id || '').trim(),
      grade: String(pickedQuestion.grade || safeGrade).trim(),
      audience: audience || '',
      semester: semester || '上',
      unit: String(pickedQuestion.unit || desiredUnit).trim(),
      question: String(pickedQuestion.question || '').trim(),
      options: Array.isArray(pickedQuestion.options) ? pickedQuestion.options.map((opt) => ({ text: String(opt?.text || '').trim(), isCorrect: !!opt?.isCorrect })) : [],
      answer,
    },
  };
}
