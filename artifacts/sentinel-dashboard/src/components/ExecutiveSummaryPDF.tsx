/**
 * ExecutiveSummaryPDF
 *
 * Fetches the 24h executive audit summary and renders:
 *  1. A screen-visible board-level preview panel (MaroShield Zen palette)
 *  2. A print / save-as-PDF button that opens a formatted popup for the OS print dialog
 *
 * The popup HTML is self-contained with embedded CSS — no external dependencies.
 */

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  FileBarChart2,
  Printer,
  Loader2,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  sage:   "#00F5FF",
  honey:  "#FFB800",
  terra:  "#FF003C",
  dark:   "#0D1117",
  panel:  "#161B22",
  border: "#2C3136",
  dim:    "#9AA4B1",
};

// ── Types ─────────────────────────────────────────────────────────────────

interface ExecSummary {
  reportId: string;
  generatedAt: string;
  timeWindow: string;
  windowStart: string;
  windowEnd: string;
  organization: string;
  agentsGovernedCount: number;
  activeAgentsCount: number;
  totalEvents: number;
  metrics: {
    trustVelocity: {
      label: string; rate: number; verifiedPct: number;
      totalVerified: number; totalEvents: number;
      trend: "ACCELERATING" | "STABLE" | "DECELERATING"; unit: string;
    };
    quantumIntegrityScore: {
      label: string; score: number; fipsLevel: string;
      fipsStandard: string; signedEvents: number;
      totalEvents: number; certification: string;
    };
    interventionSuccess: {
      label: string; count: number; driftTriggered: number;
      circuitTriggered: number; totalAnomalies: number;
      successRate: number; unit: string;
    };
  };
  riskRating: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  complianceFramework: string;
  narrative: string;
  classification: string;
}

// ── Print-window HTML generator ────────────────────────────────────────────

