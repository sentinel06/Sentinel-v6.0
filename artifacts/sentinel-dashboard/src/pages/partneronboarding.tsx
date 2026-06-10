import React, { useState, useCallback } from "react";
import {
  ShieldCheck, ShieldAlert, Shield, Key, Lock, Unlock,
  CheckCircle2, AlertCircle, Clock, ChevronRight,
  Building2, Cpu, FileText, Zap, Activity, GitBranch,
  Loader2, Copy, Check, ExternalLink, BookOpen,
  TriangleAlert, Info,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Palette ────────────────────────────────────────────────────────────────
const P = {
  sage:   "#00F5FF",
  amber:  "#FFB800",
  terra:  "#FF003C",
  panel:  "#161B22",
  border: "#2C3136",
  dim:    "#9AA4B1",
  blue:   "#5B8DEF",
  bg:     "#0D1117",
  gold:   "#FFD700",
};

// ── Types ──────────────────────────────────────────────────────────────────

type CheckStatus = "COMPLIANT" | "PARTIAL" | "NON-COMPLIANT" | "PENDING";

interface ChecklistItem {
  id:          string;
  article:     string;
  title:       string;
  requirement: string;
  status:      CheckStatus;
  evidence:    string;
  metric:      string;
  controlRef:  string;
  euDeadline:  string;
}

interface OnboardingData {
  authorized:      boolean;
  partner:         string;
  tier:            string;
  accessLevel:     string;
  reportId:        string;
  generatedAt:     string;
  systemStats:     Record<string, number>;
  checklist:       ChecklistItem[];
  overallStatus:   CheckStatus;
  compliantItems:  number;
  totalItems:      number;
  sovereignKeyProvisioning: {
    status:       string;
    sdkCommand:   string;
    registrationEndpoint: string;
    instructions: string[];
    keyRequirements: Record<string, string | number>;
  };
  sla: {
    postInterdictionSamplingWindow: Record<string, string | number>;
    breachResponseTime: Record<string, string>;
    availabilityTarget: string;
    auditLogRetention:  string;
    quantumReadiness:   string;
  };
  nextSteps: string[];
}

// ── Status helpers ─────────────────────────────────────────────────────────

function statusColor(s: CheckStatus): string {
  if (s === "COMPLIANT")     return P.sage;
  if (s === "PARTIAL")       return P.amber;
  if (s === "NON-COMPLIANT") return P.terra;
  return P.dim;
}

function statusIcon(s: CheckStatus) {
  if (s === "COMPLIANT")     return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: P.sage }} />;
  if (s === "PARTIAL")       return <AlertCircle className="w-3.5 h-3.5" style={{ color: P.amber }} />;
  if (s === "NON-COMPLIANT") return <ShieldAlert className="w-3.5 h-3.5" style={{ color: P.terra }} />;
  return <Clock className="w-3.5 h-3.5" style={{ color: P.dim }} />;
}

function overallBadge(s: CheckStatus) {
  const color = statusColor(s);
  return (
    <span
      className="text-xs font-mono font-bold px-3 py-1 rounded-full"
      style={{ color, background: `${color}18`, border: `1px solid ${color}44` }}
    >
      {s}
    </span>
  );
}

// ── Lock screen ────────────────────────────────────────────────────────────

const DEMO_KEY = "SENTINEL-DEMO-GOLDEN-2026";

