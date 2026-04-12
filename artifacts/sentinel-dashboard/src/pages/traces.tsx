import React, { useState } from "react";
import { useGetAuditLogs, useGetTrace } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAnomalous, formatTime, truncateHash } from "@/lib/audit-utils";
import { 
  ListTree, 
  ChevronRight, 
  AlertTriangle, 
  ArrowRight,
  Clock,
  Terminal,
  X
} from "lucide-react";

export default function TracesPage() {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const { data: logData, isLoading } = useGetAuditLogs({ limit: 50 }, { query: { queryKey: ['traces'] }});

  // Extract unique traces from recent logs (this is a simplified view since the backend doesn't have a specific /traces list endpoint without an ID)
  // We group logs by traceId to build the list
  const recentTraces = React.useMemo(() => {
    if (!logData?.logs) return [];
    
    const traceMap = new Map<string, {
      traceId: string;
      agentId: string;
      startTime: string;
      eventCount: number;
      hasError: boolean;
      hasAnomaly: boolean;
    }>();
    
    logData.logs.forEach(log => {
      if (!traceMap.has(log.traceId)) {
        traceMap.set(log.traceId, {
          traceId: log.traceId,
          agentId: log.agentId,
          startTime: log.timestamp,
          eventCount: 0,
          hasError: false,
          hasAnomaly: false
        });
      }
      
      const trace = traceMap.get(log.traceId)!;
      trace.eventCount++;
      if (log.eventType === 'Error') trace.hasError = true;
      if (log.isAnomalous || isAnomalous(log.eventType, log.rationale)) trace.hasAnomaly = true;
      
      // Update start time if this log is older
      if (new Date(log.timestamp) < new Date(trace.startTime)) {
        trace.startTime = log.timestamp;
      }
    });
    
    return Array.from(traceMap.values()).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [logData]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 animate-in fade-in duration-500">
      {/* Left panel - Trace List */}
      <Card className="w-1/3 flex flex-col border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden shrink-0">
        <div className="p-4 border-b border-border/60 flex items-center justify-between">
          <h2 className="font-mono text-sm font-medium flex items-center gap-2">
            <ListTree className="w-4 h-4 text-primary" />
            RECENT TRACES
          </h2>
          <Badge variant="outline" className="font-mono text-[10px]">{recentTraces.length}</Badge>
        </div>
        
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-center font-mono text-sm text-muted-foreground animate-pulse">Scanning logs...</div>
          ) : recentTraces.length === 0 ? (
            <div className="p-4 text-center font-mono text-sm text-muted-foreground">No traces found.</div>
          ) : (
            recentTraces.map(trace => (
              <button
                key={trace.traceId}
                onClick={() => setSelectedTraceId(trace.traceId)}
                className={`w-full text-left p-3 rounded-md transition-all border font-mono ${
                  selectedTraceId === trace.traceId
                    ? 'bg-primary/10 border-primary/30 text-foreground'
                    : 'bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs truncate max-w-[140px]" title={trace.traceId}>
                    {trace.traceId}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {trace.hasAnomaly && <AlertTriangle className="w-3 h-3 text-accent" />}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                      {trace.eventCount} ev
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="truncate max-w-[120px] opacity-70">Agent: {trace.agentId.substring(0,8)}</span>
                  <span className="opacity-70">{formatTime(trace.startTime)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </Card>

      {/* Right panel - Trace Details */}
      <Card className="flex-1 flex flex-col border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
        {selectedTraceId ? (
          <TraceDetailView traceId={selectedTraceId} onClose={() => setSelectedTraceId(null)} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <ListTree className="w-12 h-12 mb-4 opacity-20" />
            <h3 className="font-mono text-lg font-medium text-foreground mb-2">Trace Explorer</h3>
            <p className="text-sm text-center max-w-md font-mono opacity-80">
              Select a trace from the left to view the complete sequence of intents, actions, and results performed by the agent.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function TraceDetailView({ traceId, onClose }: { traceId: string, onClose: () => void }) {
  const { data: trace, isLoading } = useGetTrace(traceId, { query: { queryKey: ['trace', traceId] }});

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center font-mono text-sm animate-pulse">Decrypting trace data...</div>;
  }

  if (!trace) {
    return <div className="flex-1 flex items-center justify-center font-mono text-sm text-destructive">Trace data unavailable.</div>;
  }

  return (
    <>
      <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/10 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-mono text-sm font-bold flex items-center gap-2">
              TRACE <span className="text-muted-foreground font-normal">{traceId}</span>
            </h2>
            <div className="text-xs font-mono text-muted-foreground flex items-center gap-2 mt-1">
              <span>Agent: {trace.agentId}</span>
              <span>•</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                trace.status === 'error' ? 'bg-destructive/20 text-destructive' :
                trace.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {trace.status}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end font-mono text-xs text-muted-foreground gap-1">
          <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(trace.startTime)}</div>
          {trace.endTime && <div>{formatTime(trace.endTime)}</div>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-[#0A0F1C]/30 relative">
        <div className="absolute left-[39px] top-6 bottom-6 w-px bg-border/50" />
        
        <div className="space-y-6 relative">
          {trace.events.map((event, index) => {
            const anomalous = event.isAnomalous || isAnomalous(event.eventType, event.rationale);
            const isLast = index === trace.events.length - 1;
            
            let EventIcon = Terminal;
            let iconColor = "text-muted-foreground";
            let bgColor = "bg-muted";
            
            if (event.eventType === 'Error') {
              iconColor = "text-destructive";
              bgColor = "bg-destructive/20";
              EventIcon = AlertTriangle;
            } else if (event.eventType === 'Intent') {
              iconColor = "text-blue-400";
              bgColor = "bg-blue-500/20";
            } else if (event.eventType === 'Action') {
              iconColor = "text-primary";
              bgColor = "bg-primary/20";
            } else if (event.eventType === 'Result') {
              iconColor = "text-emerald-400";
              bgColor = "bg-emerald-500/20";
            }

            return (
              <div key={event.id} className="flex gap-4 relative animate-in slide-in-from-left-4 fade-in" style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}>
                <div className={`w-8 h-8 rounded-full border border-border/50 flex items-center justify-center z-10 shrink-0 ${bgColor}`}>
                  <EventIcon className={`w-3.5 h-3.5 ${iconColor}`} />
                </div>
                
                <Card className={`flex-1 border p-4 ${anomalous ? 'border-accent/40 bg-accent/5' : 'border-border/50 bg-card/40'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono font-bold uppercase tracking-wider ${iconColor}`}>
                        {event.eventType}
                      </span>
                      {anomalous && (
                        <Badge variant="outline" className="text-accent border-accent/30 bg-accent/10 text-[9px] px-1 h-4">
                          FLAGGED
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatTime(event.timestamp)}
                    </span>
                  </div>
                  
                  {event.rationale && (
                    <div className="mb-4 text-sm font-mono leading-relaxed text-foreground/90 pl-3 border-l-2 border-muted">
                      {event.rationale}
                    </div>
                  )}
                  
                  <div className="bg-background rounded-md border border-border/50 overflow-hidden">
                    <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50 text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex justify-between">
                      <span>Payload Data</span>
                      <span title="Cryptographic Hash">H: {truncateHash(event.currentHash)}</span>
                    </div>
                    <div className="p-3 overflow-x-auto text-xs font-mono text-muted-foreground whitespace-pre">
                      {JSON.stringify(event.payload, null, 2)}
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}