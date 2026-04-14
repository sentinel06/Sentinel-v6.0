import React, { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  ShieldCheck,
  Key,
  Copy,
  Check,
  Lock,
  Zap,
  Globe,
  Star,
  Building2,
  RefreshCw,
  ChevronRight,
  Activity,
  Trash2,
  Cpu,
  FileDown,
  BookOpen,
  Rocket,
  Loader2,
} from "lucide-react";
import ExecutiveSummaryPDF from "@/components/ExecutiveSummaryPDF";

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

// ── GaaS Tier Definitions ─────────────────────────────────────────────────

const TIERS = [
  {
    name: "Core",
    badge: "OPEN",
    color: C.dimText,
    border: C.divider,
    glow: "rgba(154,164,177,0.12)",
    icon: Shield,
    tagline: "Audit-first governance for small agent deployments",
    price: "Free",
    priceSub: "up to 10k events/mo",
    features: [
      { label: "Immutable Hash-Chain Ledger", included: true },
      { label: "SHA-512 Classical Integrity", included: true },
      { label: "60 events/min per agent", included: true },
      { label: "7-day log retention", included: true },
      { label: "ML-DSA-87 Quantum Signing", included: false },
      { label: "Cognitive Drift Detection", included: false },
      { label: "Swarm Ancestry Tracing", included: false },
      { label: "PDF Evidence Bags", included: false },
      { label: "Partner Health Feed", included: false },
      { label: "Recursive Revocation", included: false },
    ],
  },
  {
    name: "Pro",
    badge: "POPULAR",
    color: C.sage,
    border: C.sage,
    glow: "rgba(64,181,149,0.12)",
    icon: Zap,
    tagline: "Quantum-secure governance for production agent swarms",
    price: "$499",
    priceSub: "per month · up to 1M events",
    features: [
      { label: "Immutable Hash-Chain Ledger", included: true },
      { label: "SHA-512 Classical Integrity", included: true },
      { label: "600 events/min per agent", included: true },
      { label: "90-day log retention", included: true },
      { label: "ML-DSA-87 Quantum Signing (QL-2.0)", included: true },
      { label: "Cognitive Drift Detection", included: true },
      { label: "Swarm Ancestry Tracing", included: true },
      { label: "PDF Evidence Bags", included: true },
      { label: "Partner Health Feed", included: false },
      { label: "Recursive Revocation", included: false },
    ],
  },
  {
    name: "Enterprise",
    badge: "FULL SUITE",
    color: C.honey,
    border: C.honey,
    glow: "rgba(235,192,109,0.12)",
    icon: Building2,
    tagline: "Full EU AI Act Art. 12/14 compliance, swarm-scale governance",
    price: "Custom",
    priceSub: "unlimited events · SLA guarantee",
    features: [
      { label: "Immutable Hash-Chain Ledger", included: true },
      { label: "SHA-512 Classical Integrity", included: true },
      { label: "6000 events/min per agent", included: true },
      { label: "Unlimited log retention", included: true },
      { label: "ML-DSA-87 Quantum Signing (QL-2.0)", included: true },
      { label: "Cognitive Drift Detection", included: true },
      { label: "Swarm Ancestry Tracing", included: true },
      { label: "PDF Evidence Bags", included: true },
      { label: "Partner Health Feed", included: true },
      { label: "Recursive Revocation", included: true },
    ],
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  keyValue: string;
  partnerId: string;
  partnerEmail: string;
  label: string;
  tier: string;
  swarmScope: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface PartnerHealth {
  partnerEmail: string;
  totalAgents: number;
  activeAgents: number;
  totalLogsIngested: number;
  totalAnomalies: number;
  anomalyRate: number;
  avgTrustScore: number;
  status: "HEALTHY" | "DEGRADED" | "CRITICAL";
}

// ── Utility ───────────────────────────────────────────────────────────────

function TrustGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 85 ? C.sage : pct >= 65 ? C.honey : C.terra;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#2C3136] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums" style={{ color }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: "HEALTHY" | "DEGRADED" | "CRITICAL" }) {
  const cfg = {
    HEALTHY:  { color: C.sage,  bg: "rgba(64,181,149,0.12)",  label: "HEALTHY" },
    DEGRADED: { color: C.honey, bg: "rgba(235,192,109,0.12)", label: "DEGRADED" },
    CRITICAL: { color: C.terra, bg: "rgba(217,97,97,0.12)",   label: "CRITICAL" },
  }[status];
  return (
    <span
      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────

function QuantumBanner() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg border mb-6"
      style={{ borderColor: `${C.sage}40`, background: `rgba(64,181,149,0.07)` }}
    >
      <Lock className="w-4 h-4 shrink-0" style={{ color: C.sage }} />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-mono font-bold" style={{ color: C.sage }}>
          QUANTUM INTEGRITY: ACTIVE
        </span>
        <span className="text-xs text-muted-foreground font-mono ml-3">
          All partner API keys and audit events are sealed with QL-2.0 hybrid signatures (SHA-512 + ML-DSA-87, FIPS-204, Security Level 5)
        </span>
      </div>
      <span className="text-[10px] font-mono shrink-0" style={{ color: C.dimText }}>
        harvest-now-decrypt-later protected
      </span>
    </div>
  );
}

function TiersSection({ onSelectTier }: { onSelectTier: (tier: string) => void }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold font-mono tracking-tight">Governance-as-a-Service</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Choose the compliance tier that matches your deployment scale and regulatory requirements.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          return (
            <Card
              key={tier.name}
              className="p-5 border flex flex-col"
              style={{
                borderColor: `${tier.border}50`,
                background: `linear-gradient(135deg, ${tier.glow} 0%, transparent 60%)`,
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center"
                    style={{ background: `${tier.color}18`, border: `1px solid ${tier.color}35` }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: tier.color }} />
                  </div>
                  <span className="font-mono font-bold text-sm text-foreground">{tier.name}</span>
                </div>
                <span
                  className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                  style={{ color: tier.color, background: `${tier.color}15`, border: `1px solid ${tier.color}30` }}
                >
                  {tier.badge}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">{tier.tagline}</p>

              {/* Price */}
              <div className="mb-4">
                <span className="text-2xl font-bold font-mono" style={{ color: tier.color }}>
                  {tier.price}
                </span>
                <div className="text-[10px] text-muted-foreground font-mono">{tier.priceSub}</div>
              </div>

              {/* Features */}
              <ul className="space-y-1.5 flex-1 mb-4">
                {tier.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-1.5 text-[11px] font-mono">
                    <span
                      className="mt-0.5 shrink-0"
                      style={{ color: f.included ? tier.color : C.dim }}
                    >
                      {f.included ? "✓" : "–"}
                    </span>
                    <span style={{ color: f.included ? "var(--foreground)" : C.dim }}>{f.label}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="sm"
                variant={tier.name === "Pro" ? "default" : "outline"}
                className="w-full font-mono text-xs mt-auto"
                style={
                  tier.name !== "Pro"
                    ? { borderColor: `${tier.color}50`, color: tier.color }
                    : {}
                }
                onClick={() => onSelectTier(tier.name)}
              >
                {tier.name === "Enterprise" ? "Contact Sales" : `Generate ${tier.name} Key`}
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

interface KeyGenProps {
  defaultTier?: string;
  onKeyGenerated: () => void;
}

function KeyGenerator({ defaultTier, onKeyGenerated }: KeyGenProps) {
  const [form, setForm] = useState({
    partnerId: "",
    partnerEmail: "",
    label: "",
    tier: defaultTier ?? "Pro",
    swarmScope: "",
  });
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState<{ keyValue: string; tier: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (defaultTier) setForm((f) => ({ ...f, tier: defaultTier }));
  }, [defaultTier]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNewKey(null);
    try {
      const r = await fetch(`${BASE}/api/v1/partner/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: form.partnerId,
          partnerEmail: form.partnerEmail,
          label: form.label || `${form.tier} Key — ${new Date().toLocaleDateString()}`,
          tier: form.tier,
          swarmScope: form.swarmScope || undefined,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setNewKey({ keyValue: data.keyValue, tier: data.tier, label: data.key?.label });
        setForm((f) => ({ ...f, label: "", swarmScope: "" }));
        onKeyGenerated();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey.keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tierColor = (t: string) =>
    t === "Enterprise" ? C.honey : t === "Pro" ? C.sage : C.dimText;

  return (
    <Card className="p-5 border-border/60 bg-card/50">
      <h3 className="font-mono text-sm font-bold mb-4 flex items-center gap-2">
        <Key className="w-4 h-4" style={{ color: C.sage }} />
        API Key Generator
      </h3>

      {newKey && (
        <div
          className="mb-4 p-4 rounded-lg border"
          style={{ borderColor: `${C.sage}40`, background: `rgba(64,181,149,0.08)` }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold" style={{ color: C.sage }}>
              NEW KEY GENERATED — COPY NOW
            </span>
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ color: tierColor(newKey.tier), background: `${tierColor(newKey.tier)}15` }}
            >
              {newKey.tier}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-[#0D1117] rounded px-3 py-2 border border-[#2C3136]">
            <code className="text-[11px] font-mono text-foreground flex-1 break-all">{newKey.keyValue}</code>
            <button
              onClick={handleCopy}
              className="shrink-0 p-1 rounded hover:bg-[#2C3136] transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5" style={{ color: C.sage }} />
              ) : (
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono mt-1.5">
            This key is sealed with QL-2.0 quantum signatures. It will not be displayed again.
          </p>
        </div>
      )}

      <form onSubmit={handleGenerate} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-muted-foreground block mb-1">Partner ID *</label>
            <input
              value={form.partnerId}
              onChange={(e) => setForm((f) => ({ ...f, partnerId: e.target.value }))}
              placeholder="acme-corp"
              required
              className="w-full h-8 bg-muted/50 border border-border rounded px-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground block mb-1">Contact Email *</label>
            <input
              type="email"
              value={form.partnerEmail}
              onChange={(e) => setForm((f) => ({ ...f, partnerEmail: e.target.value }))}
              placeholder="ops@acme.com"
              required
              className="w-full h-8 bg-muted/50 border border-border rounded px-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-muted-foreground block mb-1">Label</label>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Production Swarm Key"
              className="w-full h-8 bg-muted/50 border border-border rounded px-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground block mb-1">Swarm Scope</label>
            <input
              value={form.swarmScope}
              onChange={(e) => setForm((f) => ({ ...f, swarmScope: e.target.value }))}
              placeholder="swarm-alpha (optional)"
              className="w-full h-8 bg-muted/50 border border-border rounded px-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono text-muted-foreground block mb-1">Tier</label>
          <div className="flex gap-2">
            {["Core", "Pro", "Enterprise"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, tier: t }))}
                className="flex-1 h-8 rounded border text-[11px] font-mono font-medium transition-all"
                style={
                  form.tier === t
                    ? { borderColor: tierColor(t), color: tierColor(t), background: `${tierColor(t)}12` }
                    : { borderColor: C.divider, color: C.dimText }
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <Button type="submit" className="w-full font-mono text-xs gap-2" disabled={loading}>
          <Key className="w-3.5 h-3.5" />
          {loading ? "Generating…" : "Generate API Key"}
        </Button>
      </form>
    </Card>
  );
}

function KeyList({ refresh }: { refresh: number }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/v1/partner/keys`);
      if (r.ok) {
        const data = await r.json();
        setKeys(data.keys ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [refresh, fetchKeys]);

  const handleRevoke = async (keyId: string) => {
    setRevoking(keyId);
    try {
      await fetch(`${BASE}/api/v1/partner/keys/${keyId}/revoke`, { method: "PATCH" });
      await fetchKeys();
    } finally {
      setRevoking(null);
    }
  };

  const tierColor = (t: string) =>
    t === "Enterprise" ? C.honey : t === "Pro" ? C.sage : C.dimText;

  const visible = showAll ? keys : keys.slice(0, 5);

  return (
    <Card className="p-5 border-border/60 bg-card/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-sm font-bold flex items-center gap-2">
          <Globe className="w-4 h-4" style={{ color: C.sage }} />
          Issued Keys
        </h3>
        <span className="text-[10px] font-mono text-muted-foreground">
          {keys.filter((k) => k.isActive).length} active / {keys.length} total
        </span>
      </div>

      {loading ? (
        <div className="text-xs font-mono text-muted-foreground py-6 text-center">Loading keys…</div>
      ) : keys.length === 0 ? (
        <div className="text-xs font-mono text-muted-foreground py-6 text-center flex flex-col items-center gap-2">
          <Key className="w-6 h-6 opacity-20" />
          No API keys issued yet
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-3 p-3 rounded border"
              style={{
                borderColor: key.isActive ? `${tierColor(key.tier)}30` : `${C.divider}80`,
                background: key.isActive ? `${tierColor(key.tier)}05` : "transparent",
                opacity: key.isActive ? 1 : 0.6,
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono font-medium text-foreground truncate">{key.label}</span>
                  <span
                    className="text-[9px] font-mono px-1 rounded shrink-0"
                    style={{ color: tierColor(key.tier), background: `${tierColor(key.tier)}15` }}
                  >
                    {key.tier}
                  </span>
                  {!key.isActive && (
                    <span className="text-[9px] font-mono text-muted-foreground">REVOKED</span>
                  )}
                </div>
                <div className="flex gap-3 text-[10px] font-mono text-muted-foreground">
                  <span>{key.partnerEmail}</span>
                  <code className="text-[#9AA4B1]">{key.keyValue}</code>
                  {key.swarmScope && <span>scope: {key.swarmScope}</span>}
                </div>
                <div className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
                  Created {new Date(key.createdAt).toLocaleDateString()}
                  {key.lastUsedAt && ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                </div>
              </div>
              {key.isActive && (
                <button
                  onClick={() => handleRevoke(key.id)}
                  disabled={revoking === key.id}
                  className="p-1.5 rounded hover:bg-destructive/20 transition-colors shrink-0"
                  title="Revoke key"
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
          ))}
          {keys.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors w-full text-center py-1"
            >
              {showAll ? "Show less" : `Show ${keys.length - 5} more`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function PartnerHealthFeed() {
  const [partners, setPartners] = useState<PartnerHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/v1/partner/health`);
      if (r.ok) {
        const data = await r.json();
        setPartners(data.partners ?? []);
        setLastRefresh(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 30_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  return (
    <Card className="p-5 border-border/60 bg-card/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-sm font-bold flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: C.sage }} />
          Partner Health Feed
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted-foreground">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-3 h-3 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && partners.length === 0 ? (
        <div className="text-xs font-mono text-muted-foreground py-8 text-center">
          Loading partner health data…
        </div>
      ) : partners.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <Cpu className="w-8 h-8 opacity-20" />
          <span className="text-xs font-mono">No registered agents yet</span>
          <span className="text-[10px] font-mono opacity-60">Register agents via the Registry to see their trust scores here</span>
        </div>
      ) : (
        <div className="space-y-3">
          {partners.map((p) => (
            <div
              key={p.partnerEmail}
              className="p-4 rounded border"
              style={{
                borderColor:
                  p.status === "CRITICAL" ? `${C.terra}35`
                  : p.status === "DEGRADED" ? `${C.honey}35`
                  : `${C.sage}25`,
                background:
                  p.status === "CRITICAL" ? `rgba(217,97,97,0.05)`
                  : p.status === "DEGRADED" ? `rgba(235,192,109,0.05)`
                  : `rgba(64,181,149,0.03)`,
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs font-mono font-bold text-foreground">{p.partnerEmail}</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {p.activeAgents}/{p.totalAgents} agents active
                    · {p.totalLogsIngested.toLocaleString()} events ingested
                  </div>
                </div>
                <StatusPill status={p.status} />
              </div>

              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-muted-foreground">Trust Score</span>
                </div>
                <TrustGauge score={p.avgTrustScore} />
              </div>

              <div className="flex gap-4 mt-2">
                {[
                  { label: "Anomalies", value: p.totalAnomalies, color: p.totalAnomalies > 0 ? C.honey : C.sage },
                  { label: "Anomaly Rate", value: `${p.anomalyRate}%`, color: p.anomalyRate > 10 ? C.terra : p.anomalyRate > 2 ? C.honey : C.sage },
                  { label: "QI Status", value: "ACTIVE", color: C.sage },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">{label}</span>
                    <span className="text-[11px] font-mono font-bold" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function PartnerPortalPage() {
  const [activeTab, setActiveTab] = useState<"tiers" | "keys">("tiers");
  const [selectedTier, setSelectedTier] = useState<string | undefined>();
  const [keyRefresh, setKeyRefresh] = useState(0);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoStatus, setDemoStatus] = useState<string | null>(null);

  const handleSelectTier = (tier: string) => {
    setSelectedTier(tier);
    setActiveTab("keys");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleLaunchDemo = useCallback(async () => {
    setDemoLoading(true);
    setDemoStatus("Seeding Apex-Fintech environment…");
    try {
      const r = await fetch(`${BASE}/api/v1/partner/demo/seed`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        setDemoStatus(`Error: ${data.error ?? "Unknown error"}`);
        setDemoLoading(false);
        return;
      }
      setDemoStatus(`✓ ${data.eventsInserted} events seeded — redirecting to EQA…`);
      // Short delay so the user reads the confirmation, then navigate
      setTimeout(() => {
        window.location.href = `${BASE}/eqa?partnerId=${encodeURIComponent("Apex-Fintech")}`;
      }, 900);
    } catch {
      setDemoStatus("Network error — check the API server");
      setDemoLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5" style={{ color: C.sage }} />
            <h1 className="text-2xl font-bold font-mono tracking-tight">Partner Portal</h1>
            <Badge variant="outline" className="font-mono text-[10px]" style={{ borderColor: `${C.honey}60`, color: C.honey }}>
              GaaS
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Enterprise governance infrastructure for AI agent swarms — powered by Agent-Sentinel
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Launch Demo Environment */}
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              onClick={handleLaunchDemo}
              disabled={demoLoading}
              className="font-mono text-xs gap-2 whitespace-nowrap"
              style={{
                background: demoLoading ? `${C.honey}80` : C.honey,
                color: "#0a0f13",
                border: "none",
              }}
            >
              {demoLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Rocket className="w-3.5 h-3.5" />}
              {demoLoading ? "Seeding…" : "Launch Demo Environment"}
            </Button>
            {demoStatus && (
              <div className="text-[10px] font-mono max-w-[220px] text-right leading-tight" style={{ color: demoStatus.startsWith("✓") ? C.sage : demoStatus.startsWith("Error") ? C.terra : C.dimText }}>
                {demoStatus}
              </div>
            )}
          </div>

          <ExecutiveSummaryPDF />
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.sage }} />
            All sessions quantum-sealed
          </div>
        </div>
      </div>

      {/* Quantum Banner */}
      <QuantumBanner />

      {/* White Paper download strip */}
      <div
        className="flex items-center gap-4 px-4 py-3 rounded-lg border"
        style={{ borderColor: `${C.honey}35`, background: `rgba(235,192,109,0.06)` }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${C.honey}15`, border: `1px solid ${C.honey}35` }}
        >
          <BookOpen className="w-4 h-4" style={{ color: C.honey }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono font-bold text-foreground">
            WHITE PAPER: Agent-Sentinel (v1.0 – v4.0)
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
            The Sovereign Infrastructure for Agentic Governance (2026–2030) — full technical specification including quantum roadmap, swarm ancestry, and EU AI Act compliance framework
          </div>
        </div>
        <a
          href={`${BASE}/api/v1/partner/whitepaper`}
          download="Agent-Sentinel-White-Paper.md"
          className="shrink-0"
        >
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs gap-1.5 whitespace-nowrap"
            style={{ borderColor: `${C.honey}50`, color: C.honey }}
          >
            <FileDown className="w-3.5 h-3.5" />
            Download White Paper
          </Button>
        </a>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border/60">
        {[
          { key: "tiers", label: "GaaS Tiers", icon: Star },
          { key: "keys", label: "API Key Manager", icon: Key },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition-colors"
            style={
              activeTab === key
                ? { borderColor: C.sage, color: C.sage }
                : { borderColor: "transparent", color: C.dimText }
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "tiers" ? (
        <TiersSection onSelectTier={handleSelectTier} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <KeyGenerator
            defaultTier={selectedTier}
            onKeyGenerated={() => setKeyRefresh((n) => n + 1)}
          />
          <KeyList refresh={keyRefresh} />
        </div>
      )}

      {/* Partner Health Feed — always visible */}
      <div className="border-t border-[#2C3136] pt-6">
        <PartnerHealthFeed />
      </div>
    </div>
  );
}
