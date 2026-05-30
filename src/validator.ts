import { AgentCard, ValidationReport, CheckResult, CheckDetail } from './types.js';
import { checkSchema } from './checks/schema.js';
import { checkSignature } from './checks/signature.js';
import { checkReachability } from './checks/reachability.js';
import { checkLifecycle } from './checks/lifecycle.js';

export interface ValidatorOptions {
  skipLifecycle?: boolean;
  timeout?: number;
}

const WELL_KNOWN_PATH = '/.well-known/agent.json';

/**
 * Main validator — runs all A2A compliance checks against a given agent URL.
 */
export async function validate(inputUrl: string, options: ValidatorOptions = {}): Promise<ValidationReport> {
  const timestamp = new Date().toISOString();

  // Normalise URL
  let baseUrl: string;
  try {
    const parsed = new URL(inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`);
    // Strip any path — we'll always look for the well-known path
    baseUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    return {
      url: inputUrl,
      timestamp,
      checks: [
        {
          name: 'Agent Card Discovery',
          status: 'fail',
          details: [{ message: `"${inputUrl}" is not a valid URL` }],
        },
      ],
      score: 0,
      maxScore: 5,
    };
  }

  const checks: CheckResult[] = [];

  // ── Check 1: Agent Card Discovery ──────────────────────────────────────────
  const discoveryResult = await discoverAgentCard(baseUrl);
  checks.push(discoveryResult.check);

  if (!discoveryResult.card) {
    // Can't proceed without a card
    return {
      url: baseUrl,
      timestamp,
      checks,
      score: 0,
      maxScore: 5,
    };
  }

  const card = discoveryResult.card;

  // ── Check 2: Schema Validation ─────────────────────────────────────────────
  checks.push(await checkSchema(card));

  // ── Check 3: Signature Verification ───────────────────────────────────────
  checks.push(await checkSignature(card));

  // ── Check 4: Endpoint Reachability ────────────────────────────────────────
  checks.push(await checkReachability(card));

  // ── Check 5: Task Lifecycle ────────────────────────────────────────────────
  if (!options.skipLifecycle) {
    checks.push(await checkLifecycle(card));
  } else {
    checks.push({
      name: 'Task Lifecycle',
      status: 'skip',
      details: [{ message: 'Skipped via --skip-lifecycle flag' }],
    });
  }

  // ── Score calculation ──────────────────────────────────────────────────────
  // pass = 1 point, warn = 0.5 points, skip = 0.5 points, fail = 0 points
  const score = checks.reduce((acc, c) => {
    if (c.status === 'pass') return acc + 1;
    if (c.status === 'warn' || c.status === 'skip') return acc + 0.5;
    return acc;
  }, 0);

  return {
    url: baseUrl,
    timestamp,
    checks,
    score,
    maxScore: 5,
    agentCard: card,
  };
}

/**
 * Discover the Agent Card at /.well-known/agent.json
 * A2A spec §8.2 — the well-known URI for Agent Card discovery.
 */
async function discoverAgentCard(baseUrl: string): Promise<{ check: CheckResult; card?: AgentCard }> {
  const start = Date.now();
  const cardUrl = `${baseUrl}${WELL_KNOWN_PATH}`;
  const specRef = 'https://a2a-protocol.org/latest/specification/#82-discovery-mechanisms';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(cardUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, application/a2a+json',
        'User-Agent': 'nexus-check/1.0 (A2A validator)',
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const error = err as Error;
    const message = error.name === 'AbortError'
      ? `Request to ${cardUrl} timed out after 10 seconds`
      : `Could not reach ${cardUrl}: ${error.message}`;
    return {
      check: {
        name: 'Agent Card Discovery',
        status: 'fail',
        details: [{ message, specRef }],
        durationMs: Date.now() - start,
      },
    };
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    return {
      check: {
        name: 'Agent Card Discovery',
        status: 'fail',
        details: [
          {
            message: `No Agent Card found at ${cardUrl} (HTTP 404). Agent Cards must be served at /.well-known/agent.json`,
            specRef,
          },
        ],
        durationMs: Date.now() - start,
      },
    };
  }

  if (response.status !== 200) {
    return {
      check: {
        name: 'Agent Card Discovery',
        status: 'fail',
        details: [
          {
            message: `Unexpected HTTP ${response.status} when fetching Agent Card from ${cardUrl}`,
            specRef,
          },
        ],
        durationMs: Date.now() - start,
      },
    };
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    return {
      check: {
        name: 'Agent Card Discovery',
        status: 'fail',
        details: [{ message: 'Failed to read response body', specRef }],
        durationMs: Date.now() - start,
      },
    };
  }

  let card: AgentCard;
  try {
    card = JSON.parse(body) as AgentCard;
  } catch {
    return {
      check: {
        name: 'Agent Card Discovery',
        status: 'fail',
        details: [
          {
            message: `Agent Card at ${cardUrl} is not valid JSON`,
            specRef,
          },
        ],
        durationMs: Date.now() - start,
      },
    };
  }

  const details: CheckDetail[] = [
    { message: `Agent Card found at ${cardUrl}` },
    { message: `Agent name: ${card.name ?? '(unknown)'}` },
  ];

  if (card.protocolVersion) {
    details.push({ message: `Protocol version: ${card.protocolVersion}` });
  }

  // Check CORS headers (helpful for browser-based discovery)
  const corsHeader = response.headers.get('access-control-allow-origin');
  if (corsHeader) {
    details.push({ message: `CORS enabled: Access-Control-Allow-Origin: ${corsHeader}` });
  }

  // Check caching headers (spec §8.6.1)
  const etag = response.headers.get('etag');
  const cacheControl = response.headers.get('cache-control');
  if (etag || cacheControl) {
    details.push({
      message: `Caching headers present${etag ? ` (ETag: ${etag})` : ''}${cacheControl ? ` (Cache-Control: ${cacheControl})` : ''}`,
      specRef: 'https://a2a-protocol.org/latest/specification/#86-caching',
    });
  }

  return {
    check: {
      name: 'Agent Card Discovery',
      status: 'pass',
      details,
      durationMs: Date.now() - start,
    },
    card,
  };
}