function LockScreen({ onUnlock }: { onUnlock: (key: string, data: OnboardingData) => void }) {
  const [keyInput, setKeyInput] = useState("");
  const [loading, setLoading]   = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [showKey, setShowKey]   = useState(false);

  const unlockWithKey = useCallback(async (key: string) => {
    setError(null);
    const r = await fetch(`${BASE}/api/v1/partner/onboarding?key=${encodeURIComponent(key)}`);
    const d = await r.json();
    if (!r.ok || !d.authorized) {
      throw new Error(d.error ?? "Invalid key. Access denied.");
    }
    onUnlock(key, d as OnboardingData);
  }, [onUnlock]);

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await unlockWithKey(keyInput.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — API server unreachable.");
    } finally {
      setLoading(false);
    }
  }, [keyInput, unlockWithKey]);

  const handleGuestAuditor = useCallback(async () => {
    setGuestLoading(true);
    setKeyInput(DEMO_KEY);
    try {
      await unlockWithKey(DEMO_KEY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo key unavailable — contact MaroShield support.");
    } finally {
      setGuestLoading(false);
    }
  }, [unlockWithKey]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: P.bg }}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: `${P.gold}14`, border: `1px solid ${P.gold}44` }}>
              <Lock className="w-8 h-8" style={{ color: P.gold }} />
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-white mb-1 tracking-tight">Welcome, partner.</h1>
          <p className="text-sm" style={{ color: P.dim }}>
            Sign in to your MaroShield partner workspace.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono"
            style={{ background: `${P.gold}12`, border: `1px solid ${P.gold}33`, color: P.gold }}>
            <Zap className="w-3 h-3" />
            SENTINEL-DEMO-GOLDEN-2026
          </div>
        </div>

        {/* Key form */}
        <form onSubmit={handleUnlock}
          className="rounded-2xl p-6 space-y-4"
          style={{ background: P.panel, border: `1px solid ${P.border}` }}>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest mb-2 block"
              style={{ color: P.dim }}>
              Alpha Partner Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="SENTINEL-DEMO-GOLDEN-2026"
                autoComplete="off"
                spellCheck={false}
                className="w-full h-11 rounded-lg px-4 pr-10 text-sm font-mono focus:outline-none"
                style={{
                  background: P.bg,
                  border: `1px solid ${error ? P.terra + "66" : keyInput ? P.gold + "44" : P.border}`,
                  color: "#e0e6ed",
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80"
              >
                {showKey
                  ? <Unlock className="w-4 h-4" />
                  : <Lock className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono"
                style={{ color: P.terra }}>
                <TriangleAlert className="w-3 h-3" />
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || guestLoading || !keyInput.trim()}
            className="w-full h-11 rounded-lg font-mono text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
            style={{
              background: keyInput.trim() ? P.gold : P.border,
              color: keyInput.trim() ? "#0D1117" : P.dim,
              boxShadow: keyInput.trim() ? `0 0 24px ${P.gold}44` : "none",
            }}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
              : <><Unlock className="w-4 h-4" /> Unlock Onboarding Suite</>}
          </button>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px" style={{ background: P.border }} />
            <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
              or
            </span>
            <div className="flex-1 h-px" style={{ background: P.border }} />
          </div>

          {/* ── Guest Auditor (M&A Data Room demo bypass) ── */}
          <button
            type="button"
            onClick={handleGuestAuditor}
            disabled={loading || guestLoading}
            className="w-full h-11 rounded-lg font-mono text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
            style={{
              background: "transparent",
              color: P.sage,
              border: `1px solid ${P.sage}55`,
              boxShadow: `inset 0 0 12px ${P.sage}10`,
            }}
          >
            {guestLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up your guest session…</>
              : <><Shield className="w-4 h-4" /> Take a look as a guest</>}
          </button>
          <p className="text-[11px] text-center -mt-1" style={{ color: P.dim }}>
            Read-only demo · we'll fill in the key for you
          </p>

          <p className="text-[11px] text-center" style={{ color: P.dim }}>
            Already an authorized partner? Sign in above.
            <br />Otherwise, your account manager can get you set up.
          </p>
        </form>

        {/* Bottom badge */}
        <div className="flex items-center justify-center gap-2 mt-6">
          <Shield className="w-3 h-3" style={{ color: P.sage }} />
          <span className="text-[10px] font-mono" style={{ color: P.dim }}>
            QL-2.0 · FIPS-204 · EU AI Act Art. 12/14
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Compliance Checklist Item ──────────────────────────────────────────────

function CheckItem({ item }: { item: ChecklistItem }) {
  const [expanded, setExpanded] = useState(false);
  const color = statusColor(item.status);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all cursor-pointer"
      style={{ border: `1px solid ${color}33`, background: `${color}06` }}
      onClick={() => setExpanded(v => !v)}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        {statusIcon(item.status)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}>
              {item.article}
            </span>
            <span className="text-xs font-mono font-bold text-white">{item.title}</span>
          </div>
          <div className="text-[10px] font-mono mt-0.5" style={{ color: P.dim }}>
            {item.metric} · {item.euDeadline !== "Continuous" ? `EU deadline: ${item.euDeadline}` : "Continuous obligation"}
          </div>
        </div>
        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ color, background: `${color}18` }}>
          {item.status}
        </span>
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          style={{ color: P.dim }}
        />
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: `${color}22` }}>
          <div className="mt-3">
            <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: P.dim }}>
              Requirement
            </div>
            <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#cdd5e0" }}>
              {item.requirement}
            </p>
          </div>
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: P.dim }}>
              Live Evidence
            </div>
            <p className="text-[11px] font-mono leading-relaxed" style={{ color }}>
              {item.evidence}
            </p>
          </div>
          <div className="text-[9px] font-mono" style={{ color: P.dim }}>
            {item.controlRef}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sovereign Key Provisioning Panel ──────────────────────────────────────

