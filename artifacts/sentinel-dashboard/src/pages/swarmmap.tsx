/**
 * Project Darwin — Evolutionary Prosperity Engine v3
 *
 * Radial Phylogeny:       LUCA nucleus at center; generations orbit on Vessel Physics curves.
 * Fitness Gradient:       Vitality drives scale (1.5×), bio-luminescent glow, Calcification at 300s idle.
 * Maladaptive Mutation:   SVG feTurbulence distortion shader for drift > 15%; vibration increases with drift.
 * Extinction Logic:       Cellular Dissolution particle explosion + vine withers to dashed grey.
 * Prosperity Pulse:       Global swarm-vitality mapped to slow-breathing background radial glow.
 * CRISPR Recoding:        White-Gold surge travels from LUCA down vines, washing distortion from descendants.
 * Spawn Sparks:           Gold pulse travels vine when new offspring node buds from parent.
 */

import React, {
  useEffect, useRef, useState, useCallback, useMemo,
} from "react";
import * as d3 from "d3";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Network, RefreshCw, Skull, Activity, X,
  ChevronRight, Fingerprint, Dna, TreePine, Flame, Zap,
} from "lucide-react";
import { useForensic } from "@/contexts/ForensicContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  sage:       "#40B595",
  amber:      "#EBC06D",
  terra:      "#D96161",
  blue:       "#5B8DEF",
  gold:       "#FFD700",
  whiteGold:  "#FFF8C5",
  mutation:   "#C084FC",
  collapse:   "#FF6B6B",
  calcite:    "#6B7280",   // calcification grey
  dim:        "#9AA4B1",
  border:     "#2C3136",
  panel:      "#161B22",
  bg:         "#0D1117",
  grid:       "#1a2130",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface SwarmNodeData {
  id: string; label: string; status: string;
  swarmId: string | null; rootSwarmId: string | null; parentUid: string | null;
  createdAt: string; revokedAt: string | null; revokedReason: string | null;
  x?: number; y?: number; vx?: number; vy?: number;
  fx?: number | null; fy?: number | null;
  isRoot?: boolean; radius?: number; drift?: number;
  fitnessScore?: number;
  generationDepth?: number;
}
interface SwarmLink {
  source: string | SwarmNodeData;
  target: string | SwarmNodeData;
}
interface StreamPacket {
  t: string; a: string; e: string; d: number; h: string;
  q: boolean; p: string | null; x: boolean; r: boolean;
  s: string | null; tid: string; lid: string;
}

// Surge animation: CRISPR white-gold wave propagating down a lineage at 800 px/s
interface SurgeAnim {
  rootId:      string;               // node where surge originates
  startedAt:   number;               // ms timestamp
  targets:     string[];             // ordered BFS list of node IDs (root → leaves)
  arrivalMs:   number[];             // cumulative ms when surge reaches each target
  segmentCps:  [number, number][];   // bezier control point per vine segment
  totalMs:     number;               // ms when last node is reached
}
// Spawn spark: gold dot travelling from parent → new offspring node
interface SpawnSpark { parentId: string; childId: string; startedAt: number; }
// Collapse burst state
interface CollapseState { startedAt: number; x: number; y: number; r: number; }

// ── Fitness / geometry helpers ─────────────────────────────────────────────────
function computeFitness(drift: number, status: string): number {
  if (status === "revoked") return 0;
  const d = Math.max(0, Math.min(100, drift));
  const factor = status === "drift-locked" ? 0.4 : 1;
  return Math.max(0, ((1 - d / 100) / (1 + d / 100)) * factor);
}

function bfsChildren(fromId: string, links: SwarmLink[]): string[] {
  const childMap = buildChildMap(links);
  const result: string[] = [];
  const visited = new Set<string>([fromId]);
  const q = [fromId];
  while (q.length) {
    const id = q.shift()!;
    for (const c of (childMap.get(id) ?? [])) {
      if (!visited.has(c)) { visited.add(c); result.push(c); q.push(c); }
    }
  }
  return result;
}

function buildChildMap(links: SwarmLink[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const lk of links) {
    const s = typeof lk.source === "string" ? lk.source : (lk.source as SwarmNodeData).id;
    const t = typeof lk.target === "string" ? lk.target : (lk.target as SwarmNodeData).id;
    if (!m.has(s)) m.set(s, []);
    m.get(s)!.push(t);
  }
  return m;
}

function computeGenerationDepths(nodes: SwarmNodeData[], links: SwarmLink[]): Map<string, number> {
  const childMap = buildChildMap(links);
  const depth = new Map<string, number>();
  const queue: [string, number][] = nodes.filter(n => n.isRoot).map(r => [r.id, 0]);
  while (queue.length) {
    const item = queue.shift()!;
    const [id, d] = item;
    if (depth.has(id)) continue;
    depth.set(id, d);
    for (const c of (childMap.get(id) ?? [])) queue.push([c, d + 1]);
  }
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 1);
  return depth;
}

function lineageAvgFitness(fromId: string, nodeMap: Map<string, SwarmNodeData>, links: SwarmLink[]): number {
  const ids = [fromId, ...bfsChildren(fromId, links)];
  const nodes = ids.map(id => nodeMap.get(id)).filter(Boolean) as SwarmNodeData[];
  if (!nodes.length) return 0;
  return nodes.reduce((s, n) => s + (n.fitnessScore ?? 0), 0) / nodes.length;
}

/**
 * Organic radial vine curve.
 * Instead of a straight quadratic bezier, we interpolate the control point
 * in polar space so vines naturally arc around the LUCA nucleus.
 */
