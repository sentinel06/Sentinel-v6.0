import { pgTable, text, uuid, timestamp, jsonb, boolean, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    agentId: text("agent_id").notNull(),
    traceId: text("trace_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    rationale: text("rationale"),
    currentHash: text("current_hash").notNull(),
    previousHash: text("previous_hash"),
    isAnomalous: boolean("is_anomalous").notNull().default(false),
    anomalyReason: text("anomaly_reason"),
    consistencyScore: real("consistency_score").notNull().default(1.0),
    consistencyReasons: jsonb("consistency_reasons").notNull().default([]),
    // Multi-agent orchestration chain fields (EU AI Act Art. 12 — traceability)
    // Both MUST have defaults — the immutability trigger blocks any UPDATE on this table
    parentTraceId: text("parent_trace_id"),
    dependencyChain: jsonb("dependency_chain").notNull().default([]),
    // Swarm Governance: sovereign ancestry tracking (Phase 2 — Swarm & Mesh Governance)
    parentAgentId: text("parent_agent_id"),
    swarmId: text("swarm_id"),
    // Sovereign Logs: compute origin region for geopatriation compliance (2026 AI Act update)
    computeOriginRegion: text("compute_origin_region").notNull().default("unspecified"),
    // Quantum-Secure-By-Construction: PQC signature fingerprint of currentHash (ML-DSA-87 abstraction)
    quantumSig: text("quantum_sig"),
    // QL-2.0 Hybrid dual-signature envelope (SHA-512 + ML-DSA-87)
    // Stores a HybridSignatureEnvelope as JSONB. Null for pre-QL-2.0 entries.
    pqSignature: jsonb("pq_signature"),
  },
  (table) => [
    index("audit_logs_agent_id_idx").on(table.agentId),
    index("audit_logs_trace_id_idx").on(table.traceId),
    index("audit_logs_timestamp_idx").on(table.timestamp),
    index("audit_logs_is_anomalous_idx").on(table.isAnomalous),
    index("audit_logs_consistency_score_idx").on(table.consistencyScore),
    index("audit_logs_parent_trace_id_idx").on(table.parentTraceId),
  ],
);

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  id: true,
  timestamp: true,
  currentHash: true,
  previousHash: true,
  isAnomalous: true,
  anomalyReason: true,
  consistencyScore: true,
  consistencyReasons: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;

export const integrityCheckTable = pgTable("integrity_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  totalChecked: text("total_checked").notNull(),
  tamperDetected: boolean("tamper_detected").notNull().default(false),
  tamperedEntries: jsonb("tampered_entries").notNull().default([]),
  message: text("message").notNull(),
});

export type IntegrityCheck = typeof integrityCheckTable.$inferSelect;

export const merkleCheckpointsTable = pgTable(
  "merkle_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockIndex: integer("block_index").notNull().unique(),
    blockStart: integer("block_start").notNull(),
    blockEnd: integer("block_end").notNull(),
    entryCount: integer("entry_count").notNull(),
    merkleRoot: text("merkle_root").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("merkle_checkpoints_block_index_idx").on(table.blockIndex)],
);

export type MerkleCheckpoint = typeof merkleCheckpointsTable.$inferSelect;

