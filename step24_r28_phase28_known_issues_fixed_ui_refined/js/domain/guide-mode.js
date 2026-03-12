import { APP_CONFIG, GUIDE_IMAGES } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';

export function getGuideMode(data = {}) {
  const raw = String(data?.guide_mode || APP_CONFIG.defaultGuideMode || 'cat').trim();
  if (raw === 'cat_sage') return 'cat';
  if (raw === 'baize' || raw === 'neutral' || raw === 'cat') return raw;
  return 'cat';
}

export function getGuideConfig(data = {}) {
  const mode = getGuideMode(data);
  if (mode === 'baize') {
    return {
      mode,
      title: '白澤',
      subtitle: '山海智者',
      buttonLabel: '請示白澤',
      placeholder: '請輸入你想向白澤請教的問題',
      description: '知曉萬物之理的山海智者，偏向引導式提問與較沈穩的語氣。',
      imageUrl: GUIDE_IMAGES.baize,
      profileMode: 'shanhai',
    };
  }
  if (mode === 'neutral') {
    return {
      mode,
      title: '智慧助教',
      subtitle: '中性學習夥伴',
      buttonLabel: '請教智慧助教',
      placeholder: '請輸入你想詢問的問題',
      description: '中性、不強調世界觀的學習夥伴，適合一般教學輔助。',
      imageUrl: GUIDE_IMAGES.cat,
      profileMode: 'cat',
    };
  }
  return {
    mode: 'cat',
    title: '智者貓咪',
    subtitle: '安全預設',
    buttonLabel: '請教智者貓咪',
    placeholder: '請輸入你想向智者貓咪請教的問題',
    description: '溫和、耐心、適合孩子的學習夥伴。當資料不足或未明確設定時，安全預設為智者貓咪。',
    imageUrl: GUIDE_IMAGES.cat,
    profileMode: 'cat',
  };
}

export function buildGuideSavePatch(mode) {
  const rawMode = String(mode || '').trim();
  const safeMode = rawMode === 'cat_sage' ? 'cat' : ((rawMode === 'baize' || rawMode === 'neutral' || rawMode === 'cat') ? rawMode : 'cat');
  return {
    guide_mode: safeMode,
    guide_mode_locked: true,
  };
}
