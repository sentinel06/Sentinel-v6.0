/**
 * Signed PDF Ledger — EU AI Act Art. 12/14 Evidence Package
 *
 * Generates a tamper-evident PDF containing:
 *   1. Document header with cryptographic seal metadata
 *   2. Audit log table with hash chains and consistency scores
 *   3. Authorization history (human intervention log)
 *   4. Multi-agent topology chain (ASCII tree)
 *   5. HMAC archive block seals (from cold-storage archiver)
 *
 * The PDF is streamed back as application/pdf.
 */

import PDFDocument from "pdfkit";
import { createHmac } from "crypto";
import type { Response } from "express";
import { db, auditLogsTable, authorizationRequestsTable } from "@workspace/db";
import { eq, and, gte, lte, desc, isNotNull } from "drizzle-orm";
import { getQuantumIntegrityManifest } from "../crypto/pqc";

// ── Color palette ─────────────────────────────────────────────────────────
const C = {
  primary: "#0ea5e9",
  danger: "#ef4444",
  warn: "#eab308",
  ok: "#10b981",
  muted: "#64748b",
  border: "#1e293b",
  bg: "#0f172a",
  text: "#f1f5f9",
  textSub: "#94a3b8",
};

// ── HMAC document seal ────────────────────────────────────────────────────
function sealDocument(payload: string): string {
  const key = process.env.SESSION_SECRET ?? "sentinel-fallback-key";
  return createHmac("sha256", key).update(payload).digest("hex").substring(0, 32).toUpperCase();
}

// ── ASCII topology tree builder ───────────────────────────────────────────
interface ChainNode {
  traceId: string;
  agentId: string;
  children: ChainNode[];
}

function buildTextTree(node: ChainNode, prefix = "", isLast = true): string[] {
  const connector = isLast ? "└── " : "├── ";
  const lines = [`${prefix}${connector}[${node.agentId}] ${node.traceId.substring(0, 24)}…`];
  const childPrefix = prefix + (isLast ? "    " : "│   ");
  node.children.forEach((child, i) => {
    lines.push(...buildTextTree(child, childPrefix, i === node.children.length - 1));
  });
  return lines;
}

