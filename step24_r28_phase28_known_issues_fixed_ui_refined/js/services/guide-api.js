import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { functions, auth } from './firebase.js?v=step24-r28-card-batch-workflow-20260312h';
import { ensureStudentAuth } from './auth-service.js?v=step24-r28-card-batch-workflow-20260312h';

const askGuideCallable = httpsCallable(functions, 'askBaize');

function mapGuideModeForBackend(guideMode = 'cat') {
  const mode = String(guideMode || 'cat').trim();
  if (mode === 'baize') {
    return {
      aiGuideMode: 'baize',
      profileMode: 'shanhai',
    };
  }

  // 目前後端舊版 askBaize 較穩定識別 sage_cat，
  // 因此前端在 cat / cat_sage / neutral 都先轉成 sage_cat，
  // 避免不明模式掉回白澤預設人格。
  return {
    aiGuideMode: 'sage_cat',
    profileMode: 'cat',
  };
}

export async function askGuideViaServer({ message, guideMode = 'cat', profileMode = 'cat' }) {
  const text = String(message || '').trim();
  if (!text) throw new Error('請輸入問題');

  await ensureStudentAuth();
  if (!auth.currentUser) throw new Error('學生尚未登入 Firebase Auth');
  await auth.currentUser.getIdToken(true);

  const backendMode = mapGuideModeForBackend(guideMode);

  const result = await askGuideCallable({
    message: text,
    profileMode: backendMode.profileMode || profileMode || 'cat',
    aiGuideMode: backendMode.aiGuideMode,
    requestedGuideMode: String(guideMode || '').trim() || 'cat',
  });

  return result?.data?.reply || '';
}

export { mapGuideModeForBackend };
