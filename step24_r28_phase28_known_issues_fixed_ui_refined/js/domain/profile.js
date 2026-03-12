export function getContentProfile(data = {}) {
  const id = String(data?.content_profile_id || 'cat').trim().toLowerCase();
  if (id === 'shanhai') {
    return { id: 'shanhai', title: '山海模式' };
  }
  return { id: 'cat', title: '貓咪模式' };
}

export function isCatProfile(data = {}) {
  return getContentProfile(data).id === 'cat';
}

export function getProfileLabels(data = {}) {
  return isCatProfile(data)
    ? { xp: '成長能量', coins: '魚乾幣' }
    : { xp: '靈力', coins: '金幣' };
}
