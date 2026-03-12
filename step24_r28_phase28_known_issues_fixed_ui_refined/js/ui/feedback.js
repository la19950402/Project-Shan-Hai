
function byId(id) { return document.getElementById(id); }

export function showToast(message) {
  showAlert(message, '系統提示');
}

export function showAlert(message, title = '系統通知') {
  const modal = byId('feedbackModal');
  const titleEl = byId('feedbackModalTitle');
  const textEl = byId('feedbackModalText');
  if (!modal || !titleEl || !textEl) {
    window.alert(`${title}

${String(message || '')}`);
    return;
  }
  titleEl.textContent = String(title || '系統通知');
  textEl.textContent = String(message || '');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

export function hideAlert() {
  const modal = byId('feedbackModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

export function bindFeedbackModal() {
  const modal = byId('feedbackModal');
  const closeBtn = byId('feedbackModalClose');
  if (!modal) return;
  const close = () => hideAlert();
  closeBtn?.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
}

export function showConfirm(message) {
  return window.confirm(String(message || ''));
}
