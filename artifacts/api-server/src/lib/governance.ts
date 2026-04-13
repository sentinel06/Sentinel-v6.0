/**
 * Governance State Engine
 *
 * Replaces Redis for sub-10ms in-process operations on a single-node server.
 * If the service is ever scaled horizontally, swap this Map for a Redis
 * sorted-set implementation behind the same interface.
 *
 * Responsibilities:
 *   1. Session health cache — last N consistency scores per agent
 *   2. Authorization request store — in-memory pending/resolved state with
 *      long-poll resolution via EventEmitter
 *   3. Kill-switch state — set of revoked agent IDs
 *   4. High-risk action classification
 */

import { EventEmitter } from "events";

// ── Session Health Cache ───────────────────────────────────────────────────

const HEALTH_WINDOW = 5; // rolling window of last N logs
const HEALTH_THRESHOLD = 0.7; // below this → require human approval

/** Per-agent circular buffer of recent consistency scores */
const sessionScores = new Map<string, number[]>();

export function recordConsistencyScore(agentId: string, score: number): void {
  const scores = sessionScores.get(agentId) ?? [];
  scores.push(score);
  if (scores.length > HEALTH_WINDOW) scores.shift();
  sessionScores.set(agentId, scores);
}

export function getSessionHealth(agentId: string): number {
  const scores = sessionScores.get(agentId);
  if (!scores || scores.length === 0) return 1.0; // unknown agent → full health
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function getAllSessionHealths(): Map<string, number> {
  const result = new Map<string, number>();
  for (const [agentId] of sessionScores) {
    result.set(agentId, getSessionHealth(agentId));
  }
  return result;
}

// ── Kill-Switch ────────────────────────────────────────────────────────────

const revokedAgents = new Set<string>();
let globalKillActive = false;

export function revokeAgent(agentId: string): void {
  revokedAgents.add(agentId);
}

export function isAgentRevoked(agentId: string): boolean {
  return globalKillActive || revokedAgents.has(agentId);
}

export function activateGlobalKillSwitch(): void {
  globalKillActive = true;
}

export function deactivateGlobalKillSwitch(): void {
  globalKillActive = false;
}

export function isGlobalKillActive(): boolean {
  return globalKillActive;
}

export function getRevokedAgents(): string[] {
  return Array.from(revokedAgents);
}

// ── High-Risk Action Classification ───────────────────────────────────────

const HIGH_RISK_ACTIONS = new Set([
  "financial_transfer",
  "data_deletion",
  "database_drop",
  "privilege_escalation",
  "admin_override",
  "mass_delete",
  "schema_migration",
  "credential_access",
  "external_transfer",
  "system_shutdown",
  "config_override",
  "delete",
  "drop",
  "purge",
  "truncate",
  "destroy",
]);

export function isHighRiskAction(actionType: string): boolean {
  const normalized = actionType.toLowerCase().replace(/[^a-z_]/g, "");
  for (const risk of HIGH_RISK_ACTIONS) {
    if (normalized.includes(risk)) return true;
  }
  return false;
}

// ── Authorization Request Store ────────────────────────────────────────────

export interface AuthRequestState {
  id: string;
  agentId: string;
  traceId: string;
  intent: string;
  proposedAction: string;
  actionType: string;
  status: "PENDING" | "AUTHORIZED" | "BLOCKED" | "AUTO_BLOCKED";
  sessionHealthScore: number;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
}

const authRequestStore = new Map<string, AuthRequestState>();
const authEventEmitter = new EventEmitter();
authEventEmitter.setMaxListeners(200);

export function storeAuthRequest(req: AuthRequestState): void {
  authRequestStore.set(req.id, req);
}

export function getAuthRequest(id: string): AuthRequestState | undefined {
  return authRequestStore.get(id);
}

export function getAllPendingRequests(): AuthRequestState[] {
  return Array.from(authRequestStore.values()).filter((r) => r.status === "PENDING");
}

export function getAllAuthRequests(): AuthRequestState[] {
  return Array.from(authRequestStore.values()).sort(
    (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
  );
}

/**
 * Resolve an authorization request.
 * Emits an event that any waiting long-poll listeners pick up immediately.
 */
export function resolveAuthRequest(
  id: string,
  status: "AUTHORIZED" | "BLOCKED",
  resolvedBy: string,
  notes?: string,
): AuthRequestState | null {
  const req = authRequestStore.get(id);
  if (!req) return null;
  req.status = status;
  req.resolvedAt = new Date().toISOString();
  req.resolvedBy = resolvedBy;
  req.notes = notes;
  authRequestStore.set(id, req);
  authEventEmitter.emit(`resolved:${id}`, req);
  return req;
}

/**
 * Wait for a specific authorization request to be resolved.
 * Used by long-poll: resolves in ≤ timeoutMs or returns the current state.
 */
export function waitForResolution(id: string, timeoutMs = 30_000): Promise<AuthRequestState> {
  const req = authRequestStore.get(id);
  if (!req) return Promise.reject(new Error("Auth request not found"));
  if (req.status !== "PENDING") return Promise.resolve(req);

  return new Promise((resolve) => {
    const handler = (resolved: AuthRequestState) => {
      clearTimeout(timer);
      resolve(resolved);
    };
    const timer = setTimeout(() => {
      authEventEmitter.off(`resolved:${id}`, handler);
      resolve(authRequestStore.get(id) ?? req); // return current state on timeout
    }, timeoutMs);
    authEventEmitter.once(`resolved:${id}`, handler);
  });
}

/** Emit a governance event for WebSocket broadcast */
export function emitGovernanceEvent(type: string, payload: object): void {
  authEventEmitter.emit("governance", { type, payload });
}

export function onGovernanceEvent(handler: (event: { type: string; payload: object }) => void): void {
  authEventEmitter.on("governance", handler);
}
