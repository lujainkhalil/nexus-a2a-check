#!/usr/bin/env node

import { validate } from './validator.js';
import { printReport, printSummaryLine, formatJson } from './reporter.js';

const VERSION = '1.0.0';

const HELP = `
nexus-check — A2A Agent Card Validator
Validate any A2A-compliant agent in seconds.

USAGE
  npx nexus-check <url> [options]

ARGUMENTS
  url                  Agent base URL (e.g. https://myagent.com)

OPTIONS
  --json               Output results as JSON
  --summary            Print a single-line summary (good for CI)
  --skip-lifecycle     Skip the task lifecycle check
  --version            Print version and exit
  --help               Show this help

EXAMPLES
  npx nexus-check https://myagent.com
  npx nexus-check https://myagent.com --json
  npx nexus-check https://myagent.com --skip-lifecycle

ABOUT
  nexus-check validates your agent's compliance with the A2A protocol
  (Agent2Agent, Linux Foundation). It checks:

    1. Agent Card Discovery   /.well-known/agent.json is served correctly
    2. Schema Validation      All required fields present and correctly typed
    3. Signature Verification Cryptographic signature (if present) is valid
    4. Endpoint Reachability  Declared agent endpoint responds to requests
    5. Task Lifecycle         JSON-RPC SendMessage returns a valid Task

  Spec: https://a2a-protocol.org/latest/specification/

  Part of Nexus — trust infrastructure for the open agent web.
  https://nexus.ai
`.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`nexus-check v${VERSION}`);
    process.exit(0);
  }

  // Find the URL argument (first non-flag arg)
  const url = args.find(a => !a.startsWith('--'));
  if (!url) {
    console.error('Error: No URL provided. Run `npx nexus-check --help` for usage.');
    process.exit(1);
  }

  const jsonMode = args.includes('--json');
  const summaryMode = args.includes('--summary');
  const skipLifecycle = args.includes('--skip-lifecycle');

  if (!jsonMode) {
    process.stdout.write('\x1b[2m  Running A2A compliance checks…\x1b[0m\n');
  }

  const report = await validate(url, { skipLifecycle });

  if (jsonMode) {
    console.log(formatJson(report));
  } else if (summaryMode) {
    printSummaryLine(report);
  } else {
    printReport(report);
  }

  // Exit code 1 if any checks failed
  const anyFailed = report.checks.some(c => c.status === 'fail');
  process.exit(anyFailed ? 1 : 0);
}

main().catch(err => {
  console.error('nexus-check: unexpected error:', err);
  process.exit(2);
});
