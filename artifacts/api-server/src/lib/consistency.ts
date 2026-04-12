/**
 * Intent-Action Consistency Scoring
 *
 * Compares what an agent claimed it would do (rationale / intent) against
 * what it actually did (eventType + payload). Produces a score from 0.0
 * (completely inconsistent) to 1.0 (perfect match), along with a list of
 * specific deductions for transparency.
 *
 * All scoring is deterministic and computed at INSERT time — no updates
 * after the fact, fully compatible with the immutability trigger.
 */

export const HALLUCINATION_THRESHOLD = 0.5;

export interface ConsistencyResult {
  score: number;
  reasons: string[];
  isHighRisk: boolean;
}

// ── Intent pattern groups ──────────────────────────────────────────────────

/** Rationale signals a read-only / passive intent */
const INTENT_READONLY = /\b(read[- ]?only|just read(?:ing)?|only read(?:ing)?|fetch(?:ing)?|retriev(?:e|ing)|look(?:ing)?[ -]up|get(?:ting)?|view(?:ing)?|list(?:ing)?|inspect(?:ing)?|check(?:ing)?|monitor(?:ing)?|observ(?:e|ing)|query(?:ing)?|scan(?:ning)?|search(?:ing)?|lookup)\b/i;

/** Rationale explicitly states no deletion will occur */
const INTENT_NO_DELETE = /\b(no[t]?\s+delet(?:e|ing)|no\s+remov(?:al|ing)|preserv(?:e|ing)|keep(?:ing)?\s+intact|without\s+delet(?:ing)?|not\s+remov(?:e|ing)|maintain(?:ing)?|no\s+purge|no\s+drop|will\s+not\s+be\s+delet|no\s+data\s+will\s+be\s+delet)\b/i;

/** Rationale states no external / network calls */
const INTENT_NO_EXTERNAL = /\b(no\s+external|internal[- ]?only|local[- ]?only|no\s+network|no\s+api\s+call|offline|no\s+webhook|no\s+http|no\s+outbound)\b/i;

/** Rationale states no writes / modifications */
const INTENT_NO_WRITE = /\b(no[t]?\s+(?:modify|modif(?:y|ying)|updat(?:e|ing)|writ(?:e|ing)|creat(?:e|ing)|insert(?:ing)?|chang(?:e|ing))|read[- ]?only|without\s+(?:modif|updat|writ|creat)(?:y|e|ying|ing)?)\b/i;

// ── Action pattern groups ──────────────────────────────────────────────────

const ACTION_WRITE_EVENTS = new Set([
  "write", "create", "update", "modify", "set", "insert",
  "push", "upload", "post", "publish", "patch", "put", "store", "save",
]);

const ACTION_DELETE_EVENTS = new Set([
  "delete", "remove", "drop", "purge", "clear", "destroy", "erase", "truncate",
]);

/** Check if payload JSON contains external/network references */
function payloadHasExternalCall(payload: object): boolean {
  const str = JSON.stringify(payload).toLowerCase();
  return /\b(url|endpoint|http|https|webhook|outbound|external[_-]?api)\b/.test(str);
}

// ── Resource-type vocabulary ───────────────────────────────────────────────

const RESOURCE_TERMS: Record<string, RegExp> = {
  user:      /\b(user|account|profile|identity|auth)\b/i,
  file:      /\b(file|document|attachment|upload|blob|object)\b/i,
  database:  /\b(database|db|table|record|row|query|sql)\b/i,
  email:     /\b(email|mail|message|inbox|smtp|send)\b/i,
  payment:   /\b(payment|invoice|charge|billing|stripe|order|checkout)\b/i,
  config:    /\b(config|setting|configuration|preference|env)\b/i,
  secret:    /\b(secret|key|token|password|credential|api[_ -]?key)\b/i,
};

function detectResources(text: string): Set<string> {
  const found = new Set<string>();
  for (const [name, re] of Object.entries(RESOURCE_TERMS)) {
    if (re.test(text)) found.add(name);
  }
  return found;
}

// ── Payload action extraction ──────────────────────────────────────────────

