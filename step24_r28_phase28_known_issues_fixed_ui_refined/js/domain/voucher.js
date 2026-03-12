export function createPhysicalRewardVoucher({ itemId, itemName, serial, price }) {
  const now = Date.now();
  return {
    type: 'voucher',
    voucherId: `voucher:${itemId}:${serial}:${now}`,
    itemId,
    itemName,
    price: Number(price) || 0,
    status: 'active',
    createdAt: now,
    serial,
  };
}

export function getVoucherStatusLabel(voucher = {}) {
  const status = String(voucher?.status || 'active').trim();
  if (status === 'redeemed') return '已兌現';
  if (status === 'expired') return '已過期';
  return '有效';
}

export function isVoucherActive(voucher = {}) {
  return String(voucher?.status || 'active').trim() === 'active';
}

export function redeemVoucher(voucher = {}, { teacherUid = null } = {}) {
  return {
    ...voucher,
    status: 'redeemed',
    redeemedAt: Date.now(),
    redeemedBy: teacherUid || null,
  };
}

export function formatVoucherLine(voucher = {}) {
  return [
    `voucherId: ${voucher.voucherId || '-'}`,
    `名稱: ${voucher.itemName || voucher.itemId || '未命名商品'}`,
    `狀態: ${getVoucherStatusLabel(voucher)}`,
    `價格: ${Number(voucher.price) || 0}`,
  ].join('\n');
}
