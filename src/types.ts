// A2A Protocol types (lf.a2a.v1 — Linux Foundation spec)

export interface AgentCard {
  // Required fields per A2A spec §4.4.1
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: AgentCapabilities;
  // Optional fields
  provider?: AgentProvider;
  skills?: AgentSkill[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  authentication?: Record<string, SecurityScheme>;
  supportsAuthenticatedExtendedCard?: boolean;
  protocolVersion?: string;
  extensions?: AgentExtension[];
  additionalInterfaces?: AgentInterface[];
  signature?: AgentCardSignature;
}

export interface AgentCapabilities {
  // A2A spec §4.4.3
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
}

export interface AgentProvider {
  organization: string;
  url?: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  inputModes?: string[];
  outputModes?: string[];
  examples?: string[];
}

export interface AgentExtension {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

export interface AgentInterface {
  transport: string;
  url: string;
}

export interface AgentCardSignature {
  // A2A spec §4.4.7 / §8.4
  algorithm: string;
  keyId?: string;
  signature: string;
  protected?: string;
}

export interface SecurityScheme {
  type: string;
  description?: string;
  [key: string]: unknown;
}

// Validation result types

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface CheckDetail {
  message: string;
  specRef?: string;
}

export interface CheckResult {
  name: string;
  status: CheckStatus;
  details: CheckDetail[];
  durationMs?: number;
}

export interface ValidationReport {
  url: string;
  timestamp: string;
  checks: CheckResult[];
  score: number;
  maxScore: number;
  agentCard?: AgentCard;
}

// Task lifecycle types (A2A spec §4.1.3)
export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export const TERMINAL_STATES: TaskState[] = ['completed', 'failed', 'cancelled', 'rejected'];
export const VALID_TASK_STATES: TaskState[] = [
  'submitted', 'working', 'input-required', 'auth-required',
  'completed', 'failed', 'cancelled', 'rejected',
];

// JSON-RPC types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}
