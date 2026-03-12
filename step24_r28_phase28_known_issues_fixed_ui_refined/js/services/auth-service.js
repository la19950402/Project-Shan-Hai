import {
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { auth, authPersistenceReady } from './firebase.js?v=step24-r28-card-batch-workflow-20260312h';
import { setTeacherUser } from '../state.js?v=step24-r28-card-batch-workflow-20260312h';
import { APP_CONFIG } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';

function normalizeTeacherEmail(raw) {
  let email = String(raw || '').trim();
  email = email
    .replace(/\s+/g, '')
    .replace(/＠/g, '@')
    .replace(/[。．｡]/g, '.')
    .replace(/[，、]/g, ',')
    .toLowerCase();

  if (email && !email.includes('@') && APP_CONFIG.teacherEmailDefaultDomain) {
    email = `${email}@${APP_CONFIG.teacherEmailDefaultDomain}`;
  }
  return email;
}

export function validateTeacherEmail(raw) {
  const email = normalizeTeacherEmail(raw);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return { ok, email };
}

export function mapTeacherLoginError(error) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return '管理者 Email 格式不正確。請輸入完整 Email，例如 name@example.com，並留意不要混入空白、換行或全形 @。';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return '管理者帳號不存在，或密碼不正確。請確認 Firebase Authentication 已建立 Email/Password 帳號。';
    case 'auth/wrong-password':
      return '管理者密碼不正確。';
    case 'auth/network-request-failed':
      return '登入失敗，網路連線異常。';
    case 'auth/too-many-requests':
      return '登入嘗試次數過多，請稍後再試。';
    default:
      return error?.message || String(error);
  }
}

export async function ensureStudentAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function teacherLogin(email, password) {
  await authPersistenceReady;
  const normalized = normalizeTeacherEmail(email);
  const cred = await signInWithEmailAndPassword(auth, normalized, password);
  setTeacherUser(cred.user);
  return cred.user;
}

export async function teacherLogout() {
  try {
    if (auth.currentUser) await signOut(auth);
  } catch (error) {
    const code = String(error?.code || '');
    if (!code || !/no-current-user|invalid-user-token|network-request-failed/.test(code)) {
      console.warn('[auth] teacherLogout fallback:', error);
    }
  } finally {
    setTeacherUser(null);
  }
}

export function bindTeacherAuthState(onChange) {
  return onAuthStateChanged(auth, (user) => {
    const teacherUser = user && !user.isAnonymous ? user : null;
    setTeacherUser(teacherUser);
    if (typeof onChange === 'function') onChange(teacherUser);
  });
}