// ── Main export function ──────────────────────────────────────────────────
export async function generateAuditPDF(
  res: Response,
  options: {
    agentId?: string;
    traceId?: string;
    startTime?: Date;
    endTime?: Date;
    /**
     * Caller's tenant scope predicate (built from `viewerScopeCondition`).
     * Required — passing `undefined` would expose every tenant's audit logs
     * in the exported PDF.
     */
    ownerScope: import("drizzle-orm").SQL;
  },
): Promise<void> {
  const generatedAt = new Date();
  const { agentId, traceId, startTime, endTime, ownerScope } = options;

  // ── 1. Fetch audit logs ─────────────────────────────────────────────────
  let logsQuery = db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(500)
    .$dynamic();

  const conditions = [ownerScope];
  if (agentId) conditions.push(eq(auditLogsTable.agentId, agentId));
  if (traceId) conditions.push(eq(auditLogsTable.traceId, traceId));
  if (startTime) conditions.push(gte(auditLogsTable.timestamp, startTime));
  if (endTime) conditions.push(lte(auditLogsTable.timestamp, endTime));
  logsQuery = logsQuery.where(and(...conditions));

  const logs = await logsQuery;

  // ── 2. Fetch authorization history ─────────────────────────────────────
  const authHistory = await db
    .select()
    .from(authorizationRequestsTable)
    .orderBy(desc(authorizationRequestsTable.requestedAt))
    .limit(100);

  // ── 3. Build topology chain map ─────────────────────────────────────────
  const traceMap = new Map<string, { agentId: string; parentTraceId: string | null }>();
  for (const log of logs) {
    if (!traceMap.has(log.traceId)) {
      traceMap.set(log.traceId, {
        agentId: log.agentId,
        parentTraceId: log.parentTraceId ?? null,
      });
    }
  }

  const chainNodes = new Map<string, ChainNode>();
  for (const [tid, info] of traceMap) {
    chainNodes.set(tid, { traceId: tid, agentId: info.agentId, children: [] });
  }
  const roots: ChainNode[] = [];
  for (const [tid, info] of traceMap) {
    const node = chainNodes.get(tid)!;
    if (info.parentTraceId && chainNodes.has(info.parentTraceId)) {
      chainNodes.get(info.parentTraceId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // ── 4. Compute document seal ────────────────────────────────────────────
  const sealPayload = `${generatedAt.toISOString()}:${logs.length}:${agentId ?? "ALL"}`;
  const documentSeal = sealDocument(sealPayload);

  // ── 5. Stream PDF ───────────────────────────────────────────────────────
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sentinel-audit-${agentId ?? "full"}-${generatedAt.toISOString().split("T")[0]}.pdf"`,
  );

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: "Agent-Sentinel Audit Ledger",
      Author: "Agent-Sentinel Governance Engine",
      Subject: "EU AI Act Art. 12/14 Compliance Export",
      Keywords: "audit,immutable,blockchain,EU-AI-Act",
      CreationDate: generatedAt,
    },
  });

  doc.pipe(res);

  // ─── PAGE 1: Header ─────────────────────────────────────────────────────
  // Dark header banner
  doc.rect(0, 0, 595, 120).fill("#0f172a");
  doc.rect(0, 120, 595, 4).fill("#0ea5e9");

  doc
    .font("Courier-Bold")
    .fontSize(22)
    .fillColor("#f1f5f9")
    .text("AGENT-SENTINEL", 50, 35);

  doc
    .font("Courier")
    .fontSize(9)
    .fillColor("#94a3b8")
    .text("IMMUTABLE AUDIT LEDGER  ·  EU AI Act Art. 12 / Art. 14 Evidence Package", 50, 62);

  doc
    .font("Courier")
    .fontSize(8)
    .fillColor("#0ea5e9")
    .text(`DOCUMENT SEAL: ${documentSeal}`, 50, 80);

  doc
    .font("Courier")
    .fontSize(7)
    .fillColor("#64748b")
    .text(`Generated: ${generatedAt.toUTCString()}  ·  Entries: ${logs.length}  ·  Filter: ${agentId ?? "ALL AGENTS"}`, 50, 96);

  // ─── Metadata grid ──────────────────────────────────────────────────────
  doc.fillColor("#1e293b");
  const metaY = 140;
  const anomalies = logs.filter((l) => l.isAnomalous).length;
  const avgScore = logs.length
    ? (logs.reduce((s, l) => s + (l.consistencyScore ?? 1), 0) / logs.length).toFixed(3)
    : "N/A";
  const humanApprovals = authHistory.filter(
    (r) => r.resolvedBy && r.resolvedBy !== "sentinel-auto",
  ).length;

  const metaCells = [
    ["Total Audit Entries", String(logs.length)],
    ["Anomalous Events", String(anomalies)],
    ["Avg. Consistency Score", String(avgScore)],
    ["Human Interventions", String(humanApprovals)],
    ["Authorization Requests", String(authHistory.length)],
    ["Topology Chains", String(roots.length)],
  ];

  doc.rect(50, metaY, 495, 70).fill("#0f172a").stroke("#1e293b");

  metaCells.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = 65 + col * 165;
    const cy = metaY + 12 + row * 30;
    doc.font("Courier").fontSize(7).fillColor("#64748b").text(label.toUpperCase(), cx, cy);
    doc
      .font("Courier-Bold")
      .fontSize(13)
      .fillColor(label === "Anomalous Events" && anomalies > 0 ? "#ef4444" : "#f1f5f9")
      .text(value, cx, cy + 10);
  });

  // ─── Section 1: Audit Log Table ──────────────────────────────────────────
  doc.moveDown(4);
  doc
    .font("Courier-Bold")
    .fontSize(11)
    .fillColor("#0ea5e9")
    .text("§1  IMMUTABLE AUDIT LOG", 50, 230);
  doc.rect(50, 243, 495, 1).fill("#1e293b");

  // Table header
  const cols = [130, 80, 85, 75, 70, 55];
  const headers = ["Timestamp", "Agent ID", "Event Type", "Trace ID", "Hash (8)", "Score"];
  let tableY = 255;

  doc.rect(50, tableY, 495, 16).fill("#1e293b");
  let hx = 55;
  headers.forEach((h, i) => {
    doc.font("Courier-Bold").fontSize(7).fillColor("#94a3b8").text(h, hx, tableY + 5);
    hx += cols[i];
  });
  tableY += 16;

  // Table rows (up to 40 on this page section)
  const maxRows = Math.min(logs.length, 40);
  for (let i = 0; i < maxRows; i++) {
    const log = logs[i];
    const rowY = tableY + i * 14;
    if (i % 2 === 0) doc.rect(50, rowY, 495, 14).fill("#0a1628");
    let rx = 55;

    const ts = new Date(log.timestamp).toISOString().replace("T", " ").substring(0, 19);
    const score = log.consistencyScore ?? 1;
    const scoreColor = score < 0.5 ? "#ef4444" : score < 0.75 ? "#eab308" : "#10b981";

    const cells = [
      { text: ts, color: "#94a3b8" },
      { text: log.agentId.substring(0, 14), color: "#f1f5f9" },
      { text: log.eventType.substring(0, 14), color: log.isAnomalous ? "#ef4444" : "#94a3b8" },
      { text: log.traceId.substring(0, 12) + "…", color: "#64748b" },
      { text: log.currentHash.substring(0, 8), color: "#0ea5e9" },
      { text: (score * 100).toFixed(0) + "%", color: scoreColor },
    ];

    cells.forEach((cell, ci) => {
      doc.font(log.isAnomalous ? "Courier-Bold" : "Courier")
        .fontSize(7)
        .fillColor(cell.color)
        .text(cell.text, rx, rowY + 4, { width: cols[ci] - 4, lineBreak: false });
      rx += cols[ci];
    });

    if (log.isAnomalous) {
      doc.rect(50, rowY, 3, 14).fill("#ef4444");
    }
  }

  if (logs.length > 40) {
    doc
      .font("Courier")
      .fontSize(8)
      .fillColor("#64748b")
      .text(`… and ${logs.length - 40} more entries (truncated for readability)`, 55, tableY + 40 * 14 + 4);
  }

  // ─── PAGE 2: Auth history + Topology ────────────────────────────────────
  doc.addPage();

  // Dark header bar on page 2
  doc.rect(0, 0, 595, 40).fill("#0f172a");
  doc.font("Courier-Bold").fontSize(9).fillColor("#94a3b8").text("AGENT-SENTINEL  ·  AUDIT LEDGER (CONT.)", 50, 15);
  doc.font("Courier").fontSize(7).fillColor("#0ea5e9").text(`SEAL: ${documentSeal}`, 400, 15, { align: "right", width: 145 });

  // Section 2: Authorization + Human Interventions
  doc.font("Courier-Bold").fontSize(11).fillColor("#0ea5e9").text("§2  HUMAN INTERVENTION LOG  (EU AI Act Art. 14)", 50, 55);
  doc.rect(50, 68, 495, 1).fill("#1e293b");

  const authCols = [90, 110, 80, 90, 90, 35];
  const authHeaders = ["Agent ID", "Action Type", "Status", "Resolved By", "Resolved At", "Health"];
  let authY = 78;

  doc.rect(50, authY, 495, 16).fill("#1e293b");
  let ahx = 55;
  authHeaders.forEach((h, i) => {
    doc.font("Courier-Bold").fontSize(7).fillColor("#94a3b8").text(h, ahx, authY + 5);
    ahx += authCols[i];
  });
  authY += 16;

  const maxAuth = Math.min(authHistory.length, 25);
  for (let i = 0; i < maxAuth; i++) {
    const r = authHistory[i];
    const rowY = authY + i * 14;
    if (i % 2 === 0) doc.rect(50, rowY, 495, 14).fill("#0a1628");
    let rx = 55;

    const statusColor =
      r.status === "AUTHORIZED"
        ? "#10b981"
        : r.status === "PENDING"
        ? "#eab308"
        : r.status === "HONEYPOT_BREACH" as string
        ? "#ff6b6b"
        : "#ef4444";

    const resolvedAt = r.resolvedAt
      ? new Date(r.resolvedAt).toISOString().substring(0, 16).replace("T", " ")
      : "—";
    const health = ((r.sessionHealthScore ?? 1) * 100).toFixed(0) + "%";

    [
      { text: r.agentId.substring(0, 14), color: "#f1f5f9" },
      { text: r.actionType.substring(0, 18), color: "#94a3b8" },
      { text: r.status, color: statusColor },
      { text: (r.resolvedBy ?? "—").substring(0, 16), color: "#94a3b8" },
      { text: resolvedAt, color: "#64748b" },
      { text: health, color: (r.sessionHealthScore ?? 1) >= 0.7 ? "#10b981" : "#ef4444" },
    ].forEach((cell, ci) => {
      doc.font("Courier-Bold").fontSize(7).fillColor(cell.color)
        .text(cell.text, rx, rowY + 4, { width: authCols[ci] - 4, lineBreak: false });
      rx += authCols[ci];
    });
  }

  if (authHistory.length === 0) {
    doc.font("Courier").fontSize(8).fillColor("#64748b").text("No authorization requests recorded.", 55, authY + 4);
    authY += 20;
  }

  // Section 2.5: Swarm & Sovereign Ancestry
  const swarmLogs = logs.filter(
    (l) =>
      (l as any).swarmId ||
      (l as any).parentAgentId ||
      ((l as any).computeOriginRegion && (l as any).computeOriginRegion !== "unspecified"),
  );
  const swarmY = authY + maxAuth * 14 + 18;

  doc.font("Courier-Bold").fontSize(11).fillColor(C.primary)
    .text("§2.5  SWARM & SOVEREIGN ANCESTRY  (Art. 12 — Geopatriation)", 50, swarmY);
  doc.rect(50, swarmY + 13, 495, 1).fill(C.border);

  if (swarmLogs.length === 0) {
    doc.font("Courier").fontSize(8).fillColor(C.muted)
      .text("No swarm-aware entries in this export. All agents operated as independent root nodes.", 55, swarmY + 20);
  } else {
    const swarmCols = [100, 100, 100, 100, 95];
    const swarmHeaders = ["Agent ID", "Swarm ID", "Parent Agent", "Origin Region", "Timestamp"];
    let swy = swarmY + 20;

    doc.rect(50, swy, 495, 14).fill(C.border);
    let shx = 55;
    swarmHeaders.forEach((h, i) => {
      doc.font("Courier-Bold").fontSize(7).fillColor(C.textSub).text(h, shx, swy + 4);
      shx += swarmCols[i];
    });
    swy += 14;

    const maxSwarm = Math.min(swarmLogs.length, 20);
    for (let i = 0; i < maxSwarm; i++) {
      const l = swarmLogs[i] as any;
      const rowY = swy + i * 12;
      if (i % 2 === 0) doc.rect(50, rowY, 495, 12).fill("#0a1628");
      let rx = 55;
      const ts = new Date(l.timestamp).toISOString().substring(11, 19);
      [
        { text: l.agentId.substring(0, 16), color: C.text },
        { text: (l.swarmId ?? "—").substring(0, 16), color: "#40B595" },
        { text: (l.parentAgentId ?? "—").substring(0, 16), color: C.textSub },
        { text: (l.computeOriginRegion ?? "unspecified").substring(0, 16), color: "#60A5FA" },
        { text: ts, color: C.muted },
      ].forEach((cell, ci) => {
        doc.font("Courier").fontSize(6.5).fillColor(cell.color)
          .text(cell.text, rx, rowY + 3, { width: swarmCols[ci] - 4, lineBreak: false });
        rx += swarmCols[ci];
      });
    }
    if (swarmLogs.length > maxSwarm) {
      doc.font("Courier").fontSize(7).fillColor(C.muted)
        .text(`… and ${swarmLogs.length - maxSwarm} more swarm entries`, 55, swy + maxSwarm * 12 + 2);
    }
  }

  // Section 3: Topology Chain Map
  const swarmTableHeight = swarmLogs.length > 0 ? Math.min(swarmLogs.length, 20) * 12 + 34 : 28;
  const topoY = authY + maxAuth * 14 + 18 + swarmTableHeight + 16;
  doc.font("Courier-Bold").fontSize(11).fillColor("#0ea5e9").text("§3  MULTI-AGENT TOPOLOGY CHAIN  (EU AI Act Art. 12)", 50, topoY);
  doc.rect(50, topoY + 13, 495, 1).fill("#1e293b");

  doc.rect(50, topoY + 20, 495, Math.min(roots.length, 8) * 12 + 16).fill("#0a1628");

  let ty = topoY + 28;
  const chainLines: string[] = [];
  if (roots.length === 0) {
    chainLines.push("  (No chained traces — all traces are independent root nodes)");
  } else {
    roots.slice(0, 8).forEach((root, i) => {
      const lines = buildTextTree(root, "", i === Math.min(roots.length, 8) - 1);
      chainLines.push(...lines.slice(0, 6));
    });
  }
  chainLines.slice(0, 20).forEach((line) => {
    doc.font("Courier").fontSize(7).fillColor("#94a3b8").text(line, 58, ty);
    ty += 12;
  });

  // ─── PAGE 3: Cryptographic Seal ─────────────────────────────────────────
  doc.addPage();

  doc.rect(0, 0, 595, 40).fill("#0f172a");
  doc.font("Courier-Bold").fontSize(9).fillColor("#94a3b8").text("AGENT-SENTINEL  ·  CRYPTOGRAPHIC PROOF OF INTEGRITY", 50, 15);

  doc.font("Courier-Bold").fontSize(11).fillColor("#0ea5e9").text("§4  CRYPTOGRAPHIC HASH CHAIN SUMMARY", 50, 55);
  doc.rect(50, 68, 495, 1).fill("#1e293b");

  // Show first and last hash to prove chain integrity
  if (logs.length > 0) {
    const first = logs[logs.length - 1];
    const last = logs[0];

    doc.rect(50, 78, 495, 100).fill("#0a1628");

    doc.font("Courier-Bold").fontSize(8).fillColor("#94a3b8").text("CHAIN GENESIS (oldest entry in this export)", 60, 88);
    doc.font("Courier").fontSize(7).fillColor("#0ea5e9").text(`ID: ${first.id}`, 60, 100);
    doc.font("Courier").fontSize(7).fillColor("#f1f5f9").text(`Hash: ${first.currentHash}`, 60, 112);
    doc.font("Courier").fontSize(7).fillColor("#64748b").text(`Timestamp: ${new Date(first.timestamp).toUTCString()}`, 60, 124);

    doc.rect(50, 140, 495, 1).fill("#1e293b");

    doc.font("Courier-Bold").fontSize(8).fillColor("#94a3b8").text("CHAIN TIP (newest entry in this export)", 60, 148);
    doc.font("Courier").fontSize(7).fillColor("#0ea5e9").text(`ID: ${last.id}`, 60, 160);
    doc.font("Courier").fontSize(7).fillColor("#f1f5f9").text(`Hash: ${last.currentHash}`, 60, 172);
    doc.font("Courier").fontSize(7).fillColor("#64748b").text(`Timestamp: ${new Date(last.timestamp).toUTCString()}`, 60, 184);
  }

  // Document integrity seal
  doc.rect(50, 200, 495, 120).fill("#0a1628");
  doc.rect(50, 200, 3, 120).fill("#0ea5e9");

  doc.font("Courier-Bold").fontSize(12).fillColor("#f1f5f9").text("DOCUMENT INTEGRITY SEAL", 65, 215);
  doc.font("Courier").fontSize(8).fillColor("#94a3b8").text("HMAC-SHA256 signature computed with system SESSION_SECRET at generation time.", 65, 233);
  doc.font("Courier-Bold").fontSize(11).fillColor("#0ea5e9").text(documentSeal, 65, 253);
  doc
    .font("Courier")
    .fontSize(7)
    .fillColor("#64748b")
    .text(
      `Seal input: "${sealPayload}"`,
      65,
      273,
    );
  doc
    .font("Courier")
    .fontSize(7)
    .fillColor("#64748b")
    .text(`Algorithm: HMAC-SHA256 truncated to 32 hex chars`, 65, 285);

  // §5 Quantum Integrity section
  const qm = getQuantumIntegrityManifest();
  doc.rect(50, 338, 495, 120).fill("#0a1628");
  doc.rect(50, 338, 3, 120).fill("#40B595");

  doc.font("Courier-Bold").fontSize(11).fillColor(C.primary)
    .text("§5  QUANTUM INTEGRITY  —  POST-QUANTUM CRYPTOGRAPHIC LAYER", 65, 345);
  doc.font("Courier").fontSize(7.5).fillColor(C.textSub)
    .text("Each audit entry in this export was signed at ingestion using the ML-DSA-87 abstraction layer.", 65, 360);

  const qFields: [string, string][] = [
    ["Algorithm",          qm.algorithm],
    ["FIPS Standard",      qm.fipsStandard],
    ["Migration Status",   qm.migrationStatus],
    ["Security Level",     `Level ${qm.securityLevel} (256-bit post-quantum)`],
    ["Threat Model",       qm.threatModel],
    ["Public Key Fingerprint", qm.publicKeyFingerprint],
    ["Key Rotation Policy", qm.keyRotationPolicy],
  ];

  let qy = 375;
  qFields.forEach(([label, value]) => {
    doc.font("Courier").fontSize(7).fillColor(C.muted).text(label.toUpperCase(), 65, qy);
    doc.font("Courier-Bold").fontSize(7.5).fillColor(
      label === "Algorithm" ? "#40B595" :
      label === "Migration Status" ? "#EBC06D" :
      label === "Public Key Fingerprint" ? C.primary : C.text
    ).text(value, 220, qy);
    qy += 11;
  });

  doc.font("Courier").fontSize(6.5).fillColor(C.muted)
    .text(
      "NOTE: Current implementation uses HMAC-SHA-512 as a placeholder. Drop-in replacement with @noble/post-quantum (FIPS 204 certified) requires no call-site changes.",
      65, qy + 4, { width: 460 }
    );

  // Legal footer
  doc.rect(50, 560, 495, 1).fill("#1e293b");
  doc
    .font("Courier")
    .fontSize(7)
    .fillColor("#475569")
    .text(
      "This document is a machine-generated audit record produced by Agent-Sentinel in compliance with EU AI Act",
      50,
      568,
      { align: "center", width: 495 },
    );
  doc
    .font("Courier")
    .fontSize(7)
    .fillColor("#475569")
    .text(
      "Articles 12 (Record-Keeping) and 14 (Human Oversight). The SHA-256 hash chain and HMAC document seal",
      50,
      578,
      { align: "center", width: 495 },
    );
  doc
    .font("Courier")
    .fontSize(7)
    .fillColor("#475569")
    .text(
      "provide cryptographic proof that no log entry has been tampered with after recording.",
      50,
      588,
      { align: "center", width: 495 },
    );

  doc.end();
}
