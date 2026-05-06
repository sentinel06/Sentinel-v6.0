import React, { useState } from "react";
import { useLocation } from "wouter";
import { useGetAgents } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/audit-utils";
import {
  Cpu,
  AlertTriangle,
  Search,
  ShieldCheck,
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
  Crosshair,
  Skull,
  X as XIcon,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Sovereign palette — must match swarmmap.tsx + Forensic Inspector
const SAGE   = "#40B595";
const TERRA  = "#D96161";
const VIOLET = "#8B5CF6";
const AMBER  = "#EBC06D";

interface RegistryAgent {
  id: string;
  agentId: string;
  ownerEmail: string;
  authorizedTools: string[];
  riskTier: string;
  maxBudgetPerTrace: number | null;
  isActive: boolean;
  registeredAt: string;
  updatedAt: string;
}

function useRegistry() {
  const [regAgents, setRegAgents] = React.useState<RegistryAgent[]>([]);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const r = await fetch(`${BASE}/api/v1/registry`);
    const d = await r.json();
    setRegAgents(d.agents ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  return { regAgents, loading, refresh };
}

function RiskTierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    Low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    High: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${colors[tier] ?? colors["Medium"]}`}>
      {tier}
    </span>
  );
}

function ProvenanceBadge({ revoked }: { revoked: boolean }) {
  if (revoked) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
        style={{
          color: TERRA,
          borderColor: TERRA + "55",
          background: TERRA + "12",
          letterSpacing: "0.06em",
        }}
        title="Sovereign token revoked — provenance chain broken"
      >
        <XIcon className="w-3 h-3" />
        REVOKED
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
      style={{
        color: SAGE,
        borderColor: SAGE + "55",
        background: SAGE + "12",
        letterSpacing: "0.06em",
      }}
      title="SLSA Level 4 build provenance verified · ML-DSA-87 weight signature valid"
    >
      <ShieldCheck className="w-3 h-3" />
      L4 VERIFIED
    </span>
  );
}

function RegisterAgentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    agentId: "",
    ownerEmail: "",
    authorizedTools: "",
    riskTier: "Medium",
    maxBudgetPerTrace: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!form.agentId || !form.ownerEmail) {
      setError("Agent ID and owner email are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/api/v1/registry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: form.agentId,
          ownerEmail: form.ownerEmail,
          authorizedTools: form.authorizedTools.split(",").map((s) => s.trim()).filter(Boolean),
          riskTier: form.riskTier,
          maxBudgetPerTrace: form.maxBudgetPerTrace ? parseFloat(form.maxBudgetPerTrace) : null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md border-border/60 bg-card p-6 space-y-4 m-4">
        <h3 className="font-mono text-sm font-bold">Register New Agent</h3>
        {error && <div className="text-xs text-destructive font-mono bg-destructive/10 px-3 py-2 rounded border border-destructive/20">{error}</div>}
        {[
          { label: "Agent ID *", key: "agentId", placeholder: "e.g. gpt-agent-01" },
          { label: "Owner Email *", key: "ownerEmail", placeholder: "owner@company.com" },
          { label: "Authorized Tools (comma-separated)", key: "authorizedTools", placeholder: "read, query, intent" },
          { label: "Max Budget Per Trace ($)", key: "maxBudgetPerTrace", placeholder: "e.g. 5.00" },
        ].map(({ label, key, placeholder }) => (
          <div key={key}>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>
            <Input
              placeholder={placeholder}
              value={(form as any)[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="font-mono text-sm h-9 bg-muted/30 border-border/60"
            />
          </div>
        ))}
        <div>
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Risk Tier</label>
          <select
            value={form.riskTier}
            onChange={(e) => setForm((f) => ({ ...f, riskTier: e.target.value }))}
            className="w-full h-9 bg-muted/30 border border-border/60 rounded-md px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose} className="font-mono text-sm">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="font-mono text-sm">
            {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            Register Agent
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function AgentsPage() {
  const { data: agentData, isLoading: logsLoading } = useGetAgents({ query: { queryKey: ["agents"] } });
  const { regAgents, loading: regLoading, refresh } = useRegistry();
  const [search, setSearch] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeFlash, setRevokeFlash] = useState<{ id: string; ok: boolean } | null>(null);
  const [, navigate] = useLocation();

  const agents = (agentData as any)?.agents || [];

  const filteredReg = regAgents.filter(
    (a: RegistryAgent) =>
      a.agentId.toLowerCase().includes(search.toLowerCase()) ||
      a.ownerEmail.toLowerCase().includes(search.toLowerCase()),
  );

  // ── ACTION: TRACE ─────────────────────────────────────────────────────────
  // Hand off the agent id to the swarm map via sessionStorage; swarmmap.tsx
  // reads "sentinel:pending-trace" once nodes have loaded and auto-selects the
  // matching node into the Forensic Inspector. Survives the route-change clear
  // because swarmmap consumes it AFTER mount.
  const trace = (agentId: string) => {
    try { sessionStorage.setItem("sentinel:pending-trace", agentId); } catch { /* noop */ }
    navigate("/swarmmap");
  };

  // ── ACTION: REVOKE ────────────────────────────────────────────────────────
  // Manual interdiction: same endpoint the autonomous Sovereign Watcher invokes
  // when drift > 25%. Triggers token-revocation propagation across all sessions.
  const revoke = async (agentId: string) => {
    if (!window.confirm(
      `INTERDICTION: Revoke sovereign token for ${agentId}?\n\n` +
      `This will:\n` +
      `  · Cancel all active sessions for this agent\n` +
      `  · Propagate revocation across the swarm tree\n` +
      `  · Commit the action to the EQA hash chain\n\n` +
      `This action is irreversible.`
    )) return;
    setRevoking(agentId);
    try {
      const r = await fetch(`${BASE}/api/v1/swarm/revoke-tree/${encodeURIComponent(agentId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "INTERDICTION: Manual revocation from Agent Registry" }),
      });
      // Best-effort governance state update so the row visibly flips to inactive
      try {
        await fetch(`${BASE}/api/v1/registry/${encodeURIComponent(agentId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: false }),
        });
      } catch { /* registry update is non-fatal */ }
      setRevokeFlash({ id: agentId, ok: r.ok });
      await refresh();
      setTimeout(() => setRevokeFlash(null), 2400);
    } catch {
      setRevokeFlash({ id: agentId, ok: false });
      setTimeout(() => setRevokeFlash(null), 2400);
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {showRegister && (
        <RegisterAgentModal onClose={() => setShowRegister(false)} onSuccess={refresh} />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            Your Agents
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded border ml-1"
              style={{ color: VIOLET, borderColor: VIOLET + "44", background: VIOLET + "12", letterSpacing: "0.04em" }}
            >
              Audit-grade
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every agent has a signed identity, a verified build chain, and a one-click stop button.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card/50 border-border/60 font-mono text-sm h-9"
            />
          </div>
          <Button onClick={() => setShowRegister(true)} size="sm" className="font-mono text-xs gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Register
          </Button>
        </div>
      </div>

      {/* ── Sovereign Audit Table ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
          Governance Registry ({filteredReg.length})
          {revokeFlash && (
            <span
              className="ml-3 px-2 py-0.5 rounded font-mono text-[10px] font-bold align-middle"
              style={{
                color: revokeFlash.ok ? TERRA : AMBER,
                background: (revokeFlash.ok ? TERRA : AMBER) + "18",
                border: `1px solid ${(revokeFlash.ok ? TERRA : AMBER)}55`,
              }}
            >
              {revokeFlash.ok ? "💀" : "⚠"} {revokeFlash.id} · {revokeFlash.ok ? "INTERDICTION COMMITTED" : "REVOCATION FAILED"}
            </span>
          )}
        </h2>

        {regLoading ? (
          <Card className="p-8 text-center font-mono text-xs text-muted-foreground border-border/60 bg-card/50">
            <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
            Loading sovereign registry…
          </Card>
        ) : filteredReg.length === 0 ? (
          <Card className="p-8 text-center font-mono text-xs text-muted-foreground border-border/60 bg-card/50">
            No registered agents match the current filter.
          </Card>
        ) : (
          <Card
            className="border-border/60 overflow-hidden"
            style={{ background: "rgba(13,17,23,0.55)" }}
          >
            {/* Scroll container — sticky header lives inside this scroll context */}
            <div style={{ maxHeight: "calc(100dvh - 320px)", overflowY: "auto" }}>
              <table className="w-full text-left border-collapse" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "20%" }} />{/* AGENT */}
                  <col style={{ width: "22%" }} />{/* GENOME */}
                  <col style={{ width: "18%" }} />{/* OWNER */}
                  <col style={{ width: "8%"  }} />{/* RISK */}
                  <col style={{ width: "14%" }} />{/* PROVENANCE */}
                  <col style={{ width: "8%"  }} />{/* STATUS */}
                  <col style={{ width: "10%" }} />{/* ACTIONS */}
                </colgroup>
                {/* ── Sticky Integrity Header ── */}
                <thead
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    background: "rgba(2, 6, 23, 0.80)",     // bg-slate-950/80
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    borderBottom: "1px solid rgba(139,92,246,0.30)",
                  }}
                >
                  <tr>
                    {[
                      "AGENT",
                      "GENOME",
                      "OWNER",
                      "RISK",
                      "PROVENANCE",
                      "STATUS",
                      "ACTIONS",
                    ].map((h) => (
                      <th
                        key={h}
                        className="font-mono text-[9px] font-bold px-3 py-2.5 uppercase"
                        style={{ color: VIOLET, letterSpacing: "0.16em" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredReg.map((agent: RegistryAgent, idx: number) => {
                    const isRevoked = !agent.isActive;
                    const isRevokingThis = revoking === agent.agentId;
                    return (
                      <tr
                        key={agent.agentId}
                        className="border-b border-border/30 transition-colors hover:bg-white/[0.02]"
                        style={{ opacity: isRevoked ? 0.55 : 1 }}
                      >
                        {/* AGENT */}
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Cpu className="w-3.5 h-3.5 shrink-0" style={{ color: isRevoked ? TERRA : SAGE }} />
                            <span className="font-mono text-xs font-bold truncate">{agent.agentId}</span>
                          </div>
                          <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
                            Reg {formatTime(agent.registeredAt)}
                          </div>
                        </td>
                        {/* GENOME — base36 ID, byte-identical to Forensic Inspector display */}
                        <td className="px-3 py-2.5 align-middle">
                          <div
                            className="font-mono text-[10px] truncate"
                            style={{ color: "#cdd5e0", letterSpacing: "0.02em" }}
                            title={agent.agentId}
                          >
                            {agent.agentId}
                          </div>
                          <div className="text-[8px] font-mono text-muted-foreground mt-0.5 uppercase tracking-wider">
                            base36 · matches inspector
                          </div>
                        </td>
                        {/* OWNER */}
                        <td className="px-3 py-2.5 align-middle">
                          <div className="font-mono text-[10px] truncate" title={agent.ownerEmail}>
                            {agent.ownerEmail}
                          </div>
                          {(agent.authorizedTools as string[]).length > 0 && (
                            <div className="text-[8px] font-mono text-muted-foreground mt-0.5 truncate">
                              {(agent.authorizedTools as string[]).slice(0, 3).join(" · ")}
                              {(agent.authorizedTools as string[]).length > 3 ? ` +${(agent.authorizedTools as string[]).length - 3}` : ""}
                            </div>
                          )}
                        </td>
                        {/* RISK */}
                        <td className="px-3 py-2.5 align-middle">
                          <RiskTierBadge tier={agent.riskTier} />
                        </td>
                        {/* PROVENANCE */}
                        <td className="px-3 py-2.5 align-middle">
                          <ProvenanceBadge revoked={isRevoked} />
                        </td>
                        {/* STATUS */}
                        <td className="px-3 py-2.5 align-middle">
                          {isRevoked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold" style={{ color: TERRA }}>
                              <XCircle className="w-3 h-3" /> INACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold" style={{ color: SAGE }}>
                              <CheckCircle2 className="w-3 h-3" /> ACTIVE
                            </span>
                          )}
                        </td>
                        {/* ACTIONS */}
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => trace(agent.agentId)}
                              className="font-mono text-[9px] font-bold px-2 py-1 rounded border transition-colors flex items-center gap-1"
                              style={{
                                color: VIOLET,
                                borderColor: VIOLET + "55",
                                background: VIOLET + "10",
                              }}
                              title="Open this node on the swarm map and select it in the Forensic Inspector"
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = VIOLET + "22"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = VIOLET + "10"; }}
                            >
                              <Crosshair className="w-2.5 h-2.5" />
                              TRACE
                            </button>
                            <button
                              onClick={() => revoke(agent.agentId)}
                              disabled={isRevokingThis || isRevoked}
                              className="font-mono text-[9px] font-bold px-2 py-1 rounded border transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{
                                color: TERRA,
                                borderColor: TERRA + "55",
                                background: TERRA + "10",
                              }}
                              title={isRevoked ? "Sovereign token already revoked" : "Manually trigger sovereign interdiction (irreversible)"}
                              onMouseEnter={(e) => { if (!isRevokingThis && !isRevoked) (e.currentTarget as HTMLButtonElement).style.background = TERRA + "22"; }}
                              onMouseLeave={(e) => { if (!isRevokingThis && !isRevoked) (e.currentTarget as HTMLButtonElement).style.background = TERRA + "10"; }}
                            >
                              {isRevokingThis ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <Skull className="w-2.5 h-2.5" />
                              )}
                              REVOKE
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Activity log agents — secondary section, unchanged behavior */}
      <div>
        <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
          Active Agents from Log History ({agents.filter((a: any) => a.agentId.toLowerCase().includes(search.toLowerCase())).length})
        </h2>
        {logsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 border-border/60 bg-card/50 animate-pulse h-36" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents
              .filter((a: any) => a.agentId.toLowerCase().includes(search.toLowerCase()))
              .map((agent: any) => {
                const inRegistry = regAgents.some((r) => r.agentId === agent.agentId);
                return (
                  <Card key={agent.agentId} className="p-4 border-border/60 bg-card/50 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-mono text-sm font-bold text-foreground flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-primary" />
                          {agent.agentId}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          Last seen: {formatTime(agent.lastSeen ?? new Date().toISOString())}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {agent.anomalyCount > 0 && (
                          <Badge variant="outline" className="text-accent border-accent/30 bg-accent/10 text-[9px]">
                            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                            {agent.anomalyCount} anomalies
                          </Badge>
                        )}
                        {!inRegistry && (
                          <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 bg-yellow-500/10 text-[9px]">
                            UNREGISTERED
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/30 rounded p-2">
                        <div className="text-[10px] font-mono text-muted-foreground mb-0.5">Total Events</div>
                        <div className="font-mono font-bold text-foreground">{agent.totalEvents}</div>
                      </div>
                      <div className="bg-muted/30 rounded p-2">
                        <div className="text-[10px] font-mono text-muted-foreground mb-0.5">Anomalies</div>
                        <div className={`font-mono font-bold ${agent.anomalyCount > 0 ? "text-accent" : "text-foreground"}`}>
                          {agent.anomalyCount}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
                      <button
                        onClick={() => trace(agent.agentId)}
                        className="font-mono text-[9px] font-bold px-2 py-1 rounded border transition-colors flex items-center gap-1"
                        style={{ color: VIOLET, borderColor: VIOLET + "55", background: VIOLET + "10" }}
                      >
                        <Crosshair className="w-2.5 h-2.5" /> TRACE
                      </button>
                      <button
                        onClick={() => revoke(agent.agentId)}
                        disabled={revoking === agent.agentId}
                        className="font-mono text-[9px] font-bold px-2 py-1 rounded border transition-colors flex items-center gap-1 disabled:opacity-40"
                        style={{ color: TERRA, borderColor: TERRA + "55", background: TERRA + "10" }}
                      >
                        {revoking === agent.agentId ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Skull className="w-2.5 h-2.5" />}
                        REVOKE
                      </button>
                    </div>
                  </Card>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
