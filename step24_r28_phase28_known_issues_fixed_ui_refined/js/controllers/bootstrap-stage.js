import { BUILD_TAG } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';

const GROUPS = [
  {
    id: 'local-core',
    label: '本地核心模組',
    modules: [
      '../config.js',
      '../state.js',
      '../domain/guide-mode.js',
      '../domain/profile.js',
      '../domain/reward.js',
      '../ui/feedback.js',
    ],
  },
  {
    id: 'firebase-bridge',
    label: 'Firebase 橋接',
    modules: [
      '../services/firebase.js',
      '../services/auth-service.js',
      '../services/reward-api.js',
      '../services/guide-api.js',
    ],
  },
  {
    id: 'data-services',
    label: '學生資料 / 卡務 / 系統服務',
    modules: [
      '../services/student-service.js',
      '../services/card-admin-service.js',
      '../services/item-card-service.js',
      '../services/shop-service.js',
      '../services/system-admin-service.js',
      '../services/quiz-runtime-service.js',
    ],
  },
  {
    id: 'controllers',
    label: '控制器',
    modules: [
      './batch-controller.js',
      './shop-controller.js',
      './student-core-controller.js',
      './bootstrap-controller.js',
    ],
  },
];

function makeVersionedSpecifier(specifier = '', probe = '') {
  const url = new URL(specifier, import.meta.url);
  url.searchParams.set('v', BUILD_TAG);
  if (probe) url.searchParams.set('probe', probe);
  return url.toString();
}

async function probeResponse(specifier = '', probe = '') {
  const url = makeVersionedSpecifier(specifier, probe);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const text = await response.text();
    const firstChars = text.slice(0, 120).replace(/\s+/g, ' ');
    return {
      url,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') || '(none)',
      firstChars,
    };
  } catch (error) {
    return {
      url,
      fetchError: error?.message || String(error),
      status: 0,
      statusText: 'FETCH_FAILED',
      contentType: '(fetch failed)',
      firstChars: '',
    };
  }
}

function formatProbe(probe) {
  const lines = [];
  lines.push(`status: ${probe.status} ${probe.statusText || ''}`.trim());
  lines.push(`content-type: ${probe.contentType}`);
  if (probe.fetchError) {
    lines.push(`fetch-error: ${probe.fetchError}`);
  } else {
    lines.push(`first-chars: ${probe.firstChars || '(empty)'}`);
  }
  return lines.join(' | ');
}

export async function runBootstrapStage() {
  const report = [];
  const failures = [];
  const probeSeed = `${Date.now()}`;

  for (const group of GROUPS) {
    report.push(`GROUP ${group.id}｜${group.label}`);
    let groupFailed = false;
    for (const specifier of group.modules) {
      const short = specifier.replace(/^\.\//, '').replace(/^\.\.\//, '');
      try {
        await import(makeVersionedSpecifier(specifier, probeSeed));
        report.push(`  OK   ${short}`);
      } catch (error) {
        groupFailed = true;
        const probe = await probeResponse(specifier, probeSeed);
        failures.push({
          groupId: group.id,
          groupLabel: group.label,
          specifier,
          error,
          probe,
        });
        report.push(`  FAIL ${short}`);
        report.push(`       ${error?.message || String(error)}`);
        report.push(`       ${formatProbe(probe)}`);
        break;
      }
    }
    if (!groupFailed) {
      report.push('  狀態：本組通過');
    } else {
      report.push('  狀態：本組失敗，停止後續群組載入');
      break;
    }
  }

  return {
    ok: failures.length === 0,
    report,
    failures,
    firstFailure: failures[0] || null,
  };
}
