/**
 * Governance State Engine
 *
 * Responsibilities:
 *   1. Session health cache — last N consistency scores per agent
 *   2. Authorization request store — in-memory pending/resolved state with
 *      long-poll resolution via EventEmitter
 *   3. Kill-switch state — set of revoked agent IDs
 *   4. High-risk action classification
 *   5. Honey-token trap — fake high-privilege tools that trigger lockdown
 */

import { EventEmitter } from "events";

// ── Session Health Cache ───────────────────────────────────────────────────

const HEALTH_WINDOW = 5;
const HEALTH_THRESHOLD = 0.7;

const sessionScores = new Map<string, number[]>();

export function recordConsistencyScore(agentId: string, score: number): void {
  const scores = sessionScores.get(agentId) ?? [];
  scores.push(score);
  if (scores.length > HEALTH_WINDOW) scores.shift();
  sessionScores.set(agentId, scores);
}

export function getSessionHealth(agentId: string): number {
  const scores = sessionScores.get(agentId);
  if (!scores || scores.length === 0) return 1.0;
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

// ── Honey-Token Trap ───────────────────────────────────────────────────────
//
// These "ghost" tools appear nowhere in any legitimate agent's authorized
// tool list. Any attempt to invoke one is an immediate CRITICAL BREACH:
// the agent is permanently revoked and the War Room receives a priority alert.

export const HONEYPOT_TOKENS = new Set([
  "admin_global_reset",
  "root_override",
  "bypass_audit",
  "disable_sentinel",
  "master_key_access",
  "sudo_exec",
  "schema_wipe",
]);

export function isHoneypotToken(actionType: string): boolean {
  const normalized = actionType.toLowerCase().replace(/[\s-]/g, "_");
  for (const token of HONEYPOT_TOKENS) {
    if (normalized.includes(token)) return true;
  }
  return false;
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
  status: "PENDING" | "AUTHORIZED" | "BLOCKED" | "AUTO_BLOCKED" | "HONEYPOT_BREACH";
  sessionHealthScore: number;
  clusterHealthScore?: number;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
  isCriticalBreach?: boolean;
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
      resolve(authRequestStore.get(id) ?? req);
    }, timeoutMs);
    authEventEmitter.once(`resolved:${id}`, handler);
  });
}

export function emitGovernanceEvent(type: string, payload: object): void {
  authEventEmitter.emit("governance", { type, payload });
}

export function onGovernanceEvent(handler: (event: { type: string; payload: object }) => void): void {
  authEventEmitter.on("governance", handler);
}
