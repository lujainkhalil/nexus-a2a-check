import { AgentCard, CheckResult, CheckDetail } from '../types.js';
import * as crypto from 'crypto';

const SPEC_REF = 'https://a2a-protocol.org/latest/specification/#84-agent-card-signing';

/**
 * Check 3: Verify A2A Agent Card cryptographic signature (A2A spec §8.4)
 *
 * A2A v1.0 introduces optional signed Agent Cards. The signature covers the
 * canonical JSON form of the card (fields sorted, signature field excluded).
 * Supported algorithms: ES256, RS256, EdDSA (per spec §8.4.2)
 */
export async function checkSignature(card: AgentCard): Promise<CheckResult> {
  const start = Date.now();
  const details: CheckDetail[] = [];

  if (!card.signature) {
    return {
      name: 'Signature Verification',
      status: 'skip',
      details: [
        {
          message: 'No signature field present — signed Agent Cards are optional in A2A v1.0',
          specRef: SPEC_REF,
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  const sig = card.signature;

  // Validate signature object structure (§8.4.2)
  if (!sig.algorithm || typeof sig.algorithm !== 'string') {
    return {
      name: 'Signature Verification',
      status: 'fail',
      details: [{ message: 'signature.algorithm must be a string (e.g. ES256, RS256, EdDSA)', specRef: SPEC_REF }],
      durationMs: Date.now() - start,
    };
  }

  if (!sig.signature || typeof sig.signature !== 'string') {
    return {
      name: 'Signature Verification',
      status: 'fail',
      details: [{ message: 'signature.signature (the Base64url-encoded value) is missing or not a string', specRef: SPEC_REF }],
      durationMs: Date.now() - start,
    };
  }

  const supportedAlgorithms = ['ES256', 'ES384', 'ES512', 'RS256', 'RS384', 'RS512', 'EdDSA', 'PS256'];
  if (!supportedAlgorithms.includes(sig.algorithm)) {
    details.push({
      message: `Unknown signing algorithm "${sig.algorithm}". Spec recommends: ${supportedAlgorithms.join(', ')}`,
      specRef: SPEC_REF,
    });
    // Don't fail — could be a custom algorithm; just warn
  }

  // Validate Base64url encoding of signature value
  const base64urlRegex = /^[A-Za-z0-9_-]+=*$/;
  if (!base64urlRegex.test(sig.signature)) {
    return {
      name: 'Signature Verification',
      status: 'fail',
      details: [
        {
          message: 'signature.signature is not valid Base64url encoding',
          specRef: SPEC_REF,
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  // Attempt canonicalization (§8.4.1) — sort keys, exclude signature field
  let canonicalJson: string;
  try {
    canonicalJson = canonicalizeCard(card);
  } catch (e) {
    return {
      name: 'Signature Verification',
      status: 'fail',
      details: [{ message: `Failed to canonicalize Agent Card for verification: ${(e as Error).message}`, specRef: SPEC_REF }],
      durationMs: Date.now() - start,
    };
  }

  // If a "protected" JWS header is present, validate it
  if (sig.protected) {
    try {
      const headerJson = Buffer.from(sig.protected, 'base64url').toString('utf8');
      const header = JSON.parse(headerJson) as Record<string, unknown>;
      if (header.alg && header.alg !== sig.algorithm) {
        details.push({
          message: `Algorithm mismatch: signature.algorithm="${sig.algorithm}" but JWS protected header alg="${header.alg}"`,
          specRef: SPEC_REF,
        });
      }
    } catch {
      details.push({ message: 'signature.protected is not valid Base64url-encoded JSON', specRef: SPEC_REF });
    }
  }

  // Without the public key we cannot fully verify, but we can confirm structure is valid
  details.push(
    { message: `Signature present using algorithm: ${sig.algorithm}` },
    { message: `Key ID: ${sig.keyId ?? '(not specified)'}` },
    {
      message:
        'Structural validation passed — full cryptographic verification requires the agent\'s public key. ' +
        'Obtain the key from the provider\'s JWKS endpoint and verify the canonical form.',
      specRef: SPEC_REF,
    },
  );

  // Compute a SHA-256 digest of the canonical form so devs can cross-check
  const digest = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  details.push({ message: `Canonical card SHA-256: ${digest}` });

  return {
    name: 'Signature Verification',
    status: details.some(d => d.message.includes('mismatch')) ? 'warn' : 'pass',
    details,
    durationMs: Date.now() - start,
  };
}

/**
 * Produce canonical JSON per A2A spec §8.4.1:
 * - Recursively sort object keys alphabetically
 * - Exclude the top-level "signature" field
 */
function canonicalizeCard(card: AgentCard): string {
  const cardCopy = { ...card } as Record<string, unknown>;
  delete cardCopy['signature'];
  return JSON.stringify(sortObjectKeys(cardCopy));
}

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}
