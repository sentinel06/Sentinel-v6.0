import React, { useState } from "react";
import { useGetAgents } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/audit-utils";
import {
  Cpu,
  AlertTriangle,
  Activity,
  Search,
  ShieldCheck,
  ShieldAlert,
  Plus,
  CheckCircle2,
  XCircle,
  Edit2,
  Loader2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  const [toggling, setToggling] = useState<string | null>(null);

  const agents = agentData?.agents || [];

  const filteredReg = regAgents.filter(
    (a) =>
      a.agentId.toLowerCase().includes(search.toLowerCase()) ||
      a.ownerEmail.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleActive = async (agentId: string, current: boolean) => {
    setToggling(agentId);
    await fetch(`${BASE}/api/v1/registry/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
    await refresh();
    setToggling(null);
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
            Agent Registry
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Governed identity management · authorized tools · risk tiers
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

      {/* Governance registry */}
      {filteredReg.length > 0 && (
        <div>
          <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
            Governance Registry ({filteredReg.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredReg.map((agent) => (
              <Card
                key={agent.agentId}
                className={`border p-4 space-y-3 ${agent.isActive ? "border-border/60 bg-card/50" : "border-border/30 bg-card/20 opacity-60"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-bold text-foreground truncate">{agent.agentId}</div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{agent.ownerEmail}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <RiskTierBadge tier={agent.riskTier} />
                    {agent.isActive ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {(agent.authorizedTools as string[]).length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
                      Authorized Tools
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(agent.authorizedTools as string[]).map((tool) => (
                        <span key={tool} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-muted-foreground">
                  <div>
                    <div className="uppercase tracking-wider mb-0.5">Budget / Trace</div>
                    <div className="text-foreground">{agent.maxBudgetPerTrace ? `$${agent.maxBudgetPerTrace}` : "Unlimited"}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wider mb-0.5">Registered</div>
                    <div className="text-foreground">{formatTime(agent.registeredAt)}</div>
                  </div>
                </div>

                <div className="pt-1 border-t border-border/40">
                  <button
                    onClick={() => toggleActive(agent.agentId, agent.isActive)}
                    disabled={toggling === agent.agentId}
                    className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                      agent.isActive
                        ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                        : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                  >
                    {toggling === agent.agentId ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : agent.isActive ? (
                      <XCircle className="w-2.5 h-2.5" />
                    ) : (
                      <CheckCircle2 className="w-2.5 h-2.5" />
                    )}
                    {agent.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Activity log agents */}
      <div>
        <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
          Active Agents from Log History ({agents.filter((a) => a.agentId.toLowerCase().includes(search.toLowerCase())).length})
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
              .filter((a) => a.agentId.toLowerCase().includes(search.toLowerCase()))
              .map((agent) => {
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
                          Last seen: {formatTime((agent as any).lastSeen ?? new Date().toISOString())}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {(agent as any).anomalyCount > 0 && (
                          <Badge variant="outline" className="text-accent border-accent/30 bg-accent/10 text-[9px]">
                            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                            {(agent as any).anomalyCount} anomalies
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
                        <div className="font-mono font-bold text-foreground">{(agent as any).totalEvents}</div>
                      </div>
                      <div className="bg-muted/30 rounded p-2">
                        <div className="text-[10px] font-mono text-muted-foreground mb-0.5">Anomalies</div>
                        <div className={`font-mono font-bold ${(agent as any).anomalyCount > 0 ? "text-accent" : "text-foreground"}`}>
                          {(agent as any).anomalyCount}
                        </div>
                      </div>
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
