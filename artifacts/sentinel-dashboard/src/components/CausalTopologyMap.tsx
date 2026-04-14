/**
 * Causal Dependency Graph — CausalTopologyMap
 *
 * Renders a horizontal swimlane DAG for a trace:
 * · Nodes        — typed atomic actions (Memory_Recall, API_Call, Logic_Branch, etc.)
 * · Edges        — causal handoffs colored by ML-DSA-87 integrity + drift heatmap
 * · Swimlanes    — one horizontal lane per agent
 * · Drift Glow   — amber bleed from high-drift nodes into downstream edges
 * · Diff View    — click any edge to see sent vs received payload diff
 * · Timeline     — scrub slider + auto-play to replay formation second-by-second
 * · HUD Sync     — clicking a node fires sentinelFocusAgent + calls onNodeSelect
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react";
import {
  Play, Pause, SkipBack, X, Link2, Link2Off,
  ChevronRight, Zap, AlertTriangle, RotateCcw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  sage:   "#40B595",
  amber:  "#EBC06D",
  terra:  "#D96161",
  blue:   "#5B8DEF",
  violet: "#9B7DE8",
  dim:    "#9AA4B1",
  border: "#2C3136",
  panel:  "#161B22",
  bg:     "#0D1117",
};

// ── Types (mirrors API shape) ─────────────────────────────────────────────────
export type NodeType =
  | "Memory_Recall" | "API_Call" | "Logic_Branch" | "Tool_Call"
  | "Intent" | "Action" | "Result" | "Error" | "Override" | "Breach" | "Verification" | "Pulse";

export interface TopoNode {
  id: string; eventId: string; agentId: string; eventType: string; nodeType: NodeType;
  label: string; timestamp: string; offsetMs: number; drift: number;
  payload: unknown; rationale?: string | null; quantumVerified: boolean;
  currentHash: string; previousHash?: string | null; isAnomalous: boolean;
  swarmId?: string | null; parentAgentId?: string | null;
}
export interface TopoEdge {
  id: string; source: string; target: string;
  edgeType: "sequential" | "handoff" | "result_to_intent" | "cross_swarm";
  chainIntact: boolean; quantumVerified: boolean;
  driftBleed: number; accDrift: number;
  data: { sent: unknown; received: unknown };
  sourceAgent: string; targetAgent: string; timestamp: string; offsetMs: number;
}
export interface TopologyGraph {
  traceId: string; nodes: TopoNode[]; edges: TopoEdge[];
  agentIds: string[]; swarmIds: string[];
  startTime: string; endTime: string; durationMs: number;
  timeline: { nodeId: string; edgeId?: string; offsetMs: number }[];
  stats: {
    totalNodes: number; brokenLinks: number; avgDrift: number;
    handoffs: number; quantumVerifiedPct: number;
  };
}

// ── Layout constants ──────────────────────────────────────────────────────────
const NW = 134;   // node width
const NH = 72;    // node height
const MIN_SPACING = 190; // min X gap between nodes in same lane
const LANE_H = 164;      // height per agent swimlane
const PADX   = 64;       // left/right padding
const HDR_H  = 44;       // swimlane header height

// ── Node type metadata ────────────────────────────────────────────────────────
const NODE_META: Record<NodeType, { icon: string; color: string }> = {
  Memory_Recall:  { icon: "⟐",  color: P.blue },
  API_Call:       { icon: "⬡",  color: P.violet },
  Logic_Branch:   { icon: "⑃",  color: P.amber },
  Tool_Call:      { icon: "⚙",  color: P.sage },
  Intent:         { icon: "→",  color: P.blue },
  Action:         { icon: "▷",  color: P.sage },
  Result:         { icon: "✓",  color: P.sage },
  Error:          { icon: "✕",  color: P.terra },
  Override:       { icon: "◈",  color: P.blue },
  Breach:         { icon: "⚡", color: P.terra },
  Verification:   { icon: "◎",  color: P.sage },
  Pulse:          { icon: "∿",  color: P.violet },
};

// ── Colour helpers ────────────────────────────────────────────────────────────
function driftColor(drift: number): string {
  return drift > 50 ? P.terra : drift > 15 ? P.amber : P.sage;
}
function edgeStroke(e: TopoEdge): string {
  if (!e.chainIntact) return P.terra;
  if (e.driftBleed > 0.15) return P.amber;
  return P.sage;
}

// ── Layout engine ─────────────────────────────────────────────────────────────
interface LayoutNode extends TopoNode { x: number; y: number; cx: number; cy: number; laneIdx: number; }

function layoutGraph(nodes: TopoNode[], agentIds: string[], durationMs: number, svgW: number): LayoutNode[] {
  const laneMap = new Map<string, number>(agentIds.map((a, i) => [a, i]));
  const cursors = new Map<string, number>();
  const plotW   = svgW - 2 * PADX - NW;

  return nodes.map((n) => {
    const laneIdx = laneMap.get(n.agentId) ?? 0;
    const idealX  = PADX + (durationMs > 0 ? (n.offsetMs / durationMs) * plotW : 0);
    const prevCursor = cursors.get(n.agentId) ?? (PADX - MIN_SPACING);
    const x = Math.max(idealX, prevCursor + MIN_SPACING, PADX);
    cursors.set(n.agentId, x);

    const cy = HDR_H + laneIdx * LANE_H + LANE_H / 2;
    return { ...n, x, y: cy - NH / 2, cx: x + NW / 2, cy, laneIdx };
  });
}

// ── SVG width from layout ─────────────────────────────────────────────────────
function computeSvgW(nodes: TopoNode[], agentIds: string[], durationMs: number, minW = 900): number {
  const dummy = layoutGraph(nodes, agentIds, durationMs, minW);
  const maxX = Math.max(...dummy.map(n => n.x + NW), minW);
  return maxX + PADX + 20;
}

// ── Edge path builder ─────────────────────────────────────────────────────────
function buildEdgePath(src: LayoutNode, tgt: LayoutNode): string {
  const x1 = src.x + NW;
  const y1 = src.cy;
  const x2 = tgt.x;
  const y2 = tgt.cy;
  const dx = (x2 - x1) * 0.5;
  // S-curve if lanes differ, gentle cubic if same lane
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

// ── Diff renderer ─────────────────────────────────────────────────────────────
type DiffStatus = "added" | "removed" | "changed" | "unchanged";
interface DiffEntry { key: string; status: DiffStatus; sentValue: unknown; receivedValue: unknown; }

function flatObj(obj: unknown, prefix = ""): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return prefix ? { [prefix]: obj } : {};
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as object)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(r, flatObj(v, key));
    } else { r[key] = v; }
  }
  return r;
}

function diffPayloads(sent: unknown, received: unknown): DiffEntry[] {
  const s = flatObj(sent ?? {});
  const r = flatObj(received ?? {});
  const keys = new Set([...Object.keys(s), ...Object.keys(r)]);
  return [...keys].map(key => {
    const inS = key in s, inR = key in r;
    const sv = s[key], rv = r[key];
    const status: DiffStatus = !inS ? "added" : !inR ? "removed"
      : JSON.stringify(sv) !== JSON.stringify(rv) ? "changed" : "unchanged";
    return { key, status, sentValue: sv, receivedValue: rv };
  }).sort((a, b) => {
    const o = { changed: 0, added: 1, removed: 2, unchanged: 3 };
    return o[a.status] - o[b.status];
  });
}

const DIFF_COLORS: Record<DiffStatus, { bg: string; label: string }> = {
  added:     { bg: P.sage   + "18", label: P.sage },
  removed:   { bg: P.terra  + "18", label: P.terra },
  changed:   { bg: P.amber  + "18", label: P.amber },
  unchanged: { bg: "transparent",  label: P.dim   },
};

// ── EdgeDiffPanel ─────────────────────────────────────────────────────────────
function EdgeDiffPanel({ edge, nodeMap, onClose }: {
  edge: TopoEdge;
  nodeMap: Map<string, LayoutNode>;
  onClose: () => void;
}) {
  const diff = useMemo(() => diffPayloads(edge.data.sent, edge.data.received), [edge]);
  const changed = diff.filter(d => d.status !== "unchanged");
  const unchanged = diff.filter(d => d.status === "unchanged");

  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);

  return (
    <div className="animate-in slide-in-from-right-4 flex flex-col"
      style={{
        background: P.bg, border: `1px solid ${P.border}`,
        borderRadius: 12, overflow: "hidden", minWidth: 380, maxWidth: 440,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b"
        style={{ borderColor: P.border, background: P.panel }}>
        <div>
          <div className="flex items-center gap-2">
            {edge.chainIntact
              ? <Link2 className="w-3.5 h-3.5" style={{ color: P.sage }} />
              : <Link2Off className="w-3.5 h-3.5" style={{ color: P.terra }} />}
            <span className="text-xs font-mono font-bold"
              style={{ color: edge.chainIntact ? P.sage : P.terra }}>
              {edge.chainIntact ? "QL-2.0 VERIFIED HANDOFF" : "⚠ BROKEN CHAIN — UNVERIFIED DATA"}
            </span>
          </div>
          <div className="text-[9px] font-mono mt-1" style={{ color: P.dim }}>
            {src?.agentId ?? edge.sourceAgent} → {tgt?.agentId ?? edge.targetAgent} ·
            {" "}{edge.edgeType.toUpperCase()}
            {edge.driftBleed > 0.15 && (
              <span className="ml-2 font-bold" style={{ color: P.amber }}>
                Δ{(edge.driftBleed * 100).toFixed(0)}% drift bleed
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="opacity-50 hover:opacity-100 ml-3">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-px border-b" style={{ borderColor: P.border }}>
        {[
          { label: "Changed", value: diff.filter(d => d.status === "changed").length, color: P.amber },
          { label: "Added",   value: diff.filter(d => d.status === "added").length,   color: P.sage },
          { label: "Removed", value: diff.filter(d => d.status === "removed").length, color: P.terra },
        ].map(({ label, value, color }) => (
          <div key={label} className="py-2 text-center" style={{ background: value > 0 ? color + "0a" : "transparent" }}>
            <div className="text-sm font-mono font-bold" style={{ color: value > 0 ? color : P.dim }}>{value}</div>
            <div className="text-[9px] font-mono uppercase" style={{ color: P.dim }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Diff table */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: 360 }}>
        {changed.length === 0 && (
          <div className="p-4 text-center text-[10px] font-mono" style={{ color: P.dim }}>
            No payload differences detected
          </div>
        )}
        {[...changed, ...unchanged].map((entry) => {
          const { bg, label } = DIFF_COLORS[entry.status];
          return (
            <div key={entry.key}
              className="px-3 py-2 border-b text-[9px] font-mono"
              style={{ background: bg, borderColor: P.border + "44" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold" style={{ color: label }}>{entry.key}</span>
                <span className="px-1 py-0.5 rounded text-[8px] uppercase"
                  style={{ color: label, background: label + "22" }}>
                  {entry.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div style={{ color: P.dim }} className="mb-0.5 text-[8px] uppercase">Sent</div>
                  <div style={{ color: entry.status === "removed" ? P.terra : "#cdd5e0" }}
                    className="break-all">
                    {entry.sentValue === undefined ? "—"
                      : JSON.stringify(entry.sentValue)}
                  </div>
                </div>
                <div>
                  <div style={{ color: P.dim }} className="mb-0.5 text-[8px] uppercase">Received</div>
                  <div style={{ color: entry.status === "added" ? P.sage : "#cdd5e0" }}
                    className="break-all">
                    {entry.receivedValue === undefined ? "—"
                      : JSON.stringify(entry.receivedValue)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Timeline Scrubber ─────────────────────────────────────────────────────────
function TimelineScrubber({
  durationMs, scrubMs, onChange, isPlaying, onPlay, onPause, onReset,
  startTime, endTime,
}: {
  durationMs: number; scrubMs: number | null;
  onChange: (ms: number | null) => void;
  isPlaying: boolean;
  onPlay: () => void; onPause: () => void; onReset: () => void;
  startTime: string; endTime: string;
}) {
  const currentMs = scrubMs ?? durationMs;
  const pct = durationMs > 0 ? (currentMs / durationMs) * 100 : 100;

  const formatOffset = (ms: number) => {
    if (ms < 1000) return `+${ms}ms`;
    if (ms < 60000) return `+${(ms / 1000).toFixed(1)}s`;
    return `+${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="px-4 py-3 border-t flex items-center gap-4"
      style={{ borderColor: P.border, background: P.panel }}>

      {/* Controls */}
      <button onClick={onReset} title="Reset"
        className="opacity-60 hover:opacity-100 transition-opacity">
        <SkipBack className="w-4 h-4" style={{ color: P.dim }} />
      </button>
      <button
        onClick={isPlaying ? onPause : onPlay}
        className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
        style={{ background: isPlaying ? P.amber + "22" : P.sage + "22",
          border: `1px solid ${isPlaying ? P.amber : P.sage}44` }}>
        {isPlaying
          ? <Pause className="w-3.5 h-3.5" style={{ color: P.amber }} />
          : <Play  className="w-3.5 h-3.5" style={{ color: P.sage }} />}
      </button>

      {/* Track */}
      <div className="flex-1 relative flex items-center gap-2">
        <span className="text-[9px] font-mono shrink-0" style={{ color: P.dim }}>
          {new Date(startTime).toLocaleTimeString()}
        </span>
        <div className="flex-1 relative h-6 flex items-center">
          {/* Track background */}
          <div className="absolute inset-x-0 h-1 rounded-full" style={{ background: P.border }} />
          {/* Filled portion */}
          <div className="absolute left-0 h-1 rounded-full transition-all duration-100"
            style={{ width: `${pct}%`, background: isPlaying ? P.amber : P.sage,
              boxShadow: `0 0 6px ${isPlaying ? P.amber : P.sage}66` }} />
          {/* Thumb */}
          <input
            type="range" min={0} max={durationMs} value={currentMs}
            onChange={e => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          />
          {/* Custom thumb indicator */}
          <div className="absolute h-3.5 w-1 rounded-full pointer-events-none transition-all duration-100"
            style={{
              left: `calc(${pct}% - 2px)`,
              background: isPlaying ? P.amber : P.sage,
              boxShadow: `0 0 8px ${isPlaying ? P.amber : P.sage}`,
            }} />
        </div>
        <span className="text-[9px] font-mono shrink-0" style={{ color: P.dim }}>
          {new Date(endTime).toLocaleTimeString()}
        </span>
      </div>

      {/* Current offset */}
      <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0"
        style={{ color: scrubMs !== null ? P.amber : P.sage }}>
        <span>{scrubMs === null ? "LIVE" : formatOffset(currentMs)}</span>
        {scrubMs !== null && (
          <button onClick={() => onChange(null)}
            className="opacity-60 hover:opacity-100 text-[8px] border rounded px-1"
            style={{ borderColor: P.border, color: P.dim }}>
            LIVE
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface CausalTopologyMapProps {
  traceId: string;
  onNodeSelect?: (eventId: string, agentId: string) => void;
  selectedEventId?: string | null;
}

export default function CausalTopologyMap({
  traceId, onNodeSelect, selectedEventId,
}: CausalTopologyMapProps) {
  const [graph, setGraph] = useState<TopologyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedEdge, setSelectedEdge] = useState<TopoEdge | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ node: LayoutNode; x: number; y: number } | null>(null);

  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // White-Gold surge state — fired by RECURSIVE_FIX_VERIFIED
  const [surgeAgentId, setSurgeAgentId] = useState<string | null>(null);
  const [surgePhase, setSurgePhase] = useState<"idle" | "surge" | "restore">("idle");

  useEffect(() => {
    const handler = (e: Event) => {
      const { agentId } = (e as CustomEvent).detail ?? {};
      if (!agentId) return;
      setSurgeAgentId(agentId);
      setSurgePhase("surge");
      // Hold surge 1.2s → fade to "restore" state → edges stay sage
      setTimeout(() => setSurgePhase("restore"), 1200);
      // Reload topology after fix so edges reflect the new RECURSIVE_FIX_VERIFIED event
      setTimeout(() => {
        setSurgePhase("idle");
        setSurgeAgentId(null);
        // Re-fetch graph to show updated chain state
        setGraph(null);
        fetch(`${BASE}/api/v1/topology/${traceId}`)
          .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
          .then(d => setGraph(d.graph))
          .catch(() => {});
      }, 3000);
    };
    window.addEventListener("recursiveFixVerified", handler);
    return () => window.removeEventListener("recursiveFixVerified", handler);
  }, [traceId]);

  // Fetch topology
  useEffect(() => {
    setLoading(true); setError(null); setGraph(null);
    fetch(`${BASE}/api/v1/topology/${traceId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setGraph(d.graph); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [traceId]);

  // Timeline playback
  useEffect(() => {
    if (!isPlaying || !graph) return;
    const step = 80; // ms per frame
    const speed = Math.max(1, graph.durationMs / 12000); // scale to ~12s playback
    playTimerRef.current = setInterval(() => {
      setScrubMs(prev => {
        const next = (prev ?? 0) + step * speed;
        if (next >= graph.durationMs) { setIsPlaying(false); return null; }
        return next;
      });
    }, step);
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current); };
  }, [isPlaying, graph]);

  const handlePlay  = useCallback(() => { setScrubMs(prev => prev === null ? 0 : prev); setIsPlaying(true);  }, []);
  const handlePause = useCallback(() => setIsPlaying(false), []);
  const handleReset = useCallback(() => { setIsPlaying(false); setScrubMs(0); }, []);

  // Layout
  const svgW = useMemo(() => {
    if (!graph) return 900;
    return Math.max(900, computeSvgW(graph.nodes, graph.agentIds, graph.durationMs));
  }, [graph]);

  const layoutNodes = useMemo(() => {
    if (!graph) return [];
    return layoutGraph(graph.nodes, graph.agentIds, graph.durationMs, svgW);
  }, [graph, svgW]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    layoutNodes.forEach(n => m.set(n.id, n));
    return m;
  }, [layoutNodes]);

  // Visible nodes/edges based on scrub position
  const visibleNodeIds = useMemo(() => {
    if (scrubMs === null) return new Set(layoutNodes.map(n => n.id));
    return new Set(layoutNodes.filter(n => n.offsetMs <= scrubMs).map(n => n.id));
  }, [layoutNodes, scrubMs]);

  const visibleEdgeIds = useMemo(() => {
    if (!graph) return new Set<string>();
    if (scrubMs === null) return new Set(graph.edges.map(e => e.id));
    return new Set(
      graph.edges.filter(e =>
        visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
      ).map(e => e.id)
    );
  }, [graph, scrubMs, visibleNodeIds]);

  const svgH = useMemo(() => {
    if (!graph) return 300;
    return HDR_H + graph.agentIds.length * LANE_H + 20;
  }, [graph]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 font-mono text-sm animate-pulse"
        style={{ color: P.dim }}>
        Building causal dependency graph…
      </div>
    );
  }
  if (error || !graph) {
    return (
      <div className="flex items-center justify-center py-8 font-mono text-sm"
        style={{ color: P.terra }}>
        {error ?? "No topology data available for this trace."}
      </div>
    );
  }

  const { nodes, edges, agentIds, stats } = graph;

  return (
    <div style={{ background: P.bg, borderRadius: 10, overflow: "hidden" }}>
      <style>{`
        @keyframes ctm-dash { to { stroke-dashoffset: -18 } }
        @keyframes ctm-pulse { 0%,100%{opacity:.3} 50%{opacity:.9} }
        @keyframes ctm-appear { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        .ctm-node { transition: opacity 0.25s ease; }
        .ctm-edge { transition: opacity 0.25s ease; }
      `}</style>

      {/* Stats bar */}
      <div className="flex items-center gap-5 px-4 py-2.5 border-b text-[9px] font-mono"
        style={{ borderColor: P.border, background: P.panel }}>
        {[
          { label: "Nodes",     value: stats.totalNodes,                color: P.blue },
          { label: "Handoffs",  value: stats.handoffs,                  color: P.violet },
          { label: "Broken",    value: stats.brokenLinks,               color: stats.brokenLinks > 0 ? P.terra : P.dim },
          { label: "Avg Drift", value: `${stats.avgDrift.toFixed(1)}%`, color: stats.avgDrift > 15 ? P.amber : P.sage },
          { label: "QL-2.0",   value: `${stats.quantumVerifiedPct.toFixed(0)}%`, color: P.sage },
          { label: "Agents",    value: agentIds.length,                 color: P.dim },
        ].map(({ label, value, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span style={{ color: P.dim }}>{label}</span>
            <span className="font-bold" style={{ color }}>{value}</span>
          </span>
        ))}
        {scrubMs !== null && (
          <span className="ml-auto flex items-center gap-1" style={{ color: P.amber }}>
            <RotateCcw className="w-2.5 h-2.5" />SCRUBBING
          </span>
        )}
      </div>

      <div className="flex">
        {/* ── SVG canvas ── */}
        <div ref={svgContainerRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}>
          <svg width={svgW} height={svgH} style={{ display: "block" }}>
            <defs>
              {/* Arrow markers */}
              <marker id="ctm-sage"  markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={P.sage} opacity="0.85" />
              </marker>
              <marker id="ctm-terra" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={P.terra} />
              </marker>
              <marker id="ctm-amber" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={P.amber} />
              </marker>

              {/* Drift heatmap gradients for each edge */}
              {edges.map(edge => {
                const srcNode = nodeMap.get(edge.source);
                const tgtNode = nodeMap.get(edge.target);
                if (!srcNode || !tgtNode) return null;
                const srcColor = driftColor(srcNode.drift);
                const tgtColor = !edge.chainIntact ? P.terra
                  : edge.driftBleed > 0.3 ? P.amber
                  : P.sage;
                return (
                  <linearGradient key={`grad-${edge.id}`} id={`grad-${edge.id}`}
                    x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor={srcColor} stopOpacity="0.8" />
                    <stop offset="100%" stopColor={tgtColor} stopOpacity="0.9" />
                  </linearGradient>
                );
              })}

              {/* Node glow filters */}
              {layoutNodes.map(n => {
                const color = driftColor(n.drift);
                return (
                  <filter key={`filt-${n.id}`} id={`filt-${n.id}`}
                    x="-50%" y="-50%" width="200%" height="200%">
                    <feFlood floodColor={color} result="fc" />
                    <feComposite in="fc" in2="SourceGraphic" operator="in" result="m" />
                    <feGaussianBlur in="m" stdDeviation="5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                );
              })}
            </defs>

            {/* ── White-Gold surge overlay ── */}
            <style>{`
              @keyframes wg-flash { 0%{opacity:0} 15%{opacity:0.7} 60%{opacity:0.5} 100%{opacity:0} }
              @keyframes wg-edges-restore { from{opacity:0.3} to{opacity:1} }
              .wg-surge-rect { animation: wg-flash 1.2s ease forwards; }
              .wg-restore-rect { animation: wg-edges-restore 0.8s ease forwards; }
            `}</style>

            {/* ── Swimlane backgrounds ── */}
            {agentIds.map((agentId, laneIdx) => (
              <g key={agentId}>
                <rect
                  x={0} y={HDR_H + laneIdx * LANE_H}
                  width={svgW} height={LANE_H}
                  fill={laneIdx % 2 === 0 ? "#ffffff04" : "#000000"}
                  opacity={0.4}
                />
                {/* Lane label */}
                <text
                  x={10} y={HDR_H + laneIdx * LANE_H + LANE_H / 2 + 4}
                  fontSize="9" fill={P.dim} fontFamily="monospace"
                  opacity="0.6" writingMode="vertical-lr"
                  style={{ userSelect: "none" }}>
                  {agentId.length > 12 ? agentId.substring(0, 10) + "…" : agentId}
                </text>
                {/* Lane divider */}
                <line
                  x1={0} y1={HDR_H + laneIdx * LANE_H}
                  x2={svgW} y2={HDR_H + laneIdx * LANE_H}
                  stroke={P.border} strokeWidth="1" opacity="0.5"
                />

                {/* White-Gold surge overlay for this lane */}
                {surgeAgentId === agentId && surgePhase === "surge" && (
                  <g>
                    <rect
                      key={`wg-surge-${Date.now()}`}
                      x={0} y={HDR_H + laneIdx * LANE_H}
                      width={svgW} height={LANE_H}
                      className="wg-surge-rect"
                      style={{
                        fill: `url(#wg-grad-${laneIdx})`,
                        pointerEvents: "none",
                      }}
                    />
                    <defs>
                      <linearGradient id={`wg-grad-${laneIdx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%"   stopColor="#FFFBE8" stopOpacity="0.1" />
                        <stop offset="40%"  stopColor="#FFD700" stopOpacity="0.55" />
                        <stop offset="60%"  stopColor="#FFFBE8" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#FFD700" stopOpacity="0.1" />
                      </linearGradient>
                    </defs>
                  </g>
                )}
                {/* "Restored" gold border for the lane post-surge */}
                {surgeAgentId === agentId && surgePhase === "restore" && (
                  <rect
                    x={1} y={HDR_H + laneIdx * LANE_H + 1}
                    width={svgW - 2} height={LANE_H - 2}
                    fill="none"
                    stroke="#FFD700" strokeWidth="2"
                    strokeDasharray="8,4"
                    opacity="0.5"
                    className="wg-restore-rect"
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </g>
            ))}

            {/* ── Edges ── */}
            {edges.map(edge => {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (!src || !tgt) return null;

              const visible = visibleEdgeIds.has(edge.id);
              const isHovered = hoveredEdge === edge.id;
              const isSelected = selectedEdge?.id === edge.id;
              const path = buildEdgePath(src, tgt);
              // During surge restore phase: force edge to sage (restored state)
              const isSurgedAgent =
                surgePhase !== "idle" &&
                (edge.sourceAgent === surgeAgentId || edge.targetAgent === surgeAgentId);
              const stroke = isSurgedAgent && surgePhase === "restore"
                ? P.sage
                : edgeStroke(edge);
              const markerId = !edge.chainIntact ? "ctm-terra"
                : edge.driftBleed > 0.15 ? "ctm-amber"
                : "ctm-sage";
              const isCrossLane = src.laneIdx !== tgt.laneIdx;

              return (
                <g key={edge.id}
                  data-testid={`ctm-edge-${edge.id}`}
                  className="ctm-edge"
                  style={{ opacity: visible ? 1 : 0, cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setSelectedEdge(edge); }}
                  onMouseEnter={() => setHoveredEdge(edge.id)}
                  onMouseLeave={() => setHoveredEdge(null)}>

                  {/* Drift bleed glow */}
                  {edge.driftBleed > 0.15 && (
                    <path d={path} fill="none"
                      stroke={P.amber} strokeWidth="8" opacity={edge.driftBleed * 0.2}
                    />
                  )}

                  {/* Selected/hovered glow */}
                  {(isSelected || isHovered) && (
                    <path d={path} fill="none"
                      stroke={isSelected ? P.blue : P.amber}
                      strokeWidth="5" opacity="0.25"
                    />
                  )}

                  {/* Main edge */}
                  <path d={path} fill="none"
                    stroke={`url(#grad-${edge.id})`}
                    strokeWidth={isSelected ? 3 : isHovered ? 2.5 : isCrossLane ? 2 : 1.5}
                    strokeDasharray={!edge.chainIntact ? "7,4" : edge.edgeType === "handoff" ? "none" : "none"}
                    markerEnd={`url(#${markerId})`}
                    opacity={visible ? (isSelected ? 1 : 0.75) : 0}
                    style={!edge.chainIntact ? { animation: "ctm-dash 0.7s linear infinite" } : undefined}
                  />

                  {/* Edge click target (invisible, wide hit area, must be last) */}
                  <path d={path} fill="none" stroke="transparent" strokeWidth="16"
                    style={{ pointerEvents: "stroke", cursor: "pointer" }} />

                  {/* Edge type badge for handoffs */}
                  {(isCrossLane || edge.edgeType === "handoff") && (
                    <text
                      x={(src.x + NW + tgt.x) / 2}
                      y={(src.cy + tgt.cy) / 2 - 7}
                      textAnchor="middle" fontSize="8"
                      fill={edge.edgeType === "cross_swarm" ? P.violet : P.blue}
                      fontFamily="monospace" opacity="0.8">
                      {edge.edgeType === "cross_swarm" ? "cross-swarm" : "handoff"}
                    </text>
                  )}

                  {/* Chain break label */}
                  {!edge.chainIntact && (
                    <text
                      x={(src.x + NW + tgt.x) / 2}
                      y={(src.cy + tgt.cy) / 2 - 7}
                      textAnchor="middle" fontSize="8" fontWeight="bold"
                      fill={P.terra} fontFamily="monospace">
                      ⚠ CHAIN BREAK
                    </text>
                  )}
                </g>
              );
            })}

            {/* ── Nodes ── */}
            {layoutNodes.map((n) => {
              const meta = NODE_META[n.nodeType] ?? NODE_META.Action;
              const visible = visibleNodeIds.has(n.id);
              const isSelected = selectedEventId === n.eventId;
              const isHovered  = hoveredNode === n.id;
              const drift = n.drift;
              const dc = driftColor(drift);
              const nodeColor = meta.color;
              const label = n.label.length > 16 ? n.label.substring(0, 14) + "…" : n.label;

              return (
                <g key={n.id}
                  className="ctm-node"
                  data-testid={`ctm-node-${n.eventId}`}
                  data-node-type={n.nodeType}
                  style={{
                    opacity: visible ? 1 : 0,
                    cursor: "pointer",
                    animation: visible ? "ctm-appear 0.3s ease forwards" : "none",
                  }}
                  pointerEvents="bounding-box"
                  onClick={() => {
                    onNodeSelect?.(n.eventId, n.agentId);
                    window.dispatchEvent(new CustomEvent("sentinelFocusAgent", {
                      detail: { agentId: n.agentId, eventId: n.eventId },
                    }));
                  }}
                  onMouseEnter={(e) => {
                    setHoveredNode(n.id);
                    setTooltip({ node: n, x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => {
                    setHoveredNode(null);
                    setTooltip(null);
                  }}>

                  {/* Selection ring */}
                  {isSelected && (
                    <rect x={n.x - 5} y={n.y - 5} width={NW + 10} height={NH + 10} rx="12"
                      fill="none" stroke={P.blue} strokeWidth="2"
                      style={{ animation: "ctm-pulse 1.5s ease-in-out infinite" }}
                    />
                  )}

                  {/* Drift glow halo */}
                  {drift > 15 && (
                    <rect x={n.x - 2} y={n.y - 2} width={NW + 4} height={NH + 4} rx="9"
                      fill={dc} fillOpacity={Math.min(0.2, drift / 250)} stroke={dc}
                      strokeWidth="1.5" strokeOpacity="0.4"
                    />
                  )}

                  {/* Node body */}
                  <rect x={n.x} y={n.y} width={NW} height={NH} rx="8"
                    fill={nodeColor + "10"}
                    stroke={isHovered ? nodeColor : isSelected ? P.blue : nodeColor + "88"}
                    strokeWidth={isHovered || isSelected ? 2 : 1.5}
                    filter={`url(#filt-${n.id})`}
                  />

                  {/* Breach / anomaly hatching */}
                  {n.isAnomalous && (
                    <rect x={n.x} y={n.y} width={NW} height={NH} rx="8"
                      fill="none" stroke={P.terra} strokeWidth="1"
                      strokeDasharray="4,3" opacity="0.55"
                    />
                  )}

                  {/* Node type icon */}
                  <text x={n.x + 14} y={n.y + 20}
                    textAnchor="middle" fontSize="12"
                    fill={nodeColor} fontFamily="monospace">
                    {meta.icon}
                  </text>

                  {/* Node type label */}
                  <text x={n.x + NW / 2 + 4} y={n.y + 22}
                    textAnchor="middle" fontSize="8.5"
                    fill={nodeColor} fontFamily="monospace" fontWeight="bold">
                    {n.nodeType.replace("_", " ")}
                  </text>

                  {/* Event label */}
                  <text x={n.x + NW / 2} y={n.y + 37}
                    textAnchor="middle" fontSize="8"
                    fill="#cdd5e0" fontFamily="monospace">
                    {label}
                  </text>

                  {/* Drift % */}
                  <text x={n.x + NW / 2} y={n.y + 51}
                    textAnchor="middle" fontSize="8"
                    fill={drift > 15 ? dc : P.dim} fontFamily="monospace">
                    Δ{drift.toFixed(0)}%{drift > 15 ? " ↑" : ""}
                  </text>

                  {/* Hash chip */}
                  <text x={n.x + NW / 2} y={n.y + 64}
                    textAnchor="middle" fontSize="6.5"
                    fill={P.dim} fillOpacity="0.6" fontFamily="monospace">
                    {n.currentHash?.substring(0, 8)}…
                  </text>

                  {/* QL-2.0 / unverified badge */}
                  <text x={n.x + NW - 9} y={n.y + 15}
                    textAnchor="middle" fontSize="9"
                    fill={n.quantumVerified ? P.sage : P.dim}>
                    {n.quantumVerified ? "⚡" : "·"}
                  </text>

                  {/* Transparent hitbox */}
                  <rect x={n.x - 4} y={n.y - 4} width={NW + 8} height={NH + 8}
                    rx="10" fill="transparent" stroke="none" />
                </g>
              );
            })}

            {/* ── Timeline cursor line ── */}
            {scrubMs !== null && graph.durationMs > 0 && (() => {
              const pct = scrubMs / graph.durationMs;
              const plotW = svgW - 2 * PADX - NW;
              const cursorX = PADX + pct * plotW + NW / 2;
              return (
                <line x1={cursorX} y1={HDR_H} x2={cursorX} y2={svgH}
                  stroke={P.amber} strokeWidth="1.5"
                  strokeDasharray="6,4" opacity="0.7" />
              );
            })()}
          </svg>
        </div>

        {/* ── Edge Diff Panel ── */}
        {selectedEdge && (
          <div className="shrink-0 border-l" style={{ borderColor: P.border, width: 420 }}>
            <EdgeDiffPanel
              edge={selectedEdge}
              nodeMap={nodeMap}
              onClose={() => setSelectedEdge(null)}
            />
          </div>
        )}
      </div>

      {/* ── Timeline Scrubber ── */}
      <TimelineScrubber
        durationMs={graph.durationMs}
        scrubMs={scrubMs}
        onChange={setScrubMs}
        isPlaying={isPlaying}
        onPlay={handlePlay}
        onPause={handlePause}
        onReset={handleReset}
        startTime={graph.startTime}
        endTime={graph.endTime}
      />

      {/* ── Legend ── */}
      <div className="px-4 py-2 border-t flex items-center gap-4 flex-wrap text-[9px] font-mono"
        style={{ borderColor: P.border, color: P.dim }}>
        {[
          { line: "solid",  color: P.sage,  label: "QL-2.0 intact" },
          { line: "dashed", color: P.terra, label: "Chain break" },
          { line: "solid",  color: P.amber, label: "Drift bleed >15%" },
          { line: "solid",  color: P.violet, label: "Cross-swarm handoff" },
        ].map(({ line, color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <svg width="20" height="8">
              <line x1="0" y1="4" x2="20" y2="4"
                stroke={color} strokeWidth={line === "dashed" ? 2 : 1.5}
                strokeDasharray={line === "dashed" ? "5,3" : "none"} />
            </svg>
            {label}
          </span>
        ))}
        <span className="ml-auto">Click edge = payload diff view · Click node = sync HUD</span>
      </div>

      {/* ── Hover Tooltip ── */}
      {tooltip && (
        <div className="fixed z-50 pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 14, window.innerWidth - 220),
            top: Math.max(tooltip.y - 110, 8),
            width: 210,
            background: "rgba(10,14,23,0.97)",
            border: `1px solid ${P.border}`,
            borderRadius: 10,
            boxShadow: `0 8px 24px rgba(0,0,0,0.5)`,
          }}>
          <div className="px-3 py-2 border-b" style={{ borderColor: P.border + "66" }}>
            <div className="text-[9px] font-mono font-bold" style={{
              color: NODE_META[tooltip.node.nodeType]?.color ?? P.sage,
            }}>
              {tooltip.node.nodeType.replace("_", " ")} · {tooltip.node.eventType}
            </div>
            <div className="text-[9px] font-mono mt-0.5" style={{ color: P.dim }}>
              {tooltip.node.agentId}
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div className="rounded px-2 py-1.5" style={{
              background: tooltip.node.quantumVerified ? P.sage + "0f" : P.terra + "0f",
              border: `1px solid ${tooltip.node.quantumVerified ? P.sage + "33" : P.terra + "33"}`,
            }}>
              <div className="flex items-center gap-1.5">
                {tooltip.node.quantumVerified
                  ? <Zap className="w-2.5 h-2.5" style={{ color: P.sage }} />
                  : <AlertTriangle className="w-2.5 h-2.5" style={{ color: P.terra }} />}
                <span className="text-[9px] font-mono font-bold"
                  style={{ color: tooltip.node.quantumVerified ? P.sage : P.terra }}>
                  {tooltip.node.quantumVerified ? "ML-DSA-87 VERIFIED" : "UNVERIFIED"}
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono" style={{ color: P.dim }}>Cognitive Drift</span>
                <span className="text-[9px] font-mono font-bold"
                  style={{ color: driftColor(tooltip.node.drift) }}>
                  {tooltip.node.drift.toFixed(1)}%
                </span>
              </div>
              <div className="h-1 rounded-full" style={{ background: P.border }}>
                <div className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, tooltip.node.drift)}%`,
                    background: driftColor(tooltip.node.drift),
                  }} />
              </div>
            </div>
            <div className="text-[9px] font-mono" style={{ color: P.dim }}>
              H: <span style={{ color: "#6a8caa" }}>{tooltip.node.currentHash?.substring(0, 12)}…</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
