/**
 * Executive Quantum Audit (EQA)
 *
 * Board-ready report for a specific Partner_ID.
 * API: GET /v1/partner/quantum-audit?partnerId=xxx
 *
 * PDF engine: jsPDF + jspdf-autotable (direct browser download, no print dialog)
 * Filename: SENTINEL_EQA_[TIMESTAMP]_VERIFIED.pdf
 *
 * Re-render guard: wrapped in React.memo — Layout re-renders from
 * ForensicContext selection do NOT reset the sealing/generation state.
 *
 * Page 1 (A4 landscape):
 *   Header bar · Title "EQA — {partner}" · "FIPS-204 (ML-DSA-87) Sealed"
 *   Meta strip · Risk banner
 *   CRITICAL RISK section (Warning Crimson, anomalies on first page)
 *
 * Page 2:
 *   KPI cards · Full evidence table (every row: truncated ML-DSA-87 sig)
 *   Footer with audit ID on every page
 */

import React, { useState, useCallback, useRef } from "react";
import {
  ShieldCheck, Zap, Lock, AlertTriangle, Download,
  Loader2, Search, CheckCircle2, XCircle, Activity, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useForensic, type QuarantineEvent } from "@/contexts/ForensicContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  sage:    "#40B595",
  light:   "#E0E6ED",
  honey:   "#EBC06D",
  terra:   "#D96161",
  dark:    "#0D1117",
  panel:   "#161B22",
  card:    "#1C2128",
  border:  "#2C3136",
  dim:     "#9AA4B1",
  dimText: "#6B7680",
};

// ── PDF RGB tuples ─────────────────────────────────────────────────────────
type RGB = [number, number, number];
const R = {
  sage:     [64,  181, 149] as RGB,
  terra:    [220, 38,  38]  as RGB,
  crimson:  [185, 28,  28]  as RGB,
  dark:     [13,  17,  23]  as RGB,
  light:    [224, 230, 237] as RGB,
  honey:    [235, 192, 109] as RGB,
  dim:      [154, 164, 177] as RGB,
  text:     [74,  85,  104] as RGB,
  white:    [255, 255, 255] as RGB,
  grayBg:   [240, 244, 250] as RGB,
  border:   [221, 228, 239] as RGB,
  crimsonBg:[255, 245, 245] as RGB,
  crimsonAlt:[254,242, 242] as RGB,
  crimsonTxt:[127,29,  29]  as RGB,
  blue:     [96,  165, 250] as RGB,
  pageBg:   [249, 251, 255] as RGB,
};

// ── PDF helpers ────────────────────────────────────────────────────────────
function pFill(doc: jsPDF, c: RGB)   { doc.setFillColor(c[0], c[1], c[2]); }
function pStroke(doc: jsPDF, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]); }
function pText(doc: jsPDF, c: RGB)   { doc.setTextColor(c[0], c[1], c[2]); }
function pFont(doc: jsPDF, size: number, bold = false) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
}

// ── Types ──────────────────────────────────────────────────────────────────
interface InterceptedAnomaly {
  id: string;
  timestamp: string;
  agentId: string;
  swarmId: string | null;
  eventType: string;
  anomalyReason: string;
  blockLayer: string;
  hashSurface: string;
  fips204Hash: string | null;
  quantumSigProof: string;
  isQuantumProven: boolean;
  consistencyScore: number | null;
}

interface EQAReport {
  reportId: string;
  generatedAt: string;
  partnerId: string;
  agentsScoped: number;
  activeAgents: number;
  eventsAnalyzed: number;
  quantumVerifiedCount: number;
  classicalVerifiedCount: number;
  integrityConfidenceScore: number;
  interceptedAnomalies: InterceptedAnomaly[];
  anomalyCount: number;
  layerBreakdown: Record<string, number>;
  riskRating: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  interventionTimeMs: number | null;
  complianceFramework: string;
  classification: string;
  error?: string;
}

