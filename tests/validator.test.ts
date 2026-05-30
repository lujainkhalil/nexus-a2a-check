import { checkSchema } from '../src/checks/schema';
import { checkSignature } from '../src/checks/signature';
import { AgentCard } from '../src/types';

// Minimal valid Agent Card per A2A spec §4.4.1
const validCard: AgentCard = {
  name: 'Test Agent',
  description: 'A test agent for nexus-check validation',
  url: 'https://agent.example.com',
  version: '1.0.0',
  capabilities: {
    streaming: true,
    pushNotifications: false,
  },
};

// ── Schema validation tests ────────────────────────────────────────────────

describe('checkSchema', () => {
  test('passes a fully valid Agent Card', async () => {
    const result = await checkSchema(validCard);
    expect(result.status).toBe('pass');
  });

  test('fails when name is missing', async () => {
    const card = { ...validCard };
    delete (card as Partial<AgentCard>).name;
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('name'))).toBe(true);
  });

  test('fails when description is missing', async () => {
    const card = { ...validCard };
    delete (card as Partial<AgentCard>).description;
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('description'))).toBe(true);
  });

  test('fails when url is missing', async () => {
    const card = { ...validCard };
    delete (card as Partial<AgentCard>).url;
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('url'))).toBe(true);
  });

  test('fails when version is missing', async () => {
    const card = { ...validCard };
    delete (card as Partial<AgentCard>).version;
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('version'))).toBe(true);
  });

  test('fails when capabilities is missing', async () => {
    const card = { ...validCard };
    delete (card as Partial<AgentCard>).capabilities;
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('capabilities'))).toBe(true);
  });

  test('fails when url is not a valid URL', async () => {
    const card = { ...validCard, url: 'not-a-url' };
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('valid URL'))).toBe(true);
  });

  test('fails when name is empty string', async () => {
    const card = { ...validCard, name: '' };
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
  });

  test('fails when capabilities is not an object', async () => {
    const card = { ...validCard, capabilities: 'streaming' as unknown as AgentCard['capabilities'] };
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('capabilities'))).toBe(true);
  });

  test('fails when capabilities boolean fields have wrong type', async () => {
    const card = { ...validCard, capabilities: { streaming: 'yes' } as unknown as AgentCard['capabilities'] };
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
  });

  test('validates skills array structure', async () => {
    const card: AgentCard = {
      ...validCard,
      skills: [{ id: 'search', name: 'Web Search', description: 'Search the web' }],
    };
    const result = await checkSchema(card);
    expect(result.status).toBe('pass');
  });

  test('fails when skill is missing id', async () => {
    const card = {
      ...validCard,
      skills: [{ name: 'No ID Skill' }] as unknown as AgentCard['skills'],
    };
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('skills[0].id'))).toBe(true);
  });

  test('validates provider structure', async () => {
    const card: AgentCard = {
      ...validCard,
      provider: { organization: 'Acme Corp', url: 'https://acme.com' },
    };
    const result = await checkSchema(card);
    expect(result.status).toBe('pass');
  });

  test('fails when provider missing organization', async () => {
    const card = {
      ...validCard,
      provider: { url: 'https://acme.com' } as unknown as AgentCard['provider'],
    };
    const result = await checkSchema(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('provider.organization'))).toBe(true);
  });

  test('fails for non-object input', async () => {
    const result = await checkSchema('not-an-object');
    expect(result.status).toBe('fail');
  });

  test('fails for null input', async () => {
    const result = await checkSchema(null);
    expect(result.status).toBe('fail');
  });

  test('provides spec references for failures', async () => {
    const card = { ...validCard };
    delete (card as Partial<AgentCard>).name;
    const result = await checkSchema(card);
    expect(result.details.some(d => d.specRef?.includes('a2a-protocol.org'))).toBe(true);
  });
});

// ── Signature verification tests ───────────────────────────────────────────

describe('checkSignature', () => {
  test('skips when no signature present', async () => {
    const result = await checkSignature(validCard);
    expect(result.status).toBe('skip');
    expect(result.details.some(d => d.message.includes('optional'))).toBe(true);
  });

  test('passes a valid signature structure', async () => {
    const card: AgentCard = {
      ...validCard,
      signature: {
        algorithm: 'ES256',
        keyId: 'key-2024-01',
        signature: 'base64urlsignaturevalue==',
      },
    };
    const result = await checkSignature(card);
    expect(result.status).toBe('pass');
    expect(result.details.some(d => d.message.includes('ES256'))).toBe(true);
  });

  test('fails when algorithm is missing', async () => {
    const card: AgentCard = {
      ...validCard,
      signature: {
        algorithm: '',
        signature: 'validBase64url',
      },
    };
    const result = await checkSignature(card);
    expect(result.status).toBe('fail');
  });

  test('fails when signature value is not base64url', async () => {
    const card: AgentCard = {
      ...validCard,
      signature: {
        algorithm: 'ES256',
        signature: 'not valid base 64 url!!!',
      },
    };
    const result = await checkSignature(card);
    expect(result.status).toBe('fail');
    expect(result.details.some(d => d.message.includes('Base64url'))).toBe(true);
  });

  test('warns on algorithm mismatch between signature and JWS header', async () => {
    // Encode a protected header with alg=RS256 but signature.algorithm=ES256
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const card: AgentCard = {
      ...validCard,
      signature: {
        algorithm: 'ES256',
        signature: 'validBase64urlSignature==',
        protected: header,
      },
    };
    const result = await checkSignature(card);
    expect(result.status).toBe('warn');
    expect(result.details.some(d => d.message.includes('mismatch'))).toBe(true);
  });

  test('includes canonical form SHA-256 digest', async () => {
    const card: AgentCard = {
      ...validCard,
      signature: {
        algorithm: 'EdDSA',
        signature: 'validBase64url',
      },
    };
    const result = await checkSignature(card);
    expect(result.details.some(d => d.message.includes('SHA-256'))).toBe(true);
  });
});
