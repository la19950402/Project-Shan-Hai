export const BUILD_TAG = 'step24-r28-card-batch-workflow-20260312h';
export const APP_CONFIG = {
  defaultGuideMode: 'cat',
  defaultGuideModeLocked: true,
  teacherIdleWarnMs: 12 * 60 * 1000,
  teacherIdleLogoutMs: 15 * 60 * 1000,
  studentIdleWarnMs: 8 * 60 * 1000,
  studentIdleLogoutMs: 10 * 60 * 1000,
  batchWindowMs: 10 * 1000,
  teacherEmailDefaultDomain: '',
};

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDUpGQ1jklUSugZ4ALRpJxhJC21F6sSHhs',
  authDomain: 'project-shan-hai.firebaseapp.com',
  projectId: 'project-shan-hai',
  storageBucket: 'project-shan-hai.firebasestorage.app',
  messagingSenderId: '262124728011',
  appId: '1:262124728011:web:3681797a6fdb518ad9f54e',
};

export const COLLECTIONS = {
  students: 'students',
  studentPages: 'student_pages',
  tokens: 'tag_tokens',
  shopCatalog: 'shop_catalog',
  cards: 'cards',
  itemCards: 'item_cards',
  quizBank: 'quiz_bank',
};

export const LEGACY_DOCS = {
  bossRuntime: '_BATTLE_TOWER_BOSS_',
  quizGroupMeta: '_QUESTION_SET_META_',
  quizGovernance: '_QUESTION_SET_GOVERNANCE_',
  teacherGovernance: '_TEACHER_ACCESS_GOVERNANCE_',
};

export const GUIDE_IMAGES = {
  baize: 'https://firebasestorage.googleapis.com/v0/b/project-shan-hai.firebasestorage.app/o/images%2Fmonster%20pictures%2FBaize%2FBaize_800x800.webp?alt=media&token=e2a96804-1c49-4374-a83a-96d34c5b2e92',
  cat: 'https://firebasestorage.googleapis.com/v0/b/project-shan-hai.firebasestorage.app/o/images%2Fmonster%20pictures%2Fcats%2FA%20Sagacious%20Cat_800x800.webp?alt=media&token=58e2a846-e249-4741-ac54-b8ad501e6d69',
};

export const ATTR_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'];