export const archiveSealsTable = pgTable(
  "archive_seals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockIndex: integer("block_index").notNull().unique(),
    blockStart: integer("block_start").notNull(),
    blockEnd: integer("block_end").notNull(),
    entryCount: integer("entry_count").notNull(),
    digest: text("digest").notNull(),
    signature: text("signature").notNull(),
    archivePath: text("archive_path").notNull(),
    sealedAt: timestamp("sealed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("archive_seals_block_index_idx").on(table.blockIndex)],
);

export type ArchiveSeal = typeof archiveSealsTable.$inferSelect;

// ── Swarm Ancestry Engine ─────────────────────────────────────────────────
// Tracks parent/child relationships between agent sessions.
// Enables recursive ancestry tracing and recursive revocation up the tree.

export const agentSessionsTable = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id").notNull(),
    /** agentId of the agent that spawned this one (null = root) */
    parentUid: text("parent_uid"),
    /** The root swarm's identifier, propagated down the ancestry chain */
    rootSwarmId: text("root_swarm_id"),
    /** Peer-level swarm membership (may differ from rootSwarmId) */
    swarmId: text("swarm_id"),
    /** active | revoked | drift-locked */
    status: text("status").notNull().default("active"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_sessions_agent_id_idx").on(table.agentId),
    index("agent_sessions_parent_uid_idx").on(table.parentUid),
    index("agent_sessions_root_swarm_id_idx").on(table.rootSwarmId),
    index("agent_sessions_status_idx").on(table.status),
  ],
);

export type AgentSession = typeof agentSessionsTable.$inferSelect;

// ── Governance-as-a-Service: Partner API Keys ──────────────────────────────
// Enterprise partners generate scoped API keys for their agent swarms.
// Each key carries a tier (Core | Pro | Enterprise) that gates feature access.

export const partnerKeysTable = pgTable(
  "partner_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Displayed as sk_sent_{tier_prefix}_{random} */
    keyValue: text("key_value").notNull().unique(),
    partnerId: text("partner_id").notNull(),
    partnerEmail: text("partner_email").notNull(),
    /** Human-readable label for this key */
    label: text("label").notNull().default("Unnamed Key"),
    /** Core | Pro | Enterprise */
    tier: text("tier").notNull().default("Core"),
    /** Optional swarm scope — if set, key only accepts logs for this swarmId */
    swarmScope: text("swarm_scope"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    index("partner_keys_partner_id_idx").on(table.partnerId),
    index("partner_keys_partner_email_idx").on(table.partnerEmail),
    index("partner_keys_tier_idx").on(table.tier),
    index("partner_keys_is_active_idx").on(table.isActive),
  ],
);

export type PartnerKey = typeof partnerKeysTable.$inferSelect;

// ── Governed Agent Registry ────────────────────────────────────────────────
// Each agent must be registered before its logs are accepted (or logs are
// accepted with an "UNREGISTERED" warning). The registry defines what tools
// each agent is authorized to use, its risk tier, and spend limits.

export const agentRegistryTable = pgTable(
  "agent_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id").notNull().unique(),
    ownerEmail: text("owner_email").notNull(),
    // Array of authorized tool/event-type names (jsonb for flexibility)
    authorizedTools: jsonb("authorized_tools").notNull().default([]),
    // Low | Medium | High
    riskTier: text("risk_tier").notNull().default("Medium"),
    // Maximum allowed spend per trace (null = unlimited)
    maxBudgetPerTrace: real("max_budget_per_trace"),
    isActive: boolean("is_active").notNull().default(true),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_registry_agent_id_idx").on(table.agentId),
    index("agent_registry_risk_tier_idx").on(table.riskTier),
    index("agent_registry_is_active_idx").on(table.isActive),
  ],
);

export type AgentRegistryEntry = typeof agentRegistryTable.$inferSelect;

// ── Authorization Requests (Sentinel-Gate Circuit Breaker) ─────────────────
// Written whenever an agent calls POST /v1/authorize before a high-risk action.
// Status lifecycle: PENDING → AUTHORIZED | BLOCKED
// Immutable audit trail of every human intervention.

export const authorizationRequestsTable = pgTable(
  "authorization_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id").notNull(),
    traceId: text("trace_id").notNull(),
    intent: text("intent").notNull(),
    proposedAction: text("proposed_action").notNull(),
    actionType: text("action_type").notNull(),
    // PENDING | AUTHORIZED | BLOCKED | AUTO_BLOCKED
    status: text("status").notNull().default("PENDING"),
    sessionHealthScore: real("session_health_score"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    notes: text("notes"),
  },
  (table) => [
    index("auth_requests_agent_id_idx").on(table.agentId),
    index("auth_requests_status_idx").on(table.status),
    index("auth_requests_requested_at_idx").on(table.requestedAt),
  ],
);