function radialVine(sx: number, sy: number, tx: number, ty: number, cx: number, cy: number): string {
  const saAngle = Math.atan2(sy - cy, sx - cx);
  const taAngle = Math.atan2(ty - cy, tx - cx);
  const srR     = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
  const trR     = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);

  // Arc the control point at the average radius, interpolated angle
  let midA = (saAngle + taAngle) / 2;
  // Ensure we take the short arc
  if (Math.abs(taAngle - saAngle) > Math.PI) midA += Math.PI;
  const midR = (srR + trR) / 2 * 0.7; // pull inward so arcs stay organic

  const cpx = cx + midR * Math.cos(midA);
  const cpy = cy + midR * Math.sin(midA);
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} Q ${cpx.toFixed(2)} ${cpy.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)}`;
}

/** A point on a quadratic bezier at t ∈ [0,1]. */
function bezierPt(sx: number, sy: number, cpx: number, cpy: number, tx: number, ty: number, t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * sx + 2 * mt * t * cpx + t * t * tx,
    y: mt * mt * sy + 2 * mt * t * cpy + t * t * ty,
  };
}

/** Approximate quadratic bezier arc length by sampling at N points (px). */
function bezierLength(sx: number, sy: number, cpx: number, cpy: number, tx: number, ty: number, samples = 24): number {
  let len = 0;
  let prev = { x: sx, y: sy };
  for (let i = 1; i <= samples; i++) {
    const pt = bezierPt(sx, sy, cpx, cpy, tx, ty, i / samples);
    len += Math.sqrt((pt.x - prev.x) ** 2 + (pt.y - prev.y) ** 2);
    prev = pt;
  }
  return Math.max(len, 1);
}

/**
 * Radial vine control point for a given source/target pair.
 * Returns [cpx, cpy] for the quadratic bezier.
 */
function radialVineCp(sx: number, sy: number, tx: number, ty: number, cx: number, cy: number): [number, number] {
  const saA = Math.atan2(sy - cy, sx - cx);
  const taA = Math.atan2(ty - cy, tx - cx);
  let midA  = (saA + taA) / 2;
  if (Math.abs(taA - saA) > Math.PI) midA += Math.PI;
  const midR = (Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2) + Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2)) / 2 * 0.7;
  return [cx + midR * Math.cos(midA), cy + midR * Math.sin(midA)];
}

/**
 * Build per-segment timing for the CRISPR White-Gold surge at 800 px/s.
 * Returns cumulative arrival timestamps (ms from surge start) for each target node,
 * plus the bezier control point per segment for accurate particle interpolation.
 */
function buildSurgeTimings(
  targets: string[],
  nodeMap: Map<string, SwarmNodeData>,
  _links: SwarmLink[],
  cx: number, cy: number,
): { arrivalMs: number[]; segmentCps: [number, number][]; totalMs: number } {
  const PX_PER_MS = 800 / 1000;   // 800 px/s → 0.8 px/ms
  const arrivalMs: number[]          = [0];
  const segmentCps: [number, number][] = [];

  for (let i = 0; i < targets.length - 1; i++) {
    const src = nodeMap.get(targets[i]!);
    const tgt = nodeMap.get(targets[i + 1]!);
    const prev = arrivalMs[i] ?? 0;

    if (!src?.x || !src?.y || !tgt?.x || !tgt?.y) {
      arrivalMs.push(prev + 400);          // fallback: 400ms per hop
      segmentCps.push([cx, cy]);
      continue;
    }
    const [cpx, cpy] = radialVineCp(src.x, src.y, tgt.x, tgt.y, cx, cy);
    segmentCps.push([cpx, cpy]);
    const len = bezierLength(src.x, src.y, cpx, cpy, tgt.x, tgt.y);
    arrivalMs.push(prev + len / PX_PER_MS);
  }

  const totalMs = arrivalMs[arrivalMs.length - 1] ?? 0;
  return { arrivalMs, segmentCps, totalMs };
}

// ── Node color ────────────────────────────────────────────────────────────────
function nodeColor(node: SwarmNodeData, calcified: boolean): string {
  if (calcified) return P.calcite;
  if (node.status === "revoked") return P.terra;
  const drift = node.drift ?? 0;
  if (drift > 30) return P.mutation;
  if (drift > 15 || node.status === "drift-locked") return P.amber;
  const f = node.fitnessScore ?? 0.5;
  // Bio-luminescence: very high fitness → slightly brighter sage
  return f > 0.85 ? "#4EC9A5" : P.sage;
}

function fitnessRadius(f: number, isRoot: boolean): number {
  const base = isRoot ? 22 : 12;
  // Fitness multiplier 1.0 → 1.5
  return base * (1.0 + f * 0.5);
}

// ── Right-click context menu ──────────────────────────────────────────────────
interface CtxMenuProps {
  node: SwarmNodeData; x: number; y: number; calcified: boolean;
  onClose: () => void; onRevoke: () => void; onTrace: () => void;
  onDriftLock: () => void; onCrispr: () => void;
}
function SovereignContextMenu({ node, x, y, calcified, onClose, onRevoke, onTrace, onDriftLock, onCrispr }: CtxMenuProps) {
  const color = nodeColor(node, calcified);
  const f = node.fitnessScore ?? 0;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 rounded-xl overflow-hidden shadow-2xl"
        style={{ left: Math.min(x, window.innerWidth - 270), top: Math.min(y, window.innerHeight - 360),
          width: 260, background: "rgba(13,17,23,0.97)", border: `1px solid ${color}55`,
          backdropFilter: "blur(20px)", boxShadow: `0 0 40px ${color}22` }}>

        <div className="px-4 py-3 border-b" style={{ borderColor: color + "33", background: color + "10" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
              <span className="text-xs font-mono font-bold truncate max-w-40" style={{ color }}>{node.label}</span>
            </div>
            <button onClick={onClose} className="opacity-40 hover:opacity-100"><X className="w-3 h-3" /></button>
          </div>
          <div className="text-[9px] font-mono mt-1 flex items-center gap-2" style={{ color: P.dim }}>
            <span className="uppercase">{node.status}</span>
            {node.isRoot && <span className="px-1 py-0.5 rounded" style={{ background: P.gold + "22", color: P.gold, border: `1px solid ${P.gold}44` }}>LUCA</span>}
            {calcified && <span style={{ color: P.calcite }}>CALCIFIED</span>}
            <span>Gen {node.generationDepth ?? 0}</span>
          </div>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[8px] font-mono mb-1" style={{ color: P.dim }}>
              <span>ORGANISM FITNESS</span><span style={{ color }}>{(f * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: P.border }}>
              <div className="h-full rounded-full" style={{ width: `${f * 100}%`, background: `linear-gradient(90deg,${P.terra},${P.amber},${P.sage})` }} />
            </div>
          </div>
        </div>

        <div className="px-4 py-2 border-b" style={{ borderColor: P.border }}>
          <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>CRISPR Logic Recoding</div>
        </div>

        <div className="p-2 space-y-1">
          <button onClick={onTrace} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono hover:bg-white/5">
            <Activity className="w-3.5 h-3.5" style={{ color: P.blue }} />
            <span style={{ color: "#e0e6ed" }}>View Trace Explorer</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
          </button>
          {node.status === "active" && (
            <button onClick={onCrispr} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono hover:bg-yellow-500/10">
              <Zap className="w-3.5 h-3.5" style={{ color: P.gold }} />
              <span style={{ color: P.whiteGold }}>Apply CRISPR White-Gold Surge</span>
            </button>
          )}
          {node.status === "active" && (
            <button onClick={onDriftLock} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono hover:bg-purple-500/10">
              <Dna className="w-3.5 h-3.5" style={{ color: P.mutation }} />
              <span style={{ color: P.amber }}>Flag Genetic Drift</span>
            </button>
          )}
          {node.status === "active" && (
            <button onClick={onRevoke} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono hover:bg-red-500/10">
              <Skull className="w-3.5 h-3.5" style={{ color: P.terra }} />
              <span style={{ color: P.terra }}>Cellular Dissolution</span>
            </button>
          )}
        </div>

        <div className="px-4 py-2 border-t" style={{ borderColor: P.border }}>
          <div className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: P.dim }}>
            <Fingerprint className="w-2.5 h-2.5" />
            <span className="truncate">{node.id.substring(0, 24)}…</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Node Info Panel ────────────────────────────────────────────────────────────
function NodeInfoPanel({ node, lineageRate, calcified, onClose }: {
  node: SwarmNodeData; lineageRate: number; calcified: boolean; onClose: () => void;
}) {
  const color = nodeColor(node, calcified);
  const f     = node.fitnessScore ?? 0;
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${color}44`, background: "rgba(13,17,23,0.95)", backdropFilter: "blur(20px)" }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: color + "33", background: color + "0f" }}>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}88` }} />
          <span className="text-xs font-mono font-bold" style={{ color }}>{node.label}</span>
          {node.isRoot && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold" style={{ color: P.gold, background: P.gold + "22", border: `1px solid ${P.gold}55` }}>LUCA ◆</span>}
          {calcified && <span className="text-[9px] font-mono px-1 rounded" style={{ color: P.calcite, background: "#ffffff0a" }}>CALCIFIED</span>}
        </div>
        <button onClick={onClose} className="opacity-40 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between text-[8px] font-mono mb-1">
          <span style={{ color: P.dim }}>ORGANISM FITNESS</span>
          <span style={{ color }}>{(f * 100).toFixed(0)}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: P.border }}>
          <div className="h-full rounded-full" style={{ width: `${f * 100}%`, background: `linear-gradient(90deg,${P.terra} 0%,${P.amber} 45%,${P.sage} 100%)` }} />
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono mb-1">
          <span style={{ color: P.dim }}>LINEAGE SUCCESS RATE</span>
          <span style={{ color: lineageRate > 0.6 ? P.sage : lineageRate > 0.3 ? P.amber : P.terra }}>{(lineageRate * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: P.border }}>
          <div className="h-full rounded-full" style={{ width: `${lineageRate * 100}%`, background: lineageRate > 0.6 ? P.sage : lineageRate > 0.3 ? P.amber : P.terra }} />
        </div>
      </div>
      <div className="p-4 space-y-1.5 pt-2">
        {[
          { label: "Status",      value: node.status.toUpperCase(), color },
          { label: "Generation",  value: `Gen ${node.generationDepth ?? 0}` },
          { label: "Drift",       value: `${(node.drift ?? 0).toFixed(1)}%`, color: (node.drift ?? 0) > 15 ? P.amber : P.sage },
          { label: "Swarm",       value: node.swarmId ?? "—" },
          { label: "Parent",      value: node.parentUid ? node.parentUid.substring(0, 20) + "…" : "genesis" },
          { label: "Registered",  value: new Date(node.createdAt).toLocaleString() },
          ...(node.revokedAt ? [{ label: "Dissolved", value: new Date(node.revokedAt).toLocaleString(), color: P.terra }] : []),
        ].map(({ label, value, color: c }) => (
          <div key={label} className="flex items-start gap-3">
            <span className="text-[9px] font-mono uppercase tracking-widest w-20 shrink-0 pt-0.5" style={{ color: P.dim }}>{label}</span>
            <span className="text-[10px] font-mono font-bold break-all" style={{ color: c ?? "#cdd5e0" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Drift Sparkline ────────────────────────────────────────────────────────────
function DriftSparkline({ history, current, color }: { history: number[]; current: number; color: string }) {
  const vals = history.length > 0 ? history : [current];
  const max  = Math.max(...vals, 20);
  const W = 40; const H = 16;
  const pts = vals.map((v, i) => {
    const x = (i / Math.max(vals.length - 1, 1)) * W;
    const y = H - (v / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" opacity="0.8" strokeLinecap="round" strokeLinejoin="round" />
      {vals.length > 0 && (() => {
        const lastY = H - (vals[vals.length - 1]! / max) * H;
        return <circle cx={W} cy={lastY} r="1.5" fill={color} opacity="0.9" />;
      })()}
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SwarmMapPage() {
  const svgRef  = useRef<SVGSVGElement>(null);
  const simRef  = useRef<d3.Simulation<SwarmNodeData, SwarmLink> | null>(null);
  const tickRef = useRef(0);

  const [nodes,      setNodes]      = useState<SwarmNodeData[]>([]);
  const [links,      setLinks]      = useState<SwarmLink[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [renderTick, setRenderTick] = useState(0);

  const [selectedNode,    setSelectedNode]    = useState<SwarmNodeData | null>(null);
  const [ctxMenu,         setCtxMenu]         = useState<{ node: SwarmNodeData; x: number; y: number } | null>(null);
  const [revoking,        setRevoking]        = useState(false);
  const [revokeResult,    setRevokeResult]    = useState<string | null>(null);
  const [hoveredLinkIdx,  setHoveredLinkIdx]  = useState<number | null>(null);
  const [lineageTip,      setLineageTip]      = useState<{ x: number; y: number; rate: number; label: string } | null>(null);

  // Calcification: agents idle > 300s are desaturated
  const lastActivityRef = useRef<Map<string, number>>(new Map());  // agentId → timestamp ms

  // Collapse burst particles
  const collapsingRef      = useRef<Map<string, CollapseState>>(new Map());
  const prevNodeStatusRef  = useRef<Map<string, string>>(new Map());
  const prevNodeSetRef     = useRef<Set<string>>(new Set());

  // CRISPR White-Gold surges
  const [surges, setSurges] = useState<SurgeAnim[]>([]);

  // Afterglow: nodeId → timestamp when CRISPR surge first contacted node (60s window)
  const afterglowRef = useRef<Map<string, number>>(new Map());

  // Spawn sparks (new offspring budding from parent)
  const [spawnSparks, setSpawnSparks] = useState<SpawnSpark[]>([]);

  // Live stream
  const [streamEvents,     setStreamEvents]     = useState<StreamPacket[]>([]);
  const [wsConnected,      setWsConnected]      = useState(false);
  const [focusedStreamId,  setFocusedStreamId]  = useState<string | null>(null);
  const driftHistoryRef    = useRef<Map<string, number[]>>(new Map());
  const feedRef            = useRef<HTMLDivElement>(null);

  const [, navigate] = useLocation();
  const { setAgent, setActiveMutations } = useForensic();

  const [svgDims, setSvgDims]     = useState({ W: 900, H: 540 });

  useEffect(() => {
    const update = () => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      if (r.width > 0) setSvgDims({ W: r.width, H: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    if (svgRef.current) ro.observe(svgRef.current);
    window.addEventListener("resize", update, { passive: true });
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  // Center the simulation in the visible stage, biased right to clear the
  // sidebar. (window.innerWidth - 350) / 2 is the viewport center excluding
  // the 350px Forensic Inspector; we clamp it to 75% of the measured SVG width
  // so nodes can never be pulled off the right edge of the canvas.
  const cx = svgDims.W > 0
    ? Math.min(Math.round((window.innerWidth - 350) / 2), Math.floor(svgDims.W * 0.75))
    : 450;
  const cy = svgDims.H / 2;

  // ── Touch interaction refs ─────────────────────────────────────────────────
  const longPressRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // Pinch-to-zoom state
  const [zoom,    setZoom]    = useState(1);
  const [panXY,   setPanXY]   = useState({ x: 0, y: 0 });
  const pinchRef  = useRef<{ dist: number; scale: number; midX: number; midY: number } | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/swarm/map`);
      if (!r.ok) return;
      const data = await r.json();
      const raw: SwarmNodeData[] = (data.nodes ?? []).map((n: SwarmNodeData) => ({
        ...n,
        isRoot: !n.parentUid,
        drift: n.status === "revoked" ? 100
          : n.status === "drift-locked" ? 45 + Math.random() * 25
          : Math.random() * 12,
      }));
      const rawLinks: SwarmLink[] = data.edges ?? [];
      const depths = computeGenerationDepths(raw, rawLinks);
      const enriched = raw.map(n => {
        const f = computeFitness(n.drift ?? 0, n.status);
        const r = fitnessRadius(f, !!n.isRoot || !n.parentUid);
        return { ...n, isRoot: !n.parentUid, fitnessScore: f, generationDepth: depths.get(n.id) ?? 0, radius: r };
      });

      setNodes(prev => {
        const prevStatus = prevNodeStatusRef.current;
        const prevSet    = prevNodeSetRef.current;
        const nowMap     = new Map(enriched.map(n => [n.id, n]));
        const newSparks: SpawnSpark[] = [];

        for (const [id, st] of prevStatus) {
          const curr = nowMap.get(id);
          if (curr && st !== "revoked" && curr.status === "revoked") {
            const existing = prev.find(p => p.id === id);
            if (existing?.x != null && existing?.y != null) {
              collapsingRef.current.set(id, { startedAt: Date.now(), x: existing.x!, y: existing.y!, r: existing.radius ?? 14 });
            }
          }
        }
        // Detect new offspring nodes (spawn sparks)
        for (const n of enriched) {
          if (!prevSet.has(n.id) && n.parentUid && prevSet.size > 0) {
            newSparks.push({ parentId: n.parentUid, childId: n.id, startedAt: Date.now() });
          }
        }
        if (newSparks.length) setSpawnSparks(prev2 => [...prev2, ...newSparks]);

        for (const n of enriched) { prevStatus.set(n.id, n.status); prevSet.add(n.id); }

        const posMap = new Map(prev.map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]));
        return enriched.map(n => { const pos = posMap.get(n.id); return pos ? { ...n, ...pos } : n; });
      });
      setLinks(rawLinks);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 12_000); return () => clearInterval(id); }, [fetchData]);

  // ── Focus from other views ────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: Event) => {
      const { agentId, eventId } = (e as CustomEvent<{ agentId: string; eventId?: string }>).detail ?? {};
      if (!agentId) return;
      const match = (simRef.current?.nodes() as SwarmNodeData[] | undefined)?.find(n => n.id === agentId || n.label === agentId);
      if (match) { setSelectedNode(match); simRef.current?.alpha(0.18).restart(); }
      if (eventId) setFocusedStreamId(eventId);
    };
    window.addEventListener("sentinelFocusAgent", h);
    return () => window.removeEventListener("sentinelFocusAgent", h);
  }, []);

  // ── CRISPR White-Gold Surge (recursiveFixVerified event) ─────────────────
  // Listens for event from Multi-Sig Gate or right-click context menu.
  // Computes 800 px/s speed-accurate timing using bezierLength() measurements.
  useEffect(() => {
    const h = (e: Event) => {
      const { agentId } = (e as CustomEvent<{ agentId?: string }>).detail ?? {};
      const rootId = agentId ?? nodes.find(n => n.isRoot)?.id;
      if (!rootId) return;

      // BFS all descendants in order (root first, then each generation)
      const descendants = bfsChildren(rootId, links);
      const ordered     = [rootId, ...descendants];

      // Canvas center (where LUCA is fixed)
      const svg = svgRef.current;
      const W   = svg?.clientWidth  ?? 600;
      const H   = svg?.clientHeight ?? 500;
      const cx  = W / 2;
      const cy  = H / 2;

      // Build live nodeMap from simulation positions
      const liveMap = new Map<string, SwarmNodeData>(
        (simRef.current?.nodes() as SwarmNodeData[] | undefined ?? nodes).map(n => [n.id, n])
      );

      // Compute physics-accurate timings at 800 px/s
      const { arrivalMs, segmentCps, totalMs } = buildSurgeTimings(ordered, liveMap, links, cx, cy);

      setSurges(prev => [...prev, {
        rootId,
        startedAt:  Date.now(),
        targets:    ordered,
        arrivalMs,
        segmentCps,
        totalMs,
      }]);

      // ── CRISPR_RECODE Gateway Broadcast ──────────────────────────────
      // Notify all connected SDK clients via the Sovereign Gateway so they
      // can reset their internal drift accumulators after a CRISPR heal.
      fetch(`${BASE}/api/v1/gateway/crispr_recode`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          rootId,
          targets:  ordered,
          healedAt: new Date().toISOString(),
          source:   "WAR_ROOM_CRISPR_SURGE",
        }),
      }).catch(() => {}); // fire-and-forget; WS broadcast is authoritative
    };
    window.addEventListener("recursiveFixVerified", h);
    return () => window.removeEventListener("recursiveFixVerified", h);
  }, [nodes, links]);

  // Prune expired surges & sparks; purge 60s-expired afterglow entries
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setSurges(prev => prev.filter(s => now - s.startedAt < s.totalMs + 2000));
      setSpawnSparks(prev => prev.filter(s => now - s.startedAt < 1800));
      // Clean up afterglow map so memory doesn't grow forever
      for (const [id, ts] of afterglowRef.current) {
        if (now - ts > 62_000) afterglowRef.current.delete(id);
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ── Seed feed ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BASE}/api/v1/logs?limit=30`)
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(({ logs = [] }) => {
        const hist = driftHistoryRef.current;
        const la   = lastActivityRef.current;
        const packets: StreamPacket[] = (logs as any[]).map((l: any) => {
          const drift = Math.round((1 - (l.consistencyScore ?? 1)) * 100);
          hist.set(l.agentId, [...(hist.get(l.agentId) ?? []).slice(-9), drift]);
          la.set(l.agentId, Math.max(la.get(l.agentId) ?? 0, new Date(l.timestamp).getTime()));
          return {
            t: l.timestamp, a: l.agentId, e: l.eventType,
            d: drift, h: (l.currentHash ?? "").substring(0, 8),
            q: !!l.pqSignature || !!l.quantumSig, p: l.parentAgentId ?? null,
            x: l.isAnomalous ?? false,
            r: ["HONEY_TOKEN_BREACH","HONEY_TOKEN_TRIGGERED","REVOCATION","KILL_SWITCH","DRIFT_LOCKOUT","CIRCUIT_BREAKER_OPEN"].includes(l.eventType),
            s: l.swarmId ?? null, tid: l.traceId, lid: l.id,
          };
        });
        setStreamEvents(packets);
      }).catch(() => {});
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}${BASE}/api/v1/ws`;
    let ws: WebSocket; let reconnect: ReturnType<typeof setTimeout>;
    function connect() {
      ws = new WebSocket(wsUrl);
      ws.onopen  = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); reconnect = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);

          // ── Standard stream telemetry ──────────────────────────────────
          if (msg.type === "stream_batch" && Array.isArray(msg.data?.packets)) {
            const packets: StreamPacket[] = msg.data.packets;
            const hist = driftHistoryRef.current;
            const la   = lastActivityRef.current;
            const now  = Date.now();
            for (const p of packets) {
              hist.set(p.a, [...(hist.get(p.a) ?? []).slice(-9), p.d]);
              la.set(p.a, now);
            }
            setStreamEvents(prev => [...packets.reverse(), ...prev].slice(0, 150));
          }

          // ── Project Genesis: ZEN_GOLD_SPARK (successful task / birth) ──
          if (msg.type === "GATEWAY_SPARK") {
            const { agentId: gAgentId, parentId, eventSubtype } = msg.data ?? {};
            if (gAgentId) {
              // Trigger spawn-spark animation from parent → new node
              const parentNode = parentId
                ? (simRef.current?.nodes() as SwarmNodeData[])?.find(n => n.id === parentId)
                : (simRef.current?.nodes() as SwarmNodeData[])?.find(n => n.isRoot);
              if (parentNode && eventSubtype === "BIRTH") {
                setSpawnSparks(prev => [...prev, { parentId: parentNode.id, childId: gAgentId, startedAt: Date.now() }]);
              }
              // Nudge simulation to incorporate new node
              simRef.current?.alphaTarget(0.12).restart();
              setTimeout(() => simRef.current?.alphaTarget(0), 800);
              // Refresh data to pick up new registry entry
              setTimeout(() => fetchData(), 500);
            }
          }

          // ── Project Genesis: CELLULAR_DISSOLUTION (policy violation) ───
          if (msg.type === "GATEWAY_DISSOLUTION") {
            const { agentId: gAgentId } = msg.data ?? {};
            if (gAgentId) {
              const node = (simRef.current?.nodes() as SwarmNodeData[])?.find(n => n.id === gAgentId);
              if (node?.x != null && node?.y != null) {
                collapsingRef.current.set(gAgentId, {
                  startedAt: Date.now(),
                  x: node.x!,
                  y: node.y!,
                  r: node.radius ?? 14,
                });
              }
              // Mark node as dissolved in local state
              setNodes(prev => prev.map(n => n.id === gAgentId ? { ...n, status: "revoked" as const, drift: 100 } : n));
            }
          }

          // ── Project Genesis: GATEWAY_MUTATION / MUTATION_DETECTED ─────
          if (msg.type === "GATEWAY_MUTATION" || msg.type === "MUTATION_DETECTED") {
            const { agentId: gAgentId, driftScore } = msg.data ?? {};
            if (gAgentId) {
              setNodes(prev => prev.map(n =>
                n.id === gAgentId
                  ? { ...n, status: "mutant" as const, drift: typeof driftScore === "number" ? driftScore : 50, driftScore: typeof driftScore === "number" ? driftScore : 50 }
                  : n
              ));
              driftHistoryRef.current.set(gAgentId, [
                ...(driftHistoryRef.current.get(gAgentId) ?? []).slice(-8),
                typeof driftScore === "number" ? driftScore : 50,
              ]);
              simRef.current?.alphaTarget(0.08).restart();
              setTimeout(() => simRef.current?.alphaTarget(0), 400);
            }
          }

          // ── Project Genesis: CRISPR_RECODE (drift reset from War Room) ─
          // Fired by the Gateway when a RECURSIVE_FIX_VERIFIED surge heals the swarm.
          // On the War Room side: un-mutant all healed nodes and re-nudge the sim.
          if (msg.type === "CRISPR_RECODE") {
            const { targets } = (msg.data ?? {}) as { targets?: string[] };
            const targetSet = targets ? new Set(targets) : null;
            setNodes(prev => prev.map(n => {
              if (targetSet && !targetSet.has(n.id)) return n;
              if (n.status !== "mutant" && n.status !== "drift-locked") return n;
              return { ...n, status: "active" as const, drift: Math.min(n.drift ?? 0, 8) };
            }));
            simRef.current?.alphaTarget(0.15).restart();
            setTimeout(() => simRef.current?.alphaTarget(0), 900);
          }
        } catch {}
      };
    }
    connect();
    return () => { clearTimeout(reconnect); ws?.close(); };
  }, []);

  // ── d3 Radial Evolution Simulation ───────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || nodes.length === 0) return;
    const { W, H } = svgDims;
    const RING = Math.min(85, W / 8);

    // ── Initial positions ─────────────────────────────────────────────────────
    nodes.filter(n => n.isRoot).forEach(n => {
      if (n.x == null) { n.x = cx; n.y = cy; }
    });
    nodes.filter(n => !n.isRoot).forEach(n => {
      if (n.x == null) {
        const angle = Math.random() * Math.PI * 2;
        const ring  = (n.generationDepth ?? 1) * RING;
        n.x = cx + ring * Math.cos(angle); n.y = cy + ring * Math.sin(angle);
      }
    });

    simRef.current?.stop();
    const sim = d3.forceSimulation<SwarmNodeData>(nodes)
      .force("link", d3.forceLink<SwarmNodeData, SwarmLink>(links)
        .id(d => d.id)
        .distance(d => {
          const src = d.source as SwarmNodeData; const tgt = d.target as SwarmNodeData;
          const drift = Math.max(src.drift ?? 0, tgt.drift ?? 0);
          return RING * 0.9 + drift * 0.85;
        })
        .strength(d => {
          const src = d.source as SwarmNodeData; const tgt = d.target as SwarmNodeData;
          const f = ((src.fitnessScore ?? 0.5) + (tgt.fitnessScore ?? 0.5)) / 2;
          return 0.12 + f * 0.48;
        })
      )
      .force("charge", d3.forceManyBody<SwarmNodeData>().strength(-800))
      .force("center", d3.forceCenter(cx, cy).strength(0.08))
      .force("collide", d3.forceCollide<SwarmNodeData>().radius(100).strength(0.8))
      .alphaDecay(0.010)
      .velocityDecay(0.44)
      .on("tick", () => {
        tickRef.current++;
        const margin = 24;
        for (const n of nodes) {
          const r = n.radius ?? 14;
          n.x = Math.max(r + margin, Math.min(W - r - margin, n.x ?? cx));
          n.y = Math.max(r + margin, Math.min(H - r - margin, n.y ?? cy));
        }
        // Keep D3 drag-handle circles tracking each node's current position.
        d3.select(svgRef.current!)
          .selectAll<SVGCircleElement, SwarmNodeData>(".darwin-drag")
          .attr("cx", d => d.x ?? cx)
          .attr("cy", d => d.y ?? cy);
        setRenderTick(t => t + 1);
      });

    // ── Radial Phylogeny layout ───────────────────────────────────────────────
    sim.force("phylo_radial", d3.forceRadial<SwarmNodeData>(
      d => {
        if (d.isRoot) return 0;
        const gen = d.generationDepth ?? 1;
        return gen * RING + (1 - (d.fitnessScore ?? 0.5)) * 22;
      }, cx, cy
    ).strength(d => d.isRoot ? 0.6 : 0.3 + (d.fitnessScore ?? 0.5) * 0.25));

    simRef.current = sim;

    // ── Transparent drag-handle circles overlaid on each node ────────────────
    // They have correct cx/cy/r so they intercept both drag AND click events.
    const svgSel = d3.select(svg);
    svgSel.selectAll<SVGCircleElement, SwarmNodeData>(".darwin-drag")
      .data(nodes, d => d.id)
      .join("circle")
        .attr("class", "darwin-drag")
        .attr("cx", d => d.x ?? cx)
        .attr("cy", d => d.y ?? cy)
        .attr("r",  d => (d.radius ?? 14) + 6)
        .style("fill", "transparent")
        .style("cursor", "grab")
      .call(d3.drag<SVGCircleElement, SwarmNodeData>()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end",   (ev, d) => { if (!ev.active) sim.alphaTarget(0); if (!d.isRoot) { d.fx = null; d.fy = null; } })
      )
      .on("click", (event: MouseEvent, d: SwarmNodeData) => {
        event.stopPropagation();
        handleNodeClickRef.current(event as unknown as React.MouseEvent, d);
      });

    return () => { sim.stop(); svgSel.selectAll(".darwin-drag").remove(); };
  }, [nodes.length, links.length, svgDims]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now     = Date.now();
    const active  = nodes.filter(n => n.status === "active");
    const revoked = nodes.filter(n => n.status === "revoked");
    const drifters= nodes.filter(n => (n.drift ?? 0) > 15 && n.status === "active");
    const avgF    = nodes.length > 0 ? nodes.reduce((s, n) => s + (n.fitnessScore ?? 0), 0) / nodes.length : 0;
    const calcifiedCount = nodes.filter(n => {
      const last = lastActivityRef.current.get(n.id);
      return last != null && now - last > 300_000 && n.status !== "revoked";
    }).length;
    const fertility = active.length > 0 ? (active.length / Math.max(nodes.length, 1)) * avgF : 0;
    const avgDrift  = drifters.length > 0 ? drifters.reduce((s, n) => s + (n.drift ?? 0), 0) / drifters.length : 0;
    return { total: nodes.length, active: active.length, revoked: revoked.length, drifting: drifters.length, avgFitness: avgF, fertility, avgDrift, calcifiedCount };
  }, [nodes, renderTick]);

  // Sync activeMutations to Risk Horizon
  useEffect(() => {
    const mutations = nodes.filter(n => (n.drift ?? 0) > 15 && n.status === "active").length;
    setActiveMutations(mutations);
  }, [nodes, renderTick, setActiveMutations]);

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes, renderTick]);

  // ── Calcification check ───────────────────────────────────────────────────
  const isCalcified = useCallback((id: string): boolean => {
    const last = lastActivityRef.current.get(id);
    if (last == null) return false;
    return Date.now() - last > 300_000;
  }, [renderTick]);

  // ── Surge active check ────────────────────────────────────────────────────
  /**
   * Returns 0–1 surge intensity for a node, using speed-accurate arrivalMs timing.
   * Also stamps afterglowRef on first contact (enabling the 60-second afterglow).
   */
  const surgeIntensity = useCallback((nodeId: string): number => {
    const now = Date.now();
    for (const surge of surges) {
      const idx = surge.targets.indexOf(nodeId);
      if (idx === -1) continue;
      const elapsed    = now - surge.startedAt;
      const arrivalMs  = surge.arrivalMs[idx] ?? (idx * 600);
      const glowMs     = 1800; // each node glows for 1.8s after contact
      const endMs      = arrivalMs + glowMs;
      if (elapsed >= arrivalMs) {
        // First contact → stamp afterglow
        if (!afterglowRef.current.has(nodeId)) {
          afterglowRef.current.set(nodeId, now - (elapsed - arrivalMs));
        }
        if (elapsed <= endMs) {
          const t = (elapsed - arrivalMs) / glowMs;
          return 1 - t * 0.7; // 1.0 → 0.3 fade
        }
      }
    }
    return 0;
  }, [surges, renderTick]);

  /**
   * Returns 0–1 afterglow intensity for a node over 60 seconds after surge contact.
   * 0–2s: flash phase (fades 1→0.4), 2–60s: slow decay (0.4→0).
   */
  const afterglowIntensity = useCallback((nodeId: string): number => {
    const contact = afterglowRef.current.get(nodeId);
    if (contact == null) return 0;
    const elapsed = Date.now() - contact;
    if (elapsed > 60_000) return 0;
    if (elapsed < 2_000) return 0.4 + 0.6 * (1 - elapsed / 2_000); // 1.0→0.4
    return 0.4 * (1 - (elapsed - 2_000) / 58_000);                  // 0.4→0
  }, [renderTick]);

  /**
   * Returns true if a node has been reached by surge (in metamorphosis / post-metamorphosis).
   * In this state: feTurbulence is killed, color is sage, mutation path → circle.
   */
  const isMetamorphosed = useCallback((nodeId: string): boolean => {
    return afterglowRef.current.has(nodeId) &&
           Date.now() - (afterglowRef.current.get(nodeId) ?? 0) < 60_000;
  }, [renderTick]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleNodeClick      = useCallback((e: React.MouseEvent, node: SwarmNodeData) => {
    e.preventDefault();
    setSelectedNode(node);
    setCtxMenu(null);
    setAgent({
      id: node.id,
      label: node.label,
      status: node.status,
      drift: node.drift ?? 0,
      fitnessScore: node.fitnessScore ?? 0,
      generationDepth: node.generationDepth ?? 0,
      isRoot: node.isRoot,
      swarmId: node.swarmId,
      parentUid: node.parentUid,
      createdAt: node.createdAt,
      revokedAt: node.revokedAt,
      revokedReason: node.revokedReason,
    });
  }, [setAgent]);

  // Keep a live ref so D3 native event handlers always call the latest version.
  const handleNodeClickRef = useRef(handleNodeClick);
  useEffect(() => { handleNodeClickRef.current = handleNodeClick; }, [handleNodeClick]);

  const handleNodeRightClick = useCallback((e: React.MouseEvent, node: SwarmNodeData) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ node, x: e.clientX, y: e.clientY }); setSelectedNode(null); }, []);

  const handleRevoke = useCallback(async (node: SwarmNodeData) => {
    setCtxMenu(null); setRevoking(true);
    try {
      const res = await fetch(`${BASE}/api/v1/swarm/revoke-tree/${encodeURIComponent(node.id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cellular Dissolution — Sovereign Multi-Sig revocation" }),
      });
      const d = await res.json();
      setRevokeResult(`${d.totalRevoked ?? 0} agent(s) dissolved`);
      setTimeout(() => { setRevokeResult(null); fetchData(); }, 5000);
    } finally { setRevoking(false); }
  }, [fetchData]);

  const handleTrace = useCallback((node: SwarmNodeData) => {
    setCtxMenu(null); navigate(`/traces?agent=${encodeURIComponent(node.id)}`);
  }, [navigate]);

  const handleCrispr = useCallback((node: SwarmNodeData) => {
    setCtxMenu(null);
    window.dispatchEvent(new CustomEvent("recursiveFixVerified", { detail: { agentId: node.id } }));
  }, []);

  const selectedLineageRate = useMemo(() => {
    if (!selectedNode) return 0;
    return lineageAvgFitness(selectedNode.id, nodeMap, links);
  }, [selectedNode, nodeMap, links]);

  // ── Smart Culling — desktop always shows every node (no aggregation) ───────
  const { clusterMap, clusteredIds } = useMemo(() => ({
    clusterMap: new Map<string, string[]>(),
    clusteredIds: new Set<string>(),
  }), []);

  // ── Long-press (touch) ─────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent, node: SwarmNodeData) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    longPressRef.current = setTimeout(() => {
      setCtxMenu({ node, x: touchStartRef.current?.x ?? 0, y: (touchStartRef.current?.y ?? 0) - 10 });
      setSelectedNode(null);
    }, 500);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressRef.current || !touchStartRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  // ── Pinch-to-Zoom + single-touch pan (with elastic-bounce prevention) ──────
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const getPinchDist = (touches: React.TouchList) => {
    const t0 = touches[0]; const t1 = touches[1];
    if (!t0 || !t1) return 0;
    return Math.sqrt((t0.clientX - t1.clientX) ** 2 + (t0.clientY - t1.clientY) ** 2);
  };

  // Clamp pan so the canvas cannot be dragged completely off-screen.
  // Minimum visible fraction: at least 60px of canvas edge must stay on screen.
  const clampPan = useCallback((x: number, y: number, scale: number) => {
    const { W, H } = svgDims;
    const safeW = W * (scale - 1) + 60;
    const safeH = H * (scale - 1) + 60;
    return {
      x: Math.max(-safeW, Math.min(safeW, x)),
      y: Math.max(-safeH, Math.min(safeH, y)),
    };
  }, [svgDims]);

  const handleSvgTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      // Pinch: record start for zoom gesture
      e.preventDefault();
      const t0 = e.touches[0]!; const t1 = e.touches[1]!;
      pinchRef.current = {
        dist:  getPinchDist(e.touches),
        scale: zoom,
        midX:  (t0.clientX + t1.clientX) / 2,
        midY:  (t0.clientY + t1.clientY) / 2,
      };
      panStartRef.current = null; // cancel any active pan
    } else if (e.touches.length === 1) {
      // Single touch: begin pan tracking
      const t = e.touches[0]!;
      panStartRef.current = { x: t.clientX, y: t.clientY, panX: panXY.x, panY: panXY.y };
    }
  }, [zoom, panXY]);

  const handleSvgTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      // Pinch-to-zoom: mobile min 0.8x, desktop min 0.5x
      e.preventDefault();
      const newDist  = getPinchDist(e.touches);
      const ratio    = newDist / Math.max(pinchRef.current.dist, 1);
      const newScale = Math.max(0.5, Math.min(4, pinchRef.current.scale * ratio));
      setZoom(newScale);
    } else if (e.touches.length === 1 && panStartRef.current) {
      // Single-touch pan with elastic-bounce prevention
      const t  = e.touches[0]!;
      const dx = t.clientX - panStartRef.current.x;
      const dy = t.clientY - panStartRef.current.y;
      const raw = {
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      };
      const clamped = clampPan(raw.x, raw.y, zoom);
      setPanXY(clamped);
    }
  }, [clampPan, zoom]);

  const handleSvgTouchEnd = useCallback(() => {
    pinchRef.current = null;
    panStartRef.current = null;
  }, []);

  // ── Turbulence seed (slow drift so animation feels organic) ───────────────
  const turbSeed = Math.floor(tickRef.current / 8) % 512;

  // ── KPI data (shared by desktop bar + mobile vitality sheet) ────────────
  const kpiCards = [
    { label: "Swarm Fertility",   value: `${(stats.fertility * 100).toFixed(0)}%`,  sub: "Delegation × fitness",    color: stats.fertility > 0.6 ? P.sage : stats.fertility > 0.3 ? P.amber : P.terra, Icon: Zap },
    { label: "Apex Fitness",      value: `${(stats.avgFitness * 100).toFixed(0)}%`, sub: "Population avg",          color: stats.avgFitness > 0.7 ? P.sage : stats.avgFitness > 0.4 ? P.amber : P.terra, Icon: Flame },
    { label: "Genetic Drift",     value: `${stats.avgDrift.toFixed(1)}%`,            sub: `${stats.drifting} agents`,color: stats.drifting === 0 ? P.sage : stats.drifting < 3 ? P.amber : P.mutation,    Icon: Dna },
    { label: "Natural Selection", value: stats.revoked,                               sub: "Dissolved agents",        color: stats.revoked === 0 ? P.sage : P.terra,                                         Icon: Skull },
    { label: "Active Population", value: stats.active,                                sub: `of ${stats.total} total`,color: P.blue,                                                                          Icon: Network },
    { label: "Calcification",     value: stats.calcifiedCount,                        sub: ">300s idle",              color: stats.calcifiedCount === 0 ? P.sage : P.calcite,                               Icon: () => <span style={{ color: P.calcite, fontSize: 12 }}>❄</span> },
  ];

  return (
    <div className="flex flex-col animate-in fade-in duration-500 h-[calc(100vh-6rem)] gap-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
            <Dna className="w-5 h-5 shrink-0" style={{ color: P.sage }} />
            Project Darwin
            <span className="text-xs font-normal px-2 py-0.5 rounded ml-1"
              style={{ color: P.gold, background: P.gold + "18", border: `1px solid ${P.gold}33` }}>
              Evolutionary Prosperity Engine
            </span>
          </h1>
          <p className="text-sm font-mono mt-1" style={{ color: P.dim }}>
            Radial phylogeny · Vessel physics · Fitness gradient · CRISPR recoding · Natural selection
          </p>
        </div>
        <div className="flex items-center gap-2">
          {revokeResult && (
            <span className="text-[10px] font-mono px-2 py-1 rounded border"
              style={{ color: P.terra, borderColor: P.terra + "44", background: P.terra + "10" }}>
              💀 {revokeResult}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}
            className="font-mono gap-1.5 text-xs">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI Bar ── */}
      <div className="grid grid-cols-6 gap-3 shrink-0">
          {kpiCards.map(({ label, value, sub, color, Icon }) => (
            <Card key={label} className="p-3 border-border/60 bg-card/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
              <div className="text-[8px] font-mono mt-0.5" style={{ color: P.dim }}>{sub}</div>
            </Card>
          ))}
        </div>

      {/* ── Main layout ── */}
      <div className="flex flex-1 min-h-0 gap-4">

        {/* ── SVG Canvas ── */}
        <div className="flex-1 rounded-xl overflow-hidden relative"
          style={{ border: `1px solid ${P.border}`, background: P.bg }}>

          {/* Legend */}
          <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-3 font-mono text-[9px] px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(13,17,23,0.88)", border: `1px solid ${P.border}` }}>
            {[
              { color: P.sage,     label: "Healthy" },
              { color: P.amber,    label: "Drift" },
              { color: P.mutation, label: "Mutant" },
              { color: P.terra,    label: "Dissolved" },
              { color: P.calcite,  label: "Calcified" },
              { color: P.gold,     label: "LUCA" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: color }} />
                <span style={{ color: P.dim }}>{label}</span>
              </span>
            ))}
            <>
              <span className="opacity-30 mx-1">|</span>
              <span style={{ color: P.dim }}>hover vine = lineage · right-click = CRISPR</span>
            </>
          </div>

          {nodes.length === 0 && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ color: P.dim }}>
              <TreePine className="w-12 h-12 mb-4 opacity-20" />
              <span className="font-mono text-sm">No organisms in the ecosystem</span>
            </div>
          )}

          {/* Lineage tooltip */}
          {lineageTip && (
            <div className="absolute z-20 pointer-events-none px-3 py-2 rounded-lg text-[10px] font-mono"
              style={{ left: lineageTip.x + 14, top: lineageTip.y - 38,
                background: "rgba(13,17,23,0.97)", border: `1px solid ${P.sage}55`,
                color: "#cdd5e0", boxShadow: `0 0 12px ${P.sage}22` }}>
              <div style={{ color: P.dim }}>Lineage Success Rate</div>
              <div className="font-bold" style={{ color: lineageTip.rate > 0.6 ? P.sage : lineageTip.rate > 0.3 ? P.amber : P.terra }}>
                {(lineageTip.rate * 100).toFixed(0)}% · {lineageTip.label}
              </div>
            </div>
          )}

          <svg ref={svgRef} className="w-full h-full" style={{ display: "block", touchAction: "none" }}
            onClick={() => { setSelectedNode(null); setCtxMenu(null); setLineageTip(null); }}
            onTouchStart={handleSvgTouchStart}
            onTouchMove={handleSvgTouchMove}
            onTouchEnd={handleSvgTouchEnd}>
            <defs>
              {/* Prosperity radial fill */}
              <radialGradient id="darwin-bg" cx="50%" cy="50%">
                <stop offset="0%"   stopColor={P.sage} stopOpacity={0.03 + stats.fertility * 0.04} />
                <stop offset="55%"  stopColor={P.sage} stopOpacity="0.008" />
                <stop offset="100%" stopColor={P.bg}   stopOpacity="0" />
              </radialGradient>

              {/* Glow filters */}
              {[
                { id: "fg-sage",     color: P.sage,     blur: 5 },
                { id: "fg-amber",    color: P.amber,    blur: 6 },
                { id: "fg-mutation", color: P.mutation, blur: 8 },
                { id: "fg-terra",    color: P.terra,    blur: 7 },
                { id: "fg-gold",     color: P.gold,     blur: 9 },
                { id: "fg-white",    color: P.whiteGold,blur: 10 },
                { id: "fg-calcite",  color: P.calcite,  blur: 3 },
              ].map(({ id, color, blur }) => (
                <filter key={id} id={id} x="-60%" y="-60%" width="220%" height="220%">
                  <feFlood floodColor={color} result="flood" />
                  <feComposite in="flood" in2="SourceGraphic" operator="in" result="mask" />
                  <feGaussianBlur in="mask" stdDeviation={blur} result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              ))}

              {/* ── Maladaptive Mutation distortion (feTurbulence warp) ── */}
              <filter id="mutation-warp" x="-30%" y="-30%" width="160%" height="160%">
                <feTurbulence type="fractalNoise" baseFrequency="0.065 0.055" numOctaves={3}
                  seed={turbSeed} result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale={8}
                  xChannelSelector="R" yChannelSelector="G" result="warped" />
                <feFlood floodColor={P.mutation} result="flood" />
                <feComposite in="flood" in2="warped" operator="in" result="tintMask" />
                <feGaussianBlur in="tintMask" stdDeviation={3} result="tintBlur" />
                <feMerge><feMergeNode in="tintBlur" /><feMergeNode in="warped" /></feMerge>
              </filter>
              <filter id="mutation-warp-severe" x="-40%" y="-40%" width="180%" height="180%">
                <feTurbulence type="turbulence" baseFrequency="0.09 0.07" numOctaves={4}
                  seed={turbSeed} result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale={14}
                  xChannelSelector="R" yChannelSelector="G" result="warped" />
                <feFlood floodColor={P.mutation} result="flood" />
                <feComposite in="flood" in2="warped" operator="in" result="tintMask" />
                <feGaussianBlur in="tintMask" stdDeviation={5} result="tintBlur" />
                <feMerge><feMergeNode in="tintBlur" /><feMergeNode in="warped" /></feMerge>
              </filter>

              {/* Calcification desaturate filter */}
              <filter id="calcify" x="-10%" y="-10%" width="120%" height="120%">
                <feColorMatrix type="saturate" values="0.08" />
              </filter>

              {/* CRISPR surge glow */}
              <filter id="crispr-surge" x="-80%" y="-80%" width="260%" height="260%">
                <feFlood floodColor={P.whiteGold} result="flood" />
                <feComposite in="flood" in2="SourceGraphic" operator="in" result="mask" />
                <feGaussianBlur in="mask" stdDeviation="12" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>

              {/* Arrow markers */}
              {[
                { id: "arr-sage",     color: P.sage },
                { id: "arr-amber",    color: P.amber },
                { id: "arr-mutation", color: P.mutation },
                { id: "arr-terra",    color: "#6B7280" },
                { id: "arr-gold",     color: P.gold },
              ].map(({ id, color }) => (
                <marker key={id} id={id} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill={color} opacity="0.8" />
                </marker>
              ))}

              {/* Eco grid */}
              <pattern id="eco-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke={P.grid} strokeWidth="0.4" opacity="0.45" />
                <circle cx="0" cy="0" r="0.8" fill={P.sage} opacity="0.035" />
              </pattern>
            </defs>

            {/* ── Pinch-to-Zoom transform wrapper ── */}
            <g transform={`translate(${panXY.x},${panXY.y}) scale(${zoom})`}
               style={{ transformOrigin: `${cx}px ${cy}px` }}>

            {/* Base fills */}
            <rect x={-panXY.x / zoom} y={-panXY.y / zoom}
              width={svgDims.W / zoom + Math.abs(panXY.x) / zoom * 2}
              height={svgDims.H / zoom + Math.abs(panXY.y) / zoom * 2}
              fill={P.bg} />
            <rect width="100%" height="100%" fill="url(#eco-grid)" />

            {/* ── Prosperity Pulse — background radial breath ── */}
            {(() => {
              const breathPhase = tickRef.current * 0.016;
              return (
                <g>
                  <ellipse cx={cx} cy={cy} rx="60%" ry="60%" fill="url(#darwin-bg)" />
                  {[0, 1, 2, 3].map(i => {
                    const phase   = (breathPhase + i * 0.65) % (Math.PI * 2);
                    const frac    = (Math.sin(phase) + 1) / 2;
                    const maxR    = 55 + i * 50;
                    const r       = 18 + frac * maxR;
                    const opacity = (1 - frac) * 0.07 * Math.max(stats.fertility, 0.1);
                    return <circle key={i} cx={cx} cy={cy} r={r}
                      fill="none" stroke={P.sage} strokeWidth={1.4 - i * 0.3} opacity={opacity} />;
                  })}
                  {/* LUCA nucleus core pulse */}
                  <circle cx={cx} cy={cy} r={10 + Math.sin(tickRef.current * 0.04) * 5}
                    fill={P.gold} fillOpacity={0.035 + stats.fertility * 0.04} stroke="none" />
                </g>
              );
            })()}

            {/* ── Generation ring guides ── */}
            {(() => {
              const RING = Math.min(85, svgDims.W / 8);
              const maxG = Math.max(...nodes.map(n => n.generationDepth ?? 0), 0);
              return (
                <g>
                  {Array.from({ length: maxG }, (_, i) => (
                    <circle key={i} cx={cx} cy={cy} r={(i + 1) * RING}
                      fill="none" stroke={P.sage} strokeWidth="0.25"
                      strokeDasharray="2,14" opacity={0.07} />
                  ))}
                </g>
              );
            })()}

            {/* ── Phylogenetic Vines (radial organic curves) ── */}
            <g className="vines">
              {links.map((link, i) => {
                const src = nodeMap.get(typeof link.source === "string" ? link.source : (link.source as SwarmNodeData).id);
                const tgt = nodeMap.get(typeof link.target === "string" ? link.target : (link.target as SwarmNodeData).id);
                if (!src?.x || !src?.y || !tgt?.x || !tgt?.y) return null;
                const sx = src.x; const sy = src.y; const tx = tgt.x; const ty = tgt.y;

                const isRevoked = src.status === "revoked" || tgt.status === "revoked";
                const drift     = Math.max(src.drift ?? 0, tgt.drift ?? 0);
                const hovered   = hoveredLinkIdx === i;
                const f         = ((src.fitnessScore ?? 0.5) + (tgt.fitnessScore ?? 0.5)) / 2;

                // Afterglow vine: if both endpoints are in afterglow, tint the vine gold
                const srcAfterglow = afterglowIntensity(src.id);
                const tgtAfterglow = afterglowIntensity(tgt.id);
                const vineAfterglow = Math.min(srcAfterglow, tgtAfterglow); // both ends must be healed

                // Stroke color: revoked → withered grey; drifting → amber/violet; healed → gold-sage; healthy → fitness-tinted sage
                let strokeColor: string;
                if (isRevoked) strokeColor = "#4B5563";           // withered grey
                else if (vineAfterglow > 0.01 && !hovered) {
                  // Gold-sage blend fading over 60s
                  const goldMix = (vineAfterglow * 0.55).toFixed(2);
                  strokeColor = `rgba(255,215,0,${goldMix})`;     // gold at decaying opacity
                }
                else if (drift > 30) strokeColor = P.mutation + "99";
                else if (drift > 15) strokeColor = P.amber + "88";
                else strokeColor = `rgba(64,${Math.round(150 + f * 35)},${Math.round(130 + f * 25)},${(0.28 + f * 0.45).toFixed(2)})`;
                if (hovered) strokeColor = P.gold;

                const strokeW = isRevoked ? 0.7 : hovered ? 3.5 : (0.7 + f * 1.8) + (drift / 100) * 2;
                const dashArr = isRevoked ? "2,5" : "none";  // withered vine
                const arrowId = isRevoked ? "arr-terra"
                  : hovered ? "arr-gold"
                  : drift > 30 ? "arr-mutation"
                  : drift > 15 ? "arr-amber"
                  : "arr-sage";

                const vinePath = radialVine(sx, sy, tx, ty, cx, cy);

                // Vibration for mutating vines
                const vibX = drift > 15 && !isRevoked ? Math.sin(tickRef.current * 0.15 + i * 1.1) * (drift / 100) * 5 : 0;
                const vibY = drift > 15 && !isRevoked ? Math.cos(tickRef.current * 0.20 + i * 0.9) * (drift / 100) * 4 : 0;
                const finalPath = vibX !== 0
                  ? radialVine(sx + vibX * 0.3, sy + vibY * 0.3, tx + vibX, ty + vibY, cx, cy)
                  : vinePath;

                // Lineage hover rate
                const lRate = hovered ? lineageAvgFitness(src.id, nodeMap, links) : 0;

                return (
                  <path key={i} d={finalPath}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeW}
                    strokeDasharray={dashArr}
                    markerEnd={`url(#${arrowId})`}
                    opacity={isRevoked ? 0.3 : hovered ? 1 : 0.82}
                    style={{ cursor: "pointer", transition: "stroke 0.25s, stroke-width 0.2s" }}
                    onMouseEnter={e => { setHoveredLinkIdx(i); setLineageTip({ x: e.clientX, y: e.clientY, rate: lRate, label: src.label }); }}
                    onMouseMove={e => { const r2 = lineageAvgFitness(src.id, nodeMap, links); setLineageTip({ x: e.clientX, y: e.clientY, rate: r2, label: src.label }); }}
                    onMouseLeave={() => { setHoveredLinkIdx(null); setLineageTip(null); }}
                    onClick={e => e.stopPropagation()}
                  />
                );
              })}
            </g>

            {/* ── CRISPR White-Gold Surge — 800 px/s particle on radial vine ── */}
            {surges.map(surge => {
              const now     = Date.now();
              const elapsed = now - surge.startedAt;

              // Find which vine segment the particle is currently traversing
              let segIdx = -1;
              for (let i = 0; i < surge.arrivalMs.length - 1; i++) {
                if (elapsed >= (surge.arrivalMs[i] ?? 0) && elapsed < (surge.arrivalMs[i + 1] ?? Infinity)) {
                  segIdx = i;
                  break;
                }
              }
              if (segIdx === -1) return null;

              const srcId = surge.targets[segIdx];
              const tgtId = surge.targets[segIdx + 1];
              const src   = nodeMap.get(srcId ?? "");
              const tgt   = nodeMap.get(tgtId ?? "");
              if (!src?.x || !src?.y) return null;

              // Fractional progress within this segment
              const segStart = surge.arrivalMs[segIdx]  ?? 0;
              const segEnd   = surge.arrivalMs[segIdx + 1] ?? segStart + 400;
              const tSeg     = Math.max(0, Math.min(1, (elapsed - segStart) / (segEnd - segStart)));

              let px = src.x;
              let py = src.y;

              if (tgt?.x && tgt?.y) {
                // Use pre-computed control point for accurate vine arc matching
                const [cpx, cpy] = surge.segmentCps[segIdx] ?? radialVineCp(src.x, src.y, tgt.x, tgt.y, cx, cy);
                const pt = bezierPt(src.x, src.y, cpx, cpy, tgt.x, tgt.y, tSeg);
                px = pt.x;
                py = pt.y;
              }

              const pR = 1;
              return (
                <g key={`surge-${surge.rootId}-${surge.startedAt}`}>
                  {/* Outer aura */}
                  <circle cx={px} cy={py} r={16 * pR} fill={P.whiteGold} fillOpacity="0.12" filter="url(#fg-white)" />
                  {/* White-gold halo ring */}
                  <circle cx={px} cy={py} r={9 * pR}  fill="none" stroke={P.gold} strokeWidth={1.5 * pR} opacity="0.55" />
                  {/* Core surge particle */}
                  <circle cx={px} cy={py} r={5 * pR}  fill={P.gold} fillOpacity="0.98" filter="url(#fg-gold)" />
                  {/* Hot white center */}
                  <circle cx={px} cy={py} r={2 * pR}  fill="#ffffff" fillOpacity="0.95" />
                </g>
              );
            })}

            {/* ── Cellular Dissolution burst particles ── */}
            {Array.from(collapsingRef.current.entries()).map(([id, cs]) => {
              const progress = Math.min((Date.now() - cs.startedAt) / 1000, 1);
              if (progress >= 1) { collapsingRef.current.delete(id); return null; }
              return (
                <g key={`dissolve-${id}`}>
                  {Array.from({ length: 10 }, (_, p) => {
                    const angle   = (p / 10) * Math.PI * 2;
                    const dist    = cs.r * 2.5 * progress;
                    const pScale  = 1 - progress;
                    return (
                      <circle key={p}
                        cx={cs.x + dist * Math.cos(angle)} cy={cs.y + dist * Math.sin(angle)}
                        r={3.5 * pScale} fill={P.collapse} opacity={pScale * 0.85}
                        style={{ filter: `blur(${0.8 * pScale}px)` }} />
                    );
                  })}
                  <circle cx={cs.x} cy={cs.y} r={cs.r * (1 + progress * 1.2)}
                    fill="none" stroke={P.terra} strokeWidth={2.5 * (1 - progress)} opacity={1 - progress} />
                </g>
              );
            })}

            {/* ── Spawn Sparks — gold bud travelling from parent to offspring ── */}
            {spawnSparks.map(spark => {
              const now      = Date.now();
              const progress = Math.min((now - spark.startedAt) / 1600, 1);
              const parent   = nodeMap.get(spark.parentId);
              const child    = nodeMap.get(spark.childId);
              if (!parent?.x || !parent?.y || !child?.x || !child?.y || progress >= 1) return null;
              const saA = Math.atan2(parent.y - cy, parent.x - cx);
              const taA = Math.atan2(child.y - cy, child.x - cx);
              let midA = (saA + taA) / 2;
              if (Math.abs(taA - saA) > Math.PI) midA += Math.PI;
              const midR2 = (Math.sqrt((parent.x - cx) ** 2 + (parent.y - cy) ** 2) + Math.sqrt((child.x - cx) ** 2 + (child.y - cy) ** 2)) / 2 * 0.7;
              const cpx2 = cx + midR2 * Math.cos(midA);
              const cpy2 = cy + midR2 * Math.sin(midA);
              const pt = bezierPt(parent.x, parent.y, cpx2, cpy2, child.x, child.y, progress);
              return (
                <g key={`spark-${spark.childId}`}>
                  <circle cx={pt.x} cy={pt.y} r={7} fill={P.gold} fillOpacity={0.22} filter="url(#fg-gold)" />
                  <circle cx={pt.x} cy={pt.y} r={3} fill={P.gold} fillOpacity={0.95} />
                  <circle cx={pt.x} cy={pt.y} r={1} fill="#ffffff" fillOpacity="0.9" />
                </g>
              );
            })}

            {/* ── Organisms (nodes) ── */}
            <g className="organisms">
              {nodes.map(node => {
                if (!node.x || !node.y) return null;

                const calc        = isCalcified(node.id);
                const metamorphed = isMetamorphosed(node.id);
                const afterglow   = afterglowIntensity(node.id);
                const hasAftergl  = afterglow > 0;

                // ── Metamorphosis overrides ──────────────────────────────────
                // If CRISPR surge has reached this node, kill turbulence and
                // transition color from mutation-violet → sage-teal.
                const baseDrift  = node.drift ?? 0;
                const effectiveDrift = metamorphed ? Math.min(baseDrift, 10) : baseDrift; // snap below mutation threshold
                const color      = metamorphed ? P.sage : nodeColor(node, calc);

                const r       = node.radius ?? 14;
                const f       = node.fitnessScore ?? 0.5;
                const drift   = effectiveDrift;
                const isMut   = drift > 15 && node.status !== "revoked" && !metamorphed;
                const isSev   = drift > 30 && !metamorphed;
                const surgeI  = surgeIntensity(node.id);
                const isSurging = surgeI > 0;

                const isSelected = selectedNode?.id === node.id;

                // Bio-luminescence breathing
                const bioGlow = !isMut && !calc && drift < 5 && node.status === "active";
                const breathAmp  = bioGlow ? (1 + f * 1.5) : 0.6;
                const breathFreq = bioGlow ? 0.03 + f * 0.015 : 0.08;
                const glowPulse  = r + breathAmp * (1.5 + Math.sin(tickRef.current * breathFreq + node.id.charCodeAt(0) * 0.4) * breathAmp);

                // Filter cascade — metamorphosis kills turbulence warp
                const filterId = isSurging ? "fg-white"
                  : hasAftergl ? "fg-sage"
                  : calc ? "fg-calcite"
                  : node.status === "revoked" ? "fg-terra"
                  : isSev ? "fg-mutation"
                  : isMut ? "fg-amber"
                  : node.isRoot ? "fg-gold"
                  : "fg-sage";

                // mutFilter: killed after metamorphosis
                const mutFilter = (isSurging || metamorphed) ? undefined
                  : isSev ? "url(#mutation-warp-severe)"
                  : isMut ? "url(#mutation-warp)"
                  : undefined;

                const calcFilter = (calc && !isSurging && !metamorphed) ? "url(#calcify)" : undefined;
                const nodeFilter = calcFilter ?? mutFilter;

                const displayColor = isSurging
                  ? P.whiteGold
                  : metamorphed ? P.sage
                  : calc ? P.calcite
                  : color;

                const fillOpacity   = calc && !metamorphed ? 0.2 : 0.28 + f * 0.2;
                const strokeOpacity = calc && !metamorphed ? 0.35 : 1;

                return (
                  <g key={node.id} style={{ cursor: "pointer" }}
                    onClick={e => { e.stopPropagation(); handleNodeClick(e, node); }}
                    onContextMenu={e => handleNodeRightClick(e, node)}
                    onTouchStart={e => { e.stopPropagation(); handleTouchStart(e, node); }}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}>

                    {/* Selection ring */}
                    {isSelected && (
                      <circle cx={node.x} cy={node.y} r={r + 12}
                        fill="none" stroke={P.blue} strokeWidth="2.5" opacity="0.9" />
                    )}

                    {/* ── 60s Afterglow — faint gold ring on healed lineage ── */}
                    {hasAftergl && (
                      <>
                        {/* Outer gold halo ring — Active Monitoring state */}
                        <circle cx={node.x} cy={node.y} r={r + 8 + Math.sin(tickRef.current * 0.025) * 2}
                          fill="none" stroke={P.gold}
                          strokeWidth={1.2}
                          opacity={afterglow * 0.35}
                          filter="url(#fg-gold)"
                        />
                        {/* Inner warm-sage pulse ring */}
                        <circle cx={node.x} cy={node.y} r={r + 3}
                          fill="none" stroke={P.sage}
                          strokeWidth={0.8}
                          opacity={afterglow * 0.25}
                        />
                      </>
                    )}

                    {/* Bio-luminescent halo (outer glow pulse) */}
                    <circle cx={node.x} cy={node.y} r={glowPulse}
                      fill="none"
                      stroke={displayColor}
                      strokeWidth={node.isRoot ? 2.5 : isSurging ? 3 : 1.5}
                      opacity={isSurging ? (surgeI * 0.7) : node.isRoot ? 0.38 : calc ? 0.08 : (f * 0.3 + 0.1)}
                      filter={`url(#${filterId})`}
                    />

                    {/* Sovereignty rings (LUCA) */}
                    {node.isRoot && (
                      <>
                        <circle cx={node.x} cy={node.y}
                          r={r + 13 + Math.sin(tickRef.current * 0.022) * 3}
                          fill="none" stroke={isSurging ? P.whiteGold : P.gold}
                          strokeWidth="1.2" strokeDasharray="3,5" opacity={isSurging ? 0.8 : 0.38} />
                        <circle cx={node.x} cy={node.y}
                          r={r + 22 + Math.sin(tickRef.current * 0.014 + 1) * 4}
                          fill="none" stroke={P.gold} strokeWidth="0.5" strokeDasharray="1,9" opacity="0.16" />
                      </>
                    )}

                    {/* Node body — metamorphosis: standard circle (no turbulence warp) */}
                    <circle cx={node.x} cy={node.y} r={r}
                      fill={displayColor} fillOpacity={fillOpacity}
                      stroke={displayColor} strokeWidth={node.isRoot ? 2.5 : 2}
                      strokeOpacity={strokeOpacity}
                      filter={nodeFilter ?? `url(#${filterId})`}
                    />

                    {/* Inner nucleus — fitness × brightness; afterglow adds warm gold tint */}
                    <circle cx={node.x} cy={node.y} r={r * (0.42 + f * 0.22)}
                      fill={hasAftergl ? P.gold : displayColor}
                      fillOpacity={calc && !metamorphed ? 0.15 : isSurging ? 0.95 : hasAftergl ? (afterglow * 0.18 + 0.4) : (0.55 + f * 0.35)}
                      filter={isSurging ? "url(#crispr-surge)" : undefined}
                    />

                    {/* CRISPR healing flash */}
                    {isSurging && (
                      <circle cx={node.x} cy={node.y} r={r * 1.8}
                        fill={P.whiteGold} fillOpacity={surgeI * 0.25} stroke="none"
                        filter="url(#fg-white)" />
                    )}

                    {/* Icon — metamorphosed nodes show ◉ (restored cell) */}
                    <text x={node.x} y={node.y}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={node.isRoot ? 12 : 9}
                      fill={node.isRoot ? P.bg : calc ? P.dim : "#fff"}
                      fontWeight={node.isRoot ? "bold" : "normal"}
                      style={{ userSelect: "none", pointerEvents: "none" }}>
                      {node.status === "revoked"         ? "✕"
                        : calc && !metamorphed            ? "❄"
                        : node.status === "drift-locked"  ? "⚠"
                        : node.isRoot                     ? "◆"
                        : metamorphed                     ? "◉"
                        : isSev                           ? "⚡"
                        : bioGlow                         ? "●"
                        : "●"}
                    </text>

                    {/* Label — JetBrains Mono with frosted chip background */}
                    {(() => {
                      const labelText = node.label.length > 14 ? node.label.slice(0, 12) + "…" : node.label;
                      const chipW = labelText.length * 4.9 + 10;
                      return (
                        <>
                          <rect
                            x={node.x - chipW / 2}
                            y={node.y + r + 4}
                            width={chipW}
                            height={11}
                            rx={3}
                            fill="rgba(8,10,18,0.72)"
                            style={{ pointerEvents: "none" }}
                          />
                          <text x={node.x} y={node.y + r + 12.5}
                            textAnchor="middle" fontSize="7.5"
                            fontFamily="'JetBrains Mono', monospace"
                            fill={P.dim}
                            style={{ userSelect: "none", pointerEvents: "none" }}>
                            {labelText}
                          </text>
                        </>
                      );
                    })()}

                    {/* Status badge — surging/recoded/afterglow/drift/fitness */}
                    {node.status !== "revoked" && !calc && (
                      <text x={node.x} y={node.y - r - 7}
                        textAnchor="middle" fontSize="7"
                        fill={isSurging ? P.whiteGold : metamorphed ? P.gold : hasAftergl ? P.gold : isSev ? P.mutation : isMut ? P.amber : bioGlow ? P.sage : P.dim}
                        fontWeight="bold"
                        style={{ userSelect: "none", pointerEvents: "none" }}>
                        {isSurging    ? "RECODING"
                          : metamorphed && surgeI === 0 ? "◈ HEALED"
                          : hasAftergl ? "☀ MONITORING"
                          : isSev    ? `⚠ ${baseDrift.toFixed(0)}%`
                          : isMut    ? `Δ${baseDrift.toFixed(0)}%`
                          : node.isRoot ? "LUCA"
                          : bioGlow  ? `✦ fit:${(f * 100).toFixed(0)}%`
                          : `fit:${(f * 100).toFixed(0)}%`}
                      </text>
                    )}
                    {calc && !metamorphed && (
                      <text x={node.x} y={node.y - r - 7}
                        textAnchor="middle" fontSize="7"
                        fill={P.calcite}
                        style={{ userSelect: "none", pointerEvents: "none" }}>
                        CALCIFIED
                      </text>
                    )}
                  </g>
                );
              })}

            </g>

            {/* Close pinch-to-zoom group */}
            </g>
          </svg>
        </div>

        {/* ── Right panel (desktop only) ── */}
        <div className="shrink-0 w-80 flex flex-col gap-2 min-h-0">

          {/* Node info */}
          {selectedNode && (() => {
            const calc = isCalcified(selectedNode.id);
            return (
              <div className="shrink-0 flex flex-col gap-2 animate-in slide-in-from-right-4">
                <NodeInfoPanel node={selectedNode} lineageRate={selectedLineageRate} calcified={calc} onClose={() => setSelectedNode(null)} />
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}`, background: "rgba(13,17,23,0.85)" }}>
                  <div className="p-2 space-y-1">
                    <button onClick={() => handleTrace(selectedNode)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono hover:bg-white/5">
                      <Activity className="w-3 h-3" style={{ color: P.blue }} />
                      <span style={{ color: "#e0e6ed" }}>Open Trace Explorer</span>
                      <ChevronRight className="w-2.5 h-2.5 ml-auto opacity-40" />
                    </button>
                    {selectedNode.status === "active" && (
                      <>
                        <button onClick={() => handleCrispr(selectedNode)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono hover:bg-yellow-500/10">
                          <Zap className="w-3 h-3" style={{ color: P.gold }} />
                          <span style={{ color: P.whiteGold }}>Apply CRISPR Surge</span>
                        </button>
                        <button onClick={() => handleRevoke(selectedNode)} disabled={revoking}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono hover:bg-red-500/10 disabled:opacity-40">
                          <Skull className="w-3 h-3" style={{ color: P.terra }} />
                          <span style={{ color: P.terra }}>{revoking ? "Dissolving…" : "Cellular Dissolution"}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Terminal */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden"
            style={{ border: `1px solid ${P.border}`, background: "#080c12" }}>
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b"
              style={{ borderColor: P.border + "88", background: "#0a0e17" }}>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${wsConnected ? "animate-ping" : ""}`}
                    style={{ background: wsConnected ? P.sage : P.terra }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: wsConnected ? P.sage : P.terra }} />
                </span>
                <span className="text-[9px] font-mono font-bold tracking-widest uppercase" style={{ color: P.sage }}>
                  GENOME TELEMETRY
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono" style={{ color: P.dim }}>{streamEvents.length} events</span>
                <button onClick={() => setStreamEvents([])} className="text-[9px] font-mono opacity-40 hover:opacity-100" style={{ color: P.dim }}>CLR</button>
              </div>
            </div>

            <div ref={feedRef} className="flex-1 overflow-y-auto overflow-x-hidden"
              style={{ scrollbarWidth: "thin", scrollbarColor: `${P.border} transparent` }}>
              {streamEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4" style={{ color: P.dim }}>
                  <Activity className="w-6 h-6 mb-2 opacity-20" />
                  <div className="text-[10px] font-mono opacity-60">{wsConnected ? "Awaiting genome events…" : "Connecting…"}</div>
                </div>
              )}
              {streamEvents.map((ev, idx) => {
                const isBreach = ev.r;
                const isDrift  = ev.d > 15 && !isBreach;
                const color    = isBreach ? P.terra : isDrift ? P.amber : P.sage;
                const isFocused = focusedStreamId === ev.lid;
                const driftHist = driftHistoryRef.current.get(ev.a) ?? [];
                const agentNode = nodeMap.get(ev.a);
                return (
                  <button key={`${ev.lid}-${idx}`}
                    className="w-full text-left px-2.5 py-1.5 border-b transition-all"
                    style={{ borderColor: P.border + "44",
                      background: isFocused ? color + "18" : isBreach ? P.terra + "0a" : "transparent",
                      animation: isBreach ? "darwin-dissolve 0.5s ease-out 1" : "darwin-birth 0.18s ease-out 1",
                      animationFillMode: "both" }}
                    onClick={() => {
                      setFocusedStreamId(ev.lid);
                      if (agentNode) { setSelectedNode(agentNode); simRef.current?.alphaTarget(0.1).restart(); setTimeout(() => simRef.current?.alphaTarget(0), 500); }
                    }}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] font-mono shrink-0" style={{ color: P.dim }}>
                        {new Date(ev.t).toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className="text-[9px] font-mono font-bold truncate flex-1" style={{ color }}>{ev.e}</span>
                      {ev.q && <span className="text-[9px] shrink-0" title="ML-DSA-87" style={{ color: P.sage }}>⚡</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-mono truncate" style={{ color: agentNode ? color : P.dim, maxWidth: "100px" }}>
                        {ev.a.length > 14 ? ev.a.substring(0, 12) + "…" : ev.a}
                      </span>
                      <span className="text-[9px] font-mono opacity-40 shrink-0">·</span>
                      <span className="text-[9px] font-mono shrink-0" style={{ color: P.dim + "99" }}>0x{ev.h}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DriftSparkline history={driftHist} current={ev.d} color={color} />
                      {ev.d > 0 && <span className="text-[9px] font-mono font-bold shrink-0" style={{ color: ev.d > 15 ? P.amber : P.dim }}>{ev.d.toFixed(0)}%</span>}
                      {ev.p && <span className="text-[9px] font-mono shrink-0 truncate" title={`Spawned by: ${ev.p}`} style={{ color: P.blue + "bb", maxWidth: "64px" }}>[{ev.p.substring(0, 8)}]</span>}
                      {(ev.x || isBreach) && <span className="ml-auto text-[8px] font-mono font-bold shrink-0" style={{ color }}>{isBreach ? "EXTINCT" : "MUTANT"}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── CSS ── */}
      <style>{`
        @keyframes darwin-birth {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes darwin-dissolve {
          0%   { opacity: 0; transform: translateX(14px) scaleX(1.06); }
          20%  { opacity: 1; transform: translateX(-4px); background: rgba(217,97,97,0.30); }
          50%  { transform: translateX(2px) scaleX(0.98); background: rgba(217,97,97,0.12); }
          100% { opacity: 1; transform: translateX(0) scaleX(1); }
        }
        @keyframes vitality-slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes violetPulse {
          0%   { box-shadow: 0 0 0 0   rgba(192,132,252,0); opacity: 0.75; }
          40%  { box-shadow: 0 0 0 6px rgba(192,132,252,0.45); opacity: 1; }
          100% { box-shadow: 0 0 0 0   rgba(192,132,252,0); opacity: 0.75; }
        }
        @keyframes violetPulseSvg {
          0%   { opacity: 0.65; }
          50%  { opacity: 1.0; }
          100% { opacity: 0.65; }
        }
        @keyframes whiteGoldRecode {
          0%   { box-shadow: 0 0 0 0 rgba(255,215,0,0); }
          40%  { box-shadow: 0 0 0 8px rgba(255,215,0,0.35); }
          100% { box-shadow: 0 0 0 0 rgba(255,215,0,0); }
        }
      `}</style>


      {/* ── Context menu ── */}
      {ctxMenu && (
        <SovereignContextMenu
          node={ctxMenu.node} x={ctxMenu.x} y={ctxMenu.y}
          calcified={isCalcified(ctxMenu.node.id)}
          onClose={() => setCtxMenu(null)}
          onRevoke={() => handleRevoke(ctxMenu.node)}
          onTrace={() => handleTrace(ctxMenu.node)}
          onCrispr={() => handleCrispr(ctxMenu.node)}
          onDriftLock={async () => {
            setCtxMenu(null);
            await fetch(`${BASE}/api/v1/swarm/sessions`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentId: ctxMenu.node.id + "-drift-flagged", swarmId: ctxMenu.node.swarmId ?? "default" }),
            });
            fetchData();
          }}
        />
      )}
    </div>
  );
}
