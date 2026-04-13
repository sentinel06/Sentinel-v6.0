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
    parentTraceId: text("parent_trace_id").default(null),
    dependencyChain: jsonb("dependency_chain").notNull().default([]),
    // Swarm Governance: sovereign ancestry tracking (Phase 2 — Swarm & Mesh Governance)
    parentAgentId: text("parent_agent_id").default(null),
    swarmId: text("swarm_id").default(null),
    // Sovereign Logs: compute origin region for geopatriation compliance (2026 AI Act update)
    computeOriginRegion: text("compute_origin_region").notNull().default("unspecified"),
    // Quantum-Secure-By-Construction: PQC signature fingerprint of currentHash (ML-DSA-87 abstraction)
    quantumSig: text("quantum_sig").default(null),
    // QL-2.0 Hybrid dual-signature envelope (SHA-512 + ML-DSA-87)
    // Stores a HybridSignatureEnvelope as JSONB. Null for pre-QL-2.0 entries.
    pqSignature: jsonb("pq_signature").default(null),
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
    parentUid: text("parent_uid").default(null),
    /** The root swarm's identifier, propagated down the ancestry chain */
    rootSwarmId: text("root_swarm_id").default(null),
    /** Peer-level swarm membership (may differ from rootSwarmId) */
    swarmId: text("swarm_id").default(null),
    /** active | revoked | drift-locked */
    status: text("status").notNull().default("active"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }).default(null),
    revokedReason: text("revoked_reason").default(null),
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
