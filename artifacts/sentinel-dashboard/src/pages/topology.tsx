/**
 * Trace Topology View — Multi-Agent Orchestration Map
 *
 * Renders a node-based graph of agent interaction chains.
 * Node color = red if lowestConsistencyScore < 0.5, yellow < 0.75, green otherwise.
 * Cluster health = weighted propagation of ancestor scores (logic poisoning detection).
 */

import React, { useMemo, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGetAuditLogs } from "@workspace/api-client-react";
import { GitBranch, AlertTriangle, Info, ZoomIn, ZoomOut, Maximize2, Skull } from "lucide-react";

interface LogEntry {
  id: string;
  agentId: string;
  traceId: string;
  parentTraceId?: string | null;
  consistencyScore?: number;
  isAnomalous?: boolean;
  eventType: string;
  timestamp: string;
}

interface TraceNode {
  traceId: string;
  agentId: string;
  parentTraceId: string | null;
  lowestScore: number;
  clusterHealth: number;   // weighted propagation of ancestor scores
  eventCount: number;
  anomalyCount: number;
  firstSeen: string;
  children: string[];
  isPoisoned: boolean;     // clusterHealth substantially worse than own lowestScore
}

function buildGraph(logs: LogEntry[]): Map<string, TraceNode> {
  const nodes = new Map<string, TraceNode>();

  // First pass: build nodes
  for (const log of logs) {
    if (!nodes.has(log.traceId)) {
      nodes.set(log.traceId, {
        traceId: log.traceId,
        agentId: log.agentId,
        parentTraceId: (log as any).parentTraceId ?? null,
        lowestScore: log.consistencyScore ?? 1.0,
        clusterHealth: log.consistencyScore ?? 1.0,
        eventCount: 0,
        anomalyCount: 0,
        firstSeen: log.timestamp,
        children: [],
        isPoisoned: false,
      });
    }
    const node = nodes.get(log.traceId)!;
    node.eventCount++;
    if (log.isAnomalous) node.anomalyCount++;
    if ((log.consistencyScore ?? 1.0) < node.lowestScore) {
      node.lowestScore = log.consistencyScore ?? 1.0;
    }
  }

  // Second pass: build parent→children edges
  for (const [, node] of nodes) {
    if (node.parentTraceId && nodes.has(node.parentTraceId)) {
      nodes.get(node.parentTraceId)!.children.push(node.traceId);
    }
  }

  // Third pass: propagate cluster health (recursive, memoized)
  const memo = new Map<string, number>();
  function clusterHealth(traceId: string): number {
    if (memo.has(traceId)) return memo.get(traceId)!;
    const node = nodes.get(traceId);
    if (!node) return 1.0;
    if (!node.parentTraceId || !nodes.has(node.parentTraceId)) {
      memo.set(traceId, node.lowestScore);
      return node.lowestScore;
    }
    const parentH = clusterHealth(node.parentTraceId);
    const score = 0.6 * node.lowestScore + 0.4 * parentH;
    memo.set(traceId, score);
    return score;
  }

  for (const [id, node] of nodes) {
    node.clusterHealth = clusterHealth(id);
    // Poisoned = cluster is significantly worse than own health
    node.isPoisoned = node.clusterHealth < node.lowestScore - 0.12;
  }

  return nodes;
}

function nodeColor(score: number, anomalyCount: number, isPoisoned: boolean): { fill: string; stroke: string; text: string } {
  if (isPoisoned) return { fill: "rgba(168,85,247,0.15)", stroke: "#a855f7", text: "#a855f7" };
  if (score < 0.5 || anomalyCount > 0)
    return { fill: "rgba(239,68,68,0.15)", stroke: "#ef4444", text: "#ef4444" };
  if (score < 0.75)
    return { fill: "rgba(234,179,8,0.15)", stroke: "#eab308", text: "#eab308" };
  return { fill: "rgba(16,185,129,0.12)", stroke: "#10b981", text: "#10b981" };
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  node: TraceNode;
}