export type AuthorizationRequest = typeof authorizationRequestsTable.$inferSelect;

// ── System Pulse Log ───────────────────────────────────────────────────────
// Stores each automated 6-hour "System Trust Velocity" pulse.
// Includes the formatted tweet text, computed metrics, and (if posted)
// the Twitter/X post ID for deep-linking.

export const pulseLogsTable = pgTable(
  "pulse_logs",
  {
    id:             uuid("id").primaryKey().defaultRandom(),
    firedAt:        timestamp("fired_at",        { withTimezone: true }).notNull().defaultNow(),
    /** 0–100 — percentage of events with ML-DSA-87 quantum sig in the window */
    trustVelocity:  real("trust_velocity").notNull(),
    totalEvents:    integer("total_events").notNull(),
    verifiedEvents: integer("verified_events").notNull(),
    anomalyCount:   integer("anomaly_count").notNull(),
    /** NOMINAL | ELEVATED | CRITICAL */
    status:         text("status").notNull().default("NOMINAL"),
    /** The full formatted pulse text (tweet body) */
    message:        text("message").notNull(),
    /** Twitter/X post URL if successfully published — null if keys not configured */
    tweetUrl:       text("tweet_url"),
    /** Raw Twitter API response ID */
    tweetId:        text("tweet_id"),
    /** Error message if the Twitter post failed */
    tweetError:     text("tweet_error"),
    /** Window in hours that was aggregated (default 6) */
    windowHours:    integer("window_hours").notNull().default(6),
  },
  (table) => [
    index("pulse_logs_fired_at_idx").on(table.firedAt),
    index("pulse_logs_status_idx").on(table.status),
  ],
);

export type PulseLog = typeof pulseLogsTable.$inferSelect;

// ── Sovereign Pulse Store ──────────────────────────────────────────────────
// Internal heartbeat snapshots produced by the Pulse Engine every 6 hours.
// Each entry is self-signed with the QL-2.0 Master Key (ML-DSA-87, SYSTEM scope)
// to ensure history cannot be tampered with after the fact.

export const systemPulsesTable = pgTable(
  "system_pulses",
  {
    id:                   uuid("id").primaryKey().defaultRandom(),
    createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 0–100 — percentage of ALL ledger events with ML-DSA-87 pq_signature */
    globalIntegrityIndex: real("global_integrity_index").notNull(),
    totalEvents:          integer("total_events").notNull(),
    verifiedEvents:       integer("verified_events").notNull(),
    /** Active swarm sessions at snapshot time */
    activeSwarms:         integer("active_swarms").notNull(),
    /** Revoked swarm sessions at snapshot time */
    revokedSwarms:        integer("revoked_swarms").notNull(),
    /** Theoretical ML-DSA-87 entropy bits processed (verifiedEvents × sigBytes × 8) */
    quantumThroughputBits: text("quantum_throughput_bits").notNull(),
    /** NOMINAL | ALERT | UNDER_INVESTIGATION */
    status:               text("status").notNull().default("NOMINAL"),
    /** Human-readable reason if status != NOMINAL */
    faultReason:          text("fault_reason"),
    /** Canonical payload string that was signed (deterministic from the metrics) */
    pulsePayload:         text("pulse_payload").notNull(),
    /** QL-2.0 HybridSignatureEnvelope as JSONB — self-signs this pulse record */
    pulseSignature:       jsonb("pulse_signature").notNull(),
    /** Hours of data aggregated (default 6) */
    windowHours:          integer("window_hours").notNull().default(6),
  },
  (table) => [
    index("system_pulses_created_at_idx").on(table.createdAt),
    index("system_pulses_status_idx").on(table.status),
  ],
);

export type SystemPulse = typeof systemPulsesTable.$inferSelect;
