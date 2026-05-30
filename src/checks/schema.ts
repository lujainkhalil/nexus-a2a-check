import { AgentCard, CheckResult, CheckDetail } from '../types.js';

const SPEC_BASE = 'https://a2a-protocol.org/latest/specification';

/**
 * Check 1: Validate the Agent Card JSON schema against A2A spec §4.4.1
 * Verifies all required fields are present and have correct types.
 */
export async function checkSchema(card: unknown): Promise<CheckResult> {
  const start = Date.now();
  const details: CheckDetail[] = [];
  let passed = true;

  if (typeof card !== 'object' || card === null || Array.isArray(card)) {
    return {
      name: 'Schema Validation',
      status: 'fail',
      details: [{ message: 'Agent Card is not a valid JSON object', specRef: `${SPEC_BASE}/#441-agentcard` }],
      durationMs: Date.now() - start,
    };
  }

  const obj = card as Record<string, unknown>;

  // --- Required field checks ---
  const requiredStringFields: Array<keyof AgentCard> = ['name', 'description', 'url', 'version'];
  for (const field of requiredStringFields) {
    if (!(field in obj)) {
      details.push({
        message: `Missing required field: ${field}`,
        specRef: `${SPEC_BASE}/#441-agentcard`,
      });
      passed = false;
    } else if (typeof obj[field] !== 'string') {
      details.push({
        message: `Field "${field}" must be a string, got ${typeof obj[field]}`,
        specRef: `${SPEC_BASE}/#441-agentcard`,
      });
      passed = false;
    } else if ((obj[field] as string).trim() === '') {
      details.push({
        message: `Field "${field}" must not be empty`,
        specRef: `${SPEC_BASE}/#441-agentcard`,
      });
      passed = false;
    }
  }

  // --- URL format check ---
  if (typeof obj.url === 'string') {
    try {
      new URL(obj.url);
    } catch {
      details.push({
        message: `Field "url" is not a valid URL: "${obj.url}"`,
        specRef: `${SPEC_BASE}/#441-agentcard`,
      });
      passed = false;
    }
  }

  // --- capabilities (required, object) ---
  if (!('capabilities' in obj)) {
    details.push({
      message: 'Missing required field: capabilities',
      specRef: `${SPEC_BASE}/#443-agentcapabilities`,
    });
    passed = false;
  } else if (typeof obj.capabilities !== 'object' || obj.capabilities === null) {
    details.push({
      message: `Field "capabilities" must be an object, got ${typeof obj.capabilities}`,
      specRef: `${SPEC_BASE}/#443-agentcapabilities`,
    });
    passed = false;
  } else {
    const caps = obj.capabilities as Record<string, unknown>;
    const capBoolFields = ['streaming', 'pushNotifications', 'stateTransitionHistory'];
    for (const f of capBoolFields) {
      if (f in caps && typeof caps[f] !== 'boolean') {
        details.push({
          message: `capabilities.${f} must be a boolean, got ${typeof caps[f]}`,
          specRef: `${SPEC_BASE}/#443-agentcapabilities`,
        });
        passed = false;
      }
    }
  }

  // --- Optional field type checks ---

  // provider
  if ('provider' in obj && obj.provider !== null && obj.provider !== undefined) {
    if (typeof obj.provider !== 'object') {
      details.push({ message: 'Field "provider" must be an object', specRef: `${SPEC_BASE}/#442-agentprovider` });
      passed = false;
    } else {
      const prov = obj.provider as Record<string, unknown>;
      if (!('organization' in prov) || typeof prov.organization !== 'string') {
        details.push({ message: 'provider.organization must be a string', specRef: `${SPEC_BASE}/#442-agentprovider` });
        passed = false;
      }
    }
  }

  // skills
  if ('skills' in obj && obj.skills !== undefined) {
    if (!Array.isArray(obj.skills)) {
      details.push({ message: 'Field "skills" must be an array', specRef: `${SPEC_BASE}/#445-agentskill` });
      passed = false;
    } else {
      (obj.skills as unknown[]).forEach((skill, i) => {
        if (typeof skill !== 'object' || skill === null) {
          details.push({ message: `skills[${i}] must be an object`, specRef: `${SPEC_BASE}/#445-agentskill` });
          passed = false;
        } else {
          const s = skill as Record<string, unknown>;
          if (!s.id || typeof s.id !== 'string') {
            details.push({ message: `skills[${i}].id must be a non-empty string`, specRef: `${SPEC_BASE}/#445-agentskill` });
            passed = false;
          }
          if (!s.name || typeof s.name !== 'string') {
            details.push({ message: `skills[${i}].name must be a non-empty string`, specRef: `${SPEC_BASE}/#445-agentskill` });
            passed = false;
          }
        }
      });
    }
  }

  // protocolVersion
  if ('protocolVersion' in obj && typeof obj.protocolVersion !== 'string') {
    details.push({ message: 'Field "protocolVersion" must be a string', specRef: `${SPEC_BASE}/#441-agentcard` });
    passed = false;
  }

  // extensions
  if ('extensions' in obj && obj.extensions !== undefined) {
    if (!Array.isArray(obj.extensions)) {
      details.push({ message: 'Field "extensions" must be an array', specRef: `${SPEC_BASE}/#444-agentextension` });
      passed = false;
    } else {
      (obj.extensions as unknown[]).forEach((ext, i) => {
        if (typeof ext !== 'object' || ext === null) {
          details.push({ message: `extensions[${i}] must be an object` });
          passed = false;
        } else {
          const e = ext as Record<string, unknown>;
          if (!e.uri || typeof e.uri !== 'string') {
            details.push({ message: `extensions[${i}].uri must be a string URI`, specRef: `${SPEC_BASE}/#444-agentextension` });
            passed = false;
          }
        }
      });
    }
  }

  // authentication
  if ('authentication' in obj && obj.authentication !== undefined) {
    if (typeof obj.authentication !== 'object' || Array.isArray(obj.authentication)) {
      details.push({ message: 'Field "authentication" must be a map of security scheme objects', specRef: `${SPEC_BASE}/#451-securityscheme` });
      passed = false;
    } else {
      const auth = obj.authentication as Record<string, unknown>;
      for (const [schemeName, schemeVal] of Object.entries(auth)) {
        if (typeof schemeVal !== 'object' || schemeVal === null) {
          details.push({ message: `authentication["${schemeName}"] must be an object`, specRef: `${SPEC_BASE}/#451-securityscheme` });
          passed = false;
        } else {
          const scheme = schemeVal as Record<string, unknown>;
          if (!('type' in scheme) || typeof scheme.type !== 'string') {
            details.push({ message: `authentication["${schemeName}"].type must be a string`, specRef: `${SPEC_BASE}/#451-securityscheme` });
            passed = false;
          }
        }
      }
    }
  }

  if (passed && details.length === 0) {
    details.push({ message: 'All required fields present and correctly typed' });
    // Bonus info
    const agentCard = obj as unknown as AgentCard;
    if (agentCard.skills?.length) {
      details.push({ message: `Declared ${agentCard.skills.length} skill(s): ${agentCard.skills.map(s => s.name).join(', ')}` });
    }
    const caps = agentCard.capabilities as Record<string, unknown>;
    const enabledCaps = Object.entries(caps).filter(([, v]) => v === true).map(([k]) => k);
    if (enabledCaps.length > 0) {
      details.push({ message: `Capabilities enabled: ${enabledCaps.join(', ')}` });
    }
  }

  return {
    name: 'Schema Validation',
    status: passed ? 'pass' : 'fail',
    details,
    durationMs: Date.now() - start,
  };
}
