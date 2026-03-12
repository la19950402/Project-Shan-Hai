const serialQueues = new Map();

export function queueStudentWrite(serial, writer) {
  const key = String(serial || '').trim();
  if (!key) throw new Error('queueStudentWrite 需要 serial');

  const previous = serialQueues.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => writer());

  serialQueues.set(key, next.finally(() => {
    if (serialQueues.get(key) === next) {
      serialQueues.delete(key);
    }
  }));

  return next;
}
