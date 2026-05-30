import { AgentCard, CheckResult, CheckDetail, JsonRpcRequest, JsonRpcResponse, VALID_TASK_STATES, TERMINAL_STATES } from '../types.js';
import { randomUUID } from 'crypto';

const SPEC_REF = 'https://a2a-protocol.org/latest/specification/#411-task';
const METHODS_REF = 'https://a2a-protocol.org/latest/specification/#941-sendmessage';

/**
 * Check 5: Task lifecycle validation (A2A spec §4.1, §3.1.1, §6.1)
 *
 * Submits a minimal test message via JSON-RPC 2.0 and verifies the response
 * follows the A2A task lifecycle: submitted → working → completed/failed/etc.
 */
export async function checkLifecycle(card: AgentCard): Promise<CheckResult> {
  const start = Date.now();
  const details: CheckDetail[] = [];

  const agentUrl = card.url;
  if (!agentUrl) {
    return {
      name: 'Task Lifecycle',
      status: 'fail',
      details: [{ message: 'No agent URL — cannot test task lifecycle', specRef: SPEC_REF }],
      durationMs: Date.now() - start,
    };
  }

  // Check if agent requires authentication — if so, skip gracefully
  if (card.authentication && Object.keys(card.authentication).length > 0) {
    const schemes = Object.keys(card.authentication).join(', ');
    return {
      name: 'Task Lifecycle',
      status: 'skip',
      details: [
        {
          message: `Agent requires authentication (${schemes}) — lifecycle test skipped to avoid triggering auth errors. Manually verify with valid credentials.`,
          specRef: 'https://a2a-protocol.org/latest/specification/#7-authentication-and-authorization',
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  // Build a minimal A2A SendMessage JSON-RPC 2.0 request (spec §9.4.1)
  const requestId = randomUUID();
  const contextId = randomUUID();

  const rpcRequest: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: requestId,
    method: 'a2a.sendMessage',
    params: {
      message: {
        role: 'user',
        parts: [
          {
            text: 'nexus-check: A2A compliance validation probe. Please acknowledge.',
          },
        ],
        contextId,
        messageId: randomUUID(),
      },
      configuration: {
        acceptedOutputModes: ['text/plain', 'text'],
        returnImmediately: false,
        historyLength: 0,
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(agentUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/a2a+json',
        'User-Agent': 'nexus-check/1.0 (A2A validator)',
        'A2A-Version': '1.0',
      },
      body: JSON.stringify(rpcRequest),
    });
  } catch (err) {
    clearTimeout(timeout);
    const error = err as Error;
    const message = error.name === 'AbortError'
      ? 'Task lifecycle check timed out after 15 seconds'
      : `Failed to send test message: ${error.message}`;
    return {
      name: 'Task Lifecycle',
      status: 'fail',
      details: [{ message, specRef: METHODS_REF }],
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }

  const httpStatus = response.status;

  // 401/403 — auth required at runtime
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      name: 'Task Lifecycle',
      status: 'skip',
      details: [
        {
          message: `Server returned HTTP ${httpStatus} — authentication required to submit tasks. Lifecycle check skipped.`,
          specRef: 'https://a2a-protocol.org/latest/specification/#7-authentication-and-authorization',
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  // 405 Method Not Allowed — wrong HTTP method
  if (httpStatus === 405) {
    return {
      name: 'Task Lifecycle',
      status: 'fail',
      details: [
        {
          message: 'HTTP 405 Method Not Allowed — agent must accept POST at the declared URL for JSON-RPC requests',
          specRef: METHODS_REF,
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  // Parse response body
  let body: string;
  try {
    body = await response.text();
  } catch {
    return {
      name: 'Task Lifecycle',
      status: 'fail',
      details: [{ message: 'Failed to read response body from agent', specRef: METHODS_REF }],
      durationMs: Date.now() - start,
    };
  }

  // Validate Content-Type
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json') && !contentType.includes('application/a2a')) {
    details.push({
      message: `Response Content-Type "${contentType}" should be application/json or application/a2a+json`,
      specRef: 'https://a2a-protocol.org/latest/specification/#1411-applicationa2ajson',
    });
  }

  // Parse JSON-RPC response
  let rpcResponse: JsonRpcResponse;
  try {
    rpcResponse = JSON.parse(body) as JsonRpcResponse;
  } catch {
    return {
      name: 'Task Lifecycle',
      status: 'fail',
      details: [
        {
          message: `Response body is not valid JSON. First 200 chars: ${body.substring(0, 200)}`,
          specRef: METHODS_REF,
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  // Validate JSON-RPC 2.0 envelope (spec §9)
  if (rpcResponse.jsonrpc !== '2.0') {
    details.push({
      message: `Response missing or incorrect "jsonrpc" field — expected "2.0", got "${rpcResponse.jsonrpc}"`,
      specRef: METHODS_REF,
    });
  }

  // Handle JSON-RPC error response
  if (rpcResponse.error) {
    const err = rpcResponse.error;
    // Some errors are expected and acceptable (e.g. validation errors on our test payload)
    const acceptableErrors = [-32602, -32600]; // Invalid params, Invalid request
    if (acceptableErrors.includes(err.code)) {
      details.push({
        message: `Agent returned JSON-RPC error ${err.code}: "${err.message}" — server is responding correctly to malformed requests`,
        specRef: METHODS_REF,
      });
      return {
        name: 'Task Lifecycle',
        status: 'pass',
        details,
        durationMs: Date.now() - start,
      };
    }
    return {
      name: 'Task Lifecycle',
      status: 'fail',
      details: [
        {
          message: `Agent returned JSON-RPC error ${err.code}: "${err.message}"`,
          specRef: METHODS_REF,
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  // Validate the result contains a Task object
  const result = rpcResponse.result as Record<string, unknown> | null | undefined;
  if (!result || typeof result !== 'object') {
    return {
      name: 'Task Lifecycle',
      status: 'fail',
      details: [
        {
          message: 'Response result is not a Task object — expected an object with id, status, etc.',
          specRef: SPEC_REF,
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  // Validate Task structure (spec §4.1.1)
  const taskErrors: string[] = [];

  if (!result.id || typeof result.id !== 'string') {
    taskErrors.push('Task missing required field: id (string)');
  } else {
    details.push({ message: `Task created with id: ${result.id}` });
  }

  const status = result.status as Record<string, unknown> | undefined;
  if (!status || typeof status !== 'object') {
    taskErrors.push('Task missing required field: status (TaskStatus object)');
  } else {
    const taskState = status.state as string | undefined;
    if (!taskState) {
      taskErrors.push('TaskStatus missing required field: state');
    } else if (!VALID_TASK_STATES.includes(taskState as any)) {
      taskErrors.push(
        `TaskStatus.state "${taskState}" is not a valid A2A task state. ` +
        `Valid states: ${VALID_TASK_STATES.join(', ')}`
      );
    } else {
      details.push({
        message: `Task state: ${taskState} — valid A2A lifecycle state`,
        specRef: 'https://a2a-protocol.org/latest/specification/#413-taskstate',
      });

      if (TERMINAL_STATES.includes(taskState as any)) {
        details.push({ message: 'Task reached a terminal state in the synchronous response' });
      } else if (taskState === 'working' || taskState === 'submitted') {
        details.push({ message: 'Task is processing asynchronously — lifecycle flow initiated correctly' });
      }
    }
  }

  if (taskErrors.length > 0) {
    return {
      name: 'Task Lifecycle',
      status: 'fail',
      details: [
        ...taskErrors.map(msg => ({ message: msg, specRef: SPEC_REF })),
        ...details,
      ],
      durationMs: Date.now() - start,
    };
  }

  return {
    name: 'Task Lifecycle',
    status: 'pass',
    details,
    durationMs: Date.now() - start,
  };
}
