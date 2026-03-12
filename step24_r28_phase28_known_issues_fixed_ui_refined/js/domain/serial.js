export function normalizeSerial(raw) {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '');
  return digits ? digits.padStart(3, '0') : null;
}
