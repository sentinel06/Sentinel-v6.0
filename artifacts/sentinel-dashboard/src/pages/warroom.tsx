import React, { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  Zap,
  FileText,
  Power,
  Skull,
  Lock,
  Download,
} from "lucide-react";
import { formatTime } from "@/lib/audit-utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AuthRequest {
  id: string;
  agentId: string;
  traceId: string;
  intent: string;
  proposedAction: string;
  actionType: string;
  status: "PENDING" | "AUTHORIZED" | "BLOCKED" | "AUTO_BLOCKED" | "HONEYPOT_BREACH";
  sessionHealthScore: number;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
}

function useAuthRequests() {
  const [requests, setRequests] = useState<AuthRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [criticalBreaches, setCriticalBreaches] = useState<AuthRequest[]>([]);

  const refresh = useCallback(async () => {
    const r = await fetch(`${BASE}/api/v1/authorize/history`);
    const d = await r.json();
    const all: AuthRequest[] = d.requests ?? [];
    setRequests(all);
    setCriticalBreaches(all.filter((r) => r.status === ("HONEYPOT_BREACH" as any) || (r.notes ?? "").includes("CRITICAL BREACH")));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}${BASE}/api/v1/ws`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "auth_request" || msg.type === "auth_resolved" || msg.type === "pending_approval" || msg.type === "honeypot_breach") {
        refresh();
      }
    };
    return () => ws.close();
  }, [refresh]);

  return { requests, loading, refresh, criticalBreaches };
}

function useKillSwitch() {
  const [active, setActive] = useState(false);

  const check = useCallback(async () => {
    const r = await fetch(`${BASE}/api/v1/admin/kill-switch`);
    const d = await r.json();
    setActive(d.active);
  }, []);

  useEffect(() => { check(); }, [check]);

  const toggle = async () => {
    await fetch(`${BASE}/api/v1/admin/kill-switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate: !active, resolvedBy: "admin-dashboard" }),
    });
    await check();
  };

  return { active, toggle };
}

async function resolveRequest(id: string, decision: "AUTHORIZED" | "BLOCKED") {
  await fetch(`${BASE}/api/v1/authorize/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, resolvedBy: "admin-dashboard" }),
  });
}

function StatusBadge({ status }: { status: AuthRequest["status"] }) {
  const map: Record<string, string> = {
    PENDING: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    AUTHORIZED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    BLOCKED: "bg-destructive/15 text-destructive border-destructive/30",
    AUTO_BLOCKED: "bg-destructive/15 text-destructive border-destructive/30",
    HONEYPOT_BREACH: "bg-red-900/30 text-red-300 border-red-500/50",
  };
  const icons: Record<string, React.ReactNode> = {
    HONEYPOT_BREACH: <Skull className="w-2.5 h-2.5 mr-0.5 inline" />,
    AUTO_BLOCKED: <Lock className="w-2.5 h-2.5 mr-0.5 inline" />,
  };
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border inline-flex items-center ${map[status] ?? map.BLOCKED}`}>
      {icons[status]}
      {status}
    </span>
  );
}

function HealthBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-400" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-mono font-bold ${pct >= 70 ? "text-emerald-400" : pct >= 50 ? "text-yellow-400" : "text-destructive"}`}>
        {pct}%
      </span>
    </div>
  );
}

