import React, { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Copy,
  Check,
  Award,
  ExternalLink,
  AlertTriangle,
  BookOpen,
  Code2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AgentEntry {
  agentId: string;
  healthScore?: number;
  sessionHealthScore?: number;
  status?: string;
}

function useCertificationStatus() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/registry`);
      const d = await r.json();
      setAgents(d.agents ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  const activeAgents = agents.filter((a) => a.status !== "REVOKED");
  const avgHealth =
    activeAgents.length > 0
      ? activeAgents.reduce((sum, a) => sum + ((a.healthScore ?? a.sessionHealthScore) ?? 1), 0) /
        activeAgents.length
      : 1;
  const pct = Math.round(avgHealth * 100);
  const certified = pct >= 80;

  return { agents, activeAgents, pct, certified, loading, refresh };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? (
        <Check className="w-3 h-3 text-emerald-400" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group rounded-md bg-black/40 border border-border/60 overflow-hidden">
      <div className="absolute top-2.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-xs font-mono text-emerald-300/90 overflow-x-auto leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function CertBadgePreview({ agentId }: { agentId?: string }) {
  const src = agentId
    ? `${BASE}/api/v1/badge/${agentId}.svg`
    : `${BASE}/api/v1/badge.svg`;
  return (
    <img
      src={src}
      alt="Sentinel badge preview"
      className="h-5"
      key={src + Date.now()}
    />
  );
}

export default function BadgePage() {
  const { agents, activeAgents, pct, certified, loading } =
    useCertificationStatus();
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  const deploymentUrl =
    typeof window !== "undefined" ? window.location.origin : "https://your-sentinel.replit.app";
  const agentBadgeUrl = selectedAgent
    ? `${deploymentUrl}${BASE}/api/v1/badge/${selectedAgent}.svg`
    : `${deploymentUrl}${BASE}/api/v1/badge.svg`;
  const markdownEmbed = selectedAgent
    ? `![sentinel-governed](${agentBadgeUrl})`
    : `![sentinel-governed](${deploymentUrl}${BASE}/api/v1/badge.svg)`;

  return (
    <div className="space-y-6 page-transition">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-yellow-400" />
            Sentinel-Certified Badge
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Earn and embed your governance badge · Share it in your README
          </p>
        </div>
      </div>

      {/* Certification Status */}
      <Card
        className={`border-2 ${
          certified
            ? "border-emerald-500/40 bg-emerald-950/10"
            : "border-yellow-500/30 bg-yellow-950/10"
        } p-6`}
      >
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 border-2 ${
              certified
                ? "bg-emerald-500/15 border-emerald-500/40"
                : "bg-yellow-500/10 border-yellow-500/30"
            }`}
          >
            {certified ? (
              <ShieldCheck className="w-10 h-10 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-10 h-10 text-yellow-400" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2
                className={`font-mono font-bold text-xl ${
                  certified ? "text-emerald-400" : "text-yellow-400"
                }`}
              >
                {certified ? "SENTINEL CERTIFIED" : "CERTIFICATION PENDING"}
              </h2>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded border font-bold ${
                  certified
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
                }`}
              >
                Cluster Health: {loading ? "…" : `${pct}%`}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-2 leading-relaxed max-w-xl">
              {certified
                ? `Your cluster is operating at ${pct}% health — above the 80% threshold. You may display the Sentinel-Governed badge in your project READMEs.`
                : `Your cluster health is ${pct}%. Maintain above 80% to earn the Sentinel-Governed badge. Keep rationales consistent, avoid honey-tokens, and handle approvals promptly.`}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 items-center">
              <span className="text-xs font-mono text-muted-foreground">
                {activeAgents.length} active agent{activeAgents.length !== 1 ? "s" : ""} monitored
              </span>
              {certified && (
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-mono text-[10px]">
                  ✓ Embed badge now
                </Badge>
              )}
            </div>
          </div>
          {/* Live badge preview */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Live Preview
            </div>
            <CertBadgePreview />
          </div>
        </div>
      </Card>

      {/* How to Earn */}
      <Card className="border-border/60 bg-card/50">
        <div className="p-4 border-b border-border/60 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <h2 className="font-mono text-sm font-medium">HOW TO EARN THE GREEN BADGE</h2>
        </div>
        <div className="p-4 grid md:grid-cols-3 gap-4">
          {[
            {
              n: "01",
              title: "Maintain 80%+ Cluster Health",
              body: "Your rolling average across all active agents must stay above 80%. This reflects consistent, honest, low-risk behavior.",
              color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
            },
            {
              n: "02",
              title: "Write Truthful Rationales",
              body: "The intent-action consistency engine scores every event. Hallucinated or mismatched rationales degrade your health score.",
              color: "text-primary border-primary/30 bg-primary/5",
            },
            {
              n: "03",
              title: "Never Invoke Honey-Tokens",
              body: 'Calling any of the 7 forbidden ghost tools (e.g. admin_global_reset) causes immediate revocation. One breach disqualifies that agent.',
              color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/5",
            },
          ].map(({ n, title, body, color }) => (
            <div key={n} className={`rounded-lg border p-4 ${color}`}>
              <div className="font-mono text-2xl font-bold opacity-30 mb-2">{n}</div>
              <div className="font-mono text-sm font-bold mb-1.5">{title}</div>
              <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Embed Section */}
      <Card className="border-border/60 bg-card/50">
        <div className="p-4 border-b border-border/60 flex items-center gap-2">
          <Code2 className="w-4 h-4 text-primary" />
          <h2 className="font-mono text-sm font-medium">EMBED IN YOUR README</h2>
        </div>
        <div className="p-4 space-y-5">
          {/* Agent selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-mono text-muted-foreground">
              Badge for:
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="h-8 px-2 rounded bg-muted/50 border border-border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Generic (cluster-level)</option>
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.agentId}
                </option>
              ))}
            </select>
          </div>

          {/* Preview */}
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
              Badge Preview
            </div>
            <div className="flex items-center gap-4 p-3 rounded bg-white/5 border border-border/40">
              <CertBadgePreview agentId={selectedAgent || undefined} />
              <span className="text-xs font-mono text-muted-foreground">
                Live · updates in real-time
              </span>
            </div>
          </div>

          {/* Badge URL */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Direct URL
              </div>
              <CopyButton text={agentBadgeUrl} />
            </div>
            <CodeBlock code={agentBadgeUrl} />
          </div>

          {/* Markdown */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Markdown (paste in README.md)
              </div>
              <CopyButton text={markdownEmbed} />
            </div>
            <CodeBlock code={markdownEmbed} />
          </div>

          {/* HTML */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                HTML
              </div>
              <CopyButton text={`<img src="${agentBadgeUrl}" alt="sentinel-governed" height="20">`} />
            </div>
            <CodeBlock
              code={`<img src="${agentBadgeUrl}" alt="sentinel-governed" height="20">`}
            />
          </div>
        </div>
      </Card>

      {/* Viral Growth Program */}
      <Card className="border-primary/20 bg-primary/5">
        <div className="p-4 border-b border-primary/20 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-primary" />
          <h2 className="font-mono text-sm font-medium text-primary">
            SENTINEL-GOVERNED CERTIFICATION PROGRAM
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground font-mono leading-relaxed">
            Projects that keep their cluster health above 80% may display the{" "}
            <span className="text-primary font-bold">Sentinel-Governed</span> badge. The
            badge is a live SVG — it reflects your real-time health score, so visitors
            always see your current governance posture.
          </p>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {[
              {
                label: "🟢 Green badge (≥ 80%)",
                desc: "Certified. Consistent, honest, low-risk agent behavior.",
              },
              {
                label: "🟡 Yellow badge (60–79%)",
                desc: "Marginal. Some anomalies detected — monitor closely.",
              },
              {
                label: "🔴 Red badge (< 60%)",
                desc: "Compromised. Significant integrity or consistency failures.",
              },
              {
                label: "⚫ REVOKED badge",
                desc: "Agent permanently revoked after honey-token breach.",
              },
            ].map(({ label, desc }) => (
              <div
                key={label}
                className="rounded border border-border/50 bg-card/40 p-3 text-xs font-mono"
              >
                <div className="font-bold text-foreground mb-0.5">{label}</div>
                <div className="text-muted-foreground">{desc}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground font-mono pt-1">
            To use Agent-Sentinel and earn your badge, start from the{" "}
            <span className="text-primary">Governed Agent Starter Kit</span> — a
            Replit template with the SDK pre-installed. One import, full governance.
          </p>
        </div>
      </Card>
    </div>
  );
}
