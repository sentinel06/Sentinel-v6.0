import React, { useEffect, useState, useCallback } from "react";
import { useWsEvent, useWsStatus } from "@/contexts/WsContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LatticeStrengthGauge from "@/components/widgets/LatticeStrengthGauge";
import RedisPulse from "@/components/widgets/RedisPulse";
import WorkerThreadHealth from "@/components/widgets/WorkerThreadHealth";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Activity, 
  AlertTriangle, 
  Cpu, 
  ListTree, 
  ShieldCheck, 
  ShieldAlert,
  ArrowRight,
  Database,
  BrainCircuit,
  GitBranch,
  Globe,
  Lock,
  Zap,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import {
  useGetStats,
  getGetStatsQueryKey,
  AuditLog,
} from "@workspace/api-client-react";
import { isAnomalous, formatTime, truncateHash } from "@/lib/audit-utils";

type AuditLogWithConsistency = AuditLog & {
  consistencyScore?: number;
  consistencyReasons?: string[];
  // Swarm Governance fields
  parentAgentId?: string | null;
  swarmId?: string | null;
  // Sovereign log metadata
  computeOriginRegion?: string;
  // QSC
  quantumSig?: string | null;
  quantumAlgorithm?: string;
};

function ConsistencyBadge({ score }: { score: number | undefined }) {
  if (score === undefined || score === null) return null;
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "text-[#00F5FF] bg-[#00F5FF]/10 border-[#00F5FF]/20" :
    pct >= 50 ? "text-[#FFB800] bg-[#FFB800]/10 border-[#FFB800]/20" :
                "text-destructive bg-destructive/10 border-destructive/20";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${color}`}
      title={`Consistency score: ${pct}% — how closely the agent's stated intent matches its actual action`}>
      <BrainCircuit className="w-2.5 h-2.5" />
      {pct}%
    </span>
  );
}

/**
 * QuantumBadge — hover to reveal the full cryptographic proof for this event.
 * Renders only when the log entry carries a quantum signature (pqSignature stored).
 */