function normalizeEventType(eventType: string): string {
  return eventType.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Pull an explicit `action` string from the payload if one is present.
 * Common shapes: { action: "database.delete" }, { type: "api_call" }, { method: "DELETE" }
 */
function extractPayloadAction(payload: object): string | null {
  const p = payload as Record<string, unknown>;
  const candidate = p["action"] ?? p["method"] ?? p["type"] ?? p["operation"];
  if (typeof candidate === "string") return candidate.toLowerCase();
  return null;
}

// ── Main scoring function ──────────────────────────────────────────────────

export function computeConsistencyScore(
  rationale: string | null | undefined,
  eventType: string,
  payload: object,
): ConsistencyResult {
  // No rationale → nothing to compare; score neutral (1.0) with a note
  if (!rationale || rationale.trim().length === 0) {
    return { score: 1.0, reasons: [], isHighRisk: false };
  }

  let score = 1.0;
  const reasons: string[] = [];
  const normalizedEvent = normalizeEventType(eventType);
  const payloadAction = extractPayloadAction(payload);
  const payloadStr = JSON.stringify(payload);

  // ── Check 1: Read-only intent vs write/create/update/delete action ──────
  const isWriteAction =
    ACTION_WRITE_EVENTS.has(normalizedEvent) ||
    (payloadAction !== null && ACTION_WRITE_EVENTS.has(payloadAction.replace(/[^a-z]/g, "")));

  const isDeleteAction =
    ACTION_DELETE_EVENTS.has(normalizedEvent) ||
    (payloadAction !== null && ACTION_DELETE_EVENTS.has(payloadAction.replace(/[^a-z]/g, "")));

  // Read-only intent contradicts ANY mutation (write OR delete)
  if (INTENT_READONLY.test(rationale) && (isWriteAction || isDeleteAction)) {
    score -= 0.5;
    const actionKind = isDeleteAction ? "delete" : "write";
    reasons.push(
      `Rationale signals read-only intent but action is a ${actionKind} operation (eventType: "${eventType}"${payloadAction ? `, payload.action: "${payloadAction}"` : ""})`,
    );
  }

  // ── Check 2: No-write intent vs write action ─────────────────────────────
  if (!INTENT_READONLY.test(rationale) && INTENT_NO_WRITE.test(rationale) && isWriteAction) {
    score -= 0.4;
    reasons.push(
      `Rationale explicitly states no modification but action is a write operation (eventType: "${eventType}")`,
    );
  }

  // ── Check 3: No-delete intent vs delete action ───────────────────────────

  if (INTENT_NO_DELETE.test(rationale) && isDeleteAction) {
    score -= 0.5;
    reasons.push(
      `Rationale promises no deletion but action is a delete operation (eventType: "${eventType}"${payloadAction ? `, payload.action: "${payloadAction}"` : ""})`,
    );
  }

  // ── Check 4: No-external intent vs external payload reference ────────────
  if (INTENT_NO_EXTERNAL.test(rationale) && payloadHasExternalCall(payload)) {
    score -= 0.3;
    reasons.push(
      "Rationale states internal/offline operation but payload contains external network references (url, endpoint, or webhook)",
    );
  }

  // ── Check 5: Resource-type mismatch ─────────────────────────────────────
  const intentResources = detectResources(rationale);
  const actionResources = detectResources(payloadStr + " " + eventType);

  if (intentResources.size > 0 && actionResources.size > 0) {
    const overlap = [...intentResources].filter((r) => actionResources.has(r));
    if (overlap.length === 0) {
      score -= 0.2;
      reasons.push(
        `Resource-type mismatch: rationale references [${[...intentResources].join(", ")}] but action targets [${[...actionResources].join(", ")}]`,
      );
    }
  }

  // ── Check 6: Explicit payload action vs stated intent verb ───────────────
  if (payloadAction) {
    const isDeletePayloadAction = ACTION_DELETE_EVENTS.has(payloadAction.replace(/[^a-z]/g, ""));
    const isWritePayloadAction = ACTION_WRITE_EVENTS.has(payloadAction.replace(/[^a-z]/g, ""));

    if (isDeletePayloadAction && INTENT_READONLY.test(rationale)) {
      // Already covered by Check 1 in combination but add specificity
      reasons.push(`Explicit payload action "${payloadAction}" is a delete — contradicts read-only rationale`);
    } else if (isWritePayloadAction && INTENT_NO_DELETE.test(rationale) && isDeletePayloadAction) {
      reasons.push(`Explicit payload action "${payloadAction}" contradicts no-delete rationale`);
    }
  }

  // Clamp score to [0.0, 1.0]
  score = Math.max(0.0, Math.min(1.0, parseFloat(score.toFixed(4))));

  const isHighRisk = score < HALLUCINATION_THRESHOLD;

  return { score, reasons, isHighRisk };
}

/** Format the score as a percentage string for display */
export function formatConsistencyScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}
