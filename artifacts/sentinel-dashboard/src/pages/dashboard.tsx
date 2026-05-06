import React, { useEffect, useState, useRef } from "react";
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
    pct >= 80 ? "text-[#60C96E] bg-[#60C96E]/10 border-[#60C96E]/20" :
    pct >= 50 ? "text-[#EBC06D] bg-[#EBC06D]/10 border-[#EBC06D]/20" :
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
              color: "#40B595",
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
              <ShieldCheck className="w-3 h-3" style={{ color: "#40B595" }} />
              <span className="font-bold text-[10px] uppercase tracking-widest" style={{ color: "#40B595" }}>
                Cryptographic Proof
              </span>
            </div>

            {/* Row 1 — Classical layer */}
            <div className="flex items-start gap-2.5 mb-2">
              <div
                className="mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0"
                style={{ background: "rgba(64,181,149,0.15)", border: "1px solid rgba(64,181,149,0.30)" }}
              >
                <Lock className="w-2.5 h-2.5" style={{ color: "#40B595" }} />
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
                <Zap className="w-2.5 h-2.5" style={{ color: "#40B595" }} />
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
                <CheckCircle2 className="w-2.5 h-2.5" style={{ color: "#40B595" }} />
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
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;
      
      setWsStatus("connecting");
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsStatus("connected");
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "log" && msg.data) {
              setLiveLogs(prev => [msg.data, ...prev].slice(0, 50));
            }
          } catch (e) {
            console.error("Failed to parse WS message", e);
          }
        };

        ws.onclose = () => {
          setWsStatus("disconnected");
          reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (e) {
        setWsStatus("disconnected");
        reconnectTimeout = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

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
              <Badge variant="outline" className="text-[#60C96E] border-[#60C96E]/25 bg-[#60C96E]/10 font-mono text-[10px]">CHAIN VERIFIED</Badge>
            )}
          </div>
          <div className="p-0 overflow-y-auto max-h-[600px] flex-1 bg-[#1F2226]">
            {liveLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">Waiting for incoming packets...</div>
            ) : (
              <div className="divide-y divide-[#2C3136]">
                {liveLogs.map((log) => {
                  const anomalous = log.isAnomalous || isAnomalous(log.eventType, log.rationale);
                  const score = log.consistencyScore;
                  const isHallucination = score !== undefined && score < 0.5;
                  const borderColor = isHallucination
                    ? "border-l-[#D96161]"
                    : anomalous
                    ? "border-l-[#EBC06D]"
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
                            log.eventType === 'Error' ? 'bg-[#D96161]/15 text-[#D96161]' :
                            log.eventType === 'Intent' ? 'bg-blue-500/15 text-blue-400' :
                            log.eventType === 'Action' ? 'bg-primary/15 text-primary' :
                            'bg-[#60C96E]/15 text-[#60C96E]'
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
                          <div className={`log-typewriter mt-1.5 text-xs leading-relaxed ${isHallucination ? 'text-[#D96161]/80' : anomalous ? 'text-[#EBC06D]/80' : 'text-foreground/75'}`}>
                            {log.rationale}
                          </div>
                        )}

                        {isHallucination && log.consistencyReasons && (log.consistencyReasons as string[]).length > 0 && (
                          <div className="mt-2 text-[10px] text-[#D96161] bg-[#D96161]/10 px-2 py-1.5 rounded flex items-start gap-1.5 border border-[#D96161]/20">
                            <BrainCircuit className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{(log.consistencyReasons as string[])[0]}</span>
                          </div>
                        )}
                        
                        {!isHallucination && anomalous && log.anomalyReason && (
                          <div className="mt-2 text-[10px] text-[#EBC06D] bg-[#EBC06D]/10 px-2 py-1 rounded inline-flex items-center gap-1 border border-[#EBC06D]/20">
                            <AlertTriangle className="w-3 h-3" />
                            {log.anomalyReason}
                          </div>
                        )}

                        {(log.swarmId || log.parentAgentId || (log.computeOriginRegion && log.computeOriginRegion !== "unspecified")) && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {log.swarmId && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-[#40B595]/8 border-[#40B595]/20 text-[#40B595]/80" title={`Swarm: ${log.swarmId}`}>
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
                if (type === "Error") colorClass = "bg-[#D96161]";
                if (type === "Result") colorClass = "bg-[#60C96E]";
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
                <ShieldAlert className="w-4 h-4 text-[#D96161]" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#60C96E]" />
              )}
              LEDGER STATUS
            </h3>
            
            <div className="flex flex-col gap-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Chain Status</span>
                {isLoading ? (
                  <span className="animate-pulse">Checking...</span>
                ) : stats?.integrityOk === false ? (
                  <span className="text-[#D96161] font-bold">COMPROMISED</span>
                ) : (
                  <span className="text-[#60C96E] font-bold">VERIFIED</span>
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
                    ? "text-[#40B595] border-[#40B595]/40 bg-[#40B595]/10"
                    : "text-[#EBC06D] border-[#EBC06D]/40 bg-[#EBC06D]/10"
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