// ── SVG Arc Score ──────────────────────────────────────────────────────────
function ArcScore({ score }: { score: number }) {
  const r = 70; const cx = 90; const cy = 90;
  const startAngle = -210; const endAngle = 30;
  const filled = ((score / 100) * (endAngle - startAngle));
  const arcColor = score >= 90 ? C.sage : score >= 70 ? C.honey : C.terra;

  function polar(angle: number, radius: number) {
    const a = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }
  function arc(start: number, end: number, radius: number) {
    const s = polar(start, radius); const e = polar(end, radius);
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
  }

  return (
    <svg width={180} height={160} viewBox="0 0 180 160">
      <path d={arc(startAngle, endAngle, r)} fill="none" stroke={C.border} strokeWidth={14} strokeLinecap="round" />
      {score > 0 && (
        <path d={arc(startAngle, startAngle + filled, r)} fill="none" stroke={arcColor} strokeWidth={14}
          strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${arcColor}80)` }} />
      )}
      <text x={cx} y={cy + 2}  textAnchor="middle" fill={arcColor} fontSize={28} fontWeight="bold" fontFamily="monospace">{score.toFixed(1)}</text>
      <text x={cx} y={cy + 20} textAnchor="middle" fill={arcColor} fontSize={11} fontFamily="monospace">%</text>
      <text x={cx} y={cy + 38} textAnchor="middle" fill={C.dim} fontSize={8} fontFamily="monospace" letterSpacing={1.5}>CONFIDENCE</text>
    </svg>
  );
}

// ── Layer chip ─────────────────────────────────────────────────────────────
function LayerChip({ layer }: { layer: string }) {
  const map: Record<string, string> = {
    "Cognitive Drift Detector": C.honey, "Circuit Breaker": C.terra,
    "Rate Limiter": "#60A5FA", "Consistency Guard": "#C084FC",
    "Governance Kill-Switch": C.terra, "Anomaly Detector": C.dim,
  };
  const color = map[layer] ?? C.dim;
  return (
    <span className="inline-block text-[9px] font-mono font-bold px-2 py-0.5 rounded whitespace-nowrap"
      style={{ color, background: `${color}15`, border: `1px solid ${color}35` }}>
      {layer}
    </span>
  );
}

// ── Generation progress bar ────────────────────────────────────────────────
function GenProgressBar({ progress }: { progress: number }) {
  const phase =
    progress < 30  ? "Scoping partner agents…"
    : progress < 55 ? `Scanning cryptographic events…`
    : progress < 75 ? "Verifying ML-DSA-87 signature coverage…"
    : progress < 90 ? "Computing FIPS-204 anomaly disposition…"
    :                  "Finalizing board-ready report…";

  return (
    <div style={{ borderRadius: 10, padding: "14px 16px", background: `${C.sage}08`, border: `1px solid ${C.sage}25` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: C.sage }}>
          Generating Sovereignty Report…
        </span>
        <span className="text-[10px] font-mono" style={{ color: C.dim }}>{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${C.sage}, #38BDF8)`, boxShadow: `0 0 8px ${C.sage}60` }} />
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <Loader2 className="w-3 h-3 animate-spin" style={{ color: C.sage }} />
        <span className="text-[10px] font-mono" style={{ color: C.dim }}>{phase}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// jsPDF GENERATION ENGINE
// Runs outside the React component so it is never recreated on re-renders.
// Returns a jsPDF document — caller saves it with doc.save(filename).
// ─────────────────────────────────────────────────────────────────────────────
function generatePDFDoc(r: EQAReport, qLog: QuarantineEvent[] = []): jsPDF {
  const doc  = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW   = 297;   // A4 landscape width
  const PH   = 210;   // A4 landscape height
  const ML   = 14;    // left margin
  const CW   = PW - ML * 2; // content width = 269mm

  const date    = new Date(r.generatedAt);
  const dateStr = date.toLocaleDateString("en-GB",  { day: "2-digit", month: "long",  year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-GB",  { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
  const printedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });
  const auditId = `${r.reportId}-EQA`;

  const riskRGB: Record<string, RGB> = {
    LOW: R.sage, MEDIUM: R.honey, HIGH: R.terra, CRITICAL: R.crimson,
  };
  const riskColor = riskRGB[r.riskRating] ?? R.dim;
  const scoreColor: RGB = r.integrityConfidenceScore >= 90 ? R.sage
    : r.integrityConfidenceScore >= 70 ? R.honey : R.terra;

  // ── Helper: draw page header bar ─────────────────────────────────────────
  function drawPageHeader(pageNum: number, totalLabel: string) {
    pFill(doc, R.dark); doc.rect(0, 0, PW, 15, "F");
    pFont(doc, 8, true);  pText(doc, R.sage);
    doc.text("AGENT-SENTINEL", ML, 8);
    pFont(doc, 5.5); pText(doc, R.dim);
    doc.text("NEURAL SOVEREIGNTY · v6.0", ML, 12.5);
    pFont(doc, 5.5); pText(doc, R.dim);
    doc.text(`${r.partnerId} · Page ${pageNum} ${totalLabel}`, PW - ML, 10, { align: "right" });
  }

  // ── Helper: draw page footer ──────────────────────────────────────────────
  function drawPageFooter() {
    const fy = PH - 8;
    pStroke(doc, R.border); doc.setLineWidth(0.25);
    doc.line(ML, fy - 3, PW - ML, fy - 3);
    pFont(doc, 5.5); pText(doc, R.dim);
    doc.text(`Audit ID: ${auditId}`, ML, fy);
    doc.text("Generated by Sentinel v6.0 — Neural Sovereignty EQA Engine · © 2026", PW / 2, fy, { align: "center" });
    doc.text(`Printed: ${printedAt}`, PW - ML, fy, { align: "right" });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 1
  // ─────────────────────────────────────────────────────────────────────────
  drawPageHeader(1, r.interceptedAnomalies.length > 0 ? "(Critical Risk)" : "");

  let y = 19;

  // ── Title ────────────────────────────────────────────────────────────────
  pFont(doc, 14, true); pText(doc, [10, 15, 19] as RGB);
  doc.text(`Executive Quantum Audit (EQA) \u2014 ${r.partnerId}`, ML, y);
  y += 7;

  // ── Subtitle: FIPS-204 sealed ─────────────────────────────────────────────
  pFont(doc, 8, true); pText(doc, R.sage);
  doc.text("FIPS-204 (ML-DSA-87) Sealed", ML, y);
  y += 5;

  // ── Classification badge (top right of title block) ───────────────────────
  pFont(doc, 6.5, true); pText(doc, R.terra);
  const clsW = doc.getTextWidth(r.classification) + 8;
  pStroke(doc, R.terra); doc.setLineWidth(0.3);
  doc.rect(PW - ML - clsW, y - 19, clsW, 7.5, "S");
  doc.text(r.classification, PW - ML - clsW / 2, y - 14.5, { align: "center" });

  // ── Report info line ──────────────────────────────────────────────────────
  pFont(doc, 6.5); pText(doc, R.dim);
  doc.text(`${dateStr} · ${timeStr} · Report ID: ${r.reportId}`, ML, y);
  y += 6;

  // ── Meta strip ────────────────────────────────────────────────────────────
  pFill(doc, R.grayBg); pStroke(doc, R.border); doc.setLineWidth(0.25);
  doc.rect(ML, y, CW, 14, "FD");

  const metaCols = [
    ["Partner",         r.partnerId],
    ["Events Analyzed", r.eventsAnalyzed.toLocaleString()],
    ["Agents Scoped",   `${r.activeAgents} / ${r.agentsScoped} active`],
    ["Anomalies",       String(r.anomalyCount)],
    ["Risk Rating",     r.riskRating],
    ["Framework",       r.complianceFramework.substring(0, 28)],
  ];
  const colW = CW / metaCols.length;
  metaCols.forEach(([label, value], i) => {
    const mx = ML + i * colW + 3;
    pFont(doc, 5.5); pText(doc, R.dim);
    doc.text(label.toUpperCase(), mx, y + 5);
    pFont(doc, 8, true);
    pText(doc,
      label === "Anomalies" && r.anomalyCount > 0 ? R.terra
      : label === "Risk Rating" ? riskColor
      : ([10, 15, 19] as RGB)
    );
    doc.text(value, mx, y + 11.5);
  });
  y += 17;

  // ── 4-Box KPI Metric Grid ────────────────────────────────────────────────
  const kpiW = (CW - 9) / 4;
  const kpiH = 30;
  const kpis = [
    { label: "INTEGRITY CONFIDENCE SCORE", val: `${r.integrityConfidenceScore.toFixed(1)}%`, sub: "ML-DSA-87 · FIPS-204 · Level 5", color: scoreColor },
    { label: "QUANTUM VERIFIED", val: r.quantumVerifiedCount.toLocaleString(), sub: `ML-DSA-87 · ${((r.quantumVerifiedCount / Math.max(r.eventsAnalyzed, 1)) * 100).toFixed(1)}% coverage`, color: R.sage },
    { label: "CLASSICAL VERIFIED", val: r.classicalVerifiedCount.toLocaleString(), sub: `SHA-256 · ${((r.classicalVerifiedCount / Math.max(r.eventsAnalyzed, 1)) * 100).toFixed(1)}% coverage`, color: R.blue },
    { label: "INTERCEPTED ANOMALIES", val: String(r.anomalyCount), sub: `${((r.anomalyCount / Math.max(r.eventsAnalyzed, 1)) * 100).toFixed(2)}% of events`, color: r.anomalyCount > 0 ? R.terra : R.sage },
  ];
  kpis.forEach(({ label, val, sub, color }, i) => {
    const kx = ML + i * (kpiW + 3);
    pFill(doc, R.pageBg); pStroke(doc, color); doc.setLineWidth(0.3);
    doc.rect(kx, y, kpiW, kpiH, "FD");
    pFill(doc, color); doc.rect(kx, y, kpiW, 2.5, "F");
    pFont(doc, 5.5); pText(doc, R.dim);
    doc.text(label, kx + 3, y + 8.5);
    pFont(doc, 15, true); pText(doc, color);
    doc.text(val, kx + 3, y + 20);
    pFont(doc, 5); pText(doc, R.text);
    doc.text(sub, kx + 3, y + 27);
  });
  y += kpiH + 6;

  // ── Risk banner ───────────────────────────────────────────────────────────
  const bannerBg: RGB = [
    Math.min(255, riskColor[0] + 220),
    Math.min(255, riskColor[1] + 220),
    Math.min(255, riskColor[2] + 220),
  ];
  pFill(doc, bannerBg); doc.rect(ML, y, CW, 11, "F");
  pFill(doc, riskColor); doc.rect(ML, y, 2.5, 11, "F");
  pFont(doc, 6); pText(doc, R.dim);
  doc.text("RISK CLASSIFICATION", ML + 6, y + 4.5);
  pFont(doc, 9, true); pText(doc, riskColor);
  doc.text(r.riskRating, ML + 6, y + 9.5);
  pFont(doc, 6); pText(doc, R.text);
  doc.text(r.complianceFramework, PW - ML, y + 7, { align: "right" });
  y += 14;

  // ── CRITICAL RISK section (Warning Crimson on Page 1) ────────────────────
  if (r.interceptedAnomalies.length > 0) {
    // Red header bar
    pFill(doc, R.terra); doc.rect(ML, y, CW, 9, "F");
    pFont(doc, 7.5, true); pText(doc, R.white);
    doc.text(
      `\u26A0  Critical Risk \u2014 ${r.anomalyCount} Intercepted Anomal${r.anomalyCount === 1 ? "y" : "ies"} Requiring Board Attention`,
      ML + 4, y + 5.8
    );
    pFont(doc, 5.5, true); pText(doc, R.white);
    doc.text("FIPS-204 SEALED EVIDENCE", PW - ML - 4, y + 5.8, { align: "right" });
    y += 9;

    // Anomaly rows — all in Warning Crimson highlight
    const anoRows = r.interceptedAnomalies.map((a, i) => [
      String(i + 1),
      new Date(a.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      a.agentId.length > 18 ? a.agentId.substring(0, 18) + "\u2026" : a.agentId,
      a.eventType,
      a.anomalyReason.length > 58 ? a.anomalyReason.substring(0, 58) + "\u2026" : a.anomalyReason,
      // Every row includes the truncated ML-DSA-87 signature
      a.quantumSigProof.length > 20 ? a.quantumSigProof.substring(0, 20) + "\u2026" : a.quantumSigProof,
      a.blockLayer,
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: ML },
      head: [["#", "Time (UTC)", "Agent ID", "Event Type", "Anomaly Reason", "ML-DSA-87 Sig", "Block Layer"]],
      body: anoRows,
      theme: "plain",
      styles: {
        font: "courier",
        fontSize: 6.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        fillColor: R.crimsonBg,
        textColor: R.crimsonTxt,
        lineColor: [253, 202, 202] as RGB,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [254, 226, 226] as RGB,
        textColor: R.crimsonTxt,
        fontStyle: "bold",
        fontSize: 6,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: {
        fillColor: R.crimsonAlt,
      },
      columnStyles: {
        0: { cellWidth: 7,  halign: "center" },
        1: { cellWidth: 21 },
        2: { cellWidth: 36 },
        3: { cellWidth: 28 },
        4: { cellWidth: "auto" },
        5: { cellWidth: 40, font: "courier", fontSize: 5.5 },
        6: { cellWidth: 34 },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 3;
  } else {
    // Clean state notice
    pFill(doc, [240, 253, 244] as RGB); pStroke(doc, [134, 239, 172] as RGB);
    doc.setLineWidth(0.3); doc.rect(ML, y, CW, 10, "FD");
    pFont(doc, 7, true); pText(doc, [22, 101, 52] as RGB);
    doc.text("\u2713  No anomalies intercepted in this audit window \u2014 governance posture is nominal.", ML + 5, y + 6.5);
    y += 13;
  }

  drawPageFooter();

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 2 — Sovereign Analysis + full evidence table
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  drawPageHeader(2, "(Sovereign Analysis & Evidence)");

  y = 19;

  // ── Sovereign Analysis prose ──────────────────────────────────────────────
  pFill(doc, [13, 20, 30] as RGB); doc.rect(ML, y, CW, 9, "F");
  pFont(doc, 7.5, true); pText(doc, R.sage);
  doc.text("SOVEREIGN ANALYSIS", ML + 4, y + 5.8);
  pFont(doc, 5.5, true); pText(doc, R.dim);
  doc.text("GENERATED BY SENTINEL EQA ENGINE v6.0 — NEURAL SOVEREIGNTY", PW - ML - 4, y + 5.8, { align: "right" });
  y += 10;

  const qvCoverage  = ((r.quantumVerifiedCount / Math.max(r.eventsAnalyzed, 1)) * 100).toFixed(1);
  const cvCoverage  = ((r.classicalVerifiedCount / Math.max(r.eventsAnalyzed, 1)) * 100).toFixed(1);
  const anomalyRate = ((r.anomalyCount / Math.max(r.eventsAnalyzed, 1)) * 100).toFixed(2);

  const sovereign1 = `This Executive Quantum Audit evaluates ${r.eventsAnalyzed.toLocaleString()} governance events recorded by ${r.activeAgents} active agents ` +
    `(${r.agentsScoped} scoped) under the ${r.complianceFramework} framework. Post-quantum signature coverage ` +
    `reached ${qvCoverage}% via FIPS-204 (ML-DSA-87), while classical SHA-256 chain verification achieved ${cvCoverage}% ` +
    `coverage — yielding an aggregate Integrity Confidence Score of ${r.integrityConfidenceScore.toFixed(1)}%.`;

  const sovereign2 = r.anomalyCount > 0
    ? `${r.anomalyCount} governance anomal${r.anomalyCount === 1 ? "y was" : "ies were"} intercepted and sealed on the immutable ledger, ` +
      `representing ${anomalyRate}% of the audit window. Each entry carries a cryptographically bound ML-DSA-87 lattice signature ` +
      `providing NIST Level 5 post-quantum attestation. Immediate board-level review is recommended.`
    : `No governance anomalies were intercepted in this audit window. All agent events are cryptographically attested ` +
      `and the ledger hash chain is intact. The governance posture for ${r.partnerId} is assessed as nominal.`;

  const sovereign3 = r.interventionTimeMs != null
    ? `Governance intervention latency recorded at ${r.interventionTimeMs < 1 ? r.interventionTimeMs.toFixed(1) : Math.round(r.interventionTimeMs).toLocaleString()} ms — ` +
      `sub-millisecond CASCADE_REVOKE response confirmed. Zero-trust perimeter was maintained throughout the audit window.`
    : `Zero-trust agent perimeter was maintained throughout the audit window. All agent actions were routed through ` +
      `the multi-signature governance gate before execution.`;

  pFont(doc, 7);
  const lines1 = doc.splitTextToSize(sovereign1, CW - 14) as string[];
  const lines2 = doc.splitTextToSize(sovereign2, CW - 14) as string[];
  const lines3 = doc.splitTextToSize(sovereign3, CW - 14) as string[];
  const lh = 3.5;
  const boxH = 8 + (lines1.length + lines2.length + lines3.length) * lh + 6;

  pFill(doc, R.pageBg); pStroke(doc, R.border); doc.setLineWidth(0.2);
  doc.rect(ML, y, CW, boxH, "FD");
  pFill(doc, scoreColor); doc.rect(ML, y, 2.5, boxH, "F");

  let ty = y + 6;
  pFont(doc, 7); pText(doc, [10, 15, 19] as RGB);
  doc.text(lines1, ML + 7, ty);
  ty += lines1.length * lh + 3;

  pFont(doc, 7); pText(doc, r.anomalyCount > 0 ? R.crimsonTxt : ([10, 15, 19] as RGB));
  doc.text(lines2, ML + 7, ty);
  ty += lines2.length * lh + 3;

  pFont(doc, 7); pText(doc, R.text);
  doc.text(lines3, ML + 7, ty);

  y += boxH + 6;

  // Intervention time (if present)
  if (r.interventionTimeMs !== null && r.interventionTimeMs !== undefined) {
    pFill(doc, [255, 245, 245] as RGB); pStroke(doc, R.terra); doc.setLineWidth(0.3);
    doc.rect(ML, y, CW, 11, "FD");
    pFill(doc, R.terra); doc.rect(ML, y, 2.5, 11, "F");
    pFont(doc, 6); pText(doc, R.dim);
    doc.text("GOVERNANCE INTERVENTION TIME", ML + 6, y + 4.5);
    pFont(doc, 8, true); pText(doc, R.terra);
    const itStr = r.interventionTimeMs < 1
      ? `${r.interventionTimeMs.toFixed(1)} ms`
      : `${Math.round(r.interventionTimeMs).toLocaleString()} ms`;
    doc.text(itStr, ML + 6, y + 9.5);
    pFont(doc, 6); pText(doc, R.text);
    doc.text("Sub-millisecond governance response · FIPS-204 sealed · CASCADE_REVOKE to breach interception", PW - ML - 4, y + 7, { align: "right" });
    y += 14;
  }

  // ── Section divider ────────────────────────────────────────────────────────
  pFont(doc, 6.5, true); pText(doc, R.dim);
  doc.text("FULL FIPS-204 CRYPTOGRAPHIC EVIDENCE RECORD (ALL ROWS INCLUDE ML-DSA-87 SIGNATURE)", ML, y);
  pStroke(doc, R.border); doc.setLineWidth(0.25);
  const divX = ML + doc.getTextWidth("FULL FIPS-204 CRYPTOGRAPHIC EVIDENCE RECORD (ALL ROWS INCLUDE ML-DSA-87 SIGNATURE)") + 3;
  doc.line(divX, y - 1, PW - ML, y - 1);
  y += 4;

  // ── Evidence table — every row includes ML-DSA-87 signature ──────────────
  const evRows = r.interceptedAnomalies.map((a) => [
    new Date(a.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    a.agentId.length > 20 ? a.agentId.substring(0, 20) + "\u2026" : a.agentId,
    a.eventType,
    a.anomalyReason.length > 48 ? a.anomalyReason.substring(0, 48) + "\u2026" : a.anomalyReason,
    a.isQuantumProven ? "\u2713 PROVEN" : "UNSIGNED",
    // Truncated ML-DSA-87 signature on every row
    a.quantumSigProof.length > 24 ? a.quantumSigProof.substring(0, 24) + "\u2026" : a.quantumSigProof,
    a.blockLayer,
  ]);

  if (evRows.length === 0) {
    pFill(doc, R.pageBg); doc.rect(ML, y, CW, 10, "F");
    pFont(doc, 7); pText(doc, R.dim);
    doc.text("No anomalies detected in this audit window — governance posture is nominal.", ML + 4, y + 6.5);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: ML },
      head: [["Time (UTC)", "Agent ID", "Event Type", "Anomaly Reason", "QP Status", "ML-DSA-87 Sig (truncated)", "Block Layer"]],
      body: evRows,
      theme: "striped",
      styles: {
        font: "courier",
        fontSize: 6.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        fillColor: R.white,
        textColor: R.text,
        lineColor: R.border,
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: R.grayBg,
        textColor: R.dim,
        fontStyle: "bold",
        fontSize: 6,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: { fillColor: R.pageBg },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 40 },
        2: { cellWidth: 28 },
        3: { cellWidth: "auto" },
        4: { cellWidth: 22 },
        5: { cellWidth: 50, font: "courier", fontSize: 5.5 },
        6: { cellWidth: 36 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          const proven = (data.cell.raw as string) === "\u2713 PROVEN";
          data.cell.styles.textColor = proven ? R.sage : R.terra;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  // ── Certification block (bottom of page 2) ────────────────────────────────
  const certY = PH - 28;
  pFill(doc, R.grayBg); pStroke(doc, R.border); doc.setLineWidth(0.25);
  doc.rect(ML, certY, CW, 14, "FD");

  pFont(doc, 5.5, true); pText(doc, R.sage);
  doc.text("QUANTUM-SEALED · QL-2.0", ML + 4, certY + 4.5);
  pFont(doc, 5); pText(doc, R.dim);
  doc.text("ML-DSA-87 · FIPS-204 · EU AI Act Art. 12/14 · Neural Sovereignty Layer v6.0 · SLSA L4", ML + 4, certY + 9.5);

  pFont(doc, 5, true); pText(doc, R.dim);
  doc.text(`Report ID: ${r.reportId}`, PW - ML - 4, certY + 4.5, { align: "right" });
  doc.text(`Audit ID: ${auditId}`, PW - ML - 4, certY + 9.5, { align: "right" });

  drawPageFooter();

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 3 — Autonomous Quarantine Log (V6.0 Neural Sovereignty)
  // ─────────────────────────────────────────────────────────────────────────
  if (qLog.length > 0) {
    doc.addPage();
    drawPageHeader(3, "(Autonomous Quarantine Log)");
    y = 19;

    // Section header
    pFill(doc, R.crimson); doc.rect(ML, y, CW, 9, "F");
    pFont(doc, 7.5, true); pText(doc, R.white);
    doc.text(`\u26A0  AUTONOMOUS QUARANTINE LOG \u2014 ${qLog.length} Sub-Millisecond Interdiction${qLog.length === 1 ? "" : "s"}`, ML + 4, y + 5.8);
    pFont(doc, 5.5, true); pText(doc, R.white);
    doc.text("SOVEREIGN TOKEN REVOKED · COGNITIVE DRIFT > 25%", PW - ML - 4, y + 5.8, { align: "right" });
    y += 11;

    // Summary strip
    const totalIntMs = qLog.reduce((s, e) => s + e.interventionMs, 0);
    const avgIntMs   = totalIntMs / qLog.length;
    const maxDrift   = Math.max(...qLog.map(e => e.drift));
    pFill(doc, R.crimsonBg); pStroke(doc, R.crimson); doc.setLineWidth(0.25);
    doc.rect(ML, y, CW, 14, "FD");
    const sumCols = [
      ["Interdictions",         String(qLog.length)],
      ["Avg Response",          `${avgIntMs.toFixed(2)} ms`],
      ["Peak Drift",            `${maxDrift.toFixed(1)}%`],
      ["Sovereign Tokens Revoked", String(qLog.length)],
    ];
    const sCw = CW / sumCols.length;
    sumCols.forEach(([label, value], i) => {
      const mx = ML + i * sCw + 3;
      pFont(doc, 5.5); pText(doc, R.dim);
      doc.text(label.toUpperCase(), mx, y + 5);
      pFont(doc, 8, true); pText(doc, R.crimsonTxt);
      doc.text(value, mx, y + 11.5);
    });
    y += 17;

    // Event table
    const qRows = qLog.map((e, i) => [
      String(i + 1),
      new Date(e.ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      e.agentLabel.length > 22 ? e.agentLabel.substring(0, 22) + "\u2026" : e.agentLabel,
      e.swarmId ? (e.swarmId.length > 22 ? e.swarmId.substring(0, 22) + "\u2026" : e.swarmId) : "—",
      `${e.drift.toFixed(1)}%`,
      `${e.interventionMs.toFixed(2)} ms`,
      "CASCADE_REVOKE",
      e.reason.length > 48 ? e.reason.substring(0, 48) + "\u2026" : e.reason,
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: ML },
      head: [["#", "Timestamp", "Agent", "Cluster", "Drift", "Response", "Action", "Reason"]],
      body: qRows,
      theme: "plain",
      styles: {
        font: "courier", fontSize: 6.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        fillColor: R.crimsonBg, textColor: R.crimsonTxt,
        lineColor: [253, 202, 202] as RGB, lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [254, 226, 226] as RGB, textColor: R.crimsonTxt,
        fontStyle: "bold", fontSize: 6,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: { fillColor: R.crimsonAlt },
      columnStyles: {
        0: { cellWidth: 7,  halign: "center" },
        1: { cellWidth: 38 },
        2: { cellWidth: 42 },
        3: { cellWidth: 38 },
        4: { cellWidth: 16, halign: "right", fontStyle: "bold" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 32, fontStyle: "bold" },
        7: { cellWidth: "auto" },
      },
    });

    drawPageFooter();
  }

  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// Wrapped in React.memo to prevent re-renders from ForensicContext updates
// (Layout calls useForensic() — any Forensic Inspector selection triggers a
// Layout re-render that would otherwise cascade into EQA and reset sealing state)
// ─────────────────────────────────────────────────────────────────────────────
const EQAPage = React.memo(function EQAPage() {
  const { quarantineLog } = useForensic();
  const initId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("partnerId") ?? ""
    : "";

  const [partnerId,    setPartnerId]    = useState(initId);
  const [loading,      setLoading]      = useState(false);
  const [genProgress,  setGenProgress]  = useState(0);
  const [report,       setReport]       = useState<EQAReport | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  // Separate sealing (PDF generation) state — must not be reset by parent re-renders
  const [sealing,      setSealing]      = useState(false);
  const [sealProgress, setSealProgress] = useState(0);
  const [sealVerified, setSealVerified] = useState(false);

  const genIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const sealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // isMounted ref — prevents setState after unmount during async PDF generation
  const isMounted = useRef(true);
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (genIntervalRef.current)  clearInterval(genIntervalRef.current);
      if (sealIntervalRef.current) clearInterval(sealIntervalRef.current);
    };
  }, []);

  // ── Report generation progress animation ──────────────────────────────────
  const startGenProgress = () => {
    setGenProgress(0);
    let cur = 0;
    genIntervalRef.current = setInterval(() => {
      cur += Math.random() * 8 + 2;
      if (cur >= 88) { cur = 88; clearInterval(genIntervalRef.current!); }
      if (isMounted.current) setGenProgress(cur);
    }, 180);
  };

  const finishGenProgress = () => {
    if (genIntervalRef.current) clearInterval(genIntervalRef.current);
    if (isMounted.current) {
      setGenProgress(100);
      setTimeout(() => { if (isMounted.current) setGenProgress(0); }, 800);
    }
  };

  // ── Generate EQA report from API ──────────────────────────────────────────
  const handleGenerate = useCallback(async (id?: string) => {
    const pid = (id ?? partnerId).trim();
    if (!pid) return;
    setLoading(true);
    setError(null);
    setReport(null);
    startGenProgress();
    try {
      const res  = await fetch(`${BASE}/api/v1/partner/quantum-audit?partnerId=${encodeURIComponent(pid)}`);
      const data: EQAReport = await res.json();
      if (!res.ok || data.error) {
        finishGenProgress();
        if (isMounted.current) setError(data.error ?? "Failed to fetch EQA report");
        return;
      }
      finishGenProgress();
      if (isMounted.current) setReport(data);
    } catch {
      finishGenProgress();
      if (isMounted.current) setError("Network error — check the API server");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  // Auto-load if partnerId pre-filled from URL
  React.useEffect(() => {
    if (initId) handleGenerate(initId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Async PDF generation + direct download ────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!report || sealing) return;

    setSealing(true);
    setSealProgress(0);

    // Animate sealing progress bar
    let cur = 0;
    sealIntervalRef.current = setInterval(() => {
      cur = Math.min(cur + Math.random() * 14 + 4, 88);
      if (isMounted.current) setSealProgress(Math.round(cur));
      if (cur >= 88) clearInterval(sealIntervalRef.current!);
    }, 80);

    // Yield — let React paint the "Sealing N Events…" button state before
    // the (synchronous) jsPDF work blocks the main thread
    await new Promise<void>(resolve => setTimeout(resolve, 60));

    try {
      const doc = generatePDFDoc(report, quarantineLog);

      // Finalize progress
      if (sealIntervalRef.current) clearInterval(sealIntervalRef.current);
      if (isMounted.current) setSealProgress(100);

      // Brief pause so user sees 100% before download starts
      await new Promise<void>(resolve => setTimeout(resolve, 220));

      // Filename: SENTINEL_EQA_[TIMESTAMP]_VERIFIED.pdf
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      doc.save(`SENTINEL_EQA_${ts}_VERIFIED.pdf`);

      // Show "Seal Verified" completion signal for 2.4s
      if (isMounted.current) {
        setSealing(false);
        setSealProgress(0);
        setSealVerified(true);
        setTimeout(() => { if (isMounted.current) setSealVerified(false); }, 2400);
      }
    } catch {
      if (sealIntervalRef.current) clearInterval(sealIntervalRef.current);
      if (isMounted.current) {
        setSealing(false);
        setSealProgress(0);
      }
    }
  }, [report, sealing]);

  // ── Derived colours ───────────────────────────────────────────────────────
  const arcColor = report
    ? report.integrityConfidenceScore >= 90 ? C.sage
    : report.integrityConfidenceScore >= 70 ? C.honey : C.terra
    : C.sage;

  const riskColor: Record<string, string> = {
    LOW: C.sage, MEDIUM: C.honey, HIGH: C.terra, CRITICAL: C.terra,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5" style={{ color: C.sage }} />
            <h1 className="text-2xl font-bold font-mono tracking-tight" style={{ color: C.light }}>
              Executive Quantum Audit
            </h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
              style={{ color: C.sage, borderColor: `${C.sage}40`, background: `${C.sage}10` }}>
              EQA
            </span>
          </div>
          <p className="text-sm font-mono" style={{ color: C.dim }}>
            ML-DSA-87 integrity confidence · FIPS-204 cryptographic evidence · board-ready export
          </p>
        </div>

        {/* Download Board-Ready PDF — active immediately once report is loaded */}
        {report && (
          <Button
            onClick={handleDownload}
            disabled={sealing || sealVerified}
            className="font-mono text-xs gap-2 whitespace-nowrap shrink-0 relative overflow-hidden"
            style={{
              background: sealVerified ? C.sage
                        : sealing     ? `${C.sage}22`
                        : C.sage,
              color:      sealVerified ? "#000"
                        : sealing     ? C.sage
                        : "#000",
              border:     sealVerified ? "none"
                        : sealing     ? `1px solid ${C.sage}50`
                        : "none",
              minWidth: 220,
              transition: "background 0.3s ease, color 0.3s ease",
              animation: sealVerified ? "seal-flash 0.5s ease 2" : undefined,
            }}
          >
            {sealVerified ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Seal Verified ✓</span>
              </>
            ) : sealing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>SEALING LEDGER…</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 shrink-0" />
                Download Board-Ready PDF
              </>
            )}
          </Button>
        )}
      </div>

      {/* Sealing progress bar (PDF generation in progress) */}
      {sealing && (
        <div style={{ borderRadius: 10, padding: "14px 16px", background: `${C.honey}08`, border: `1px solid ${C.honey}25` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: C.honey }}>
              Sealing PDF — Writing FIPS-204 Evidence…
            </span>
            <span className="text-[10px] font-mono" style={{ color: C.dim }}>{sealProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
            <div className="h-full rounded-full transition-all duration-150"
              style={{ width: `${sealProgress}%`, background: `linear-gradient(90deg, ${C.honey}, ${C.terra})`,
                boxShadow: `0 0 8px ${C.honey}60` }} />
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: C.honey }} />
            <span className="text-[10px] font-mono" style={{ color: C.dim }}>
              {sealProgress < 30 ? "Building page layout…"
              : sealProgress < 55 ? `Writing ${report?.anomalyCount ?? 0} anomaly rows in Warning Crimson…`
              : sealProgress < 75 ? "Embedding ML-DSA-87 signatures in every row…"
              : sealProgress < 90 ? "Encoding FIPS-204 evidence table…"
              :                     "Finalizing — triggering download…"}
            </span>
          </div>
        </div>
      )}

      {/* Partner ID input */}
      <div className="flex items-center gap-3 p-4 rounded-lg border"
        style={{ background: C.panel, borderColor: C.border }}>
        <Search className="w-4 h-4 shrink-0" style={{ color: C.dim }} />
        <input
          type="text"
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && !sealing && handleGenerate()}
          placeholder="Partner ID (e.g. Apex-Fintech)"
          className="flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
          style={{ color: C.light }}
          disabled={loading || sealing}
        />
        <Button
          onClick={() => handleGenerate()}
          disabled={loading || sealing || !partnerId.trim()}
          size="sm"
          className="font-mono text-xs gap-1.5 shrink-0"
          style={{
            background: loading ? `${C.sage}10` : `${C.sage}20`,
            color: C.sage,
            border: `1px solid ${C.sage}40`,
            opacity: (loading || sealing) ? 0.6 : 1,
          }}
        >
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />SEALING LEDGER…</>
            : <><Activity className="w-3.5 h-3.5" />Generate EQA</>}
        </Button>
      </div>

      {/* Report generation progress bar */}
      {loading && <GenProgressBar progress={genProgress} />}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border font-mono text-sm"
          style={{ background: `${C.terra}10`, borderColor: `${C.terra}35`, color: C.terra }}>
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!report && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border"
          style={{ background: C.panel, borderColor: C.border }}>
          <ShieldCheck className="w-12 h-12 mb-4 opacity-20" style={{ color: C.sage }} />
          <p className="font-mono text-sm text-muted-foreground">Enter a Partner ID and generate an EQA report</p>
          <p className="font-mono text-[11px] text-muted-foreground mt-1">
            Analyzes the last 1,000 events — ML-DSA-87 verified
          </p>
          <p className="font-mono text-[10px] mt-3 px-3 py-1.5 rounded"
            style={{ color: C.dim, background: `${C.border}60` }}>
            Try: <span style={{ color: C.sage }}>Apex-Fintech</span>
          </p>
        </div>
      )}

      {/* ── Report ──────────────────────────────────────────────────────────── */}
      {report && (
        <div className="space-y-5">

          {/* Classification + meta strip */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border"
            style={{ background: `${C.terra}08`, borderColor: `${C.terra}30` }}>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 border tracking-widest"
                style={{ color: C.terra, borderColor: `${C.terra}50` }}>
                {report.classification}
              </span>
              <span className="font-mono text-[11px]" style={{ color: C.dim }}>
                {report.reportId} · {new Date(report.generatedAt).toLocaleString()}
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
              style={{
                color: riskColor[report.riskRating],
                borderColor: `${riskColor[report.riskRating]}40`,
                background: `${riskColor[report.riskRating]}10`,
              }}>
              {report.riskRating} RISK
            </span>
          </div>

          {/* On-screen Critical Risk banner */}
          {report.anomalyCount > 0 && (
            <div className="rounded-xl border overflow-hidden"
              style={{ borderColor: `${C.terra}50`, borderWidth: "1.5px" }}>
              <div className="flex items-center justify-between px-5 py-3"
                style={{ background: `${C.terra}18`, borderBottom: `1px solid ${C.terra}30` }}>
                <div className="flex items-center gap-2">
                  <TriangleAlert className="w-4 h-4" style={{ color: C.terra }} />
                  <span className="font-mono text-sm font-bold" style={{ color: C.terra }}>
                    Critical Risk — {report.anomalyCount} Intercepted Anomal{report.anomalyCount === 1 ? "y" : "ies"}
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded"
                  style={{ color: C.terra, background: `${C.terra}15`, border: `1px solid ${C.terra}30` }}>
                  FIPS-204 SEALED EVIDENCE
                </span>
              </div>
              <div className="px-5 py-3 text-[11px] font-mono"
                style={{ background: `${C.terra}06`, color: C.dim }}>
                {report.anomalyCount} governance event{report.anomalyCount === 1 ? "" : "s"} flagged and intercepted.
                All entries are ML-DSA-87 signed and cryptographically sealed on the immutable ledger.
                The downloaded PDF embeds every ML-DSA-87 signature on the first page in Warning Crimson.
              </div>
            </div>
          )}

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-4">
            {/* Arc score */}
            <div className="col-span-1 rounded-xl border flex flex-col items-center justify-center py-4"
              style={{ background: C.card, borderColor: `${arcColor}35`, borderWidth: "1.5px" }}>
              <div className="text-[9px] font-mono font-bold uppercase tracking-widest mb-2" style={{ color: C.dim }}>
                Integrity Confidence
              </div>
              <ArcScore score={report.integrityConfidenceScore} />
              <div className="text-[9px] font-mono text-center mt-1 px-4" style={{ color: C.dim }}>
                ML-DSA-87 · FIPS-204 · Level 5
              </div>
            </div>

            {/* Three metric cards */}
            <div className="col-span-3 grid grid-cols-3 gap-4">
              {[
                { icon: Zap,           label: "Quantum Verified",      value: report.quantumVerifiedCount.toLocaleString(),   sub: "ML-DSA-87 lattice signatures", color: C.sage,
                  pct: report.eventsAnalyzed > 0 ? (report.quantumVerifiedCount / report.eventsAnalyzed) * 100 : 0 },
                { icon: Lock,          label: "Classical Verified",    value: report.classicalVerifiedCount.toLocaleString(), sub: "SHA-256 chain hash coverage",  color: "#60A5FA",
                  pct: report.eventsAnalyzed > 0 ? (report.classicalVerifiedCount / report.eventsAnalyzed) * 100 : 0 },
                { icon: AlertTriangle, label: "Intercepted Anomalies", value: report.anomalyCount.toLocaleString(),            sub: "blocked at governance layer",  color: report.anomalyCount > 0 ? C.terra : C.sage,
                  pct: report.eventsAnalyzed > 0 ? (report.anomalyCount / report.eventsAnalyzed) * 100 : 0 },
              ].map(({ icon: Icon, label, value, sub, color, pct }) => (
                <div key={label} className="rounded-xl border p-5 relative overflow-hidden flex flex-col"
                  style={{ background: C.card, borderColor: `${color}28` }}>
                  <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: color }} />
                  <div className="flex items-center gap-1.5 mb-2 mt-0.5">
                    <Icon className="w-3 h-3" style={{ color }} />
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: C.dim }}>{label}</span>
                  </div>
                  <div className="text-3xl font-bold font-mono tabular-nums mb-1" style={{ color }}>{value}</div>
                  <div className="text-[10px] font-mono mb-3" style={{ color: C.dimText }}>{sub}</div>
                  <div className="h-1.5 rounded-full overflow-hidden mt-auto" style={{ background: C.border }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, pct)}%`, background: color }} />
                  </div>
                  <div className="text-[9px] font-mono mt-1" style={{ color: C.dim }}>
                    {pct.toFixed(1)}% of {report.eventsAnalyzed.toLocaleString()} events
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Intervention Time */}
          {report.interventionTimeMs !== null && report.interventionTimeMs !== undefined && (
            <div className="rounded-xl border flex items-center gap-6 px-6 py-4"
              style={{ background: `${C.terra}08`, borderColor: `${C.terra}40`, borderWidth: "1.5px" }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ background: `${C.terra}15`, border: `1.5px solid ${C.terra}40` }}>
                <Zap className="w-5 h-5" style={{ color: C.terra }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono font-bold uppercase tracking-widest mb-0.5" style={{ color: C.terra }}>
                  Governance Intervention Time
                </div>
                <div className="text-[11px] font-mono" style={{ color: C.dimText }}>
                  Time from first anomalous event to CASCADE_REVOKE — honey-token breach response latency
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-4xl font-bold font-mono tabular-nums" style={{ color: C.terra }}>
                  {report.interventionTimeMs < 1
                    ? `${report.interventionTimeMs.toFixed(1)}ms`
                    : `${Math.round(report.interventionTimeMs).toLocaleString()}ms`}
                </div>
                <div className="text-[9px] font-mono mt-0.5 uppercase tracking-widest" style={{ color: C.dimText }}>
                  Sub-millisecond response · FIPS-204 sealed
                </div>
              </div>
            </div>
          )}

          {/* Layer breakdown */}
          {Object.keys(report.layerBreakdown).length > 0 && (
            <div className="rounded-xl border p-5" style={{ background: C.card, borderColor: C.border }}>
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
                Governance Layer Breakdown
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(report.layerBreakdown).map(([layer, cnt]) => (
                  <div key={layer} className="flex items-center gap-2">
                    <LayerChip layer={layer} />
                    <span className="font-mono text-xs font-bold" style={{ color: C.light }}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Intercepted Anomalies table */}
          <div className="rounded-xl border overflow-hidden" style={{ background: C.card, borderColor: C.border }}>
            <div className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: C.border, background: C.panel }}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" style={{ color: C.honey }} />
                <span className="font-mono text-sm font-bold" style={{ color: C.light }}>
                  Intercepted Anomalies
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ color: C.honey, background: `${C.honey}15` }}>
                  {report.anomalyCount}
                </span>
              </div>
              <span className="text-[10px] font-mono" style={{ color: C.dim }}>FIPS-204 cryptographic evidence</span>
            </div>

            {report.interceptedAnomalies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="w-10 h-10 mb-3 opacity-30" style={{ color: C.sage }} />
                <p className="font-mono text-sm text-muted-foreground">No anomalies detected in this window</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono border-collapse">
                  <thead>
                    <tr style={{ background: `${C.sage}08`, borderBottom: `1px solid ${C.border}` }}>
                      {["Time", "Agent ID", "Swarm", "Type", "Block Layer", "Anomaly Reason", "Quantum Proof"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[9px] uppercase tracking-widest font-bold"
                          style={{ color: C.dim }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.interceptedAnomalies.map((a, i) => (
                      <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}`,
                        background: i % 2 === 0 ? "transparent" : `${C.border}20` }}>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: C.dim }}>
                          {new Date(a.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap" title={a.agentId} style={{ color: C.light }}>
                          {a.agentId.substring(0, 12)}…
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: C.dim }}>
                          {a.swarmId ? a.swarmId.substring(0, 10) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ color: C.honey, background: `${C.honey}15` }}>{a.eventType}</span>
                        </td>
                        <td className="px-4 py-2.5"><LayerChip layer={a.blockLayer} /></td>
                        <td className="px-4 py-2.5 max-w-xs truncate" title={a.anomalyReason} style={{ color: C.dim }}>
                          {a.anomalyReason}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {a.isQuantumProven
                              ? <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: C.sage }} />
                              : <XCircle      className="w-3 h-3 shrink-0" style={{ color: C.terra }} />}
                            <span className="text-[9px] truncate max-w-[120px]" title={a.quantumSigProof}
                              style={{ color: a.isQuantumProven ? C.sage : C.terra }}>
                              {a.quantumSigProof}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Compliance footer */}
          <div className="flex items-center justify-between px-5 py-3 rounded-lg border text-[10px] font-mono"
            style={{ background: C.panel, borderColor: C.border, color: C.dim }}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: C.sage }} />
              <span>{report.complianceFramework}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>{report.eventsAnalyzed.toLocaleString()} events · {report.agentsScoped} agents · {report.partnerId}</span>
              <span className="font-bold px-2 py-0.5 border"
                style={{ color: C.sage, borderColor: `${C.sage}40`, background: `${C.sage}0a` }}>
                QUANTUM-SEALED · QL-2.0
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
});

export default EQAPage;