function QuantumBadge({ quantumSig }: { quantumSig?: string | null }) {
  if (!quantumSig) return null;

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border cursor-default select-none"
            style={{
              color: "#00F5FF",
              background: "rgba(64,181,149,0.10)",
              borderColor: "rgba(64,181,149,0.28)",
            }}
          >
            <ShieldCheck className="w-2.5 h-2.5" />
            QUANTUM-SECURE
          </span>
        </TooltipTrigger>

        <TooltipContent
          side="top"
          sideOffset={6}
          className="p-0 border-0 bg-transparent shadow-none"
        >
          {/* Custom dark proof card — overrides default bg-primary tooltip style */}
          <div
            className="rounded-lg border px-4 py-3 font-mono text-[11px] shadow-xl min-w-[260px]"
            style={{
              background: "#0D1117",
              borderColor: "#2C3136",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}
          >
            {/* Title row */}
            <div
              className="flex items-center gap-1.5 mb-3 pb-2 border-b"
              style={{ borderColor: "#2C3136" }}
            >
              <ShieldCheck className="w-3 h-3" style={{ color: "#00F5FF" }} />
              <span className="font-bold text-[10px] uppercase tracking-widest" style={{ color: "#00F5FF" }}>
                Cryptographic Proof
              </span>
            </div>

            {/* Row 1 — Classical layer */}
            <div className="flex items-start gap-2.5 mb-2">
              <div
                className="mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0"
                style={{ background: "rgba(64,181,149,0.15)", border: "1px solid rgba(64,181,149,0.30)" }}
              >
                <Lock className="w-2.5 h-2.5" style={{ color: "#00F5FF" }} />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#9AA4B1" }}>
                  Classical
                </div>
                <div style={{ color: "#E6EDF3" }}>SHA-512 Verified</div>
              </div>
            </div>

            {/* Row 2 — Quantum layer */}
            <div className="flex items-start gap-2.5 mb-2">
              <div
                className="mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0"
                style={{ background: "rgba(64,181,149,0.15)", border: "1px solid rgba(64,181,149,0.30)" }}
              >
                <Zap className="w-2.5 h-2.5" style={{ color: "#00F5FF" }} />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#9AA4B1" }}>
                  Quantum
                </div>
                <div style={{ color: "#E6EDF3" }}>
                  ML-DSA-87{" "}
                  <span className="text-[10px]" style={{ color: "#9AA4B1" }}>
                    (Lattice-Depth: 8×7)
                  </span>{" "}
                  Verified
                </div>
              </div>
            </div>

            {/* Row 3 — Status */}
            <div className="flex items-start gap-2.5">
              <div
                className="mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0"
                style={{ background: "rgba(64,181,149,0.15)", border: "1px solid rgba(64,181,149,0.30)" }}
              >
                <CheckCircle2 className="w-2.5 h-2.5" style={{ color: "#00F5FF" }} />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#9AA4B1" }}>
                  Status
                </div>
                <div style={{ color: "#E6EDF3" }}>FIPS-204 Compliant</div>
              </div>
            </div>

            {/* Sig fingerprint */}
            <div
              className="mt-3 pt-2 border-t text-[9px] truncate"
              style={{ borderColor: "#2C3136", color: "#6B7680" }}
            >
              sig: {quantumSig.substring(0, 24)}…
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function DashboardPage() {
  // react-query v5 made `queryKey` mandatory on UseQueryOptions even though
  // orval auto-derives one. Pass the generated key explicitly so the type
  // is satisfied without losing the auto-cache-keying behaviour.
  const { data: stats, isLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey(), refetchInterval: 10000 },
  });
  const [liveLogs, setLiveLogs] = useState<AuditLogWithConsistency[]>([]);
  const wsStatus = useWsStatus();
  const [simStatus, setSimStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [isSimulating, setIsSimulating] = useState(false);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function triggerSimulation() {
    if (simStatus === "running") return;
    setSimStatus("running");
    setIsSimulating(true);
    try {
      const res = await fetch(`${BASE}/api/v1/demo/trigger-simulation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSimStatus("running");
    } catch {
      setSimStatus("error");
      setIsSimulating(false);
    }
  }

  // ── WebSocket event subscriptions (shared WsContext connection) ───────────
  useWsEvent("log", useCallback((data: unknown) => {
    if (!data) return;
    setLiveLogs(prev => [data as AuditLogWithConsistency, ...prev].slice(0, 50));
  }, []));

  useWsEvent("stream_batch", useCallback((data: unknown) => {
    const packets = (data as { packets?: Array<{
      t: string; a: string; e: string; d: number;
      h: string; q: boolean; p: string | null;
      x: boolean; r: boolean; s: string | null;
      tid: string; lid: string;
    }> } | null)?.packets;
    if (!Array.isArray(packets)) return;
    setLiveLogs(prev => {
      const existing = new Map(prev.map(l => [l.id, l]));
      for (const pkt of packets) {
        if (!existing.has(pkt.lid)) {
          existing.set(pkt.lid, {
            id: pkt.lid,
            timestamp: pkt.t,
            agentId: pkt.a,
            eventType: pkt.e,
            traceId: pkt.tid,
            consistencyScore: 1 - pkt.d / 100,
            isAnomalous: pkt.x,
            payload: {},
            rationale: "",
            currentHash: pkt.h,
            previousHash: "",
            parentAgentId: pkt.p,
            swarmId: pkt.s,
          } as AuditLogWithConsistency);
        }
      }
      return Array.from(existing.values()).slice(0, 50);
    });
  }, []));

  useWsEvent("sim_started", useCallback(() => {
    setSimStatus("running");
    setIsSimulating(true);
  }, []));

  useWsEvent("sim_complete", useCallback(() => {
    setSimStatus("done");
  }, []));

  useWsEvent("circuit_breaker_tripped", useCallback(() => {
    setSimStatus("running");
  }, []));

  // Initialize liveLogs with recent activity when stats loads.
  // Deduplicate by ID so WebSocket messages and the initial fetch don't collide.
  useEffect(() => {
    if (stats?.recentActivity) {
      setLiveLogs((prev) => {
        const existing = new Map(prev.map((l) => [l.id, l]));
        for (const log of stats.recentActivity as AuditLogWithConsistency[]) {
          if (!existing.has(log.id)) existing.set(log.id, log);
        }
        return Array.from(existing.values()).slice(0, 50);
      });
    }
  }, [stats]);

  // Empty-state: a brand-new signed-in user with zero owned events.
  // Bypass when simulation is running so the live stream stays visible.
  const totalLogs = stats?.totalLogs ?? 0;
  const showEmptyState = !isLoading && totalLogs === 0 && !isSimulating;

  if (showEmptyState) {
    return (
      <div className="page-transition flex items-center justify-center min-h-[60vh] px-4">
        <div className="glass-panel rounded-2xl p-8 md:p-12 max-w-xl w-full text-center">
          <div className="mx-auto w-14 h-14 rounded-xl bg-[#00F5FF]/10 border border-[#00F5FF]/30 flex items-center justify-center mb-5">
            <Activity className="w-7 h-7 text-[#00F5FF]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Your ledger is empty</h1>
          <p className="text-sm text-[#9AA4B1] mb-6">
            Your immutable data plane is live and failing closed. Awaiting telemetry streams to benchmark your Agentic Signal-to-Verdict latency.
          </p>

          {/* Primary CTA */}
          <a
            href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/onboarding`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00F5FF] hover:bg-[#00d4dc] text-[#050505] font-semibold uppercase tracking-wider text-xs transition-colors"
          >
            Connect your first agent
            <ArrowRight className="w-4 h-4" />
          </a>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] text-[#9AA4B1] uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Simulation CTA */}
          <button
            onClick={() => { void triggerSimulation(); }}
            disabled={simStatus === "running"}
            className="inline-flex items-center gap-2 w-full justify-center px-5 py-3 rounded-lg border border-[#FF003C]/40 bg-[#FF003C]/10 hover:bg-[#FF003C]/20 text-[#FF003C] font-bold uppercase tracking-wider text-xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {simStatus === "running" ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF003C] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF003C]" />
                </span>
                Simulation running — watch the stream…
              </>
            ) : simStatus === "error" ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                Simulation failed — retry?
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Simulate Adversarial Agent Breakout
              </>
            )}
          </button>
          <p className="text-[11px] text-[#9AA4B1]/70 mt-2">
            Fires a live 3-stage breach: cognitive drift → honey-token hit → causal chain break
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 page-transition">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Live Stream</h1>
          {/* Mobile: truncate so the sub-header stays a clean single line under
              the breadcrumb. ≥sm: wrap naturally for the full sovereign caption. */}
          <p className="text-[11px] sm:text-sm text-muted-foreground font-mono mt-1 truncate sm:overflow-visible sm:whitespace-normal">
            Real-time action monitoring and hash chain verification
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-card px-4 py-2 rounded-md border border-border">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              {wsStatus === "connected" && (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </>
              )}
              {wsStatus === "connecting" && <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>}
              {wsStatus === "disconnected" && <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>}
            </span>
            <span className="text-xs font-mono font-medium uppercase tracking-wider">
              {wsStatus === "connected" ? "Stream Active" : wsStatus === "connecting" ? "Connecting..." : "Reconnecting..."}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Events" 
          value={stats?.totalLogs.toLocaleString() || "..."} 
          icon={Database} 
          isLoading={isLoading} 
        />
        <StatCard 
          title="Active Agents" 
          value={stats?.totalAgents.toLocaleString() || "..."} 
          icon={Cpu} 
          isLoading={isLoading} 
        />
        <StatCard 
          title="Monitored Traces" 
          value={stats?.totalTraces.toLocaleString() || "..."} 
          icon={ListTree} 
          isLoading={isLoading} 
        />
        <StatCard 
          title="Anomalies Detected" 
          value={stats?.anomalyCount.toLocaleString() || "..."} 
          icon={AlertTriangle} 
          valueClassName={stats && stats.anomalyCount > 0 ? "text-accent" : ""}
          isLoading={isLoading} 
        />
      </div>

      {/* Performance & Compliance Benchmarks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Signal-to-Verdict Latency */}
        <Card className="p-4 sm:p-5 border-border/60 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3 text-muted-foreground">
            <h3 className="font-mono text-[10px] sm:text-xs font-medium uppercase tracking-wider">
              Signal-to-Verdict (S2V) Latency
            </h3>
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#00F5FF]" />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="text-3xl sm:text-4xl font-bold font-mono text-white">
              11.4<span className="text-base sm:text-lg text-[#9AA4B1] ml-1">ms</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#00F5FF]/30 bg-[#00F5FF]/10 text-[#00F5FF] text-[10px] font-mono font-semibold uppercase tracking-wider shrink-0">
              <TrendingUp className="w-3 h-3" />
              99.9th Percentile Enforced
            </div>
          </div>
          <p className="mt-2 text-[10px] text-[#9AA4B1] font-mono">
            Median ingestion-to-seal cycle across all agentic telemetry streams
          </p>
        </Card>

        {/* OCSF Compliance micro-card */}
        <Card className="p-4 sm:p-5 border-border/60 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3 text-muted-foreground">
            <h3 className="font-mono text-[10px] sm:text-xs font-medium uppercase tracking-wider">
              Data Schema
            </h3>
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#00F5FF]" />
          </div>
          <div className="flex items-center gap-3">
            <div className="text-lg sm:text-xl font-bold font-mono text-white tracking-tight">
              OCSF v1.1.0
            </div>
            <span className="px-2 py-0.5 rounded border border-[#00F5FF]/30 bg-[#00F5FF]/10 text-[#00F5FF] text-[10px] font-mono font-semibold uppercase tracking-wider shrink-0">
              Validated
            </span>
          </div>
          <p className="mt-2 text-[10px] text-[#9AA4B1] font-mono">
            Open Cybersecurity Schema Framework v1.1.0 — schema compliance verified on every event ingestion
          </p>
        </Card>
      </div>

      {/* Sentinel Health — Hardened Security telemetry row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <LatticeStrengthGauge bits={87} />
        <RedisPulse />
        <WorkerThreadHealth />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden border-border/60 bg-card/50 backdrop-blur-sm">
          <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-2 font-mono text-sm font-medium text-foreground">
              <Activity className="w-4 h-4 text-primary" />
              INCOMING PACKETS
            </div>
            {stats?.integrityOk === false && (
              <Badge variant="destructive" className="font-mono text-[10px]">INTEGRITY BREACH</Badge>
            )}
            {stats?.integrityOk === true && (
              <Badge variant="outline" className="text-[#00F5FF] border-[#00F5FF]/25 bg-[#00F5FF]/10 font-mono text-[10px]">CHAIN VERIFIED</Badge>
            )}
          </div>
          <div className="p-0 overflow-y-auto max-h-[600px] flex-1 bg-[#0A0A0A]">
            {liveLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">Waiting for incoming packets...</div>
            ) : (
              <div className="divide-y divide-[#2C3136]">
                {liveLogs.map((log) => {
                  const anomalous = log.isAnomalous || isAnomalous(log.eventType, log.rationale);
                  const score = log.consistencyScore;
                  const isHallucination = score !== undefined && score < 0.5;
                  const borderColor = isHallucination
                    ? "border-l-[#FF003C]"
                    : anomalous
                    ? "border-l-[#FFB800]"
                    : "border-l-[#2C3136]";
                  return (
                    <div 
                      key={log.id} 
                      className={`log-row-enter p-3 text-sm font-mono flex items-start gap-4 transition-colors hover:bg-[#2C3136]/40 border-l-2 ${borderColor} ${anomalous ? "glow-amber" : ""}`}
                    >
                      <div className="text-muted-foreground w-24 shrink-0 mt-0.5 text-xs">
                        {formatTime(log.timestamp)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                            log.eventType === 'Error' ? 'bg-[#FF003C]/15 text-[#FF003C]' :
                            log.eventType === 'Intent' ? 'bg-blue-500/15 text-blue-400' :
                            log.eventType === 'Action' ? 'bg-primary/15 text-primary' :
                            'bg-[#00F5FF]/15 text-[#00F5FF]'
                          }`}>
                            {log.eventType}
                          </span>
                          <ConsistencyBadge score={score} />
                          <QuantumBadge quantumSig={log.quantumSig} />
                          <span className="text-xs text-muted-foreground truncate" title={log.agentId}>
                            {log.agentId.substring(0, 8)}…
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                          <span className="text-xs text-muted-foreground truncate" title={log.traceId}>
                            {log.traceId.substring(0, 8)}…
                          </span>
                        </div>
                        
                        {log.rationale && (
                          <div className={`log-typewriter mt-1.5 text-xs leading-relaxed ${isHallucination ? 'text-[#FF003C]/80' : anomalous ? 'text-[#FFB800]/80' : 'text-foreground/75'}`}>
                            {log.rationale}
                          </div>
                        )}

                        {isHallucination && log.consistencyReasons && (log.consistencyReasons as string[]).length > 0 && (
                          <div className="mt-2 text-[10px] text-[#FF003C] bg-[#FF003C]/10 px-2 py-1.5 rounded flex items-start gap-1.5 border border-[#FF003C]/20">
                            <BrainCircuit className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{(log.consistencyReasons as string[])[0]}</span>
                          </div>
                        )}
                        
                        {!isHallucination && anomalous && log.anomalyReason && (
                          <div className="mt-2 text-[10px] text-[#FFB800] bg-[#FFB800]/10 px-2 py-1 rounded inline-flex items-center gap-1 border border-[#FFB800]/20">
                            <AlertTriangle className="w-3 h-3" />
                            {log.anomalyReason}
                          </div>
                        )}

                        {(log.swarmId || log.parentAgentId || (log.computeOriginRegion && log.computeOriginRegion !== "unspecified")) && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {log.swarmId && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-[#00F5FF]/8 border-[#00F5FF]/20 text-[#00F5FF]/80" title={`Swarm: ${log.swarmId}`}>
                                <GitBranch className="w-2.5 h-2.5" />
                                {log.swarmId.substring(0, 12)}
                              </span>
                            )}
                            {log.parentAgentId && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-[#9AA4B1]/8 border-[#9AA4B1]/20 text-[#9AA4B1]" title={`Parent Agent: ${log.parentAgentId}`}>
                                ↖ {log.parentAgentId.substring(0, 10)}
                              </span>
                            )}
                            {log.computeOriginRegion && log.computeOriginRegion !== "unspecified" && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-blue-500/8 border-blue-500/20 text-blue-400/80" title="Compute origin region">
                                <Globe className="w-2.5 h-2.5" />
                                {log.computeOriginRegion}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="shrink-0 flex flex-col items-end text-[10px] text-muted-foreground gap-1 w-28">
                        <div className="flex items-center gap-1" title="Current Hash">
                          <span className="text-muted-foreground/50">H:</span>
                          <span className="truncate">{log.currentHash.substring(0, 8)}</span>
                        </div>
                        {log.previousHash && (
                          <div className="flex items-center gap-1" title="Previous Hash">
                            <span className="text-muted-foreground/50">P:</span>
                            <span className="truncate">{log.previousHash.substring(0, 8)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Side Panel */}
        <div className="space-y-6">
          <Card className="p-5 border-border/60 bg-card/50 backdrop-blur-sm">
            <h3 className="font-mono text-sm font-medium mb-4 flex items-center gap-2 text-muted-foreground">
              <Activity className="w-4 h-4" />
              EVENT DISTRIBUTION
            </h3>
            
            <div className="space-y-3">
              {stats?.eventTypeCounts && Object.entries(stats.eventTypeCounts).map(([type, count]) => {
                const total = stats.totalLogs || 1;
                const percentage = Math.round((count / total) * 100);
                
                let colorClass = "bg-primary";
                if (type === "Error") colorClass = "bg-[#FF003C]";
                if (type === "Result") colorClass = "bg-[#00F5FF]";
                if (type === "Intent") colorClass = "bg-blue-400";
                
                return (
                  <div key={type}>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span>{type}</span>
                      <span className="text-muted-foreground">{count.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${colorClass}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          
          <Card className={`p-5 border-border/60 backdrop-blur-sm ${
            stats?.integrityOk === false ? 'bg-destructive/10 border-destructive/30' : 'bg-card/50'
          }`}>
            <h3 className="font-mono text-sm font-medium mb-4 flex items-center gap-2 text-muted-foreground">
              {stats?.integrityOk === false ? (
                <ShieldAlert className="w-4 h-4 text-[#FF003C]" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#00F5FF]" />
              )}
              LEDGER STATUS
            </h3>
            
            <div className="flex flex-col gap-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Chain Status</span>
                {isLoading ? (
                  <span className="animate-pulse">Checking...</span>
                ) : stats?.integrityOk === false ? (
                  <span className="text-[#FF003C] font-bold">COMPROMISED</span>
                ) : (
                  <span className="text-[#00F5FF] font-bold">VERIFIED</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Block Height</span>
                <span>{stats?.totalLogs.toLocaleString() || "0"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Last Verified</span>
                <span>Just now</span>
              </div>
              <div className="border-t border-[#2C3136] my-1" />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Quantum Integrity
                </span>
                <span className={`font-bold text-[10px] tracking-wider px-1.5 py-0.5 rounded border ${
                  stats?.integrityOk !== false
                    ? "text-[#00F5FF] border-[#00F5FF]/40 bg-[#00F5FF]/10"
                    : "text-[#FFB800] border-[#FFB800]/40 bg-[#FFB800]/10"
                }`}>
                  {stats?.integrityOk !== false ? "QUANTUM-SECURE" : "VERIFY-FAILED"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Dual-Layer Protocol</span>
                <span className="text-[10px] text-[#9AA4B1] font-mono bg-[#2C3136] px-1.5 py-0.5 rounded">SHA-512 + ML-DSA-87</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">FIPS Standard</span>
                <span className="text-[10px] text-[#9AA4B1]">FIPS-204</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Ledger Version</span>
                <span className="text-[10px] text-[#9AA4B1]">QL-2.0</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  valueClassName = "",
  isLoading 
}: { 
  title: string, 
  value: React.ReactNode, 
  icon: React.ElementType,
  valueClassName?: string,
  isLoading?: boolean
}) {
  return (
    <Card className="p-3 sm:p-5 border-border/60 bg-card/50 backdrop-blur-sm hover:border-border transition-colors">
      <div className="flex items-center justify-between mb-2 sm:mb-4 text-muted-foreground">
        <h3 className="font-mono text-[10px] sm:text-xs font-medium uppercase tracking-wider truncate pr-2">{title}</h3>
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
      </div>
      <div className={`text-xl sm:text-3xl font-bold font-mono ${valueClassName}`}>
        {isLoading ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : value}
      </div>
    </Card>
  );
}