function HoneypotBreachCard({ breach }: { breach: AuthRequest }) {
  return (
    <div className="relative overflow-hidden rounded-lg border-2 border-red-500/60 bg-red-950/20 p-4 animate-pulse-once">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-600 via-red-400 to-red-600" />
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 border border-red-500/40">
          <Skull className="w-5 h-5 text-red-400 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-red-300">CRITICAL BREACH</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-500/40">
              {breach.agentId}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-red-400 border border-red-600/40">
              honey-token: {breach.actionType}
            </span>
          </div>
          <p className="text-[11px] font-mono text-red-400/80 mt-1.5 leading-relaxed">{breach.notes}</p>
          <div className="text-[10px] font-mono text-red-600/70 mt-1.5 flex items-center gap-2">
            <Lock className="w-2.5 h-2.5" />
            Agent permanently revoked · {formatTime(breach.requestedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadPDFButton({ agentId }: { agentId?: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (agentId) params.set("agentId", agentId);
    const url = `${BASE}/api/v1/export/audit-pdf?${params.toString()}`;
    const r = await fetch(url);
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sentinel-audit-${agentId ?? "full"}-${new Date().toISOString().split("T")[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    setLoading(false);
  };

  return (
    <Button onClick={handleDownload} disabled={loading} variant="outline" size="sm"
      className="font-mono text-xs border-primary/30 hover:bg-primary/10 gap-1.5">
      <Download className="w-3.5 h-3.5 text-primary" />
      {loading ? "Generating PDF…" : "Export Evidence Bag (PDF)"}
    </Button>
  );
}

export default function WarRoomPage() {
  const { requests, loading, refresh, criticalBreaches } = useAuthRequests();
  const { active: killActive, toggle: toggleKill } = useKillSwitch();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "PENDING");
  const history = requests.filter((r) => r.status !== "PENDING");
  const articleFourteen = requests.filter((r) => r.resolvedBy && r.resolvedBy !== "sentinel-auto" && r.resolvedBy !== "sentinel-honeypot");

  const handleResolve = async (id: string, decision: "AUTHORIZED" | "BLOCKED") => {
    setResolvingId(id);
    await resolveRequest(id, decision);
    await refresh();
    setResolvingId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-destructive" />
            Governance War Room
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Active circuit breaker · Human-in-the-loop approvals · EU AI Act Art. 14
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DownloadPDFButton />
          <button
            onClick={toggleKill}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-mono text-sm font-bold transition-all ${
              killActive
                ? "bg-destructive text-white border-destructive hover:bg-destructive/80 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                : "bg-card border-destructive/50 text-destructive hover:bg-destructive/10"
            }`}
          >
            <Power className={`w-4 h-4 ${killActive ? "animate-pulse" : ""}`} />
            {killActive ? "KILL-SWITCH ACTIVE" : "Activate Kill-Switch"}
          </button>
        </div>
      </div>

      {/* CRITICAL BREACH ALERTS ─ honeypot trap activations */}
      {criticalBreaches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-400 uppercase tracking-widest">
            <Skull className="w-3.5 h-3.5" />
            CRITICAL SECURITY BREACH — HONEY-TOKEN TRAP ACTIVATED ({criticalBreaches.length})
          </div>
          {criticalBreaches.map((breach) => (
            <HoneypotBreachCard key={breach.id} breach={breach} />
          ))}
        </div>
      )}

      {killActive && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-destructive mt-0.5 shrink-0 animate-pulse" />
          <div>
            <div className="font-mono text-sm font-bold text-destructive">GLOBAL KILL-SWITCH ACTIVE</div>
            <div className="text-xs text-muted-foreground font-mono mt-1">
              All agent sessions have been revoked. POST /v1/log and /v1/authorize from any agent will be blocked.
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Pending Approvals", value: pending.length, icon: Clock, color: "text-yellow-400" },
          { label: "Total Requests", value: requests.length, icon: Activity, color: "text-primary" },
          { label: "Authorized", value: requests.filter(r => r.status === "AUTHORIZED").length, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Blocked / Breach", value: requests.filter(r => ["BLOCKED", "AUTO_BLOCKED", "HONEYPOT_BREACH"].includes(r.status)).length, icon: XCircle, color: "text-destructive" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4 border-border/60 bg-card/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
          </Card>
        ))}
      </div>

      {/* Pending Approvals */}
      <Card className="border-border/60 bg-card/50">
        <div className="p-4 border-b border-border/60 flex items-center justify-between">
          <h2 className="font-mono text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            PENDING APPROVALS
          </h2>
          {pending.length > 0 && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-mono text-[10px]">
              {pending.length} awaiting
            </Badge>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="p-8 text-center font-mono text-sm text-muted-foreground">
            <ShieldCheck className="w-8 h-8 mx-auto mb-3 opacity-20" />
            No pending authorization requests
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {pending.map((req) => (
              <div key={req.id} className="p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-foreground">{req.agentId}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/30">
                        {req.actionType}
                      </span>
                      <StatusBadge status={req.status} />
                    </div>
                    {req.notes && (
                      <div className="text-[10px] font-mono px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                        {req.notes}
                      </div>
                    )}
                    <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                      <span className="text-foreground/70">Intent: </span>{req.intent}
                    </p>
                    <p className="text-xs font-mono text-destructive/80">
                      <span className="text-muted-foreground">Proposed: </span>{req.proposedAction}
                    </p>
                    <div className="w-48">
                      <div className="text-[10px] font-mono text-muted-foreground mb-1">Session Health</div>
                      <HealthBar score={req.sessionHealthScore ?? 1} />
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {formatTime(req.requestedAt)} · Trace: {req.traceId}
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs"
                      onClick={() => handleResolve(req.id, "AUTHORIZED")}
                      disabled={resolvingId === req.id}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 font-mono text-xs"
                      onClick={() => handleResolve(req.id, "BLOCKED")}
                      disabled={resolvingId === req.id}
                    >
                      <XCircle className="w-3 h-3 mr-1" />
                      Deny
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Article 14 — Human Interventions */}
      <Card className="border-border/60 bg-card/50">
        <div className="p-4 border-b border-border/60 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="font-mono text-sm font-medium">EU AI ACT ART. 14 — HUMAN INTERVENTION LOG</h2>
          <Badge variant="outline" className="font-mono text-[10px] ml-auto">{articleFourteen.length} records</Badge>
          <DownloadPDFButton />
        </div>

        {articleFourteen.length === 0 ? (
          <div className="p-8 text-center font-mono text-sm text-muted-foreground">
            No human interventions recorded yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["Agent", "Action Type", "Decision", "Resolved By", "Time", "Notes"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-muted-foreground uppercase tracking-wider text-[10px] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {articleFourteen.slice(0, 50).map((req) => (
                  <tr key={req.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-2.5 text-foreground">{req.agentId}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{req.actionType}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={req.status} /></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{req.resolvedBy ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{req.resolvedAt ? formatTime(req.resolvedAt) : "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-48">{req.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Authorization history */}
      {history.length > 0 && (
        <Card className="border-border/60 bg-card/50">
          <div className="p-4 border-b border-border/60 flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-mono text-sm font-medium">AUTHORIZATION HISTORY</h2>
            <Badge variant="outline" className="font-mono text-[10px] ml-auto">{history.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["Agent", "Action Type", "Session Health", "Status", "Requested", "Notes"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-muted-foreground uppercase tracking-wider text-[10px] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 30).map((req) => (
                  <tr key={req.id} className={`border-b border-border/30 hover:bg-muted/10 ${req.status === ("HONEYPOT_BREACH" as any) || (req.notes ?? "").includes("CRITICAL BREACH") ? "bg-red-950/10" : ""}`}>
                    <td className="px-4 py-2.5 text-foreground flex items-center gap-1.5">
                      {((req.notes ?? "").includes("CRITICAL BREACH")) && <Skull className="w-3 h-3 text-red-400 shrink-0" />}
                      {req.agentId}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{req.actionType}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-bold ${(req.sessionHealthScore ?? 1) >= 0.7 ? "text-emerald-400" : "text-destructive"}`}>
                        {Math.round((req.sessionHealthScore ?? 1) * 100)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={req.status} /></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatTime(req.requestedAt)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-40">{req.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
