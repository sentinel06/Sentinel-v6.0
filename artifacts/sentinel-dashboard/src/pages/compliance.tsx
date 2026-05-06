import React, { useState, useEffect, useCallback } from "react";
import { useGetAgents } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileCheck,
  Download,
  Loader2,
  FileText,
  ShieldCheck,
  Lock,
  BarChart3,
  Cpu,
  Shield,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Star,
  RefreshCw,
} from "lucide-react";
import { formatTime, formatDate } from "@/lib/audit-utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  sage: "#40B595",
  honey: "#EBC06D",
  terra: "#D96161",
  divider: "#2C3136",
  dim: "#4A5568",
  dimText: "#9AA4B1",
};

// ── Shared mini-components ─────────────────────────────────────────────────

function ScoreDial({ pct, label, color }: { pct: number; label: string; color: string }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#2C3136" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text x="50" y="46" textAnchor="middle" fill={color} fontSize="16" fontWeight="bold" fontFamily="monospace">
          {pct.toFixed(1)}
        </text>
        <text x="50" y="60" textAnchor="middle" fill="#9AA4B1" fontSize="8" fontFamily="monospace">
          %
        </text>
      </svg>
      <span className="text-[10px] font-mono text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function StatBar({
  detected,
  blocked,
}: {
  detected: number;
  blocked: number;
}) {
  const max = Math.max(detected, 1);
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-mono">
          <span className="text-muted-foreground">DETECTED</span>
          <span style={{ color: C.terra }} className="font-bold tabular-nums">{detected}</span>
        </div>
        <div className="h-2 bg-[#2C3136] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${(detected / max) * 100}%`, background: C.terra }}
          />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-mono">
          <span className="text-muted-foreground">BLOCKED</span>
          <span style={{ color: C.sage }} className="font-bold tabular-nums">{blocked}</span>
        </div>
        <div className="h-2 bg-[#2C3136] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${(blocked / max) * 100}%`, background: C.sage }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Quantum certification config ───────────────────────────────────────────

const QT_CONFIG = [
  { tier: 0, label: "NOT STARTED",           color: C.dimText, icon: XCircle,     bg: "rgba(74,84,104,0.12)"  },
  { tier: 1, label: "PARTIAL COVERAGE",       color: C.honey,   icon: AlertTriangle, bg: "rgba(235,192,109,0.10)" },
  { tier: 2, label: "CERTIFIED — QL-1.0",    color: C.sage,    icon: CheckCircle2, bg: "rgba(64,181,149,0.10)" },
  { tier: 3, label: "QUANTUM-SECURE — QL-2.0", color: C.sage,  icon: Shield,       bg: "rgba(64,181,149,0.13)" },
  { tier: 4, label: "FULLY SOVEREIGN — QL-2.0 GOLD", color: C.honey, icon: Star,  bg: "rgba(235,192,109,0.13)" },
] as const;

const RISK_CONFIG = {
  LOW:      { color: C.sage,    border: `${C.sage}40`,    bg: "rgba(64,181,149,0.07)"   },
  MEDIUM:   { color: C.honey,   border: `${C.honey}40`,   bg: "rgba(235,192,109,0.07)"  },
  HIGH:     { color: C.terra,   border: `${C.terra}40`,   bg: "rgba(217,97,97,0.07)"    },
  CRITICAL: { color: C.terra,   border: `${C.terra}55`,   bg: "rgba(217,97,97,0.13)"    },
};

// ── Report Types ───────────────────────────────────────────────────────────

interface AuditReport {
  partnerEmail: string;
  timeHorizon: string;
  windowStart: string;
  windowEnd: string;
  reportGeneratedAt: string;
  agentsGovernedCount: number;
  activeAgentsCount: number;
  agentIds: string[];
  totalEvents: number;
  avgTrustScore: number;
  totalAnomaliesDetected: number;
  totalAnomaliesBlocked: number;
  blockRate: number;
  quantumSignedEvents: number;
  quantumCoverage: number;
  quantumCertification: string;
  quantumTier: number;
  riskProfile: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  complianceFramework: string;
  summary: string;
}

// ── Professional Audit Report Panel ───────────────────────────────────────

function AuditReportGenerator({ partnerEmails }: { partnerEmails: string[] }) {
  const [partnerId, setPartnerId] = useState("");
  const [timeHorizon, setTimeHorizon] = useState("30d");
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!partnerId) return;
    setGenerating(true);
    setError(null);
    setReport(null);
    try {
      const params = new URLSearchParams({ partnerId, timeHorizon });
      const r = await fetch(`${BASE}/api/v1/compliance/audit-report?${params}`);
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Failed to generate report"); return; }
      setReport(data);
    } catch {
      setError("Network error — please try again");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentinel-audit-report-${report.partnerEmail}-${report.timeHorizon}-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const qtCfg = report ? (QT_CONFIG[report.quantumTier] ?? QT_CONFIG[0]) : null;
  const riskCfg = report ? RISK_CONFIG[report.riskProfile] : null;
  const trustColor = report
    ? report.avgTrustScore >= 85 ? C.sage
      : report.avgTrustScore >= 65 ? C.honey
      : C.terra
    : C.sage;

  const TIME_LABELS: Record<string, string> = {
    "7d": "Last 7 Days",
    "30d": "Last 30 Days",
    "90d": "Last 90 Days",
    "365d": "Last 12 Months",
  };

  return (
    <div className="space-y-5">
      {/* Input controls */}
      <Card className="p-5 border-border/60 bg-card/50">
        <h3 className="font-mono text-sm font-bold flex items-center gap-2 mb-4">
          <ClipboardList className="w-4 h-4" style={{ color: C.sage }} />
          Report Parameters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Partner ID</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger className="font-mono bg-background border-border/50 text-xs">
                <SelectValue placeholder="Select partner email…" />
              </SelectTrigger>
              <SelectContent>
                {partnerEmails.length === 0 ? (
                  <SelectItem value="__none" disabled className="font-mono text-xs text-muted-foreground">
                    No partners found — register an agent first
                  </SelectItem>
                ) : (
                  partnerEmails.map((e) => (
                    <SelectItem key={e} value={e} className="font-mono text-xs">{e}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Time Horizon</Label>
            <Select value={timeHorizon} onValueChange={setTimeHorizon}>
              <SelectTrigger className="font-mono bg-background border-border/50 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d" className="font-mono text-xs">Last 7 Days</SelectItem>
                <SelectItem value="30d" className="font-mono text-xs">Last 30 Days</SelectItem>
                <SelectItem value="90d" className="font-mono text-xs">Last 90 Days</SelectItem>
                <SelectItem value="365d" className="font-mono text-xs">Last 12 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-border/40 pt-4">
          <Button
            onClick={handleGenerate}
            disabled={!partnerId || generating}
            className="font-mono text-xs gap-2"
          >
            {generating
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
              : <><BarChart3 className="w-3.5 h-3.5" /> Generate Audit Report</>
            }
          </Button>
          {report && (
            <Button onClick={handleDownload} variant="outline" size="sm" className="font-mono text-xs gap-1.5 border-border/50">
              <Download className="w-3 h-3" /> Export JSON
            </Button>
          )}
          {error && (
            <span className="text-xs font-mono" style={{ color: C.terra }}>{error}</span>
          )}
        </div>
      </Card>

      {/* Executive Report Output */}
      {report && riskCfg && qtCfg && (
        <div className="animate-in slide-in-from-bottom-4 fade-in duration-500 space-y-4">

          {/* Report Header */}
          <div
            className="p-4 rounded-lg border"
            style={{ borderColor: riskCfg.border, background: riskCfg.bg }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    CONFIDENTIAL · EXECUTIVE AUDIT REPORT
                  </span>
                </div>
                <div className="text-lg font-mono font-bold text-foreground">{report.partnerEmail}</div>
                <div className="text-xs font-mono text-muted-foreground mt-0.5">
                  {TIME_LABELS[report.timeHorizon]} ·{" "}
                  {new Date(report.windowStart).toLocaleDateString()} → {new Date(report.windowEnd).toLocaleDateString()}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground mt-1">
                  Generated {new Date(report.reportGeneratedAt).toLocaleString()} · {report.complianceFramework}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span
                  className="text-xs font-mono font-bold px-2.5 py-1 rounded border"
                  style={{ color: riskCfg.color, borderColor: riskCfg.border, background: riskCfg.bg }}
                >
                  RISK: {report.riskProfile}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {report.agentsGovernedCount} agents · {report.totalEvents.toLocaleString()} events
                </span>
              </div>
            </div>
          </div>

          {/* Three Core Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* 1. Aggregate Trust Score */}
            <Card className="p-5 border-border/60 bg-card/50">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-4 h-4" style={{ color: trustColor }} />
                <span className="text-xs font-mono font-bold text-foreground">Aggregate Trust Score</span>
              </div>
              <div className="flex flex-col items-center">
                <ScoreDial pct={report.avgTrustScore} label="avg. consistency" color={trustColor} />
                <div className="mt-3 text-center space-y-0.5">
                  <div
                    className="text-[11px] font-mono font-bold"
                    style={{ color: trustColor }}
                  >
                    {report.avgTrustScore >= 85 ? "TRUSTED" : report.avgTrustScore >= 65 ? "WATCHLIST" : "DEGRADED"}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {report.activeAgentsCount}/{report.agentsGovernedCount} agents active
                  </div>
                </div>
              </div>
            </Card>

            {/* 2. Anomaly Disposition */}
            <Card className="p-5 border-border/60 bg-card/50">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4" style={{ color: C.honey }} />
                <span className="text-xs font-mono font-bold text-foreground">Anomaly Disposition</span>
              </div>
              <StatBar
                detected={report.totalAnomaliesDetected}
                blocked={report.totalAnomaliesBlocked}
              />
              <div className="mt-4 border-t border-[#2C3136] pt-3 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground uppercase">Block Rate</div>
                  <div
                    className="text-base font-mono font-bold"
                    style={{ color: report.blockRate >= 70 ? C.sage : report.blockRate >= 30 ? C.honey : C.terra }}
                  >
                    {report.blockRate}%
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground uppercase">Unmitigated</div>
                  <div className="text-base font-mono font-bold" style={{ color: C.terra }}>
                    {report.totalAnomaliesDetected - report.totalAnomaliesBlocked}
                  </div>
                </div>
              </div>
            </Card>

            {/* 3. Quantum-Readiness Certification */}
            <Card className="p-5 border-border/60 bg-card/50">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4" style={{ color: C.honey }} />
                <span className="text-xs font-mono font-bold text-foreground">Quantum-Readiness</span>
              </div>
              <div className="flex flex-col items-center">
                <ScoreDial pct={report.quantumCoverage} label="QL-2.0 signature coverage" color={qtCfg.color} />
                <div
                  className="mt-3 w-full px-2 py-2 rounded-lg border text-center"
                  style={{ background: qtCfg.bg, borderColor: `${qtCfg.color}40` }}
                >
                  <div
                    className="text-[10px] font-mono font-bold leading-tight"
                    style={{ color: qtCfg.color }}
                  >
                    {report.quantumCertification}
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
                    ML-DSA-87 · FIPS-204 · Security Level 5
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Summary Narrative */}
          <Card
            className="p-5 border"
            style={{ borderColor: `${C.sage}25`, background: "rgba(64,181,149,0.04)" }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
                style={{ background: "rgba(64,181,149,0.12)", border: `1px solid ${C.sage}35` }}
              >
                <FileText className="w-4 h-4" style={{ color: C.sage }} />
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  SENTINEL ANALYSIS SUMMARY
                </div>
                <p className="text-xs font-mono text-foreground/80 leading-relaxed">{report.summary}</p>
                <div className="flex flex-wrap gap-3 mt-3">
                  {[
                    { label: "Events Audited", value: report.totalEvents.toLocaleString() },
                    { label: "Quantum-Sealed", value: `${report.quantumSignedEvents.toLocaleString()} (${report.quantumCoverage}%)` },
                    { label: "Agents Governed", value: String(report.agentsGovernedCount) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase">{label}</span>
                      <span className="text-[11px] font-mono font-bold text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const { data: agentData } = useGetAgents({ query: { queryKey: ["agents"] } });

  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [timeRange, setTimeRange] = useState<string>("24h");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  // Distinct partner emails from the agent registry
  const partnerEmails = Array.from(
    new Set((agentData?.agents ?? []).map((a: any) => a.ownerEmail).filter(Boolean)),
  ) as string[];

  const handleGenerate = async () => {
    if (!selectedAgent) return;
    setIsGenerating(true);
    try {
      const endTime = new Date().toISOString();
      const startTime = new Date();
      if (timeRange === "1h") startTime.setHours(startTime.getHours() - 1);
      else if (timeRange === "24h") startTime.setHours(startTime.getHours() - 24);
      else if (timeRange === "7d") startTime.setDate(startTime.getDate() - 7);
      else if (timeRange === "30d") startTime.setDate(startTime.getDate() - 30);
      const params = new URLSearchParams({
        agentId: selectedAgent,
        startTime: startTime.toISOString(),
        endTime,
        format: "json",
      });
      const report = await fetch(`${BASE}/api/v1/compliance/export?${params.toString()}`).then((r) => r.json());
      setReportData(report);
    } catch (error) {
      console.error("Failed to generate report:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadJSON = () => {
    if (!reportData) return;
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance_report_${selectedAgent}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const params = new URLSearchParams();
      if (selectedAgent) params.set("agentId", selectedAgent);
      if (timeRange && selectedAgent) {
        const endTime = new Date().toISOString();
        const startTime = new Date();
        if (timeRange === "1h") startTime.setHours(startTime.getHours() - 1);
        else if (timeRange === "24h") startTime.setHours(startTime.getHours() - 24);
        else if (timeRange === "7d") startTime.setDate(startTime.getDate() - 7);
        else if (timeRange === "30d") startTime.setDate(startTime.getDate() - 30);
        params.set("startTime", startTime.toISOString());
        params.set("endTime", endTime);
      }
      const r = await fetch(`${BASE}/api/v1/export/audit-pdf?${params.toString()}`);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sentinel-evidence-bag-${selectedAgent || "full"}-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">

      {/* ── Professional Audit Report ──────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" style={{ color: C.sage }} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Audit Reports</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              One-click summary your board, auditor, or regulator can actually use — trust score, anomaly review, quantum-readiness.
            </p>
          </div>
        </div>
        <AuditReportGenerator partnerEmails={partnerEmails} />
      </section>

      {/* Divider */}
      <div className="border-t border-[#2C3136]" />

      {/* ── Existing Evidence Bag & JSON Report ───────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Evidence Packages</h2>
            <p className="text-xs text-muted-foreground">
              Tamper-sealed PDFs and JSON bundles you can hand straight to a regulator.
            </p>
          </div>
        </div>

        {/* PDF Evidence Bag */}
        <Card className="p-5 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 border border-primary/20">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-mono font-bold text-sm text-foreground flex items-center gap-2">
                Signed PDF Evidence Package
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20">
                  EU AI ACT ART. 12/14
                </span>
              </h3>
              <p className="text-xs text-muted-foreground font-mono mt-1.5 leading-relaxed">
                Generates a 3-page cryptographically-sealed PDF containing the full audit log table with SHA-256 hash chains,
                HMAC document seal, human intervention log (Art. 14), and multi-agent topology chain map.
                Suitable for legal review and regulatory submission.
              </p>
              <div className="flex flex-wrap gap-3 mt-3">
                <Button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="font-mono text-sm gap-2">
                  {isGeneratingPDF
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Download className="w-4 h-4" />}
                  {isGeneratingPDF ? "Generating Evidence Bag…" : "Download Evidence Bag (PDF)"}
                </Button>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  HMAC-SHA256 document seal · hash chain proof · human approval timestamps
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Agent JSON Report */}
        <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-sm">
          <h3 className="font-mono font-medium text-sm text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            Agent-Specific JSON Report
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-3">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Target Agent</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="font-mono bg-background border-border/50">
                  <SelectValue placeholder="Select Agent ID" />
                </SelectTrigger>
                <SelectContent>
                  {agentData?.agents?.map((agent: any) => (
                    <SelectItem key={agent.agentId} value={agent.agentId} className="font-mono">
                      {agent.agentId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Time Horizon</Label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="font-mono bg-background border-border/50">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h" className="font-mono">Last 1 Hour</SelectItem>
                  <SelectItem value="24h" className="font-mono">Last 24 Hours</SelectItem>
                  <SelectItem value="7d" className="font-mono">Last 7 Days</SelectItem>
                  <SelectItem value="30d" className="font-mono">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-4 border-t border-border/40 pt-6">
            <Button
              onClick={handleGenerate}
              disabled={!selectedAgent || isGenerating}
              variant="outline"
              className="font-mono"
            >
              {isGenerating
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <FileCheck className="w-4 h-4 mr-2" />}
              Generate JSON Report
            </Button>
            <p className="text-xs font-mono text-muted-foreground max-w-xs">
              Includes full hash chains proving immutability for the selected timeframe.
            </p>
          </div>
        </Card>

        {reportData && (
          <Card className="p-6 border-primary/30 bg-primary/5 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <FileCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-mono font-medium text-foreground">JSON Report Ready</h3>
                  <p className="text-xs font-mono text-muted-foreground">
                    Generated {formatDate(reportData.generatedAt)} at {formatTime(reportData.generatedAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleDownloadJSON} variant="outline" className="font-mono border-border/50 hover:bg-muted/20" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Download JSON
                </Button>
                <Button onClick={handleDownloadPDF} disabled={isGeneratingPDF} variant="outline" className="font-mono border-primary/30 hover:bg-primary/10" size="sm">
                  {isGeneratingPDF
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Lock className="w-4 h-4 mr-2 text-primary" />}
                  Download PDF
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-background/50 rounded-md border border-border/50">
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Agent</div>
                <div className="font-mono text-sm truncate" title={reportData.agentId}>{reportData.agentId}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Events Logged</div>
                <div className="font-mono text-sm">{reportData.totalEvents?.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Anomalies</div>
                <div className={`font-mono text-sm ${reportData.anomalyCount > 0 ? "text-accent font-bold" : ""}`}>
                  {reportData.anomalyCount}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Integrity</div>
                <div className={`font-mono text-sm font-bold ${reportData.integrityVerified ? "text-emerald-500" : "text-destructive"}`}>
                  {reportData.integrityVerified ? "VERIFIED" : "FAILED"}
                </div>
              </div>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
