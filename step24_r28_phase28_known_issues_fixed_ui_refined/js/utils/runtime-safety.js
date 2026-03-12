import { BUILD_TAG } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';

export function safeJsonParse(text, label = 'JSON') {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      value: null,
      error: new Error(`${label} 格式錯誤：${error?.message || error}`),
    };
  }
}

export function safeCloneJsonLike(value, fallback = {}) {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
  } catch (_) {
    // fall back to JSON clone below
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return fallback;
  }
}

export function getRuntimeSafetyBuildTag() {
  return BUILD_TAG;
}
