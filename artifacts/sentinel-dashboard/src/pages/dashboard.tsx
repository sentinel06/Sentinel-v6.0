import React, { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  AlertTriangle, 
  Cpu, 
  ListTree, 
  ShieldCheck, 
  ShieldAlert,
  ArrowRight,
  Database
} from "lucide-react";
import { 
  useGetStats, 
  AuditLog
} from "@workspace/api-client-react";
import { isAnomalous, formatTime, truncateHash } from "@/lib/audit-utils";

export default function DashboardPage() {
  const { data: stats, isLoading } = useGetStats({ query: { refetchInterval: 10000 } });
  const [liveLogs, setLiveLogs] = useState<AuditLog[]>([]);
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

  // Initialize liveLogs with recent activity when stats loads
  useEffect(() => {
    if (stats?.recentActivity && liveLogs.length === 0) {
      setLiveLogs(stats.recentActivity);
    }
  }, [stats, liveLogs.length]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Stream</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">Real-time action monitoring and hash chain verification</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden border-border/60 bg-card/50 backdrop-blur-sm">
          <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-2 font-mono text-sm font-medium">
              <Activity className="w-4 h-4 text-primary" />
              INCOMING PACKETS
            </div>
            {stats?.integrityOk === false && (
              <Badge variant="destructive" className="font-mono text-[10px]">INTEGRITY BREACH</Badge>
            )}
            {stats?.integrityOk === true && (
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10 font-mono text-[10px]">CHAIN VERIFIED</Badge>
            )}
          </div>
          <div className="p-0 overflow-y-auto max-h-[600px] flex-1 bg-[#0A0F1C]/50">
            {liveLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">Waiting for incoming packets...</div>
            ) : (
              <div className="divide-y divide-border/40">
                {liveLogs.map((log) => {
                  const anomalous = log.isAnomalous || isAnomalous(log.eventType, log.rationale);
                  return (
                    <div 
                      key={log.id} 
                      className={`p-3 text-sm font-mono flex items-start gap-4 transition-colors hover:bg-muted/30 ${
                        anomalous ? "bg-accent/5 border-l-2 border-l-accent" : "border-l-2 border-l-transparent"
                      }`}
                    >
                      <div className="text-muted-foreground w-24 shrink-0 mt-0.5 text-xs">
                        {formatTime(log.timestamp)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                            log.eventType === 'Error' ? 'bg-destructive/20 text-destructive' :
                            log.eventType === 'Intent' ? 'bg-blue-500/20 text-blue-400' :
                            log.eventType === 'Action' ? 'bg-primary/20 text-primary' :
                            'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {log.eventType}
                          </span>
                          <span className="text-xs text-muted-foreground truncate" title={log.agentId}>
                            Agent: {log.agentId.substring(0, 8)}...
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground/50 mx-1" />
                          <span className="text-xs text-muted-foreground truncate" title={log.traceId}>
                            Trace: {log.traceId.substring(0, 8)}...
                          </span>
                        </div>
                        
                        {log.rationale && (
                          <div className={`mt-1.5 text-xs leading-relaxed ${anomalous ? 'text-accent/90' : 'text-foreground/80'}`}>
                            {log.rationale}
                          </div>
                        )}
                        
                        {anomalous && log.anomalyReason && (
                          <div className="mt-2 text-[10px] text-accent bg-accent/10 px-2 py-1 rounded inline-flex items-center gap-1 border border-accent/20">
                            <AlertTriangle className="w-3 h-3" />
                            {log.anomalyReason}
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
                if (type === "Error") colorClass = "bg-destructive";
                if (type === "Result") colorClass = "bg-emerald-500";
                if (type === "Intent") colorClass = "bg-blue-500";
                
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
                <ShieldAlert className="w-4 h-4 text-destructive" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              )}
              LEDGER STATUS
            </h3>
            
            <div className="flex flex-col gap-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Chain Status</span>
                {isLoading ? (
                  <span className="animate-pulse">Checking...</span>
                ) : stats?.integrityOk === false ? (
                  <span className="text-destructive font-bold">COMPROMISED</span>
                ) : (
                  <span className="text-emerald-500 font-bold">VERIFIED</span>
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
    <Card className="p-5 border-border/60 bg-card/50 backdrop-blur-sm hover:border-border transition-colors">
      <div className="flex items-center justify-between mb-4 text-muted-foreground">
        <h3 className="font-mono text-xs font-medium uppercase tracking-wider">{title}</h3>
        <Icon className="w-4 h-4" />
      </div>
      <div className={`text-3xl font-bold font-mono ${valueClassName}`}>
        {isLoading ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : value}
      </div>
    </Card>
  );
}