function layoutGraph(nodes: Map<string, TraceNode>): LayoutNode[] {
  const W = 180;
  const H = 100;
  const HGAP = 40;
  const VGAP = 60;

  const roots: string[] = [];
  for (const [id, node] of nodes) {
    if (!node.parentTraceId || !nodes.has(node.parentTraceId)) roots.push(id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const subtreeWidths = new Map<string, number>();

  function calcWidth(id: string): number {
    const node = nodes.get(id)!;
    if (node.children.length === 0) { subtreeWidths.set(id, 1); return 1; }
    const w = node.children.reduce((sum, c) => sum + calcWidth(c), 0);
    subtreeWidths.set(id, Math.max(1, w));
    return Math.max(1, w);
  }
  roots.forEach(calcWidth);

  function assignPos(id: string, depth: number, xOffset: number): void {
    const node = nodes.get(id)!;
    const w = subtreeWidths.get(id) ?? 1;
    positions.set(id, { x: xOffset + (w - 1) * (W + HGAP) / 2, y: depth * (H + VGAP) });
    let cx = xOffset;
    for (const childId of node.children) {
      const cw = subtreeWidths.get(childId) ?? 1;
      assignPos(childId, depth + 1, cx);
      cx += cw * (W + HGAP);
    }
  }

  let rootX = 0;
  for (const root of roots) {
    const w = subtreeWidths.get(root) ?? 1;
    assignPos(root, 0, rootX);
    rootX += w * (W + HGAP);
  }

  const result: LayoutNode[] = [];
  for (const [id, node] of nodes) {
    const pos = positions.get(id) ?? { x: 0, y: 0 };
    result.push({ id, x: pos.x, y: pos.y, node });
  }
  return result;
}

function TopologyGraph({ nodes }: { nodes: Map<string, TraceNode> }) {
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const layout = useMemo(() => layoutGraph(nodes), [nodes]);

  const W = 180;
  const H = 90;

  const maxX = Math.max(...layout.map((n) => n.x + W), 600);
  const maxY = Math.max(...layout.map((n) => n.y + H), 300);

  // Build edge paths
  const edges: Array<{ from: string; to: string; path: string; isPoisoned: boolean }> = [];
  for (const { id, x, y, node } of layout) {
    for (const childId of node.children) {
      const child = layout.find((n) => n.id === childId);
      if (!child) continue;
      const x1 = x + W / 2;
      const y1 = y + H;
      const x2 = child.x + W / 2;
      const y2 = child.y;
      const mid = (y1 + y2) / 2;
      edges.push({
        from: id,
        to: childId,
        path: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`,
        isPoisoned: child.node.isPoisoned,
      });
    }
  }

  const selectedNode = selected ? layout.find((n) => n.id === selected) : null;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-3 justify-end">
        <button onClick={() => setScale((s) => Math.min(s + 0.2, 2))} className="p-1.5 rounded border border-border/50 hover:bg-muted text-muted-foreground">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setScale((s) => Math.max(s - 0.2, 0.3))} className="p-1.5 rounded border border-border/50 hover:bg-muted text-muted-foreground">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setScale(1)} className="p-1.5 rounded border border-border/50 hover:bg-muted text-muted-foreground">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono text-muted-foreground">{Math.round(scale * 100)}%</span>
      </div>

      <div className="overflow-auto border border-border/40 rounded-lg bg-[#070B14]">
        <svg
          ref={svgRef}
          width={(maxX + 60) * scale}
          height={(maxY + 80) * scale}
          viewBox={`-30 -30 ${maxX + 60} ${maxY + 60}`}
          style={{ transform: `scale(${scale})`, transformOrigin: "top left", display: "block" }}
        >
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#334155" />
            </marker>
            <marker id="arrow-poison" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#a855f7" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((e) => (
            <path
              key={`${e.from}-${e.to}`}
              d={e.path}
              fill="none"
              stroke={e.isPoisoned ? "#a855f7" : "#334155"}
              strokeWidth={e.isPoisoned ? 2 : 1.5}
              markerEnd={e.isPoisoned ? "url(#arrow-poison)" : "url(#arrow)"}
              strokeDasharray={e.isPoisoned ? "6 2" : "4 2"}
              opacity={e.isPoisoned ? 0.8 : 1}
            />
          ))}

          {/* Nodes */}
          {layout.map(({ id, x, y, node }) => {
            const colors = nodeColor(node.lowestScore, node.anomalyCount, node.isPoisoned);
            const isSelected = selected === id;
            return (
              <g
                key={id}
                onClick={() => setSelected(isSelected ? null : id)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={x}
                  y={y}
                  width={W}
                  height={H}
                  rx={8}
                  fill={colors.fill}
                  stroke={isSelected ? "#0ea5e9" : colors.stroke}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  filter={isSelected ? "drop-shadow(0 0 8px rgba(14,165,233,0.5))" : undefined}
                />

                {/* Poison badge */}
                {node.isPoisoned && (
                  <>
                    <rect x={x + W - 52} y={y + 4} width={48} height={12} rx={4} fill="#a855f720" stroke="#a855f7" strokeWidth={0.8} />
                    <text x={x + W - 28} y={y + 13} textAnchor="middle" fill="#a855f7" fontSize="7" fontFamily="monospace" fontWeight="bold">POISONED</text>
                  </>
                )}

                {/* Agent ID */}
                <text x={x + W / 2} y={y + 22} textAnchor="middle" fill={colors.stroke} fontSize="9" fontFamily="monospace" fontWeight="bold">
                  {node.agentId.substring(0, 18)}
                </text>
                {/* Trace ID */}
                <text x={x + W / 2} y={y + 36} textAnchor="middle" fill="#64748b" fontSize="7.5" fontFamily="monospace">
                  {id.substring(0, 18)}…
                </text>
                {/* Own score */}
                <text x={x + W / 2} y={y + 53} textAnchor="middle" fill={colors.text} fontSize="9.5" fontFamily="monospace" fontWeight="bold">
                  ⬡ {Math.round(node.lowestScore * 100)}%
                </text>
                {/* Cluster health (only shown when different) */}
                {node.isPoisoned && (
                  <text x={x + W / 2} y={y + 66} textAnchor="middle" fill="#a855f7" fontSize="7.5" fontFamily="monospace">
                    cluster: {Math.round(node.clusterHealth * 100)}%
                  </text>
                )}
                {/* Event count */}
                <text x={x + W / 2} y={node.isPoisoned ? y + 79 : y + 67} textAnchor="middle" fill="#475569" fontSize="7.5" fontFamily="monospace">
                  {node.eventCount} events
                </text>

                {/* Anomaly dot */}
                {node.anomalyCount > 0 && (
                  <circle cx={x + W - 12} cy={y + 12} r={6} fill="#ef4444" />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Node detail panel */}
      {selectedNode && (
        <div className="mt-3 p-4 bg-card/80 border border-border/60 rounded-lg font-mono text-xs space-y-3">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Info className="w-3.5 h-3.5 text-primary" />
            Node Detail — {selectedNode.node.agentId}
            {selectedNode.node.isPoisoned && (
              <span className="ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400">
                <Skull className="w-3 h-3" />
                LOGIC POISONING DETECTED
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
            <span>Trace ID:</span><span className="text-foreground truncate">{selectedNode.id}</span>
            <span>Parent Trace:</span><span className="text-foreground truncate">{selectedNode.node.parentTraceId ?? "ROOT"}</span>
            <span>Events:</span><span className="text-foreground">{selectedNode.node.eventCount}</span>
            <span>Anomalies:</span><span className={selectedNode.node.anomalyCount > 0 ? "text-destructive font-bold" : "text-foreground"}>{selectedNode.node.anomalyCount}</span>
            <span>Own Lowest Score:</span>
            <span className={selectedNode.node.lowestScore < 0.5 ? "text-destructive font-bold" : selectedNode.node.lowestScore < 0.75 ? "text-yellow-400" : "text-emerald-400"}>
              {Math.round(selectedNode.node.lowestScore * 100)}%
            </span>
            <span>Cluster Health:</span>
            <span className={selectedNode.node.clusterHealth < 0.5 ? "text-destructive font-bold" : selectedNode.node.clusterHealth < 0.75 ? "text-yellow-400 font-bold" : "text-emerald-400"}>
              {Math.round(selectedNode.node.clusterHealth * 100)}%
              {selectedNode.node.isPoisoned && <span className="ml-1.5 text-purple-400 text-[10px]">(degraded by ancestors)</span>}
            </span>
            <span>First Seen:</span><span className="text-foreground">{new Date(selectedNode.node.firstSeen).toLocaleTimeString()}</span>
            <span>Children:</span><span className="text-foreground">{selectedNode.node.children.length} downstream traces</span>
          </div>
          {selectedNode.node.isPoisoned && (
            <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 leading-relaxed">
              <strong>Logic Poisoning Warning:</strong> This node's cluster health ({Math.round(selectedNode.node.clusterHealth * 100)}%) is significantly lower than its own consistency score ({Math.round(selectedNode.node.lowestScore * 100)}%). An upstream ancestor in the trace chain has degraded trust, which automatically lowers MaroShield's approval threshold for actions from this node — even if the node itself appears healthy.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TopologyPage() {
  const { data: logData, isLoading } = useGetAuditLogs(
    { limit: 200 },
    { query: { queryKey: ["topology-logs"], refetchInterval: 15000 } }
  );

  const graphNodes = useMemo(() => {
    if (!logData?.logs) return new Map<string, TraceNode>();
    return buildGraph(logData.logs as LogEntry[]);
  }, [logData]);

  const stats = useMemo(() => {
    let roots = 0, chained = 0, compromised = 0, poisoned = 0;
    for (const [, node] of graphNodes) {
      if (!node.parentTraceId || !graphNodes.has(node.parentTraceId)) roots++;
      else chained++;
      if (node.lowestScore < 0.5 || node.anomalyCount > 0) compromised++;
      if (node.isPoisoned) poisoned++;
    }
    return { roots, chained, compromised, poisoned, total: graphNodes.size };
  }, [graphNodes]);

  return (
    <div className="space-y-6 page-transition">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-primary" />
          Trace Topology
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Multi-agent orchestration map · cluster health propagation · EU AI Act Art. 12
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Traces", value: stats.total, color: "text-primary" },
          { label: "Root Traces", value: stats.roots, color: "text-foreground" },
          { label: "Chained", value: stats.chained, color: "text-blue-400" },
          { label: "Compromised", value: stats.compromised, color: "text-destructive" },
          { label: "Logic Poisoned", value: stats.poisoned, color: "text-purple-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4 border-border/60 bg-card/50">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground flex-wrap">
        <span className="font-medium text-foreground uppercase tracking-wider">Legend:</span>
        {[
          { color: "border-emerald-500 bg-emerald-500/10", label: "Score ≥ 75% — clean" },
          { color: "border-yellow-400 bg-yellow-500/10", label: "Score 50–74% — marginal" },
          { color: "border-destructive bg-destructive/10", label: "Score < 50% — compromised" },
          { color: "border-purple-500 bg-purple-500/10", label: "Logic poisoned by ancestor" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${color}`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-destructive" />
          Has anomaly
        </div>
      </div>

      {stats.poisoned > 0 && (
        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
          <Skull className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-mono font-bold text-purple-300">Logic Poisoning Detected in {stats.poisoned} trace{stats.poisoned > 1 ? "s" : ""}</div>
            <div className="text-[11px] font-mono text-purple-400/70 mt-0.5">
              Garbage In, Action Out prevention: MaroShield has automatically lowered the trust threshold for these downstream nodes. Click a purple node for details.
            </div>
          </div>
        </div>
      )}

      <Card className="border-border/60 bg-card/50 p-4">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center font-mono text-sm text-muted-foreground animate-pulse">
            Building topology graph…
          </div>
        ) : graphNodes.size === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
            <GitBranch className="w-10 h-10 mb-3 opacity-20" />
            <div className="font-mono text-sm">No trace data available</div>
            <div className="font-mono text-xs mt-1 opacity-60">
              Submit logs with parent_trace_id to see multi-agent chains
            </div>
          </div>
        ) : (
          <TopologyGraph nodes={graphNodes} />
        )}
      </Card>
    </div>
  );
}
