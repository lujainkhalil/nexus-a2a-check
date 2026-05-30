import { ValidationReport, CheckResult, CheckStatus } from './types.js';

// ANSI colour codes — no external dependency needed
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed:   '\x1b[41m',
  bgYellow:'\x1b[43m',
};

function col(text: string, ...codes: string[]): string {
  return `${codes.join('')}${text}${c.reset}`;
}

const CHECK_ICONS: Record<CheckStatus, string> = {
  pass: col(' PASS ', c.bold, c.bgGreen, c.white),
  fail: col(' FAIL ', c.bold, c.bgRed, c.white),
  warn: col(' WARN ', c.bold, c.bgYellow, c.white),
  skip: col(' SKIP ', c.bold, c.dim),
};

const DETAIL_ICONS: Record<CheckStatus, string> = {
  pass: col('✓', c.green),
  fail: col('✗', c.red),
  warn: col('⚠', c.yellow),
  skip: col('○', c.gray),
};

export function printReport(report: ValidationReport): void {
  const { url, timestamp, checks, score, maxScore } = report;

  // ── Header ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log(col('  nexus-check  ', c.bold, c.bgGreen, c.white) + col('  A2A Agent Card Validator', c.bold));
  console.log(col('  https://github.com/nexus-ai/nexus-check', c.dim));
  console.log('');
  console.log(col('Target: ', c.dim) + col(url, c.cyan, c.bold));
  console.log(col('Scanned:', c.dim) + ' ' + new Date(timestamp).toLocaleString());
  console.log('');

  const divider = col('─'.repeat(60), c.gray);

  // ── Checks ─────────────────────────────────────────────────────────────────
  for (const check of checks) {
    printCheck(check, divider);
  }

  // ── Score ──────────────────────────────────────────────────────────────────
  console.log(divider);
  const scoreInt = Math.round(score);
  const pct = Math.round((score / maxScore) * 100);
  const allPass = score >= maxScore;
  const allFail = score === 0;

  const scoreLabel = allPass
    ? col(`${scoreInt}/${maxScore} — fully A2A compliant ✓`, c.bold, c.green)
    : allFail
    ? col(`${scoreInt}/${maxScore} — not A2A compliant`, c.bold, c.red)
    : col(`${Math.floor(score * 2) / 2}/${maxScore} — partially compliant (${pct}%)`, c.bold, c.yellow);

  console.log('');
  console.log('  ' + scoreLabel);
  console.log('');

  if (!allPass) {
    const failedChecks = checks.filter(c => c.status === 'fail');
    if (failedChecks.length > 0) {
      console.log(col('  Next steps:', c.bold));
      for (const fc of failedChecks) {
        const firstError = fc.details.find(d => d.message.toLowerCase().includes('missing') || d.specRef);
        if (firstError?.specRef) {
          console.log(col(`  → ${fc.name}: `, c.dim) + col(firstError.specRef, c.cyan));
        }
      }
      console.log('');
    }
  }

  console.log(col('  Powered by Nexus — trust infrastructure for the open agent web', c.dim));
  console.log(col('  nexus.ai', c.dim));
  console.log('');
}

function printCheck(check: CheckResult, divider: string): void {
  const badge = CHECK_ICONS[check.status];
  const duration = check.durationMs != null ? col(` ${check.durationMs}ms`, c.gray) : '';

  console.log(divider);
  console.log(`  ${badge}  ${col(check.name, c.bold)}${duration}`);

  for (const detail of check.details) {
    const icon = DETAIL_ICONS[check.status];
    const ref = detail.specRef ? col(` — ${detail.specRef}`, c.dim) : '';
    console.log(`        ${icon} ${detail.message}${ref}`);
  }
}

/**
 * Print a compact single-line summary (useful for CI output)
 */
export function printSummaryLine(report: ValidationReport): void {
  const { score, maxScore, checks } = report;
  const allPass = score >= maxScore;
  const status = allPass ? col('PASS', c.green, c.bold) : col('FAIL', c.red, c.bold);
  const failures = checks.filter(c => c.status === 'fail').map(c => c.name).join(', ');
  console.log(`[nexus-check] ${status} ${Math.floor(score * 2) / 2}/${maxScore}${failures ? ` | Failed: ${failures}` : ''}`);
}

/**
 * Format report as JSON (for --json flag)
 */
export function formatJson(report: ValidationReport): string {
  return JSON.stringify(report, null, 2);
}
