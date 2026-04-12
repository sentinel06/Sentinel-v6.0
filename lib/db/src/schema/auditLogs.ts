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
    // Long-form text, uncapped — PostgreSQL TEXT has no length limit
    payload: jsonb("payload").notNull(),
    rationale: text("rationale"),
    currentHash: text("current_hash").notNull(),
    previousHash: text("previous_hash"),
    isAnomalous: boolean("is_anomalous").notNull().default(false),
    anomalyReason: text("anomaly_reason"),
    // Consistency Score: 0.0 (hallucination) → 1.0 (perfect intent-action match)
    // Computed at INSERT time; never updated (immutability trigger compliant)
    consistencyScore: real("consistency_score").notNull().default(1.0),
    // Structured list of deductions that reduced the score
    consistencyReasons: jsonb("consistency_reasons").notNull().default([]),
  },
  (table) => [
    index("audit_logs_agent_id_idx").on(table.agentId),
    index("audit_logs_trace_id_idx").on(table.traceId),
    index("audit_logs_timestamp_idx").on(table.timestamp),
    index("audit_logs_is_anomalous_idx").on(table.isAnomalous),
    index("audit_logs_consistency_score_idx").on(table.consistencyScore),
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

// Merkle checkpoint: one root hash per block of BLOCK_SIZE entries
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
  (table) => [
    index("merkle_checkpoints_block_index_idx").on(table.blockIndex),
  ],
);

export type MerkleCheckpoint = typeof merkleCheckpointsTable.$inferSelect;
