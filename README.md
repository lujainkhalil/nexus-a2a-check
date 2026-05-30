# nexus-a2a-check

[![npm version](https://img.shields.io/npm/v/nexus-check?color=00d4a8&label=npm)](https://www.npmjs.com/package/nexus-a2a-check)
[![License: MIT](https://img.shields.io/badge/License-MIT-00d4a8.svg)](LICENSE)
[![A2A Spec](https://img.shields.io/badge/A2A-v1.0-0F6E56)](https://a2a-protocol.org/latest/specification/)

**The `npx` tool for validating A2A Agent Cards.** Run it against any agent URL and get an instant compliance report.

```
npx nexus-check https://myagent.example.com
```

---

## Why this exists

The [A2A protocol](https://a2a-protocol.org) (Agent2Agent, Linux Foundation) defines how AI agents discover and communicate with each other. Every A2A agent publishes an **Agent Card** at `/.well-known/agent.json`, a structured manifest declaring its capabilities, skills, and endpoint.

Getting the Agent Card right is critical: it's the first thing any A2A client reads before attempting to communicate with your agent. But until now there was no clean tool to validate it.

**nexus-check** fills that gap. Zero install, instant output, spec-linked error messages.

---

## Install & Usage

No install needed — run directly with `npx`:

```bash
npx nexus-check https://myagent.example.com
```

Or install globally:

```bash
npm install -g nexus-check
nexus-check https://myagent.example.com
```

### Options

```
nexus-check <url> [options]

Options:
  --json              Output full report as JSON (for CI/CD pipelines)
  --summary           Print a single-line summary
  --skip-lifecycle    Skip the task lifecycle check (faster, no side-effects)
  --version           Print version
  --help              Show help
```

---

## What it checks

| # | Check | What it validates |
|---|-------|-------------------|
| 1 | **Agent Card Discovery** | `/.well-known/agent.json` exists and returns valid JSON |
| 2 | **Schema Validation** | All required fields (`name`, `description`, `url`, `version`, `capabilities`) present with correct types |
| 3 | **Signature Verification** | Cryptographic signature structure valid (A2A v1.0) — skipped if unsigned |
| 4 | **Endpoint Reachability** | The declared `url` endpoint responds to HTTP requests |
| 5 | **Task Lifecycle** | JSON-RPC 2.0 `a2a.sendMessage` returns a valid `Task` with a recognised `TaskState` |

Scoring: **pass** = 1pt · **warn/skip** = 0.5pt · **fail** = 0pt · Max: **5/5**

---

## Example output

```
  nexus-check  A2A Agent Card Validator
  https://github.com/nexus-ai/nexus-check

Target:  https://myagent.example.com
Scanned: 30 May 2026, 14:22:01

────────────────────────────────────────────────────────────
  PASS  Agent Card Discovery   (312ms)
        ✓ Agent Card found at https://myagent.example.com/.well-known/agent.json
        ✓ Agent name: My Awesome Agent
        ✓ Protocol version: 1.0
────────────────────────────────────────────────────────────
  PASS  Schema Validation   (1ms)
        ✓ All required fields present and correctly typed
        ✓ Capabilities enabled: streaming, pushNotifications
        ✓ Declared 3 skill(s): web-search, summarise, translate
────────────────────────────────────────────────────────────
  SKIP  Signature Verification
        ○ No signature field — signed Agent Cards are optional in A2A v1.0
────────────────────────────────────────────────────────────
  PASS  Endpoint Reachability   (89ms)
        ✓ Agent endpoint responded with HTTP 200
        ✓ A2A-Version header: 1.0
────────────────────────────────────────────────────────────
  PASS  Task Lifecycle   (441ms)
        ✓ Task created: 3f2a8b1c-4d5e-4f6a-8b9c-0d1e2f3a4b5c
        ✓ Task state: working — valid A2A lifecycle state

────────────────────────────────────────────────────────────

  4.5/5 — mostly A2A compliant (add a signature for full marks)

  Powered by Nexus — trust infrastructure for the open agent web
  nexus.ai
```

### Failure example

```
  FAIL  Schema Validation
        ✗ Missing required field: capabilities
          → https://a2a-protocol.org/latest/specification/#443-agentcapabilities
        ✗ Field "url" is not a valid URL: "myagent.example.com"
          → https://a2a-protocol.org/latest/specification/#441-agentcard
```

Every error message tells you exactly what's wrong and links to the relevant spec section.

---

## Repo badge

Add this badge to your agent's README once it passes:

```markdown
[![A2A Compliant](https://img.shields.io/badge/A2A-compliant-0F6E56)](https://github.com/lujainkhalil/nexus-a2a-check)
```

[![A2A Compliant](https://img.shields.io/badge/A2A-compliant-0F6E56)](https://github.com/lujainkhalil/nexus-a2a-check)

---

## Web version

A companion browser-based validator is available at `web/index.html` (or your deployed URL). Paste any agent URL and get the same report in the browser. Note: browser CORS policies may limit the lifecycle check — use the CLI for full validation.

---

## A2A spec reference

- Full spec: [a2a-protocol.org/latest/specification](https://a2a-protocol.org/latest/specification/)
- Agent Card schema: [§4.4.1 AgentCard](https://a2a-protocol.org/latest/specification/#441-agentcard)
- Discovery: [§8.2 Discovery Mechanisms](https://a2a-protocol.org/latest/specification/#82-discovery-mechanisms)
- Task lifecycle: [§4.1.3 TaskState](https://a2a-protocol.org/latest/specification/#413-taskstate)
- Signatures: [§8.4 Agent Card Signing](https://a2a-protocol.org/latest/specification/#84-agent-card-signing)

**Required Agent Card fields:**

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Human-readable agent name |
| `description` | string | What the agent does |
| `url` | string (URL) | Primary A2A endpoint |
| `version` | string | Agent software version |
| `capabilities` | object | `{ streaming?, pushNotifications?, stateTransitionHistory? }` |

---

## Development

```bash
git clone https://github.com/nexus-ai/nexus-check
cd nexus-check
npm install
npm run build
npm test

# Run locally against a real agent
node dist/index.js https://myagent.example.com
```

### Project structure

```
nexus-check/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── validator.ts      # Orchestrates all checks
│   ├── reporter.ts       # Terminal output formatting
│   ├── types.ts          # A2A type definitions
│   └── checks/
│       ├── schema.ts     # Required field / type validation
│       ├── signature.ts  # Cryptographic signature verification
│       ├── reachability.ts  # Endpoint HTTP check
│       └── lifecycle.ts  # JSON-RPC task submission
├── web/
│   └── index.html        # Static browser validator
├── tests/
│   └── validator.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Contributing

Issues and PRs welcome. If you find a compliant agent that fails a check — or a non-compliant agent that passes — please open an issue with the agent URL.

---

## About Nexus

nexus-a2a-check is the open source entry point for **Nexus** — trust and economic infrastructure for the open agent web.

---

MIT License