function buildPrintHTML(s: ExecSummary): string {
  const date = new Date(s.generatedAt);
  const dateStr = date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

  const trustColor  = s.metrics.trustVelocity.verifiedPct >= 90 ? "#00F5FF" : s.metrics.trustVelocity.verifiedPct >= 70 ? "#FFB800" : "#FF003C";
  const qiColor     = s.metrics.quantumIntegrityScore.score >= 90 ? "#00F5FF" : s.metrics.quantumIntegrityScore.score >= 50 ? "#FFB800" : "#FF003C";
  const intColor    = s.metrics.interventionSuccess.count > 0 ? "#00F5FF" : "#9AA4B1";
  const riskColors  = { LOW: "#00F5FF", MEDIUM: "#FFB800", HIGH: "#FF003C", CRITICAL: "#FF003C" };
  const riskColor   = riskColors[s.riskRating];

  const tvBar = Math.min(100, s.metrics.trustVelocity.verifiedPct);
  const qiBar = Math.min(100, s.metrics.quantumIntegrityScore.score);
  const ivBar = s.metrics.interventionSuccess.totalAnomalies > 0
    ? Math.min(100, s.metrics.interventionSuccess.successRate)
    : 100;

  const trendIcon = s.metrics.trustVelocity.trend === "ACCELERATING" ? "▲"
    : s.metrics.trustVelocity.trend === "DECELERATING" ? "▼" : "—";
  const trendColor = s.metrics.trustVelocity.trend === "ACCELERATING" ? "#00F5FF"
    : s.metrics.trustVelocity.trend === "DECELERATING" ? "#FF003C" : "#9AA4B1";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MaroShield Executive Audit — ${dateStr}</title>
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    background: #ffffff;
    color: #0a0f13;
    padding: 48px 52px 36px;
    min-height: 100vh;
    font-size: 10px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2.5px solid #00F5FF;
    padding-bottom: 14px;
    margin-bottom: 22px;
  }
  .logo-row { display: flex; align-items: center; gap: 10px; }
  .logo-shield {
    width: 32px; height: 32px;
    background: #00F5FF18;
    border: 1.5px solid #00F5FF40;
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    color: #00F5FF;
    font-size: 16px;
    font-weight: bold;
  }
  .logo-text { font-size: 18px; font-weight: bold; letter-spacing: -0.3px; color: #0a0f13; }
  .logo-text em { color: #00F5FF; font-style: normal; }
  .logo-sub { font-size: 8px; letter-spacing: 2.5px; color: #9AA4B1; margin-top: 1px; }
  .classification {
    font-size: 8px; letter-spacing: 2.5px; color: #FF003C;
    font-weight: bold;
    border: 1.5px solid #FF003C;
    padding: 4px 10px;
    text-transform: uppercase;
  }

  /* ── Report title ── */
  .report-title {
    font-size: 19px;
    font-weight: bold;
    letter-spacing: -0.3px;
    color: #0a0f13;
    margin-bottom: 4px;
  }
  .report-subtitle {
    font-size: 9.5px;
    color: #4A5568;
    letter-spacing: 0.5px;
    margin-bottom: 18px;
  }

  /* ── Meta row ── */
  .meta-row {
    display: flex;
    gap: 28px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 10px 14px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .meta-item { }
  .meta-label { font-size: 7.5px; letter-spacing: 2px; color: #9AA4B1; text-transform: uppercase; margin-bottom: 1.5px; }
  .meta-value { font-size: 10px; font-weight: 700; color: #0a0f13; }

  /* ── Risk banner ── */
  .risk-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    margin-bottom: 20px;
    border-left: 3.5px solid ${riskColor};
    background: ${riskColor}0e;
  }
  .risk-label { font-size: 8px; letter-spacing: 2px; color: #4A5568; text-transform: uppercase; }
  .risk-value { font-size: 13px; font-weight: bold; color: ${riskColor}; letter-spacing: 1px; }
  .risk-agents { font-size: 8.5px; color: #9AA4B1; }

  /* ── Metrics grid ── */
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px; }
  .metric-card {
    border: 1px solid #e2e8f0;
    padding: 18px 16px 14px;
    position: relative;
    overflow: hidden;
  }
  .metric-accent {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 3px;
  }
  .metric-icon-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .metric-icon {
    font-size: 14px;
    line-height: 1;
  }
  .metric-category {
    font-size: 7.5px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #9AA4B1;
    font-weight: bold;
  }
  .metric-number {
    font-size: 44px;
    font-weight: bold;
    line-height: 1;
    margin: 6px 0 2px;
    letter-spacing: -1.5px;
  }
  .metric-unit {
    font-size: 9px;
    color: #4A5568;
    margin-bottom: 10px;
  }
  .bar-container { margin-bottom: 8px; }
  .bar-track {
    width: 100%;
    height: 5px;
    background: #f0f0f0;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .bar-fill { height: 100%; border-radius: 3px; }
  .bar-legend {
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: #9AA4B1;
  }
  .metric-badge {
    display: inline-block;
    font-size: 7.5px;
    padding: 2px 7px;
    font-weight: bold;
    letter-spacing: 0.8px;
    border-radius: 2px;
    margin-top: 4px;
  }
  .metric-sub-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 8px;
    border-top: 1px solid #f0f0f0;
    padding-top: 8px;
  }
  .sub-item-label { font-size: 7.5px; color: #9AA4B1; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 1px; }
  .sub-item-value { font-size: 10px; font-weight: 700; }

  /* ── Trend marker ── */
  .trend-marker {
    display: inline-block;
    font-size: 10px;
    font-weight: bold;
    margin-left: 6px;
    color: ${trendColor};
    vertical-align: middle;
  }

  /* ── Narrative ── */
  .narrative-section { margin-bottom: 20px; }
  .section-title {
    font-size: 8px;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #9AA4B1;
    font-weight: bold;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e2e8f0;
  }
  .narrative-text {
    font-size: 10.5px;
    line-height: 1.75;
    color: #1a1a2e;
    background: #f8fafc;
    padding: 14px 16px;
    border-left: 3px solid #00F5FF;
  }

  /* ── Compliance row ── */
  .compliance-row {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .compliance-tag {
    font-size: 7.5px;
    letter-spacing: 1px;
    padding: 3px 8px;
    border: 1px solid #00F5FF40;
    color: #00F5FF;
    font-weight: bold;
  }

  /* ── Footer ── */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-top: 1px solid #e2e8f0;
    padding-top: 10px;
    margin-top: 8px;
  }
  .footer-left { }
  .footer-text { font-size: 7.5px; color: #9AA4B1; letter-spacing: 1px; line-height: 1.6; }
  .footer-cert {
    font-size: 8px;
    border: 1px solid #00F5FF;
    color: #00F5FF;
    padding: 4px 10px;
    letter-spacing: 1px;
    font-weight: bold;
  }

  @media print {
    body { padding: 36px 44px 28px; }
    .metric-card { break-inside: avoid; }
    .narrative-section { break-inside: avoid; }
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="logo-row">
      <div class="logo-shield">⬡</div>
      <div>
        <div class="logo-text">AGENT-<em>SENTINEL</em></div>
        <div class="logo-sub">ZERO-TRUST AI GOVERNANCE INFRASTRUCTURE</div>
      </div>
    </div>
    <div class="classification">${s.classification}</div>
  </div>

  <!-- Title -->
  <div class="report-title">Executive AI Governance Audit</div>
  <div class="report-subtitle">${s.timeWindow.toUpperCase()} SUMMARY REPORT · ${dateStr} · ${timeStr}</div>

  <!-- Meta -->
  <div class="meta-row">
    <div class="meta-item">
      <div class="meta-label">Organization</div>
      <div class="meta-value">${s.organization}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Report ID</div>
      <div class="meta-value">${s.reportId}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Window</div>
      <div class="meta-value">${new Date(s.windowStart).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} → ${new Date(s.windowEnd).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Total Events</div>
      <div class="meta-value">${s.totalEvents.toLocaleString()}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Agents</div>
      <div class="meta-value">${s.activeAgentsCount} / ${s.agentsGovernedCount} active</div>
    </div>
  </div>

  <!-- Risk Banner -->
  <div class="risk-banner">
    <div>
      <div class="risk-label">Overall Risk Classification</div>
      <div class="risk-value">${s.riskRating}</div>
    </div>
    <div class="risk-agents" style="text-align:right;">
      <div>${s.complianceFramework}</div>
    </div>
  </div>

  <!-- Three Metric Cards -->
  <div class="metrics">

    <!-- 1. Trust Velocity -->
    <div class="metric-card">
      <div class="metric-accent" style="background:${trustColor};"></div>
      <div class="metric-icon-row">
        <div class="metric-icon" style="color:${trustColor}">⚡</div>
        <div class="metric-category">Trust Velocity</div>
      </div>
      <div class="metric-number" style="color:${trustColor}">
        ${s.metrics.trustVelocity.rate}
        <span class="trend-marker">${trendIcon}</span>
      </div>
      <div class="metric-unit">${s.metrics.trustVelocity.unit}</div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="bar-fill" style="width:${tvBar}%;background:${trustColor};"></div>
        </div>
        <div class="bar-legend">
          <span>Verified actions</span>
          <span style="color:${trustColor};font-weight:bold;">${s.metrics.trustVelocity.verifiedPct}%</span>
        </div>
      </div>
      <div>
        <span class="metric-badge" style="background:${trustColor}15;color:${trustColor};border:1px solid ${trustColor}40;">
          ${s.metrics.trustVelocity.trend}
        </span>
      </div>
      <div class="metric-sub-grid">
        <div>
          <div class="sub-item-label">Verified</div>
          <div class="sub-item-value" style="color:${trustColor}">${s.metrics.trustVelocity.totalVerified.toLocaleString()}</div>
        </div>
        <div>
          <div class="sub-item-label">Total</div>
          <div class="sub-item-value">${s.metrics.trustVelocity.totalEvents.toLocaleString()}</div>
        </div>
      </div>
    </div>

    <!-- 2. Quantum Integrity Score -->
    <div class="metric-card">
      <div class="metric-accent" style="background:${qiColor};"></div>
      <div class="metric-icon-row">
        <div class="metric-icon" style="color:${qiColor}">⬡</div>
        <div class="metric-category">Quantum Integrity Score</div>
      </div>
      <div class="metric-number" style="color:${qiColor}">${s.metrics.quantumIntegrityScore.score}</div>
      <div class="metric-unit">${s.metrics.quantumIntegrityScore.fipsLevel} compliance %</div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="bar-fill" style="width:${qiBar}%;background:${qiColor};"></div>
        </div>
        <div class="bar-legend">
          <span>ML-DSA-87 signed</span>
          <span style="color:${qiColor};font-weight:bold;">${s.metrics.quantumIntegrityScore.signedEvents} / ${s.metrics.quantumIntegrityScore.totalEvents}</span>
        </div>
      </div>
      <div>
        <span class="metric-badge" style="background:${qiColor}15;color:${qiColor};border:1px solid ${qiColor}40;">
          ${s.metrics.quantumIntegrityScore.certification}
        </span>
      </div>
      <div class="metric-sub-grid">
        <div>
          <div class="sub-item-label">Standard</div>
          <div class="sub-item-value" style="font-size:8px;color:#4A5568">${s.metrics.quantumIntegrityScore.fipsStandard}</div>
        </div>
        <div>
          <div class="sub-item-label">Sec Level</div>
          <div class="sub-item-value" style="color:${qiColor}">5 / 5</div>
        </div>
      </div>
    </div>

    <!-- 3. Intervention Success -->
    <div class="metric-card">
      <div class="metric-accent" style="background:${intColor};"></div>
      <div class="metric-icon-row">
        <div class="metric-icon" style="color:${intColor}">⚑</div>
        <div class="metric-category">Intervention Success</div>
      </div>
      <div class="metric-number" style="color:${intColor}">${s.metrics.interventionSuccess.count}</div>
      <div class="metric-unit">${s.metrics.interventionSuccess.unit} triggered</div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="bar-fill" style="width:${ivBar}%;background:${intColor};"></div>
        </div>
        <div class="bar-legend">
          <span>Block success rate</span>
          <span style="color:${intColor};font-weight:bold;">${s.metrics.interventionSuccess.successRate}%</span>
        </div>
      </div>
      <div>
        <span class="metric-badge" style="background:${intColor}15;color:${intColor};border:1px solid ${intColor}40;">
          ${s.metrics.interventionSuccess.totalAnomalies === 0 ? "NO THREATS" : s.metrics.interventionSuccess.successRate >= 80 ? "HIGH EFFICACY" : "REVIEW NEEDED"}
        </span>
      </div>
      <div class="metric-sub-grid">
        <div>
          <div class="sub-item-label">Drift Triggers</div>
          <div class="sub-item-value" style="color:${intColor}">${s.metrics.interventionSuccess.driftTriggered}</div>
        </div>
        <div>
          <div class="sub-item-label">Circuit Breaks</div>
          <div class="sub-item-value" style="color:#FFB800">${s.metrics.interventionSuccess.circuitTriggered}</div>
        </div>
      </div>
    </div>

  </div>

  <!-- Narrative -->
  <div class="narrative-section">
    <div class="section-title">MaroShield Analysis & Findings</div>
    <div class="narrative-text">${s.narrative}</div>
  </div>

  <!-- Compliance Tags -->
  <div class="section-title">Compliance Frameworks Active</div>
  <div class="compliance-row">
    ${s.complianceFramework.split(" · ").map((f) => `<div class="compliance-tag">${f}</div>`).join("")}
    <div class="compliance-tag">SHA-512 + ML-DSA-87</div>
    <div class="compliance-tag">QL-2.0 HYBRID SIGNATURES</div>
    <div class="compliance-tag">HARVEST-NOW-DECRYPT-LATER PROTECTED</div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      <div class="footer-text">Generated by MaroShield v6.0 · ${s.reportId}</div>
      <div class="footer-text">© 2026 MaroShield. This report is classified. Unauthorized distribution is prohibited.</div>
      <div class="footer-text">Window: ${s.windowStart} → ${s.windowEnd}</div>
    </div>
    <div class="footer-cert">QUANTUM-SEALED · QL-2.0</div>
  </div>

</body>
</html>`;
}

// ── Screen preview sub-components ─────────────────────────────────────────

function MetricPanel({
  icon: Icon,
  label,
  value,
  unit,
  pct,
  color,
  badge,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  unit: string;
  pct: number;
  color: string;
  badge: string;
  sub?: React.ReactNode;
}) {
  return (
    <div
      className="flex-1 min-w-0 border rounded-lg p-5 relative overflow-hidden"
      style={{ borderColor: `${color}30`, background: `${color}06` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-lg"
        style={{ background: color }}
      />
      <div className="flex items-center gap-2 mb-3 mt-0.5">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
        <span className="text-[9px] font-mono font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-4xl font-bold font-mono leading-none mb-1 tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground mb-3">{unit}</div>
      <div className="h-1.5 bg-[#2C3136] rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(100, pct)}%`, background: color }}
        />
      </div>
      <div
        className="inline-block text-[9px] font-mono font-bold px-2 py-0.5 rounded"
        style={{ color, background: `${color}15`, border: `1px solid ${color}35` }}
      >
        {badge}
      </div>
      {sub && <div className="mt-3 pt-3 border-t border-[#2C3136]">{sub}</div>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  partnerId?: string;
}

export default function ExecutiveSummaryPDF({ partnerId }: Props) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ExecSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ hours: "24" });
      if (partnerId) params.set("partnerId", partnerId);
      const r = await fetch(`${BASE}/api/v1/compliance/executive-summary?${params}`);
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Failed"); return; }
      setReport(data);
      setOpen(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  const handlePrint = () => {
    if (!report) return;
    const html = buildPrintHTML(report);
    const win = window.open("", "_blank", "width=900,height=720,scrollbars=yes");
    if (!win) { alert("Please allow popups to print the report."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  const trustColor  = report
    ? report.metrics.trustVelocity.verifiedPct >= 90 ? C.sage : report.metrics.trustVelocity.verifiedPct >= 70 ? C.honey : C.terra
    : C.sage;
  const qiColor     = report
    ? report.metrics.quantumIntegrityScore.score >= 90 ? C.sage : report.metrics.quantumIntegrityScore.score >= 50 ? C.honey : C.terra
    : C.honey;
  const intColor    = report && report.metrics.interventionSuccess.count > 0 ? C.sage : C.dim;
  const riskColors  = { LOW: C.sage, MEDIUM: C.honey, HIGH: C.terra, CRITICAL: C.terra };

  return (
    <>
      {/* Trigger button — rendered inline wherever this component is placed */}
      <Button
        onClick={handleGenerate}
        disabled={loading}
        className="font-mono text-xs gap-2 whitespace-nowrap"
        style={{ background: C.sage, color: "#000", border: "none" }}
      >
        {loading
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
          : <><FileBarChart2 className="w-3.5 h-3.5" />Generate Executive Audit</>}
      </Button>
      {error && <span className="text-[10px] font-mono ml-2" style={{ color: C.terra }}>{error}</span>}

      {/* Full-screen overlay report */}
      {open && report && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="w-full max-w-4xl rounded-xl border overflow-hidden shadow-2xl"
            style={{ background: C.dark, borderColor: C.border }}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: C.border, background: C.panel }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${C.sage}18`, border: `1px solid ${C.sage}35` }}
                >
                  <FileBarChart2 className="w-4 h-4" style={{ color: C.sage }} />
                </div>
                <div>
                  <div className="text-sm font-mono font-bold text-foreground">Executive AI Governance Audit</div>
                  <div className="text-[10px] font-mono" style={{ color: C.dim }}>
                    {report.reportId} · Generated {new Date(report.generatedAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handlePrint}
                  size="sm"
                  className="font-mono text-xs gap-1.5"
                  style={{ background: C.sage, color: "#000", border: "none" }}
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </Button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" style={{ color: C.dim }} />
                </button>
              </div>
            </div>

            {/* Report body */}
            <div className="p-6 space-y-5">

              {/* Classification + title header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b" style={{ borderColor: `${C.sage}30` }}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[8px] font-mono font-bold px-2 py-0.5 rounded border tracking-widest"
                      style={{ color: C.terra, borderColor: `${C.terra}50`, background: `${C.terra}10` }}
                    >
                      {report.classification}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold font-mono tracking-tight text-foreground">
                    Executive AI Governance Audit
                  </h2>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">
                    {report.timeWindow.toUpperCase()} Summary · {new Date(report.generatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                </div>
                <div
                  className="shrink-0 text-right px-4 py-2 rounded border"
                  style={{ borderColor: `${riskColors[report.riskRating]}40`, background: `${riskColors[report.riskRating]}0a` }}
                >
                  <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Risk Rating</div>
                  <div className="text-xl font-bold font-mono" style={{ color: riskColors[report.riskRating] }}>
                    {report.riskRating}
                  </div>
                </div>
              </div>

              {/* Meta strip */}
              <div className="grid grid-cols-5 gap-3 text-[10px] font-mono">
                {[
                  { label: "Organization", value: report.organization },
                  { label: "Agents Governed", value: `${report.activeAgentsCount}/${report.agentsGovernedCount}` },
                  { label: "Total Events", value: report.totalEvents.toLocaleString() },
                  { label: "Window", value: `Last ${report.timeWindow}` },
                  { label: "Framework", value: "EU AI Act · FIPS-204" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-muted-foreground uppercase text-[9px] tracking-wider mb-0.5">{label}</div>
                    <div className="font-bold text-foreground truncate">{value}</div>
                  </div>
                ))}
              </div>

              {/* Three metric cards */}
              <div className="flex gap-4">
                <MetricPanel
                  icon={TrendingUp}
                  label="Trust Velocity"
                  value={report.metrics.trustVelocity.rate}
                  unit={report.metrics.trustVelocity.unit}
                  pct={report.metrics.trustVelocity.verifiedPct}
                  color={trustColor}
                  badge={`${report.metrics.trustVelocity.verifiedPct}% VERIFIED · ${report.metrics.trustVelocity.trend}`}
                  sub={
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { l: "Verified", v: report.metrics.trustVelocity.totalVerified, c: trustColor },
                        { l: "Total", v: report.metrics.trustVelocity.totalEvents, c: C.dim },
                      ].map(({ l, v, c }) => (
                        <div key={l}>
                          <div className="text-[9px] text-muted-foreground uppercase mb-0.5">{l}</div>
                          <div className="text-xs font-mono font-bold" style={{ color: c }}>{v.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  }
                />

                <MetricPanel
                  icon={Zap}
                  label="Quantum Integrity Score"
                  value={report.metrics.quantumIntegrityScore.score}
                  unit="FIPS-204 ML-DSA-87 compliance %"
                  pct={report.metrics.quantumIntegrityScore.score}
                  color={qiColor}
                  badge={report.metrics.quantumIntegrityScore.certification}
                  sub={
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { l: "Signed", v: report.metrics.quantumIntegrityScore.signedEvents, c: qiColor },
                        { l: "Sec Level", v: "5 / 5", c: C.honey },
                      ].map(({ l, v, c }) => (
                        <div key={l}>
                          <div className="text-[9px] text-muted-foreground uppercase mb-0.5">{l}</div>
                          <div className="text-xs font-mono font-bold" style={{ color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  }
                />

                <MetricPanel
                  icon={ShieldCheck}
                  label="Intervention Success"
                  value={report.metrics.interventionSuccess.count}
                  unit="autonomous blocks triggered"
                  pct={report.metrics.interventionSuccess.successRate}
                  color={intColor}
                  badge={
                    report.metrics.interventionSuccess.totalAnomalies === 0
                      ? "NO THREATS DETECTED"
                      : `${report.metrics.interventionSuccess.successRate}% SUCCESS RATE`
                  }
                  sub={
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { l: "Drift", v: report.metrics.interventionSuccess.driftTriggered, c: intColor },
                        { l: "Circuit", v: report.metrics.interventionSuccess.circuitTriggered, c: C.honey },
                      ].map(({ l, v, c }) => (
                        <div key={l}>
                          <div className="text-[9px] text-muted-foreground uppercase mb-0.5">{l}</div>
                          <div className="text-xs font-mono font-bold" style={{ color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  }
                />
              </div>

              {/* Narrative */}
              <div
                className="p-4 rounded-lg border text-[11px] font-mono leading-relaxed"
                style={{ background: `${C.sage}05`, borderColor: `${C.sage}25`, borderLeftWidth: "3px", borderLeftColor: C.sage, color: "var(--foreground)" }}
              >
                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                  MaroShield Analysis &amp; Findings
                </div>
                {report.narrative}
              </div>

              {/* Compliance tags */}
              <div className="flex flex-wrap gap-2">
                {[...report.complianceFramework.split(" · "), "SHA-512 + ML-DSA-87", "QL-2.0 HYBRID SIGNATURES"].map((f) => (
                  <span
                    key={f}
                    className="text-[9px] font-mono font-bold px-2 py-1 rounded border"
                    style={{ color: C.sage, borderColor: `${C.sage}35`, background: `${C.sage}08` }}
                  >
                    {f}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div
                className="flex items-center justify-between pt-4 border-t text-[9px] font-mono text-muted-foreground"
                style={{ borderColor: C.border }}
              >
                <div>
                  <div>Generated by MaroShield v6.0 · {report.reportId}</div>
                  <div className="opacity-60 mt-0.5">
                    © 2026 MaroShield. Classified. Unauthorized distribution prohibited.
                  </div>
                </div>
                <div
                  className="px-3 py-1.5 font-bold tracking-widest border"
                  style={{ color: C.sage, borderColor: `${C.sage}50`, background: `${C.sage}0a` }}
                >
                  QUANTUM-SEALED · QL-2.0
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
