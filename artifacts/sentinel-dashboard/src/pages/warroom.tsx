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
  Users,
  FileText,
  Power,
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
  status: "PENDING" | "AUTHORIZED" | "BLOCKED" | "AUTO_BLOCKED";
  sessionHealthScore: number;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
}

function useAuthRequests() {
  const [requests, setRequests] = useState<AuthRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const r = await fetch(`${BASE}/api/v1/authorize/history`);
    const d = await r.json();
    setRequests(d.requests ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // WebSocket updates
  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}${BASE}/api/v1/ws`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "auth_request" || msg.type === "auth_resolved" || msg.type === "pending_approval") {
        refresh();
      }
    };
    return () => ws.close();
  }, [refresh]);

  return { requests, loading, refresh };
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

async function resolve(id: string, decision: "AUTHORIZED" | "BLOCKED") {
  await fetch(`${BASE}/api/v1/authorize/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, resolvedBy: "admin-dashboard" }),
  });
}

function StatusBadge({ status }: { status: AuthRequest["status"] }) {
  const map = {
    PENDING: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    AUTHORIZED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    BLOCKED: "bg-destructive/15 text-destructive border-destructive/30",
    AUTO_BLOCKED: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${map[status]}`}>
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

export default function WarRoomPage() {
  const { requests, loading, refresh } = useAuthRequests();
  const { active: killActive, toggle: toggleKill } = useKillSwitch();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "PENDING");
  const history = requests.filter((r) => r.status !== "PENDING");

  const handleResolve = async (id: string, decision: "AUTHORIZED" | "BLOCKED") => {
    setResolvingId(id);
    await resolve(id, decision);
    await refresh();
    setResolvingId(null);
  };

  const articleFourteen = requests.filter((r) => r.resolvedBy && r.resolvedBy !== "sentinel-auto");

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

        {/* Kill-Switch */}
        <button
          onClick={toggleKill}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-mono text-sm font-bold transition-all ${
            killActive
              ? "bg-destructive text-white border-destructive hover:bg-destructive/80 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
              : "bg-card border-destructive/50 text-destructive hover:bg-destructive/10"
          }`}
        >
          <Power className={`w-4 h-4 ${killActive ? "animate-pulse" : ""}`} />
          {killActive ? "KILL-SWITCH ACTIVE — Click to Deactivate" : "Activate Global Kill-Switch"}
        </button>
      </div>

      {killActive && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-destructive mt-0.5 shrink-0 animate-pulse" />
          <div>
            <div className="font-mono text-sm font-bold text-destructive">GLOBAL KILL-SWITCH ACTIVE</div>
            <div className="text-xs text-muted-foreground font-mono mt-1">
              All agent sessions have been revoked. POST /v1/log and /v1/authorize requests from any agent
              will be blocked until deactivated.
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
          { label: "Blocked", value: requests.filter(r => r.status === "BLOCKED" || r.status === "AUTO_BLOCKED").length, icon: XCircle, color: "text-destructive" },
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
                    <th key={h} className="text-left px-4 py-2.5 text-muted-foreground uppercase tracking-wider text-[10px] font-medium">
                      {h}
                    </th>
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

      {/* Recent authorization history */}
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
                    <th key={h} className="text-left px-4 py-2.5 text-muted-foreground uppercase tracking-wider text-[10px] font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 30).map((req) => (
                  <tr key={req.id} className="border-b border-border/30 hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-foreground">{req.agentId}</td>
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
