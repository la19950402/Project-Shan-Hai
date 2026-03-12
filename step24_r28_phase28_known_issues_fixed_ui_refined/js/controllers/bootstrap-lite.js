import { BUILD_TAG } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';

function byId(id) {
  return document.getElementById(id);
}

function ensureLiteStyle() {
  if (document.querySelector('#coreShellLiteStyle')) return;
  const style = document.createElement('style');
  style.id = 'coreShellLiteStyle';
  style.textContent = `
    .core-shell-banner {
      position: sticky;
      top: 0;
      z-index: 1200;
      margin: 0 0 12px;
      padding: 10px 14px;
      border: 1px solid rgba(120, 255, 220, 0.22);
      border-radius: 14px;
      background: rgba(7, 24, 32, 0.92);
      color: #dffbf7;
      box-shadow: 0 12px 30px rgba(0,0,0,0.18);
      backdrop-filter: blur(10px);
    }
    .core-shell-banner strong { display:block; margin-bottom: 4px; }
    .core-shell-banner.is-warning { border-color: rgba(255, 210, 110, 0.32); color: #fff4cf; }
    .core-shell-banner.is-ok { border-color: rgba(92, 236, 162, 0.32); color: #e6fff1; }
    .lite-active-section {
      outline: 2px solid rgba(120, 255, 220, 0.55);
      outline-offset: 4px;
      transition: outline-color 220ms ease;
    }
  `;
  document.head.appendChild(style);
}

function ensureBanner() {
  let banner = document.querySelector('.core-shell-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'core-shell-banner';
    document.body.prepend(banner);
  }
  return banner;
}

function setBuildMarkers() {
  document.documentElement.dataset.appBuild = BUILD_TAG;
  const buildEl = byId('legacyBuildTagText');
  if (buildEl) buildEl.textContent = BUILD_TAG;
}

function focusSection(sectionId) {
  const section = byId(sectionId);
  if (!section) return false;
  document.querySelectorAll('.lite-active-section').forEach((el) => el.classList.remove('lite-active-section'));
  section.classList.add('lite-active-section');
  setTimeout(() => section.classList.remove('lite-active-section'), 1600);
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

function activateSystemPane(paneKey = 'overview') {
  const panes = Array.from(document.querySelectorAll('[data-system-pane]'));
  if (!panes.length) return false;
  let activated = false;
  panes.forEach((pane) => {
    const isActive = pane.dataset.systemPane === paneKey;
    pane.classList.toggle('is-active', isActive);
    pane.hidden = !isActive;
    if (isActive) activated = true;
  });
  document.querySelectorAll('[data-system-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.systemTab === paneKey);
  });
  document.querySelectorAll('[data-system-target]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.systemTarget === paneKey);
  });
  if (activated) focusSection('systemZoneSection');
  return activated;
}

function triggerTargetClick(targetId) {
  const target = byId(targetId);
  if (!target) return false;
  target.click();
  return true;
}

function installDelegates() {
  document.addEventListener('click', (event) => {
    const navButton = event.target.closest('[data-nav-target]');
    if (navButton) {
      const ok = focusSection(navButton.dataset.navTarget);
      if (ok) {
        event.preventDefault();
        return;
      }
    }

    const paneButton = event.target.closest('[data-system-target], [data-system-tab]');
    if (paneButton) {
      const paneKey = paneButton.dataset.systemTarget || paneButton.dataset.systemTab;
      if (paneKey) {
        const ok = activateSystemPane(paneKey);
        if (ok) {
          event.preventDefault();
          return;
        }
      }
    }

    const proxyButton = event.target.closest('[data-click-target]');
    if (proxyButton) {
      const ok = triggerTargetClick(proxyButton.dataset.clickTarget);
      if (ok) {
        event.preventDefault();
      }
    }
  });
}

function setStatus(state = 'loading', detail = '') {
  const banner = ensureBanner();
  banner.classList.remove('is-warning', 'is-ok');
  const title = state === 'ok'
    ? '核心殼層已接手，完整模組已載入。'
    : state === 'warning'
      ? '完整模組尚未完成初始化，核心殼層維持基本導覽與切頁。'
      : '正在啟動核心殼層，先保留老師 / 學生主鏈導覽。';
  if (state === 'ok') banner.classList.add('is-ok');
  if (state === 'warning') banner.classList.add('is-warning');
  banner.innerHTML = `<strong>${title}</strong><span>Build: ${BUILD_TAG}</span>${detail ? `<div style="margin-top:6px; white-space:pre-wrap;">${detail}</div>` : ''}`;
}

export function initCoreShell() {
  ensureLiteStyle();
  setBuildMarkers();
  activateSystemPane('overview');
  installDelegates();
  setStatus('loading');
  return {
    markBootSuccess() {
      setBuildMarkers();
      setStatus('ok');
    },
    markBootFailure(detail = '') {
      setBuildMarkers();
      setStatus('warning', detail);
    },
  };
}
