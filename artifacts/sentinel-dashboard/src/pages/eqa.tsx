/**
 * Executive Quantum Audit (EQA)
 *
 * Single-page board-ready dashboard for a specific Partner_ID.
 *
 * Powered by:  GET /v1/partner/quantum-audit?partnerId=xxx
 *
 * Sections:
 *   1. Integrity Confidence Score — ML-DSA-87 coverage arc + percentage
 *   2. Coverage breakdown — quantum vs classical vs total
 *   3. Intercepted Anomalies — table with FIPS-204 hashes, block layers, timestamps
 *   4. Download Board-Ready PDF — popup window with print-optimised HTML
 */

import React, { useState, useCallback } from "react";
import {
  ShieldCheck,
  Zap,
  Lock,
  AlertTriangle,
  Download,
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  Cpu,
  Activity,
  FileBarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  complianceFramework: string;
  classification: string;
  error?: string;
}

// ── SVG Arc Score ──────────────────────────────────────────────────────────

function ArcScore({ score }: { score: number }) {
  const r = 70;
  const cx = 90;
  const cy = 90;
  const startAngle = -210;
  const endAngle   = 30;
  const totalArc   = endAngle - startAngle;
  const filled     = (score / 100) * totalArc;
  const arcColor   = score >= 90 ? C.sage : score >= 70 ? C.honey : C.terra;

  function polarToXY(angle: number, radius: number) {
    const a = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  function describeArc(start: number, end: number, radius: number) {
    const s = polarToXY(start, radius);
    const e = polarToXY(end, radius);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  return (
    <svg width={180} height={160} viewBox="0 0 180 160">
      {/* Track */}
      <path
        d={describeArc(startAngle, endAngle, r)}
        fill="none"
        stroke={C.border}
        strokeWidth={14}
        strokeLinecap="round"
      />
      {/* Filled arc */}
      {score > 0 && (
        <path
          d={describeArc(startAngle, startAngle + filled, r)}
          fill="none"
          stroke={arcColor}
          strokeWidth={14}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${arcColor}80)` }}
        />
      )}
      {/* Score text */}
      <text x={cx} y={cy + 2} textAnchor="middle" fill={arcColor} fontSize={28} fontWeight="bold" fontFamily="monospace">
        {score.toFixed(1)}
      </text>
      <text x={cx} y={cy + 20} textAnchor="middle" fill={arcColor} fontSize={11} fontFamily="monospace">
        %
      </text>
      <text x={cx} y={cy + 38} textAnchor="middle" fill={C.dim} fontSize={8} fontFamily="monospace" letterSpacing={1.5}>
        CONFIDENCE
      </text>
    </svg>
  );
}

// ── Block-Layer chip ───────────────────────────────────────────────────────

function LayerChip({ layer }: { layer: string }) {
  const map: Record<string, string> = {
    "Cognitive Drift Detector": C.honey,
    "Circuit Breaker":          C.terra,
    "Rate Limiter":             "#60A5FA",
    "Consistency Guard":        "#C084FC",
    "Governance Kill-Switch":   C.terra,
    "Anomaly Detector":         C.dim,
  };
  const color = map[layer] ?? C.dim;
  return (
    <span
      className="inline-block text-[9px] font-mono font-bold px-2 py-0.5 rounded whitespace-nowrap"
      style={{ color, background: `${color}15`, border: `1px solid ${color}35` }}
    >
      {layer}
    </span>
  );
}

// ── Print HTML builder ─────────────────────────────────────────────────────

function buildPrintHTML(r: EQAReport): string {
  const date = new Date(r.generatedAt);
  const dateStr = date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  const arcColor = r.integrityConfidenceScore >= 90 ? "#40B595" : r.integrityConfidenceScore >= 70 ? "#EBC06D" : "#D96161";
  const riskColor = { LOW: "#40B595", MEDIUM: "#EBC06D", HIGH: "#D96161", CRITICAL: "#D96161" }[r.riskRating];

  const anomalyRows = r.interceptedAnomalies.slice(0, 30).map((a) => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:7px 10px;font-size:9px;color:#4A5568;">${new Date(a.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
      <td style="padding:7px 10px;font-size:9px;font-family:monospace;color:#1a1a2e;">${a.agentId.substring(0, 16)}…</td>
      <td style="padding:7px 10px;font-size:9px;color:#4A5568;">${a.eventType}</td>
      <td style="padding:7px 10px;font-size:9px;color:#4A5568;max-width:160px;">${a.anomalyReason.substring(0, 50)}${a.anomalyReason.length > 50 ? "…" : ""}</td>
      <td style="padding:7px 10px;font-size:9px;"><span style="background:${a.isQuantumProven ? "#40B59515" : "#D9616115"};color:${a.isQuantumProven ? "#40B595" : "#D96161"};padding:2px 6px;border-radius:3px;font-weight:bold;">${a.isQuantumProven ? "✓ PROVEN" : "UNSIGNED"}</span></td>
      <td style="padding:7px 10px;font-size:8px;font-family:monospace;color:#9AA4B1;word-break:break-all;">${a.quantumSigProof}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>EQA — ${r.partnerId} — ${dateStr}</title>
<style>
  @page { size: A4 landscape; margin: 20mm 18mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Courier New',monospace; background:#fff; color:#0a0f13; font-size:10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid #40B595; padding-bottom:12px; margin-bottom:16px; }
  .logo { font-size:16px; font-weight:bold; } .logo em { color:#40B595; font-style:normal; }
  .classification { font-size:7.5px; letter-spacing:2px; color:#D96161; font-weight:bold; border:1.5px solid #D96161; padding:3px 8px; }
  .title { font-size:18px; font-weight:bold; margin-bottom:3px; }
  .subtitle { font-size:9px; color:#4A5568; margin-bottom:14px; }
  .meta-row { display:flex; gap:24px; background:#f8fafc; border:1px solid #e2e8f0; padding:8px 12px; margin-bottom:14px; flex-wrap:wrap; }
  .meta-label { font-size:7px; letter-spacing:2px; color:#9AA4B1; text-transform:uppercase; margin-bottom:1px; }
  .meta-value { font-size:9.5px; font-weight:700; }
  .kpi-row { display:grid; grid-template-columns:180px 1fr 1fr 1fr; gap:12px; margin-bottom:14px; }
  .kpi-card { border:1px solid #e2e8f0; padding:12px 14px; }
  .kpi-accent { height:3px; margin:-12px -14px 10px; border-radius:0; }
  .kpi-label { font-size:7px; letter-spacing:2px; color:#9AA4B1; text-transform:uppercase; margin-bottom:6px; }
  .kpi-val { font-size:32px; font-weight:bold; line-height:1; }
  .kpi-sub { font-size:8px; color:#4A5568; margin-top:4px; }
  .section-title { font-size:8px; letter-spacing:2px; text-transform:uppercase; color:#9AA4B1; font-weight:bold; margin-bottom:8px; display:flex; align-items:center; gap:6px; }
  .section-title::after { content:''; flex:1; height:1px; background:#e2e8f0; }
  table { width:100%; border-collapse:collapse; margin-bottom:12px; }
  thead tr { background:#f8fafc; }
  th { padding:7px 10px; text-align:left; font-size:7.5px; letter-spacing:1.5px; color:#9AA4B1; text-transform:uppercase; font-weight:bold; border-bottom:1px solid #e2e8f0; }
  .risk-banner { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-left:3.5px solid ${riskColor}; background:${riskColor}0d; margin-bottom:14px; }
  .footer { display:flex; justify-content:space-between; border-top:1px solid #e2e8f0; padding-top:8px; margin-top:8px; font-size:7.5px; color:#9AA4B1; }
  .cert { font-size:7.5px; border:1px solid #40B595; color:#40B595; padding:3px 8px; letter-spacing:1px; font-weight:bold; }
</style>
</head><body>
  <div class="header">
    <div>
      <div class="logo">AGENT-<em>SENTINEL</em></div>
      <div style="font-size:7.5px;letter-spacing:2px;color:#9AA4B1;margin-top:2px;">ZERO-TRUST AI GOVERNANCE</div>
    </div>
    <div class="classification">${r.classification}</div>
  </div>

  <div class="title">Executive Quantum Audit (EQA)</div>
  <div class="subtitle">${dateStr} · ${timeStr} · Partner: ${r.partnerId}</div>

  <div class="meta-row">
    <div><div class="meta-label">Report ID</div><div class="meta-value">${r.reportId}</div></div>
    <div><div class="meta-label">Events Analyzed</div><div class="meta-value">${r.eventsAnalyzed.toLocaleString()}</div></div>
    <div><div class="meta-label">Agents Scoped</div><div class="meta-value">${r.activeAgents} / ${r.agentsScoped} active</div></div>
    <div><div class="meta-label">Anomalies</div><div class="meta-value">${r.anomalyCount}</div></div>
    <div><div class="meta-label">Framework</div><div class="meta-value">${r.complianceFramework}</div></div>
  </div>

  <div class="risk-banner">
    <div>
      <div style="font-size:7.5px;letter-spacing:2px;color:#4A5568;text-transform:uppercase;margin-bottom:2px;">Risk Classification</div>
      <div style="font-size:14px;font-weight:bold;color:${riskColor};">${r.riskRating}</div>
    </div>
    <div style="text-align:right;font-size:8.5px;color:#4A5568;">${r.complianceFramework}</div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card" style="border-color:${arcColor}40;">
      <div class="kpi-accent" style="background:${arcColor};"></div>
      <div class="kpi-label">Integrity Confidence Score</div>
      <div class="kpi-val" style="color:${arcColor};">${r.integrityConfidenceScore.toFixed(1)}%</div>
      <div class="kpi-sub">ML-DSA-87 (FIPS-204) coverage</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-accent" style="background:#40B595;"></div>
      <div class="kpi-label">Quantum Verified</div>
      <div class="kpi-val" style="color:#40B595;">${r.quantumVerifiedCount.toLocaleString()}</div>
      <div class="kpi-sub">events with ML-DSA-87 signature</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-accent" style="background:#60A5FA;"></div>
      <div class="kpi-label">Classical Verified</div>
      <div class="kpi-val" style="color:#60A5FA;">${r.classicalVerifiedCount.toLocaleString()}</div>
      <div class="kpi-sub">events with SHA-512 hash</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-accent" style="background:${r.anomalyCount > 0 ? "#EBC06D" : "#40B595"};"></div>
      <div class="kpi-label">Intercepted Anomalies</div>
      <div class="kpi-val" style="color:${r.anomalyCount > 0 ? "#EBC06D" : "#40B595"};">${r.anomalyCount}</div>
      <div class="kpi-sub">blocked at governance layer</div>
    </div>
  </div>

  <div class="section-title">Intercepted Anomalies — FIPS-204 Cryptographic Evidence (top 30)</div>
  <table>
    <thead><tr>
      <th>Time</th><th>Agent ID</th><th>Type</th><th>Anomaly Reason</th><th>Quantum Proof</th><th>FIPS-204 Signature Hash</th>
    </tr></thead>
    <tbody>${anomalyRows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#9AA4B1;">No anomalies detected in this window.</td></tr>'}</tbody>
  </table>

  <div class="footer">
    <div>
      <div>Generated by Agent-Sentinel v4.0 EQA Engine · ${r.reportId}</div>
      <div style="opacity:0.6;margin-top:2px;">© 2026 Agent-Sentinel. Classified. Unauthorized distribution prohibited.</div>
    </div>
    <div class="cert">QUANTUM-SEALED · QL-2.0</div>
  </div>
</body></html>`;
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function EQAPage() {
  const initId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("partnerId") ?? ""
    : "";

  const [partnerId, setPartnerId] = useState(initId);
  const [loading, setLoading]     = useState(false);
  const [report, setReport]       = useState<EQAReport | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const handleGenerate = useCallback(async (id?: string) => {
    const pid = (id ?? partnerId).trim();
    if (!pid) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const r = await fetch(`${BASE}/api/v1/partner/quantum-audit?partnerId=${encodeURIComponent(pid)}`);
      const data: EQAReport = await r.json();
      if (!r.ok || data.error) { setError(data.error ?? "Failed to fetch"); return; }
      setReport(data);
    } catch {
      setError("Network error — check the API server");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  // Auto-load if partnerId is pre-filled from URL
  React.useEffect(() => {
    if (initId) handleGenerate(initId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = () => {
    if (!report) return;
    const html = buildPrintHTML(report);
    const win  = window.open("", "_blank", "width=1100,height=780,scrollbars=yes");
    if (!win) { alert("Allow popups to download the PDF."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  const arcColor = report
    ? report.integrityConfidenceScore >= 90 ? C.sage
    : report.integrityConfidenceScore >= 70 ? C.honey
    : C.terra
    : C.sage;

  const riskColor: Record<string, string> = {
    LOW: C.sage, MEDIUM: C.honey, HIGH: C.terra, CRITICAL: C.terra,
  };

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5" style={{ color: C.sage }} />
            <h1 className="text-2xl font-bold font-mono tracking-tight" style={{ color: C.light }}>
              Executive Quantum Audit
            </h1>
            <span
              className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
              style={{ color: C.sage, borderColor: `${C.sage}40`, background: `${C.sage}10` }}
            >
              EQA
            </span>
          </div>
          <p className="text-sm font-mono" style={{ color: C.dim }}>
            ML-DSA-87 integrity confidence · FIPS-204 cryptographic evidence · board-ready export
          </p>
        </div>
        {report && (
          <Button
            onClick={handleDownload}
            className="font-mono text-xs gap-2 whitespace-nowrap shrink-0"
            style={{ background: C.sage, color: "#000", border: "none" }}
          >
            <Download className="w-3.5 h-3.5" />
            Download Board-Ready PDF
          </Button>
        )}
      </div>

      {/* ── Partner ID input ── */}
      <div
        className="flex items-center gap-3 p-4 rounded-lg border"
        style={{ background: C.panel, borderColor: C.border }}
      >
        <Search className="w-4 h-4 shrink-0" style={{ color: C.dim }} />
        <input
          type="text"
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder="Partner ID (e.g. admin@example.com)"
          className="flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
          style={{ color: C.light }}
        />
        <Button
          onClick={handleGenerate}
          disabled={loading || !partnerId.trim()}
          size="sm"
          className="font-mono text-xs gap-1.5 shrink-0"
          style={{ background: `${C.sage}20`, color: C.sage, border: `1px solid ${C.sage}40` }}
        >
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
            : <><Activity className="w-3.5 h-3.5" />Generate EQA</>}
        </Button>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-lg border font-mono text-sm"
          style={{ background: `${C.terra}10`, borderColor: `${C.terra}35`, color: C.terra }}
        >
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!report && !loading && !error && (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl border"
          style={{ background: C.panel, borderColor: C.border }}
        >
          <ShieldCheck className="w-12 h-12 mb-4 opacity-20" style={{ color: C.sage }} />
          <p className="font-mono text-sm text-muted-foreground">Enter a Partner ID and generate an EQA report</p>
          <p className="font-mono text-[11px] text-muted-foreground mt-1">
            Analyzes the last 1,000 events — ML-DSA-87 verified
          </p>
        </div>
      )}

      {/* ── Report ── */}
      {report && (
        <div className="space-y-5">

          {/* Classification + meta strip */}
          <div
            className="flex items-center justify-between px-4 py-2.5 rounded-lg border"
            style={{ background: `${C.terra}08`, borderColor: `${C.terra}30` }}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-[9px] font-mono font-bold px-2 py-0.5 border tracking-widest"
                style={{ color: C.terra, borderColor: `${C.terra}50` }}
              >
                {report.classification}
              </span>
              <span className="font-mono text-[11px]" style={{ color: C.dim }}>
                {report.reportId} · {new Date(report.generatedAt).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
                style={{
                  color: riskColor[report.riskRating],
                  borderColor: `${riskColor[report.riskRating]}40`,
                  background: `${riskColor[report.riskRating]}10`,
                }}
              >
                {report.riskRating} RISK
              </span>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-4">

            {/* Arc score card */}
            <div
              className="col-span-1 rounded-xl border flex flex-col items-center justify-center py-4"
              style={{ background: C.card, borderColor: `${arcColor}35`, borderWidth: "1.5px" }}
            >
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
                {
                  icon: Zap, label: "Quantum Verified", value: report.quantumVerifiedCount.toLocaleString(),
                  sub: "ML-DSA-87 lattice signatures", color: C.sage,
                  pct: report.eventsAnalyzed > 0 ? (report.quantumVerifiedCount / report.eventsAnalyzed) * 100 : 0,
                },
                {
                  icon: Lock, label: "Classical Verified", value: report.classicalVerifiedCount.toLocaleString(),
                  sub: "SHA-512 hash coverage", color: "#60A5FA",
                  pct: report.eventsAnalyzed > 0 ? (report.classicalVerifiedCount / report.eventsAnalyzed) * 100 : 0,
                },
                {
                  icon: AlertTriangle, label: "Intercepted Anomalies", value: report.anomalyCount.toLocaleString(),
                  sub: "blocked at governance layer", color: report.anomalyCount > 0 ? C.honey : C.sage,
                  pct: report.eventsAnalyzed > 0 ? (report.anomalyCount / report.eventsAnalyzed) * 100 : 0,
                },
              ].map(({ icon: Icon, label, value, sub, color, pct }) => (
                <div
                  key={label}
                  className="rounded-xl border p-5 relative overflow-hidden flex flex-col"
                  style={{ background: C.card, borderColor: `${color}28` }}
                >
                  <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: color }} />
                  <div className="flex items-center gap-1.5 mb-2 mt-0.5">
                    <Icon className="w-3 h-3" style={{ color }} />
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: C.dim }}>{label}</span>
                  </div>
                  <div className="text-3xl font-bold font-mono tabular-nums mb-1" style={{ color }}>{value}</div>
                  <div className="text-[10px] font-mono mb-3" style={{ color: C.dimText }}>{sub}</div>
                  <div className="h-1.5 rounded-full overflow-hidden mt-auto" style={{ background: C.border }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, pct)}%`, background: color }}
                    />
                  </div>
                  <div className="text-[9px] font-mono mt-1" style={{ color: C.dim }}>
                    {pct.toFixed(1)}% of {report.eventsAnalyzed.toLocaleString()} events
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Block-layer breakdown */}
          {Object.keys(report.layerBreakdown).length > 0 && (
            <div
              className="rounded-xl border p-5"
              style={{ background: C.card, borderColor: C.border }}
            >
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
          <div
            className="rounded-xl border overflow-hidden"
            style={{ background: C.card, borderColor: C.border }}
          >
            {/* Table header bar */}
            <div
              className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: C.border, background: C.panel }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" style={{ color: C.honey }} />
                <span className="font-mono text-sm font-bold" style={{ color: C.light }}>
                  Intercepted Anomalies
                </span>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ color: C.honey, background: `${C.honey}15` }}
                >
                  {report.anomalyCount}
                </span>
              </div>
              <span className="text-[10px] font-mono" style={{ color: C.dim }}>
                FIPS-204 cryptographic evidence
              </span>
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
                      {["Time", "Agent ID", "Swarm", "Type", "Block Layer", "Anomaly Reason", "Quantum Proof"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-2.5 text-[9px] uppercase tracking-widest font-bold"
                          style={{ color: C.dim }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.interceptedAnomalies.map((a, i) => (
                      <tr
                        key={a.id}
                        style={{
                          borderBottom: `1px solid ${C.border}`,
                          background: i % 2 === 0 ? "transparent" : `${C.border}20`,
                        }}
                      >
                        {/* Time */}
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: C.dim }}>
                          {new Date(a.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>

                        {/* Agent */}
                        <td className="px-4 py-2.5 whitespace-nowrap" title={a.agentId} style={{ color: C.light }}>
                          {a.agentId.substring(0, 12)}…
                        </td>

                        {/* Swarm */}
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: C.dim }}>
                          {a.swarmId ? a.swarmId.substring(0, 10) : "—"}
                        </td>

                        {/* Event type */}
                        <td className="px-4 py-2.5">
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ color: C.honey, background: `${C.honey}15` }}
                          >
                            {a.eventType}
                          </span>
                        </td>

                        {/* Block layer */}
                        <td className="px-4 py-2.5">
                          <LayerChip layer={a.blockLayer} />
                        </td>

                        {/* Reason */}
                        <td
                          className="px-4 py-2.5 max-w-xs truncate"
                          title={a.anomalyReason}
                          style={{ color: C.dim }}
                        >
                          {a.anomalyReason}
                        </td>

                        {/* FIPS-204 proof */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {a.isQuantumProven ? (
                              <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: C.sage }} />
                            ) : (
                              <XCircle className="w-3 h-3 shrink-0" style={{ color: C.terra }} />
                            )}
                            <span
                              className="text-[9px] truncate max-w-[120px]"
                              title={a.quantumSigProof}
                              style={{ color: a.isQuantumProven ? C.sage : C.terra }}
                            >
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
          <div
            className="flex items-center justify-between px-5 py-3 rounded-lg border text-[10px] font-mono"
            style={{ background: C.panel, borderColor: C.border, color: C.dim }}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: C.sage }} />
              <span>{report.complianceFramework}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>{report.eventsAnalyzed.toLocaleString()} events · {report.agentsScoped} agents · {report.partnerId}</span>
              <span
                className="font-bold px-2 py-0.5 border"
                style={{ color: C.sage, borderColor: `${C.sage}40`, background: `${C.sage}0a` }}
              >
                QUANTUM-SEALED · QL-2.0
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
