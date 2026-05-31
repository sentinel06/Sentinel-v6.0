/**
 * Honey-Token V2 Engine
 *
 * Allows operators to embed invisible trap strings inside an agent's operating
 * context. Any outgoing telemetry payload that contains a configured token
 * immediately triggers the associated action:
 *
 *   "log"       — record the breach; execution continues.
 *   "block"     — record the breach; execution is blocked (403).
 *   "terminate" — record the breach; agent is permanently revoked and a
 *                 HONEY_TOKEN_BREACH kill-switch frame is published to the
 *                 Redis sentinel:events channel so every container instance
 *                 disconnects the agent in real time.
 *
 * The store is process-local (in-memory Map). Tokens registered via
 * POST /v1/gateway/register survive for the lifetime of the container.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HoneyToken {
  id:     string;
  token:  string;
  action: "log" | "block" | "terminate";
}

export interface HoneyTokenMatch {
  tokenId: string;
  token:   string;
  action:  "log" | "block" | "terminate";
  agentId: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const agentHoneyTokens = new Map<string, HoneyToken[]>();

/**
 * Register (or replace) the honey-token list for an agent.
 * Called during gateway registration when the agent supplies `honeyTokens`.
 */
export function registerHoneyTokens(agentId: string, tokens: HoneyToken[]): void {
  // Validate shape; silently drop any token that is malformed.
  const valid = tokens.filter(
    (t) =>
      typeof t.id === "string" &&
      typeof t.token === "string" &&
      t.token.length > 0 &&
      (t.action === "log" || t.action === "block" || t.action === "terminate"),
  );
  agentHoneyTokens.set(agentId, valid);
}

/**
 * Retrieve the configured honey-tokens for an agent (read-only copy).
 */
export function getHoneyTokens(agentId: string): readonly HoneyToken[] {
  return agentHoneyTokens.get(agentId) ?? [];
}

/**
 * Remove all honey-tokens for an agent (called on revocation / cleanup).
 */
export function clearHoneyTokens(agentId: string): void {
  agentHoneyTokens.delete(agentId);
}

// ── Matching ──────────────────────────────────────────────────────────────────

/**
 * Scan `content` for any honey-token registered against `agentId`.
 *
 * Matching is a fast plain `includes()` check — intentionally simple so it
 * cannot be bypassed by encoding tricks. Operators should choose tokens that
 * are unlikely to appear in legitimate payloads (e.g. UUIDs, random hex
 * strings, or deliberate canary phrases).
 *
 * Returns the first matching `HoneyTokenMatch`, or `null` if none found.
 * Iteration order is insertion order so the first token registered wins.
 */
export function checkHoneyTokens(agentId: string, content: string): HoneyTokenMatch | null {
  const tokens = agentHoneyTokens.get(agentId);
  if (!tokens || tokens.length === 0) return null;

  for (const ht of tokens) {
    if (content.includes(ht.token)) {
      return {
        tokenId: ht.id,
        token:   ht.token,
        action:  ht.action,
        agentId,
      };
    }
  }

  return null;
}
