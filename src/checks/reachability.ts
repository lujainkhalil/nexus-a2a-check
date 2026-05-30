import { AgentCard, CheckResult, CheckDetail } from '../types.js';

const SPEC_REF = 'https://a2a-protocol.org/latest/specification/#8-agent-discovery-the-agent-card';

/**
 * Check 4: Verify the declared agent endpoint is reachable (A2A spec §8.3)
 *
 * The Agent Card's "url" field declares the primary A2A service endpoint.
 * We confirm the server responds to HTTP requests.
 */
export async function checkReachability(card: AgentCard): Promise<CheckResult> {
  const start = Date.now();
  const details: CheckDetail[] = [];

  const agentUrl = card.url;

  if (!agentUrl) {
    return {
      name: 'Endpoint Reachability',
      status: 'fail',
      details: [{ message: 'No url field in Agent Card — cannot check endpoint reachability', specRef: SPEC_REF }],
      durationMs: Date.now() - start,
    };
  }

  // Verify it's HTTPS (required for production agents per §7.1)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(agentUrl);
  } catch {
    return {
      name: 'Endpoint Reachability',
      status: 'fail',
      details: [{ message: `Agent Card url is not a valid URL: "${agentUrl}"`, specRef: SPEC_REF }],
      durationMs: Date.now() - start,
    };
  }

  if (parsedUrl.protocol === 'http:') {
    details.push({
      message: 'Warning: Agent endpoint uses HTTP, not HTTPS. A2A spec §7.1 requires TLS for production agents.',
      specRef: 'https://a2a-protocol.org/latest/specification/#71-protocol-security',
    });
  }

  // Try HEAD first (lightweight), fall back to GET
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let status: number | null = null;
  let serverHeader: string | null = null;
  let a2aVersionHeader: string | null = null;
  let reachable = false;

  try {
    const response = await fetch(agentUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'nexus-check/1.0 (A2A validator)',
        'A2A-Version': '1.0',
      },
    });
    status = response.status;
    serverHeader = response.headers.get('server');
    a2aVersionHeader = response.headers.get('a2a-version');
    reachable = true;
  } catch (headError) {
    // HEAD failed — try GET
    try {
      const response = await fetch(agentUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'nexus-check/1.0 (A2A validator)',
          'A2A-Version': '1.0',
          'Content-Type': 'application/json',
        },
      });
      status = response.status;
      serverHeader = response.headers.get('server');
      a2aVersionHeader = response.headers.get('a2a-version');
      reachable = true;
    } catch (getError) {
      const err = getError as Error;
      const message = err.name === 'AbortError'
        ? `Request timed out after 10 seconds — agent endpoint at "${agentUrl}" did not respond`
        : `Could not reach agent endpoint at "${agentUrl}": ${err.message}`;
      return {
        name: 'Endpoint Reachability',
        status: 'fail',
        details: [{ message, specRef: SPEC_REF }],
        durationMs: Date.now() - start,
      };
    }
  } finally {
    clearTimeout(timeout);
  }

  details.push({ message: `Agent endpoint responded with HTTP ${status}` });

  if (serverHeader) {
    details.push({ message: `Server: ${serverHeader}` });
  }

  if (a2aVersionHeader) {
    details.push({
      message: `A2A-Version header: ${a2aVersionHeader}`,
      specRef: 'https://a2a-protocol.org/latest/specification/#1421-a2a-version-header',
    });
  }

  // 401/403 means the server is up but requires auth — count as reachable
  if (status === 401 || status === 403) {
    details.push({
      message: `Endpoint is live but requires authentication (HTTP ${status}). Check the Agent Card's authentication schemes.`,
      specRef: 'https://a2a-protocol.org/latest/specification/#7-authentication-and-authorization',
    });
    return {
      name: 'Endpoint Reachability',
      status: 'warn',
      details,
      durationMs: Date.now() - start,
    };
  }

  if (status && status >= 500) {
    details.push({ message: `Server returned error HTTP ${status} — agent endpoint may be misconfigured` });
    return {
      name: 'Endpoint Reachability',
      status: 'fail',
      details,
      durationMs: Date.now() - start,
    };
  }

  // Also check any additionalInterfaces (§8.3.1)
  if (card.additionalInterfaces && card.additionalInterfaces.length > 0) {
    details.push({ message: `Declared ${card.additionalInterfaces.length} additional interface(s) — primary endpoint verified` });
  }

  return {
    name: 'Endpoint Reachability',
    status: reachable ? 'pass' : 'fail',
    details,
    durationMs: Date.now() - start,
  };
}
