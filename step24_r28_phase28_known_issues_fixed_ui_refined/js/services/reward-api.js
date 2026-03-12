import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { functions } from './firebase.js?v=step24-r28-card-batch-workflow-20260312h';
import { ensureStudentAuth } from './auth-service.js?v=step24-r28-card-batch-workflow-20260312h';

const settleRewardCallable = httpsCallable(functions, 'settleStudentReward');

export async function settleRewardViaServer({ token, type, meta = {} }) {
  await ensureStudentAuth();
  const safeToken = String(token || '').trim();
  const safeType = String(type || '').trim();
  if (!safeToken) throw new Error('settleRewardViaServer 缺少 token');
  if (!safeType) throw new Error('settleRewardViaServer 缺少 type');

  const result = await settleRewardCallable({
    token: safeToken,
    type: safeType,
    meta,
  });

  return result?.data || null;
}


export function normalizeRewardResponse(result) {
  if (!result) return null;
  return {
    ok: Boolean(result.ok),
    applied: Boolean(result.applied),
    code: result.code || '',
    message: result.message || '',
    student: result.student || null,
    reward: result.reward || null,
  };
}
