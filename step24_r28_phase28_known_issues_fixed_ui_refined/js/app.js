function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function renderStartupError(error, extraNote = '', diagnostics = []) {
  const message = error?.message || String(error);
  const stack = error?.stack ? String(error.stack) : '';
  console.error('[startup] bootstrap failed:', error);
  if (!document?.body) return;

  let panel = document.querySelector('.startup-error-banner');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'startup-error-banner';
    document.body.prepend(panel);
  }

  const diagnosticHtml = Array.isArray(diagnostics) && diagnostics.length
    ? `<details style="margin-top:8px;"><summary>模組診斷</summary><pre style="white-space:pre-wrap; margin:8px 0 0;">${escapeHtml(diagnostics.join('\n'))}</pre></details>`
    : '';

  const details = [
    '<strong>系統初始化失敗</strong>',
    `<span>${escapeHtml(message)}</span>`,
    extraNote ? `<span>${escapeHtml(extraNote)}</span>` : '',
    '<span>Build: step24-r28-card-batch-workflow-20260312h</span>',
    diagnosticHtml,
    stack ? `<details style="margin-top:8px;"><summary>錯誤堆疊</summary><pre style="white-space:pre-wrap; margin:8px 0 0;">${escapeHtml(stack)}</pre></details>` : '',
  ].filter(Boolean).join('');

  panel.innerHTML = details;
}

async function collectModuleDiagnostics(specifiers = []) {
  const lines = [];
  for (const specifier of specifiers) {
    const base = new URL(specifier, import.meta.url);
    base.searchParams.set('diag', Date.now().toString());
    try {
      const response = await fetch(base.toString(), { cache: 'no-store' });
      const text = await response.text();
      const head = text.slice(0, 120).replace(/\s+/g, ' ');
      lines.push(`${specifier}`);
      lines.push(`  status: ${response.status} ${response.statusText}`);
      lines.push(`  content-type: ${response.headers.get('content-type') || '(none)'}`);
      lines.push(`  first-chars: ${head || '(empty)'}`);
      const trimmed = text.trimStart();
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
        lines.push('  判斷：這個 JS 路徑回傳的是 HTML，通常代表 Hosting rewrite / 404 fallback / 快取混版。');
      }
    } catch (diagError) {
      lines.push(`${specifier}`);
      lines.push(`  fetch failed: ${diagError?.message || diagError}`);
    }
  }
  return lines;
}

async function collectFirebaseCdnDiagnostics() {
  const urls = [
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js',
  ];
  const lines = [];
  for (const url of urls) {
    try {
      const response = await fetch(`${url}?probe=${Date.now()}`, { cache: 'no-store', mode: 'cors' });
      const text = await response.text();
      lines.push(url);
      lines.push(`  status: ${response.status} ${response.statusText}`);
      lines.push(`  content-type: ${response.headers.get('content-type') || '(none)'}`);
      lines.push(`  first-chars: ${text.slice(0, 120).replace(/\s+/g, ' ') || '(empty)'}`);
    } catch (error) {
      lines.push(url);
      lines.push(`  fetch failed: ${error?.message || error}`);
    }
  }
  return lines;
}

function bindFallbackClickDiagnostics() {
  const interactive = document.querySelectorAll('button, [role="button"], .menu-btn, .quick-open, [data-nav-target]');
  interactive.forEach((el) => {
    if (!el || el.dataset.fallbackBound === 'true') return;
    el.dataset.fallbackBound = 'true';
    el.addEventListener('click', (event) => {
      const banner = document.querySelector('.startup-error-banner');
      const detail = banner?.textContent?.trim() || '前端模組尚未完成初始化，請開啟 Console 查看第一個紅字錯誤。';
      event.preventDefault();
      event.stopPropagation();
      window.alert(detail);
    }, true);
  });
}

