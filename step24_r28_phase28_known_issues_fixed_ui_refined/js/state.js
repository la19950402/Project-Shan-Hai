import { APP_CONFIG } from './config.js?v=step24-r28-card-batch-workflow-20260312h';

export const currentState = {
  teacherUser: null,
  studentData: null,
  currentSerial: null,
  currentToken: null,
  previewAction: null,
};

export const batchState = {
  isRunning: false,
  queue: [],
  lastResult: [],
  summary: {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  },
  activeStudentSerial: null,
  activeStudentName: '',
  activeToken: null,
  timeLeftMs: 0,
  comboCount: 0,
  comboCountBySerial: {},
  lastAppliedAt: 0,
  lastCardEffect: null,
  activeStudentSnapshot: null,
  sessionHistory: [],
  scanModeEnabled: false,
  waitingFor: 'student',
  lastScanSource: null,
};

export const quizSession = {
  active: false,
};

export const uiState = {
  isSaving: false,
  lastAction: '系統待命',
  lastSyncAt: null,
};

export function resetCurrentStudent() {
  currentState.studentData = null;
  currentState.currentSerial = null;
  currentState.currentToken = null;
  currentState.previewAction = null;
}

export function setCurrentStudent(student, { serial = null, token = null } = {}) {
  currentState.studentData = student;
  currentState.currentSerial = serial || student?.serial || student?.card_seq || null;
  currentState.currentToken = token || student?.active_token || student?.page_token || null;
}

export function setTeacherUser(user) {
  currentState.teacherUser = user || null;
}

export function setPreviewAction(action) {
  currentState.previewAction = action || null;
}

export function clearPreviewAction() {
  currentState.previewAction = null;
}

export function getSafeGuideMode(data) {
  return (data?.guide_mode === 'cat_sage' ? 'cat' : data?.guide_mode) || APP_CONFIG.defaultGuideMode;
}

export function setUiBusy(isBusy, actionText = null) {
  uiState.isSaving = Boolean(isBusy);
  if (actionText) uiState.lastAction = actionText;
}

export function markUiSynced(actionText = '同步完成') {
  uiState.lastAction = actionText;
  uiState.lastSyncAt = Date.now();
}

export function setBatchSummary(summary = {}) {
  batchState.summary = {
    total: Number(summary.total) || 0,
    success: Number(summary.success) || 0,
    failed: Number(summary.failed) || 0,
    skipped: Number(summary.skipped) || 0,
  };
}


export function resetBatchRuntimeState() {
  batchState.activeStudentSerial = null;
  batchState.activeStudentName = '';
  batchState.activeToken = null;
  batchState.timeLeftMs = 0;
  batchState.comboCount = 0;
  batchState.comboCountBySerial = {};
  batchState.lastAppliedAt = 0;
  batchState.lastCardEffect = null;
  batchState.activeStudentSnapshot = null;
  batchState.sessionHistory = [];
  batchState.scanModeEnabled = false;
  batchState.waitingFor = 'student';
  batchState.lastScanSource = null;
}
