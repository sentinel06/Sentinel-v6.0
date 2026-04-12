import React, { useState } from "react";
import { useGetAuditLogs, useGetTrace } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAnomalous, formatTime, truncateHash } from "@/lib/audit-utils";
import {
  ListTree,
  AlertTriangle,
  X,
  Clock,
  Terminal,
  BrainCircuit,
  FlaskConical,
  CheckCircle2,
  ChevronRight,
  Loader2,
} from "lucide-react";

type AnyEvent = {
  id: string;
  timestamp: string;
  eventType: string;
  rationale?: string | null;
  payload: unknown;
  currentHash: string;
  isAnomalous?: boolean;
  anomalyReason?: string | null;
  consistencyScore?: number;
  consistencyReasons?: string[];
};

export default function TracesPage() {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const { data: logData, isLoading } = useGetAuditLogs({ limit: 50 }, { query: { queryKey: ["traces"] } });

  const recentTraces = React.useMemo(() => {
    if (!logData?.logs) return [];

    const traceMap = new Map<
      string,
      { traceId: string; agentId: string; startTime: string; eventCount: number; hasError: boolean; hasAnomaly: boolean; lowestScore: number }
    >();

    (logData.logs as AnyEvent[]).forEach((log: any) => {
      if (!traceMap.has(log.traceId)) {
        traceMap.set(log.traceId, {
          traceId: log.traceId,
          agentId: log.agentId,
          startTime: log.timestamp,
          eventCount: 0,
          hasError: false,
          hasAnomaly: false,
          lowestScore: 1.0,
        });
      }

      const trace = traceMap.get(log.traceId)!;
      trace.eventCount++;
      if (log.eventType === "Error") trace.hasError = true;
      if (log.isAnomalous || isAnomalous(log.eventType, log.rationale)) trace.hasAnomaly = true;
      if (typeof log.consistencyScore === "number" && log.consistencyScore < trace.lowestScore) {
        trace.lowestScore = log.consistencyScore;
      }
      if (new Date(log.timestamp) < new Date(trace.startTime)) trace.startTime = log.timestamp;
    });

    return Array.from(traceMap.values()).sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }, [logData]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 animate-in fade-in duration-500">
      {/* Left panel — Trace List */}
      <Card className="w-1/3 flex flex-col border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden shrink-0">
        <div className="p-4 border-b border-border/60 flex items-center justify-between">
          <h2 className="font-mono text-sm font-medium flex items-center gap-2">
            <ListTree className="w-4 h-4 text-primary" />
            RECENT TRACES
          </h2>
          <Badge variant="outline" className="font-mono text-[10px]">
            {recentTraces.length}
          </Badge>
        </div>

        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-center font-mono text-sm text-muted-foreground animate-pulse">
              Scanning logs...
            </div>
          ) : recentTraces.length === 0 ? (
            <div className="p-4 text-center font-mono text-sm text-muted-foreground">No traces found.</div>
          ) : (
            recentTraces.map((trace) => {
              const scorePct = Math.round(trace.lowestScore * 100);
              const scoreColor =
                scorePct < 50 ? "text-destructive" : scorePct < 75 ? "text-yellow-400" : "text-emerald-400";
              return (
                <button
                  key={trace.traceId}
                  onClick={() => setSelectedTraceId(trace.traceId)}
                  className={`w-full text-left p-3 rounded-md transition-all border font-mono ${
                    selectedTraceId === trace.traceId
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs truncate max-w-[140px]" title={trace.traceId}>
                      {trace.traceId}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {trace.hasAnomaly && <AlertTriangle className="w-3 h-3 text-accent" />}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{trace.eventCount} ev</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="truncate max-w-[120px] opacity-70">
                      Agent: {trace.agentId.substring(0, 8)}
                    </span>
                    <span className={`font-bold ${scoreColor}`}>
                      <BrainCircuit className="w-2.5 h-2.5 inline mr-0.5" />
                      {scorePct}%
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Card>

      {/* Right panel — Trace Details */}
      <Card className="flex-1 flex flex-col border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
        {selectedTraceId ? (
          <TraceDetailView traceId={selectedTraceId} onClose={() => setSelectedTraceId(null)} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <ListTree className="w-12 h-12 mb-4 opacity-20" />
            <h3 className="font-mono text-lg font-medium text-foreground mb-2">Trace Explorer</h3>
            <p className="text-sm text-center max-w-md font-mono opacity-80">
              Select a trace from the left to view the complete sequence of intents, actions, and results
              performed by the agent. Anomalous entries include a Simulate Fix panel.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Simulate Fix Panel ─────────────────────────────────────────────────────

interface SimulateResult {
  consistencyScore: number;
  consistencyReasons: string[];
  isHighRisk: boolean;
  label: "HIGH-RISK" | "MARGINAL" | "CONSISTENT";
}

function SimulateFixPanel({
  event,
  onClose,
}: {
  event: AnyEvent;
  onClose: () => void;
}) {
  const [rationale, setRationale] = useState(event.rationale ?? "");
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [loading, setLoading] = useState(false);

  const originalScore = event.consistencyScore ?? 1.0;
  const originalPct = Math.round(originalScore * 100);

  const run = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/v1/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rationale,
          eventType: event.eventType,
          payload: event.payload,
        }),
      });
      const data = await resp.json();
      setResult(data);
    } catch (e) {
      console.error("Simulate failed", e);
    } finally {
      setLoading(false);
    }
  };

  const newPct = result ? Math.round(result.consistencyScore * 100) : null;
  const improvement = newPct !== null ? newPct - originalPct : null;

  return (
    <div className="border-t border-border/60 bg-[#0A0F1C]/60 p-4 animate-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-mono text-sm font-bold flex items-center gap-2 text-sky-400">
          <FlaskConical className="w-4 h-4" />
          SHADOW MODE — Simulate Fix
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs font-mono text-muted-foreground mb-3 leading-relaxed">
        Rewrite the rationale to describe what the agent <em>should</em> have stated. The original payload
        and eventType are unchanged — only the intent text is tested. Nothing is written to the ledger.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3 text-[10px] font-mono">
        <div className="bg-muted/30 rounded p-2 border border-border/40">
          <div className="text-muted-foreground mb-1 uppercase">Original Score</div>
          <div className={`text-lg font-bold ${originalPct < 50 ? "text-destructive" : originalPct < 75 ? "text-yellow-400" : "text-emerald-400"}`}>
            {originalPct}%
          </div>
        </div>
        <div className="bg-muted/30 rounded p-2 border border-border/40">
          <div className="text-muted-foreground mb-1 uppercase">Simulated Score</div>
          {newPct !== null ? (
            <div className={`text-lg font-bold ${newPct < 50 ? "text-destructive" : newPct < 75 ? "text-yellow-400" : "text-emerald-400"}`}>
              {newPct}%
              {improvement !== null && improvement !== 0 && (
                <span className={`text-xs ml-1 ${improvement > 0 ? "text-emerald-400" : "text-destructive"}`}>
                  ({improvement > 0 ? "+" : ""}{improvement})
                </span>
              )}
            </div>
          ) : (
            <div className="text-lg font-bold text-muted-foreground/40">—</div>
          )}
        </div>
      </div>

      <textarea
        className="w-full bg-background border border-border/60 rounded-md p-3 text-xs font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-sky-500/50 placeholder:text-muted-foreground/40"
        rows={4}
        placeholder="Rewrite the agent's rationale here — describe what it actually intended to do, accurately…"
        value={rationale}
        onChange={(e) => { setRationale(e.target.value); setResult(null); }}
      />

      <div className="flex items-center gap-2 mt-2">
        <Button
          size="sm"
          className="font-mono text-xs bg-sky-600 hover:bg-sky-500 text-white"
          onClick={run}
          disabled={loading || !rationale.trim()}
        >
          {loading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <FlaskConical className="w-3 h-3 mr-1.5" />}
          {loading ? "Running simulation…" : "Run Simulation"}
        </Button>
        {result && (
          <div className={`text-[10px] font-mono font-bold px-2 py-1 rounded border ${
            result.label === "CONSISTENT"
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              : result.label === "MARGINAL"
              ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
              : "text-destructive bg-destructive/10 border-destructive/20"
          }`}>
            {result.label}
          </div>
        )}
      </div>

      {result && result.consistencyReasons.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {result.consistencyReasons.map((r, i) => (
            <div key={i} className="text-[10px] font-mono text-destructive/80 bg-destructive/5 px-2 py-1 rounded border border-destructive/20 flex items-start gap-1.5">
              <AlertTriangle className="w-2.5 h-2.5 mt-0.5 shrink-0" />
              {r}
            </div>
          ))}
        </div>
      )}
      {result && result.consistencyReasons.length === 0 && (
        <div className="mt-3 text-[10px] font-mono text-emerald-400 bg-emerald-500/5 px-2 py-1.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" />
          No intent-action conflicts detected — this rationale is fully consistent.
        </div>
      )}
    </div>
  );
}

// ── Trace Detail View ──────────────────────────────────────────────────────

function TraceDetailView({ traceId, onClose }: { traceId: string; onClose: () => void }) {
  const { data: trace, isLoading } = useGetTrace(traceId, { query: { queryKey: ["trace", traceId] } });
  const [simulatingEventId, setSimulatingEventId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm animate-pulse">
        Decrypting trace data…
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-destructive">
        Trace data unavailable.
      </div>
    );
  }

  return (
    <>
      <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/10 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-mono text-sm font-bold flex items-center gap-2">
              TRACE <span className="text-muted-foreground font-normal">{traceId}</span>
            </h2>
            <div className="text-xs font-mono text-muted-foreground flex items-center gap-2 mt-1">
              <span>Agent: {trace.agentId}</span>
              <span>•</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                  trace.status === "error"
                    ? "bg-destructive/20 text-destructive"
                    : trace.status === "success"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-blue-500/20 text-blue-400"
                }`}
              >
                {trace.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end font-mono text-xs text-muted-foreground gap-1">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {formatTime(trace.startTime)}
          </div>
          {trace.endTime && <div>{formatTime(trace.endTime)}</div>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-[#0A0F1C]/30 relative">
        <div className="absolute left-[39px] top-6 bottom-6 w-px bg-border/50" />

        <div className="space-y-6 relative">
          {(trace.events as AnyEvent[]).map((event, index) => {
            const anomalous = event.isAnomalous || isAnomalous(event.eventType, event.rationale ?? undefined);
            const score: number = (event as any).consistencyScore ?? 1.0;
            const scorePct = Math.round(score * 100);
            const isHallucination = score < 0.5;
            const isSimulating = simulatingEventId === event.id;

            let EventIcon = Terminal;
            let iconColor = "text-muted-foreground";
            let bgColor = "bg-muted";

            if (event.eventType === "Error") {
              iconColor = "text-destructive";
              bgColor = "bg-destructive/20";
              EventIcon = AlertTriangle;
            } else if (event.eventType === "Intent") {
              iconColor = "text-blue-400";
              bgColor = "bg-blue-500/20";
            } else if (event.eventType === "Action") {
              iconColor = "text-primary";
              bgColor = "bg-primary/20";
            } else if (event.eventType === "Result") {
              iconColor = "text-emerald-400";
              bgColor = "bg-emerald-500/20";
            }

            const cardBorder = isHallucination
              ? "border-destructive/40 bg-destructive/5"
              : anomalous
              ? "border-accent/40 bg-accent/5"
              : "border-border/50 bg-card/40";

            return (
              <div
                key={event.id}
                className="flex gap-4 relative animate-in slide-in-from-left-4 fade-in"
                style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
              >
                <div
                  className={`w-8 h-8 rounded-full border border-border/50 flex items-center justify-center z-10 shrink-0 ${bgColor}`}
                >
                  <EventIcon className={`w-3.5 h-3.5 ${iconColor}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <Card className={`border p-4 ${cardBorder}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-mono font-bold uppercase tracking-wider ${iconColor}`}>
                          {event.eventType}
                        </span>
                        {/* Consistency score badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                            scorePct >= 80
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                              : scorePct >= 50
                              ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                              : "text-destructive bg-destructive/10 border-destructive/20"
                          }`}
                        >
                          <BrainCircuit className="w-2.5 h-2.5" />
                          {scorePct}%
                        </span>
                        {anomalous && (
                          <Badge
                            variant="outline"
                            className="text-accent border-accent/30 bg-accent/10 text-[9px] px-1 h-4"
                          >
                            {isHallucination ? "HALLUCINATION" : "FLAGGED"}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {formatTime(event.timestamp)}
                        </span>
                        {anomalous && (
                          <button
                            onClick={() => setSimulatingEventId(isSimulating ? null : event.id)}
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                              isSimulating
                                ? "bg-sky-500/20 border-sky-500/30 text-sky-400"
                                : "border-border/40 text-muted-foreground hover:border-sky-500/30 hover:text-sky-400 hover:bg-sky-500/10"
                            }`}
                          >
                            <FlaskConical className="w-2.5 h-2.5" />
                            {isSimulating ? "Close" : "Simulate Fix"}
                            {!isSimulating && <ChevronRight className="w-2.5 h-2.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {event.rationale && (
                      <div
                        className={`mb-4 text-sm font-mono leading-relaxed pl-3 border-l-2 ${
                          isHallucination
                            ? "text-destructive/80 border-destructive/30"
                            : anomalous
                            ? "text-accent/90 border-accent/30"
                            : "text-foreground/90 border-muted"
                        }`}
                      >
                        {event.rationale}
                      </div>
                    )}

                    {anomalous && event.anomalyReason && (
                      <div className="mb-3 text-[10px] font-mono text-accent bg-accent/10 px-2 py-1.5 rounded flex items-start gap-1.5 border border-accent/20">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        {event.anomalyReason}
                      </div>
                    )}

                    <div className="bg-background rounded-md border border-border/50 overflow-hidden">
                      <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50 text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex justify-between">
                        <span>Payload Data</span>
                        <span title="Cryptographic Hash">H: {truncateHash(event.currentHash)}</span>
                      </div>
                      <div className="p-3 overflow-x-auto text-xs font-mono text-muted-foreground whitespace-pre max-h-40">
                        {JSON.stringify(event.payload, null, 2)}
                      </div>
                    </div>
                  </Card>

                  {/* Simulate Fix panel — slides in under the card */}
                  {isSimulating && (
                    <SimulateFixPanel
                      event={event}
                      onClose={() => setSimulatingEventId(null)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