function renderFileProtocolWarning(coreShell) {
  renderStartupError(
    new Error('目前是用本機檔案模式開啟（file://），瀏覽器通常會阻擋 ES Modules / Firebase 載入。'),
    '請改用本地伺服器啟動，例如執行 start_local_server.bat，或部署到 Firebase Hosting / 任一靜態網站主機後再測試。',
  );
  coreShell?.markBootFailure('請改用 http(s) 啟動，避免 file:// 阻擋模組與 Firebase。');
  bindFallbackClickDiagnostics();
}

window.addEventListener('DOMContentLoaded', async () => {
  let coreShell = null;
  try {
    const lite = await import('./controllers/bootstrap-lite.js?v=step24-r28-card-batch-workflow-20260312h');
    coreShell = lite.initCoreShell();
  } catch (liteError) {
    console.warn('[startup] core shell init failed:', liteError);
  }

  if (window.location.protocol === 'file:') {
    renderFileProtocolWarning(coreShell);
    return;
  }

  try {
    const stage = await import('./controllers/bootstrap-stage.js?v=step24-r28-card-batch-workflow-20260312h');
    const stageResult = await stage.runBootstrapStage();
    if (!stageResult.ok) {
      const diagnostics = [
        ...stageResult.report,
        '',
        '關鍵檔案診斷：',
        ...(await collectModuleDiagnostics([
          './controllers/bootstrap-controller.js?v=step24-r28-card-batch-workflow-20260312h',
          './controllers/bootstrap-stage.js?v=step24-r28-card-batch-workflow-20260312h',
          './config.js?v=step24-r28-card-batch-workflow-20260312h',
          './services/firebase.js?v=step24-r28-card-batch-workflow-20260312h',
          './services/auth-service.js?v=step24-r28-card-batch-workflow-20260312h',
          './services/student-service.js?v=step24-r28-card-batch-workflow-20260312h',
          './services/card-admin-service.js?v=step24-r28-card-batch-workflow-20260312h',
          './controllers/student-core-controller.js?v=step24-r28-card-batch-workflow-20260312h',
        ])),
      ];
      const firstFailure = stageResult.firstFailure;
      const shouldCheckFirebase = firstFailure && /firebase|auth-service|student-service|card-admin-service|guide-api|reward-api|system-admin-service|shop-service/i.test(firstFailure.specifier || '');
      if (shouldCheckFirebase) {
        diagnostics.push('', 'Firebase CDN 診斷：', ...(await collectFirebaseCdnDiagnostics()));
      }
      throw Object.assign(new Error(`模組分段載入失敗：${firstFailure?.specifier || 'unknown module'}`), {
        stageDiagnostics: diagnostics,
      });
    }

    const mod = await import('./controllers/bootstrap-controller.js?v=step24-r28-card-batch-workflow-20260312h');
    await mod.bootstrapApp();
    coreShell?.markBootSuccess();
    document.documentElement.dataset.appBuild = 'step24-r28-card-batch-workflow-20260312h';
  } catch (error) {
    const diagnostics = Array.isArray(error?.stageDiagnostics) ? error.stageDiagnostics : await collectModuleDiagnostics([
      './controllers/bootstrap-controller.js?v=step24-r28-card-batch-workflow-20260312h',
      './controllers/bootstrap-lite.js?v=step24-r28-card-batch-workflow-20260312h',
      './controllers/bootstrap-stage.js?v=step24-r28-card-batch-workflow-20260312h',
      './config.js?v=step24-r28-card-batch-workflow-20260312h',
      './services/firebase.js?v=step24-r28-card-batch-workflow-20260312h',
      './domain/reward.js?v=step24-r28-card-batch-workflow-20260312h',
    ]);
    renderStartupError(
      error,
      '已先啟動核心殼層保留老師 / 學生主鏈導覽；目前改為分段載入，會先顯示第一個失敗模組，避免整頁只剩抽象 bootstrap failed。',
      diagnostics,
    );
    coreShell?.markBootFailure('完整 bootstrap 失敗，核心殼層已保留基本導覽與系統區切頁。');
    bindFallbackClickDiagnostics();
  }
});