function SovereignKeyPanel({ data }: { data: OnboardingData["sovereignKeyProvisioning"] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.sdkCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${P.gold}44`, background: `${P.gold}06` }}>
      <div className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: `${P.gold}33`, background: `${P.gold}0a` }}>
        <Key className="w-4 h-4" style={{ color: P.gold }} />
        <span className="text-xs font-mono font-bold" style={{ color: P.gold }}>
          SECONDARY SOVEREIGN KEY PROVISIONING
        </span>
        <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ color: P.amber, background: `${P.amber}18`, border: `1px solid ${P.amber}33` }}>
          PENDING ENROLLMENT
        </span>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-[11px] font-mono leading-relaxed" style={{ color: P.dim }}>
          The Two-Man Rule requires a distinct Secondary Sovereign Key (ML-DSA-87, FIPS-204 Level 5)
          held by a different authorized individual than the Operator Key. This is required for
          EU AI Act Art. 14 §3 compliance.
        </p>

        {/* Step-by-step */}
        <ol className="space-y-2">
          {data.instructions.map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-[11px] font-mono">
              <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                style={{ background: `${P.gold}18`, border: `1px solid ${P.gold}44`, color: P.gold }}>
                {i + 1}
              </span>
              <span style={{ color: "#cdd5e0" }}>{step}</span>
            </li>
          ))}
        </ol>

        {/* SDK command */}
        <div className="rounded-lg p-3" style={{ background: P.bg, border: `1px solid ${P.border}` }}>
          <div className="text-[9px] font-mono mb-2 uppercase tracking-widest" style={{ color: P.dim }}>
            Generate Key (SDK Command)
          </div>
          <div className="flex items-center gap-2">
            <code className="text-[11px] font-mono flex-1" style={{ color: P.sage }}>
              $ {data.sdkCommand}
            </code>
            <button onClick={handleCopy}
              className="p-1.5 rounded hover:bg-white/5 transition-colors shrink-0">
              {copied
                ? <Check className="w-3.5 h-3.5" style={{ color: P.sage }} />
                : <Copy className="w-3.5 h-3.5" style={{ color: P.dim }} />}
            </button>
          </div>
        </div>

        {/* Key requirements */}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(data.keyRequirements).map(([k, v]) => (
            <div key={k} className="rounded px-3 py-2"
              style={{ background: P.panel, border: `1px solid ${P.border}` }}>
              <div className="text-[9px] font-mono uppercase" style={{ color: P.dim }}>{k}</div>
              <div className="text-[10px] font-mono font-bold" style={{ color: P.gold }}>{String(v)}</div>
            </div>
          ))}
        </div>

        <div className="text-[9px] font-mono rounded px-3 py-2"
          style={{ background: `${P.blue}0a`, border: `1px solid ${P.blue}33`, color: P.blue }}>
          Registration endpoint: {data.registrationEndpoint}
        </div>
      </div>
    </div>
  );
}

// ── SLA Panel ──────────────────────────────────────────────────────────────

function SLAPanel({ sla }: { data: OnboardingData; sla: OnboardingData["sla"] }) {
  const window = sla.postInterdictionSamplingWindow;
  const resp   = sla.breachResponseTime;

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${P.sage}44`, background: `${P.sage}06` }}>
      <div className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: `${P.sage}33`, background: `${P.sage}0a` }}>
        <Activity className="w-4 h-4" style={{ color: P.sage }} />
        <span className="text-xs font-mono font-bold" style={{ color: P.sage }}>
          SERVICE LEVEL AGREEMENT — POST-INTERDICTION
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 100% sampling window */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.sage }}>
            100% Signature Sampling Window
          </h4>
          <div className="space-y-2">
            {Object.entries(window).map(([k, v]) => (
              <div key={k} className="flex justify-between items-start gap-2">
                <span className="text-[10px] font-mono capitalize" style={{ color: P.dim }}>
                  {k.replace(/([A-Z])/g, " $1").trim()}
                </span>
                <span className="text-[10px] font-mono font-bold text-right" style={{ color: "#e0e6ed" }}>
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-mono leading-relaxed" style={{ color: P.dim }}>
            Following any Apply Fix / Two-Man Rule interdiction, the affected agent enters an elevated
            monitoring window for the next 100 events. Every event must carry a full ML-DSA-87
            quantum signature. Track progress via the Fix Monitor API.
          </p>
        </div>

        {/* Response times & other SLAs */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.blue }}>
            Breach Response & Availability
          </h4>
          <div className="space-y-2">
            {Object.entries(resp).map(([k, v]) => (
              <div key={k} className="flex justify-between items-start gap-2">
                <span className="text-[10px] font-mono capitalize" style={{ color: P.dim }}>{k}</span>
                <span className="text-[10px] font-mono font-bold text-right" style={{ color: P.blue }}>{v}</span>
              </div>
            ))}
          </div>
          <div className="rounded px-3 py-2 space-y-1" style={{ background: P.panel, border: `1px solid ${P.border}` }}>
            <div className="text-[9px] font-mono" style={{ color: P.dim }}>Availability: <span style={{ color: P.sage }}>{sla.availabilityTarget}</span></div>
            <div className="text-[9px] font-mono" style={{ color: P.dim }}>Retention: <span style={{ color: P.sage }}>{sla.auditLogRetention}</span></div>
            <div className="text-[9px] font-mono" style={{ color: P.dim }}>Quantum: <span style={{ color: P.gold }}>{sla.quantumReadiness}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

function OnboardingDashboard({ data, partnerKey }: { data: OnboardingData; partnerKey: string }) {
  const compliantCount     = data.checklist.filter(c => c.status === "COMPLIANT").length;
  const partialCount       = data.checklist.filter(c => c.status === "PARTIAL").length;
  const nonCompliantCount  = data.checklist.filter(c => c.status === "NON-COMPLIANT").length;
  const pendingCount       = data.checklist.filter(c => c.status === "PENDING").length;
  const pct = Math.round((compliantCount / data.totalItems) * 100);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: P.bg }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Building2 className="w-5 h-5" style={{ color: P.gold }} />
            <h1 className="text-xl font-mono font-bold text-white">Partner Alpha Onboarding</h1>
          </div>
          <p className="text-sm font-mono" style={{ color: P.dim }}>
            EU AI Act Art. 12/14 Compliance Readiness · {data.tier} Tier · {data.accessLevel}
          </p>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono" style={{ color: P.dim }}>
            <span>Report ID: {data.reportId}</span>
            <span>·</span>
            <span>Generated: {new Date(data.generatedAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {overallBadge(data.overallStatus)}
          <div className="text-[10px] font-mono" style={{ color: P.dim }}>
            {compliantCount}/{data.totalItems} controls compliant
          </div>
        </div>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────── */}
      <div className="rounded-xl p-4" style={{ background: P.panel, border: `1px solid ${P.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
            Compliance Readiness
          </span>
          <span className="text-lg font-mono font-bold" style={{ color: statusColor(data.overallStatus) }}>
            {pct}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: P.border }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${P.sage}, ${pct === 100 ? P.gold : P.sage})`,
              boxShadow: pct === 100 ? `0 0 12px ${P.gold}66` : "none",
            }}
          />
        </div>
        {/* Status breakdown */}
        <div className="flex gap-4 flex-wrap">
          {[
            { label: "Compliant",     count: compliantCount,    color: P.sage },
            { label: "Partial",       count: partialCount,      color: P.amber },
            { label: "Non-Compliant", count: nonCompliantCount, color: P.terra },
            { label: "Pending",       count: pendingCount,      color: P.dim },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-[10px] font-mono" style={{ color: P.dim }}>
                {label}: <span style={{ color }}>{count}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Live system stats ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Events",        value: data.systemStats.totalEvents?.toLocaleString() ?? "0",   color: P.blue,  icon: <Activity className="w-3.5 h-3.5" /> },
          { label: "Quantum Coverage",    value: `${data.systemStats.quantumCoverage ?? 0}%`,             color: P.gold,  icon: <Shield className="w-3.5 h-3.5" /> },
          { label: "Drift Events",        value: String(data.systemStats.driftDetected ?? 0),             color: P.amber, icon: <GitBranch className="w-3.5 h-3.5" /> },
          { label: "Dual-Sig Commits",    value: String(data.systemStats.recursiveFixes ?? 0),            color: P.sage,  icon: <ShieldCheck className="w-3.5 h-3.5" /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="rounded-xl p-3"
            style={{ background: P.panel, border: `1px solid ${P.border}` }}>
            <div className="flex items-center gap-1.5 mb-1" style={{ color }}>
              {icon}
              <span className="text-[9px] font-mono uppercase tracking-widest">{label}</span>
            </div>
            <div className="text-xl font-mono font-bold" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Checklist ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-mono font-bold mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" style={{ color: P.sage }} />
          <span style={{ color: P.sage }}>EU AI Act 2026 Compliance Checklist</span>
          <span className="text-[10px] font-mono ml-1" style={{ color: P.dim }}>
            (click any row to expand)
          </span>
        </h2>
        <div className="space-y-2">
          {data.checklist.map(item => (
            <CheckItem key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* ── Sovereign Key Provisioning ───────────────────────────────── */}
      <SovereignKeyPanel data={data.sovereignKeyProvisioning} />

      {/* ── SLA Panel ────────────────────────────────────────────────── */}
      <SLAPanel data={data} sla={data.sla} />

      {/* ── Next Steps ───────────────────────────────────────────────── */}
      {data.nextSteps.length > 0 && (
        <div className="rounded-xl p-4"
          style={{ border: `1px solid ${P.blue}44`, background: `${P.blue}06` }}>
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4" style={{ color: P.blue }} />
            <span className="text-xs font-mono font-bold" style={{ color: P.blue }}>NEXT STEPS</span>
          </div>
          <ul className="space-y-2">
            {data.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] font-mono">
                <ChevronRight className="w-3 h-3 shrink-0 mt-0.5" style={{ color: P.blue }} />
                <span style={{ color: "#cdd5e0" }}>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Breach scenario CTA ──────────────────────────────────────── */}
      <div className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap"
        style={{ border: `1px solid ${P.terra}44`, background: `${P.terra}08` }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4" style={{ color: P.terra }} />
            <span className="text-xs font-mono font-bold" style={{ color: P.terra }}>
              BREACH SCENARIO DEMO
            </span>
          </div>
          <p className="text-[11px] font-mono" style={{ color: P.dim }}>
            Run the 3-stage Logic Poisoning simulation (Cognitive Drift → Honey-Token → Chain Break)
            to see live governance in action. Use the breach script:
            <code className="ml-1 px-1 rounded text-[10px]"
              style={{ background: P.panel, color: P.amber }}>
              pnpm --filter @workspace/scripts run breach
            </code>
          </p>
        </div>
        <button
          onClick={async () => {
            await fetch(`${BASE}/api/v1/partner/demo/seed`, { method: "POST" });
            window.location.href = `${BASE}/traces`;
          }}
          className="px-4 py-2 rounded-lg font-mono text-xs font-bold flex items-center gap-2 transition-all shrink-0"
          style={{ background: `${P.terra}18`, border: `1px solid ${P.terra}66`, color: P.terra }}>
          <Cpu className="w-3.5 h-3.5" />
          Seed &amp; View in Traces
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-[10px] font-mono pt-4 border-t"
        style={{ borderColor: P.border, color: P.dim }}>
        <div className="flex items-center gap-2">
          <Shield className="w-3 h-3" style={{ color: P.sage }} />
          MaroShield v6.0 · QL-2.0 FIPS-204 · EU AI Act Art. 12/14
        </div>
        <div>
          Key: {partnerKey.substring(0, 12)}••••
        </div>
      </div>
    </div>
  );
}

// ── Page root ──────────────────────────────────────────────────────────────

export default function PartnerOnboardingPage() {
  const [unlockedKey,  setUnlockedKey]  = useState<string | null>(null);
  const [onboardData,  setOnboardData]  = useState<OnboardingData | null>(null);

  const handleUnlock = useCallback((key: string, data: OnboardingData) => {
    setUnlockedKey(key);
    setOnboardData(data);
  }, []);

  if (!unlockedKey || !onboardData) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return <OnboardingDashboard data={onboardData} partnerKey={unlockedKey} />;
}
