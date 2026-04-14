/**
 * Evolutionary Prosperity Engine — Swarm Map v2
 *
 * Phylogenetic Physics: LUCA (Sovereign Root) at center; generations radiate
 * outward on forceRadial rings. Fitness drives node size + glow brightness.
 *
 * Mutation Overlay: drift > 15% → "Maladaptive Mutation" warp/vibration.
 *
 * Extinction & Pruning: Revoke/Honey-Token → "Cellular Collapse" burst + brittle vine snap.
 *
 * Prosperity Pulse: Rhythmic background breath synced to Sovereign Pulse vitality.
 *
 * Interaction: Hover branch → Lineage Success Rate tooltip.
 *              Click node → left panel with evolutionary metrics.
 *              Right-click → CRISPR intervention (Multi-Sig correction = logic recoding).
 */

import React, {
  useEffect, useRef, useState, useCallback, useMemo,
} from "react";
import * as d3 from "d3";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Network, ShieldAlert, AlertTriangle, Shield, RefreshCw,
  GitBranch, Zap, Lock, Skull, Activity, X,
  ChevronRight, Fingerprint, TriangleAlert, Dna, TreePine, Flame,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  sage:      "#40B595",
  amber:     "#EBC06D",
  terra:     "#D96161",
  blue:      "#5B8DEF",
  gold:      "#FFD700",
  mutation:  "#C084FC",   // violet — genetic distortion
  collapse:  "#FF6B6B",   // bright red — extinction burst
  dim:       "#9AA4B1",
  border:    "#2C3136",
  panel:     "#161B22",
  bg:        "#0D1117",
  grid:      "#1a2130",
  prosperity: "#40B595",  // breath ring colour
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface SwarmNodeData {
  id: string; label: string; status: string;
  swarmId: string | null; rootSwarmId: string | null; parentUid: string | null;
  createdAt: string; revokedAt: string | null; revokedReason: string | null;
  // d3-force properties (mutated in place)
  x?: number; y?: number; vx?: number; vy?: number;
  fx?: number | null; fy?: number | null;
  // computed
  isRoot?: boolean; radius?: number; drift?: number;
  fitnessScore?: number;   // [0,1] successRate / (1 + drift)
  generationDepth?: number; // 0 = LUCA, 1 = direct descendants, …
  lineageSuccessRate?: number; // avg fitness of this + all descendants
}
interface SwarmLink {
  source: string | SwarmNodeData;
  target: string | SwarmNodeData;
  _hovering?: boolean;
}

interface StreamPacket {
  t: string; a: string; e: string; d: number; h: string;
  q: boolean; p: string | null; x: boolean; r: boolean;
  s: string | null; tid: string; lid: string;
}

// ── Fitness helpers ────────────────────────────────────────────────────────────
function computeFitness(node: SwarmNodeData): number {
  if (node.status === "revoked") return 0;
  const d = Math.max(0, Math.min(100, node.drift ?? 0));
  const successRate = 1 - d / 100;
  // Maladaptive: fitness degrades faster when drift exceeds threshold
  const penaltyFactor = node.status === "drift-locked" ? 0.4 : 1;
  return Math.max(0, (successRate / (1 + d / 100)) * penaltyFactor);
}

/** BFS from roots to assign generation depth. */
function computeGenerationDepths(
  nodes: SwarmNodeData[],
  links: SwarmLink[],
): Map<string, number> {
  const childMap = new Map<string, string[]>();
  for (const link of links) {
    const srcId = typeof link.source === "string" ? link.source : (link.source as SwarmNodeData).id;
    const tgtId = typeof link.target === "string" ? link.target : (link.target as SwarmNodeData).id;
    if (!childMap.has(srcId)) childMap.set(srcId, []);
    childMap.get(srcId)!.push(tgtId);
  }
  const depth = new Map<string, number>();
  const roots = nodes.filter(n => n.isRoot);
  const queue: [string, number][] = roots.map(r => [r.id, 0]);
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const [id, d] = item;
    if (depth.has(id)) continue;
    depth.set(id, d);
    for (const child of (childMap.get(id) ?? [])) queue.push([child, d + 1]);
  }
  for (const n of nodes) {
    if (!depth.has(n.id)) depth.set(n.id, 1);
  }
  return depth;
}

/** Average fitness of node and all descendants (Lineage Success Rate). */
function computeLineageSuccess(
  nodeId: string,
  nodeMap: Map<string, SwarmNodeData>,
  links: SwarmLink[],
): number {
  const childMap = new Map<string, string[]>();
  for (const link of links) {
    const s = typeof link.source === "string" ? link.source : (link.source as SwarmNodeData).id;
    const t = typeof link.target === "string" ? link.target : (link.target as SwarmNodeData).id;
    if (!childMap.has(s)) childMap.set(s, []);
    childMap.get(s)!.push(t);
  }
  const collected: SwarmNodeData[] = [];
  const visited = new Set<string>();
  const q = [nodeId];
  while (q.length > 0) {
    const id = q.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const n = nodeMap.get(id);
    if (n) collected.push(n);
    for (const child of (childMap.get(id) ?? [])) q.push(child);
  }
  if (collected.length === 0) return 0;
  return collected.reduce((s, n) => s + (n.fitnessScore ?? 0), 0) / collected.length;
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function nodeColor(node: SwarmNodeData): string {
  if (node.status === "revoked") return P.terra;
  const drift = node.drift ?? 0;
  if (drift > 30) return P.mutation;         // severe genetic distortion
  if (drift > 15 || node.status === "drift-locked") return P.amber;
  // Fitness gradient: low-fitness = dimmer sage
  const f = node.fitnessScore ?? 1;
  if (f < 0.3) return `#2d8a6e`;
  if (f > 0.85) return P.sage;
  return P.sage;
}

function nodeBrightness(node: SwarmNodeData): number {
  // 0.3 – 1.0: high fitness = more opaque fill
  return 0.3 + (node.fitnessScore ?? 0.5) * 0.7;
}

function fitnessRadius(node: SwarmNodeData): number {
  const base = node.isRoot ? 22 : 13;
  const f    = node.fitnessScore ?? 0.5;
  // High-fitness nodes grow up to 10px larger
  return base + f * (node.isRoot ? 8 : 10);
}

function linkColor(src: SwarmNodeData, tgt: SwarmNodeData): string {
  if (src.status === "revoked" || tgt.status === "revoked") return P.terra + "55";
  const drift = Math.max(src.drift ?? 0, tgt.drift ?? 0);
  if (drift > 30) return P.mutation + "88";
  if (drift > 15) return P.amber + "77";
  // Tint by average fitness
  const f = ((src.fitnessScore ?? 0.5) + (tgt.fitnessScore ?? 0.5)) / 2;
  return `rgba(64, ${Math.round(140 + f * 40)}, ${Math.round(120 + f * 30)}, ${0.3 + f * 0.4})`;
}

function linkWidth(src: SwarmNodeData, tgt: SwarmNodeData, hovered: boolean): number {
  if (hovered) return 3.5;
  const drift = Math.max(src.drift ?? 0, tgt.drift ?? 0);
  const f = ((src.fitnessScore ?? 0.5) + (tgt.fitnessScore ?? 0.5)) / 2;
  if (src.status === "revoked" || tgt.status === "revoked") return 0.8;
  return (0.8 + f * 1.8) + (drift / 100) * 2.5;
}

// ── Wobbly organic path for mutating nodes ────────────────────────────────────
function mutationPath(cx: number, cy: number, r: number, tick: number, drift: number): string {
  const pts = 8;
  const amp  = (drift / 100) * r * 0.38;
  const coords: string[] = [];
  for (let i = 0; i <= pts; i++) {
    const angle  = (i / pts) * Math.PI * 2;
    const phase  = tick * 0.09 + i * 1.2;
    const wobble = Math.sin(phase) * amp + Math.cos(phase * 1.7) * amp * 0.5;
    const rr     = r + wobble;
    coords.push(`${(cx + rr * Math.cos(angle)).toFixed(2)},${(cy + rr * Math.sin(angle)).toFixed(2)}`);
  }
  return `M ${coords.join(" L ")} Z`;
}

// ── Collapse burst particles (purely SVG, position-based) ─────────────────────
interface CollapseState { startedAt: number; x: number; y: number; r: number; color: string; }

// ── Right-click context menu ──────────────────────────────────────────────────
interface CtxMenuProps {
  node: SwarmNodeData;
  x: number; y: number;
  onClose: () => void;
  onRevoke: () => void;
  onTrace: () => void;
  onDriftLock: () => void;
}
function SovereignContextMenu({ node, x, y, onClose, onRevoke, onTrace, onDriftLock }: CtxMenuProps) {
  const color = nodeColor(node);
  const f = (node.fitnessScore ?? 0);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 rounded-xl overflow-hidden shadow-2xl"
        style={{
          left: Math.min(x, window.innerWidth - 270),
          top: Math.min(y, window.innerHeight - 320),
          width: 260,
          background: "rgba(13,17,23,0.97)",
          border: `1px solid ${color}55`,
          backdropFilter: "blur(20px)",
          boxShadow: `0 0 40px ${color}22`,
        }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: color + "33", background: color + "10" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
              <span className="text-xs font-mono font-bold truncate max-w-40" style={{ color }}>
                {node.label}
              </span>
            </div>
            <button onClick={onClose} className="opacity-40 hover:opacity-100">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="text-[9px] font-mono mt-1 flex items-center gap-2" style={{ color: P.dim }}>
            <span className="uppercase">{node.status}</span>
            {node.isRoot && <span className="px-1 py-0.5 rounded" style={{ background: P.blue + "22", color: P.blue, border: `1px solid ${P.blue}33` }}>LUCA</span>}
            <span>Gen {node.generationDepth ?? 0}</span>
          </div>
          {/* Fitness bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-[8px] font-mono mb-1" style={{ color: P.dim }}>
              <span>ORGANISM FITNESS</span>
              <span style={{ color }}>{(f * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: P.border }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${f * 100}%`, background: color }} />
            </div>
          </div>
        </div>
        <div className="px-4 py-2 border-b" style={{ borderColor: P.border }}>
          <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
            CRISPR Logic Intervention
          </div>
        </div>
        <div className="p-2 space-y-1">
          <button onClick={onTrace}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-white/5">
            <Activity className="w-3.5 h-3.5" style={{ color: P.blue }} />
            <span style={{ color: "#e0e6ed" }}>View Trace Explorer</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
          </button>
          {node.status === "active" && (
            <button onClick={onDriftLock}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-amber-500/10">
              <Dna className="w-3.5 h-3.5" style={{ color: P.mutation }} />
              <span style={{ color: P.amber }}>Flag Genetic Drift</span>
            </button>
          )}
          {node.parentUid && (
            <button onClick={() => {}}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-white/5">
              <GitBranch className="w-3.5 h-3.5" style={{ color: P.dim }} />
              <span style={{ color: "#e0e6ed" }}>Audit Phylogenetic Chain</span>
              <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
            </button>
          )}
          {node.status === "active" && (
            <button onClick={onRevoke}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-red-500/10">
              <Skull className="w-3.5 h-3.5" style={{ color: P.terra }} />
              <span style={{ color: P.terra }}>Trigger Cellular Collapse</span>
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

// ── Node Info Panel ───────────────────────────────────────────────────────────
function NodeInfoPanel({ node, lineageRate, onClose }: {
  node: SwarmNodeData; lineageRate: number; onClose: () => void;
}) {
  const color = nodeColor(node);
  const f     = node.fitnessScore ?? 0;
  return (
    <div className="rounded-xl overflow-hidden" style={{
      border: `1px solid ${color}44`,
      background: "rgba(13,17,23,0.95)",
      backdropFilter: "blur(20px)",
    }}>
      <div className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: color + "33", background: color + "0f" }}>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}88` }} />
          <span className="text-xs font-mono font-bold" style={{ color }}>{node.label}</span>
          {node.isRoot && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold"
              style={{ color: P.gold, background: P.gold + "22", border: `1px solid ${P.gold}55` }}>
              LUCA ◆
            </span>
          )}
        </div>
        <button onClick={onClose} className="opacity-40 hover:opacity-100 transition-opacity">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Fitness gradient bar */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between text-[8px] font-mono mb-1">
          <span style={{ color: P.dim }}>ORGANISM FITNESS</span>
          <span style={{ color }}>{(f * 100).toFixed(0)}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: P.border }}>
          <div className="h-full rounded-full"
            style={{ width: `${f * 100}%`, background: `linear-gradient(90deg, ${P.terra} 0%, ${P.amber} 45%, ${P.sage} 100%)`, transition: "width 0.6s ease" }} />
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono mb-1">
          <span style={{ color: P.dim }}>LINEAGE SUCCESS RATE</span>
          <span style={{ color: lineageRate > 0.6 ? P.sage : lineageRate > 0.3 ? P.amber : P.terra }}>
            {(lineageRate * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: P.border }}>
          <div className="h-full rounded-full"
            style={{ width: `${lineageRate * 100}%`, background: lineageRate > 0.6 ? P.sage : lineageRate > 0.3 ? P.amber : P.terra }} />
        </div>
      </div>

      <div className="p-4 space-y-1.5 pt-2">
        {[
          { label: "Status", value: node.status.toUpperCase(), color },
          { label: "Generation", value: `Gen ${node.generationDepth ?? 0}` },
          { label: "Drift", value: `${(node.drift ?? 0).toFixed(1)}%`, color: (node.drift ?? 0) > 15 ? P.amber : P.sage },
          { label: "Swarm", value: node.swarmId ?? "—" },
          { label: "Parent", value: node.parentUid ? node.parentUid.substring(0, 20) + "…" : "genesis" },
          { label: "Registered", value: new Date(node.createdAt).toLocaleString() },
          ...(node.revokedAt ? [{ label: "Collapsed", value: new Date(node.revokedAt).toLocaleString(), color: P.terra }] : []),
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

// ── Drift Sparkline ───────────────────────────────────────────────────────────
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function SwarmMapPage() {
  const svgRef    = useRef<SVGSVGElement>(null);
  const simRef    = useRef<d3.Simulation<SwarmNodeData, SwarmLink> | null>(null);
  const tickRef   = useRef(0);
  const animRef   = useRef(0);

  const [nodes,       setNodes]       = useState<SwarmNodeData[]>([]);
  const [links,       setLinks]       = useState<SwarmLink[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [renderTick,  setRenderTick]  = useState(0);

  const [selectedNode, setSelectedNode] = useState<SwarmNodeData | null>(null);
  const [ctxMenu,      setCtxMenu]      = useState<{ node: SwarmNodeData; x: number; y: number } | null>(null);
  const [revoking,     setRevoking]     = useState(false);
  const [revokeResult, setRevokeResult] = useState<string | null>(null);
  const [hoveredLinkIdx, setHoveredLinkIdx] = useState<number | null>(null);
  const [lineageTooltip, setLineageTooltip] = useState<{ x: number; y: number; rate: number; label: string } | null>(null);

  // Collapse tracking: nodeId → CollapseState
  const collapsingRef = useRef<Map<string, CollapseState>>(new Map());
  const prevNodeStatusRef = useRef<Map<string, string>>(new Map());

  // Live stream
  const [streamEvents,   setStreamEvents]   = useState<StreamPacket[]>([]);
  const [wsConnected,    setWsConnected]    = useState(false);
  const [focusedStreamId, setFocusedStreamId] = useState<string | null>(null);
  const driftHistoryRef = useRef<Map<string, number[]>>(new Map());
  const feedRef         = useRef<HTMLDivElement>(null);

  const [, navigate] = useLocation();

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/swarm/map`);
      if (!r.ok) return;
      const data = await r.json();

      const rawNodes: SwarmNodeData[] = (data.nodes ?? []).map((n: SwarmNodeData) => ({
        ...n,
        isRoot: !n.parentUid,
        drift: n.status === "revoked" ? 100
          : n.status === "drift-locked" ? 45 + Math.random() * 25
          : Math.random() * 12,
      }));

      // Compute fitness + generation depth
      const rawLinks: SwarmLink[] = data.edges ?? [];
      const depths = computeGenerationDepths(rawNodes, rawLinks);
      const enriched = rawNodes.map(n => {
        const fitness = computeFitness({ ...n, drift: n.drift });
        return { ...n, fitnessScore: fitness, generationDepth: depths.get(n.id) ?? 0, radius: fitnessRadius({ ...n, fitnessScore: fitness, isRoot: !n.parentUid }) };
      });

      setNodes(prev => {
        // Detect newly-revoked nodes → trigger collapse animation
        const prevStatus = prevNodeStatusRef.current;
        const nowMap = new Map(enriched.map(n => [n.id, n]));
        for (const [id, prevSt] of prevStatus) {
          const curr = nowMap.get(id);
          if (curr && prevSt !== "revoked" && curr.status === "revoked") {
            const existing = prev.find(p => p.id === id);
            if (existing && existing.x != null && existing.y != null) {
              collapsingRef.current.set(id, {
                startedAt: Date.now(),
                x: existing.x!, y: existing.y!,
                r: existing.radius ?? 14,
                color: nodeColor(existing),
              });
            }
          }
        }
        // Update status tracking
        for (const n of enriched) prevStatus.set(n.id, n.status);
        // Preserve positions
        const posMap = new Map(prev.map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]));
        return enriched.map(n => {
          const pos = posMap.get(n.id);
          return pos ? { ...n, ...pos } : n;
        });
      });
      setLinks(rawLinks);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 12_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Focus event from other views ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { agentId, eventId } = (e as CustomEvent<{ agentId: string; eventId?: string }>).detail ?? {};
      if (!agentId) return;
      const match = (simRef.current?.nodes() as SwarmNodeData[] | undefined)?.find(n => n.id === agentId || n.label === agentId);
      if (match) { setSelectedNode(match); simRef.current?.alpha(0.18).restart(); }
      if (eventId) setFocusedStreamId(eventId);
    };
    window.addEventListener("sentinelFocusAgent", handler);
    return () => window.removeEventListener("sentinelFocusAgent", handler);
  }, []);

  // ── Seed feed from REST history ────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BASE}/api/v1/logs?limit=30`)
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(({ logs = [] }) => {
        const hist = driftHistoryRef.current;
        const packets: StreamPacket[] = (logs as any[]).map((l: any) => {
          const drift = Math.round((1 - (l.consistencyScore ?? 1)) * 100);
          const prev  = hist.get(l.agentId) ?? [];
          hist.set(l.agentId, [...prev.slice(-9), drift]);
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
      })
      .catch(() => {});
  }, []);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}${BASE}/api/v1/ws`;
    let ws: WebSocket;
    let reconnect: ReturnType<typeof setTimeout>;
    function connect() {
      ws = new WebSocket(wsUrl);
      ws.onopen  = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); reconnect = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === "stream_batch" && Array.isArray(msg.data?.packets)) {
            const packets: StreamPacket[] = msg.data.packets;
            const hist = driftHistoryRef.current;
            for (const p of packets) { hist.set(p.a, [...(hist.get(p.a) ?? []).slice(-9), p.d]); }
            setStreamEvents(prev => [...packets.reverse(), ...prev].slice(0, 150));
          }
        } catch {}
      };
    }
    connect();
    return () => { clearTimeout(reconnect); ws?.close(); };
  }, []);

  // ── d3 Radial Evolution Simulation ────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || nodes.length === 0) return;

    const rect = svg.getBoundingClientRect();
    const W  = rect.width  || 900;
    const H  = rect.height || 540;
    const cx = W / 2;
    const cy = H / 2;

    const RING_SPACING = Math.min(80, W / 9);

    // Place roots at center
    nodes.filter(n => n.isRoot).forEach(n => {
      if (n.x == null) { n.x = cx + (Math.random() - 0.5) * 30; n.y = cy + (Math.random() - 0.5) * 30; }
      n.fx = null; n.fy = null;
    });
    nodes.filter(n => !n.isRoot).forEach(n => {
      if (n.x == null) {
        const angle = Math.random() * Math.PI * 2;
        const ring  = (n.generationDepth ?? 1) * RING_SPACING;
        n.x = cx + ring * Math.cos(angle);
        n.y = cy + ring * Math.sin(angle);
      }
    });

    simRef.current?.stop();

    const sim = d3.forceSimulation<SwarmNodeData>(nodes)
      .force("link", d3.forceLink<SwarmNodeData, SwarmLink>(links)
        .id(d => d.id)
        .distance(d => {
          const src = d.source as SwarmNodeData;
          const tgt = d.target as SwarmNodeData;
          const drift = Math.max(src.drift ?? 0, tgt.drift ?? 0);
          // Higher drift = longer, more chaotic tether
          return RING_SPACING + drift * 0.9;
        })
        .strength(d => {
          const src = d.source as SwarmNodeData;
          const tgt = d.target as SwarmNodeData;
          const f = ((src.fitnessScore ?? 0.5) + (tgt.fitnessScore ?? 0.5)) / 2;
          // High-fitness = strong bonds; low-fitness = weak, drifting vines
          return 0.15 + f * 0.5;
        })
      )
      .force("charge", d3.forceManyBody<SwarmNodeData>()
        .strength(d => {
          // High-fitness nodes attract neighbours; revoked repel strongly
          if (d.status === "revoked") return -500;
          return d.isRoot ? -700 : -180 - (d.fitnessScore ?? 0.5) * 80;
        })
      )
      .force("center", d3.forceCenter(cx, cy).strength(0.02))
      .force("collide", d3.forceCollide<SwarmNodeData>()
        .radius(d => (d.radius ?? 14) + 10)
      )
      // Phylogenetic radial force: each generation orbits at its ring distance from LUCA
      .force("phylo_radial", d3.forceRadial<SwarmNodeData>(
        d => {
          if (d.isRoot) return 0;
          const gen = d.generationDepth ?? 1;
          // High-fitness nodes orbit tighter (closer to LUCA); low-fitness drift outward
          const fitnessExpansion = (1 - (d.fitnessScore ?? 0.5)) * 20;
          return gen * RING_SPACING + fitnessExpansion;
        },
        cx, cy
      ).strength(d => d.isRoot ? 0.5 : 0.35 + (d.fitnessScore ?? 0.5) * 0.25))
      .alphaDecay(0.01)
      .velocityDecay(0.42)
      .on("tick", () => {
        tickRef.current++;
        const margin = 20;
        for (const n of nodes) {
          const r = n.radius ?? 14;
          n.x = Math.max(r + margin, Math.min(W - r - margin, n.x ?? cx));
          n.y = Math.max(r + margin, Math.min(H - r - margin, n.y ?? cy));
        }
        setRenderTick(t => t + 1);
      });

    simRef.current = sim;

    // d3 drag
    const svgSel = d3.select(svg);
    svgSel.selectAll<SVGCircleElement, SwarmNodeData>(".evo-drag")
      .data(nodes, d => d.id)
      .join("circle")
      .attr("class", "evo-drag")
      .style("fill", "transparent")
      .style("cursor", "grab")
      .call(
        d3.drag<SVGCircleElement, SwarmNodeData>()
          .on("start", (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag",  (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end",   (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            if (!d.isRoot) { d.fx = null; d.fy = null; }
          })
      );

    return () => { sim.stop(); svgSel.selectAll(".evo-drag").remove(); };
  }, [nodes.length, links.length]);

  // ── Compute SVG center ────────────────────────────────────────────────────
  const svgCenter = useMemo(() => {
    const svg = svgRef.current;
    if (!svg) return { cx: 450, cy: 270 };
    const rect = svg.getBoundingClientRect();
    return { cx: (rect.width || 900) / 2, cy: (rect.height || 540) / 2 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active   = nodes.filter(n => n.status === "active");
    const revoked  = nodes.filter(n => n.status === "revoked");
    const drifting = nodes.filter(n => (n.drift ?? 0) > 15 && n.status === "active");
    const avgFitness = nodes.length > 0
      ? nodes.reduce((s, n) => s + (n.fitnessScore ?? 0), 0) / nodes.length : 0;
    const swarmFertility = active.length > 0
      ? (active.length / Math.max(nodes.length, 1)) * avgFitness : 0;
    const geneticDrift = drifting.length > 0
      ? drifting.reduce((s, n) => s + (n.drift ?? 0), 0) / drifting.length : 0;
    return {
      total: nodes.length, active: active.length, revoked: revoked.length,
      drifting: drifting.length, avgFitness, swarmFertility, geneticDrift,
    };
  }, [nodes, renderTick]);

  // ── Node map ──────────────────────────────────────────────────────────────
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes, renderTick]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleNodeClick       = useCallback((e: React.MouseEvent, node: SwarmNodeData) => { e.preventDefault(); setSelectedNode(node); setCtxMenu(null); }, []);
  const handleNodeRightClick  = useCallback((e: React.MouseEvent, node: SwarmNodeData) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ node, x: e.clientX, y: e.clientY }); setSelectedNode(null); }, []);

  const handleRevoke = useCallback(async (node: SwarmNodeData) => {
    setCtxMenu(null); setRevoking(true);
    try {
      const r = await fetch(`${BASE}/api/v1/swarm/revoke-tree/${encodeURIComponent(node.id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cellular Collapse — Sovereign Multi-Sig revocation" }),
      });
      const d = await r.json();
      setRevokeResult(`${d.totalRevoked ?? 0} agent(s) collapsed`);
      setTimeout(() => { setRevokeResult(null); fetchData(); }, 5000);
    } finally { setRevoking(false); }
  }, [fetchData]);

  const handleTrace = useCallback((node: SwarmNodeData) => {
    setCtxMenu(null); navigate(`/traces?agent=${encodeURIComponent(node.id)}`);
  }, [navigate]);

  // Lineage success for selected node
  const selectedLineageRate = useMemo(() => {
    if (!selectedNode) return 0;
    return computeLineageSuccess(selectedNode.id, nodeMap, links);
  }, [selectedNode, nodeMap, links]);

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
            <TreePine className="w-6 h-6" style={{ color: P.sage }} />
            Evolutionary Prosperity Engine
          </h1>
          <p className="text-sm font-mono mt-1" style={{ color: P.dim }}>
            Phylogenetic radial topology · Fitness-driven growth · CRISPR logic recoding · Natural selection
          </p>
        </div>
        <div className="flex items-center gap-3">
          {revokeResult && (
            <span className="text-[10px] font-mono px-2 py-1 rounded border"
              style={{ color: P.terra, borderColor: P.terra + "44", background: P.terra + "10" }}>
              💀 {revokeResult}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="font-mono text-xs gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Evolutionary KPI row ── */}
      <div className="grid grid-cols-5 gap-3 shrink-0">
        {[
          {
            label: "Swarm Fertility",
            value: `${(stats.swarmFertility * 100).toFixed(0)}%`,
            sub: "Delegation efficiency",
            color: stats.swarmFertility > 0.6 ? P.sage : stats.swarmFertility > 0.3 ? P.amber : P.terra,
            Icon: Zap,
            title: "How effectively your AI is delegating and scaling.",
          },
          {
            label: "Apex Fitness",
            value: `${(stats.avgFitness * 100).toFixed(0)}%`,
            sub: "Population avg",
            color: stats.avgFitness > 0.7 ? P.sage : stats.avgFitness > 0.4 ? P.amber : P.terra,
            Icon: Flame,
            title: "Average organism fitness across the entire swarm civilization.",
          },
          {
            label: "Genetic Drift",
            value: `${stats.geneticDrift.toFixed(1)}%`,
            sub: `${stats.drifting} agents drifting`,
            color: stats.drifting === 0 ? P.sage : stats.drifting < 3 ? P.amber : P.mutation,
            Icon: Dna,
            title: "The erosion of corporate policy alignment over time.",
          },
          {
            label: "Natural Selection",
            value: stats.revoked,
            sub: "Eliminated agents",
            color: stats.revoked === 0 ? P.sage : P.terra,
            Icon: Skull,
            title: "Sentinel automatically pruning inefficient / unaligned logic.",
          },
          {
            label: "Active Population",
            value: stats.active,
            sub: `of ${stats.total} total`,
            color: P.blue,
            Icon: Network,
            title: "Living agents in the swarm ecosystem.",
          },
        ].map(({ label, value, sub, color, Icon, title }) => (
          <Card key={label} className="p-3 border-border/60 bg-card/50 cursor-default" title={title}>
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
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── SVG Canvas ── */}
        <div className="flex-1 rounded-xl overflow-hidden relative"
          style={{ border: `1px solid ${P.border}`, background: P.bg }}>

          {/* Legend */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-3 text-[9px] font-mono px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(13,17,23,0.85)", border: `1px solid ${P.border}` }}>
            {[
              { color: P.sage,     label: "High-fitness" },
              { color: P.amber,    label: "Genetic drift >15%" },
              { color: P.mutation, label: "Maladaptive >30%" },
              { color: P.terra,    label: "Collapsed" },
              { color: P.gold,     label: "LUCA (root)" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                <span style={{ color: P.dim }}>{label}</span>
              </span>
            ))}
            <span className="opacity-40 mx-1">|</span>
            <span style={{ color: P.dim }}>hover vine = lineage · right-click = CRISPR</span>
          </div>

          {nodes.length === 0 && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ color: P.dim }}>
              <TreePine className="w-12 h-12 mb-4 opacity-20" />
              <span className="font-mono text-sm">No organisms in the ecosystem</span>
            </div>
          )}

          {/* Lineage tooltip */}
          {lineageTooltip && (
            <div className="absolute z-20 pointer-events-none px-3 py-2 rounded-lg text-[10px] font-mono"
              style={{
                left: lineageTooltip.x + 12,
                top:  lineageTooltip.y - 32,
                background: "rgba(13,17,23,0.95)",
                border: `1px solid ${P.sage}55`,
                color: "#cdd5e0",
                boxShadow: `0 0 12px ${P.sage}22`,
              }}>
              <div style={{ color: P.dim }}>Lineage Success Rate</div>
              <div className="font-bold" style={{ color: lineageTooltip.rate > 0.6 ? P.sage : lineageTooltip.rate > 0.3 ? P.amber : P.terra }}>
                {(lineageTooltip.rate * 100).toFixed(0)}% · {lineageTooltip.label}
              </div>
            </div>
          )}

          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ display: "block" }}
            onClick={() => { setSelectedNode(null); setCtxMenu(null); setLineageTooltip(null); }}
          >
            <defs>
              {/* Radial background glow */}
              <radialGradient id="prosperity-bg" cx="50%" cy="50%">
                <stop offset="0%"   stopColor={P.sage} stopOpacity="0.04" />
                <stop offset="60%"  stopColor={P.sage} stopOpacity="0.01" />
                <stop offset="100%" stopColor={P.bg}   stopOpacity="0" />
              </radialGradient>

              {/* Node glow filters */}
              {[
                { id: "glow-sage",     color: P.sage,     blur: 5 },
                { id: "glow-amber",    color: P.amber,    blur: 6 },
                { id: "glow-mutation", color: P.mutation, blur: 8 },
                { id: "glow-terra",    color: P.terra,    blur: 7 },
                { id: "glow-gold",     color: P.gold,     blur: 8 },
                { id: "glow-blue",     color: P.blue,     blur: 4 },
              ].map(({ id, color, blur }) => (
                <filter key={id} id={id} x="-60%" y="-60%" width="220%" height="220%">
                  <feFlood floodColor={color} result="flood" />
                  <feComposite in="flood" in2="SourceGraphic" operator="in" result="mask" />
                  <feGaussianBlur in="mask" stdDeviation={blur} result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              ))}

              {/* Arrow markers */}
              {[
                { id: "arr-sage",     color: P.sage },
                { id: "arr-amber",    color: P.amber },
                { id: "arr-mutation", color: P.mutation },
                { id: "arr-terra",    color: P.terra },
              ].map(({ id, color }) => (
                <marker key={id} id={id} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill={color} opacity="0.75" />
                </marker>
              ))}

              {/* Ring pattern */}
              <pattern id="eco-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke={P.grid} strokeWidth="0.4" opacity="0.5" />
                <circle cx="0" cy="0" r="0.8" fill={P.sage} opacity="0.04" />
              </pattern>
            </defs>

            {/* Base fill */}
            <rect width="100%" height="100%" fill={P.bg} />
            <rect width="100%" height="100%" fill="url(#eco-grid)" />

            {/* ── Prosperity Pulse: background breath rings ── */}
            {(() => {
              const { cx, cy } = svgCenter;
              const breathPhase = tickRef.current * 0.018;
              const vitality = stats.swarmFertility;
              return (
                <g>
                  {/* Radial prosperity aura */}
                  <ellipse cx={cx} cy={cy} rx="100%" ry="100%" fill="url(#prosperity-bg)" opacity={vitality * 0.8} />
                  {/* Concentric breath rings expanding from LUCA */}
                  {[0, 1, 2].map(i => {
                    const phase   = (breathPhase + i * 0.7) % (Math.PI * 2);
                    const frac    = (Math.sin(phase) + 1) / 2;   // 0..1 oscillation
                    const maxR    = 60 + i * 55;
                    const r       = 20 + frac * maxR;
                    const opacity = (1 - frac) * 0.09 * vitality;
                    return (
                      <circle key={i} cx={cx} cy={cy} r={r}
                        fill="none" stroke={P.prosperity}
                        strokeWidth={1.5 - i * 0.4}
                        opacity={opacity}
                      />
                    );
                  })}
                  {/* Center LUCA glow pulse */}
                  <circle cx={cx} cy={cy} r={12 + Math.sin(breathPhase * 1.3) * 6}
                    fill={P.gold} fillOpacity={0.04 + vitality * 0.04} stroke="none" />
                </g>
              );
            })()}

            {/* ── Generation ring guides (faint) ── */}
            {(() => {
              const { cx, cy } = svgCenter;
              const maxGen = Math.max(...nodes.map(n => n.generationDepth ?? 0), 0);
              const RING = Math.min(80, 720 / 9);
              return (
                <g>
                  {Array.from({ length: maxGen }, (_, i) => (
                    <circle key={i} cx={cx} cy={cy} r={(i + 1) * RING}
                      fill="none" stroke={P.sage} strokeWidth="0.3"
                      strokeDasharray="3,12" opacity={0.08} />
                  ))}
                </g>
              );
            })()}

            {/* ── Links (phylogenetic vines) ── */}
            <g className="vines">
              {links.map((link, i) => {
                const src = nodeMap.get(typeof link.source === "string" ? link.source : (link.source as SwarmNodeData).id);
                const tgt = nodeMap.get(typeof link.target === "string" ? link.target : (link.target as SwarmNodeData).id);
                if (!src?.x || !src?.y || !tgt?.x || !tgt?.y) return null;
                const srcX = src.x; const srcY = src.y;
                const tgtX = tgt.x; const tgtY = tgt.y;

                const isRevoked = src.status === "revoked" || tgt.status === "revoked";
                const drift     = Math.max(src.drift ?? 0, tgt.drift ?? 0);
                const hovered   = hoveredLinkIdx === i;
                const color     = linkColor(src, tgt);
                const width     = linkWidth(src, tgt, hovered);

                // Vibration for mutation vines
                const vibX = drift > 15 && !isRevoked ? Math.sin(tickRef.current * 0.16 + i * 1.1) * (drift / 100) * 5 : 0;
                const vibY = drift > 15 && !isRevoked ? Math.cos(tickRef.current * 0.21 + i * 0.9) * (drift / 100) * 4 : 0;

                const mx = (srcX + tgtX) / 2 + vibX;
                const my = (srcY + tgtY) / 2 + vibY;

                const arrowId = isRevoked ? "arr-terra" : drift > 30 ? "arr-mutation" : drift > 15 ? "arr-amber" : "arr-sage";

                // Compute lineage success for tooltip
                const srcNode = src;
                const lineageRate = hovered ? computeLineageSuccess(srcNode.id, nodeMap, links) : 0;

                return (
                  <path
                    key={i}
                    d={`M ${srcX} ${srcY} Q ${mx} ${my} ${tgtX} ${tgtY}`}
                    fill="none"
                    stroke={hovered ? P.gold : color}
                    strokeWidth={width}
                    strokeDasharray={
                      isRevoked ? "3,5"          // brittle snap
                        : drift > 30 ? "none"
                        : "none"
                    }
                    markerEnd={`url(#${arrowId})`}
                    opacity={isRevoked ? 0.35 : hovered ? 1 : 0.8}
                    style={{ cursor: "pointer", transition: "stroke 0.2s, stroke-width 0.2s" }}
                    onMouseEnter={e => {
                      setHoveredLinkIdx(i);
                      setLineageTooltip({ x: e.clientX, y: e.clientY, rate: lineageRate, label: src.label });
                    }}
                    onMouseMove={e => {
                      const newRate = computeLineageSuccess(src.id, nodeMap, links);
                      setLineageTooltip({ x: e.clientX, y: e.clientY, rate: newRate, label: src.label });
                    }}
                    onMouseLeave={() => { setHoveredLinkIdx(null); setLineageTooltip(null); }}
                    onClick={e => e.stopPropagation()}
                  />
                );
              })}
            </g>

            {/* ── Cellular Collapse burst particles ── */}
            {Array.from(collapsingRef.current.entries()).map(([id, cs]) => {
              const elapsed = Date.now() - cs.startedAt;
              const progress = Math.min(elapsed / 900, 1);
              if (progress >= 1) { collapsingRef.current.delete(id); return null; }

              const PARTICLES = 8;
              return (
                <g key={`collapse-${id}`}>
                  {Array.from({ length: PARTICLES }, (_, p) => {
                    const angle    = (p / PARTICLES) * Math.PI * 2;
                    const speed    = (cs.r * 2) * progress;
                    const px       = cs.x + speed * Math.cos(angle);
                    const py       = cs.y + speed * Math.sin(angle);
                    const scale    = 1 - progress;
                    const opacity  = (1 - progress) * 0.9;
                    return (
                      <circle key={p} cx={px} cy={py}
                        r={3 * scale}
                        fill={P.collapse}
                        opacity={opacity}
                        style={{ filter: `blur(${1 * scale}px)` }}
                      />
                    );
                  })}
                  {/* Central implosion ring */}
                  <circle
                    cx={cs.x} cy={cs.y}
                    r={cs.r * (1 + progress * 0.8)}
                    fill="none"
                    stroke={P.terra}
                    strokeWidth={2 * (1 - progress)}
                    opacity={(1 - progress) * 0.7}
                  />
                </g>
              );
            })}

            {/* ── Nodes (organisms) ── */}
            <g className="organisms">
              {nodes.map(node => {
                if (!node.x || !node.y) return null;
                const color  = nodeColor(node);
                const r      = node.radius ?? 14;
                const f      = node.fitnessScore ?? 0.5;
                const drift  = node.drift ?? 0;
                const isSelected = selectedNode?.id === node.id;
                const isMutating = drift > 15 && node.status !== "revoked";
                const isSevere   = drift > 30;

                // Outer glow radius — pulsing, fitness-driven
                const glowPulse = isSevere
                  ? r + 8 + Math.sin(tickRef.current * 0.18 + node.id.charCodeAt(0)) * 5
                  : isMutating
                  ? r + 5 + Math.sin(tickRef.current * 0.10 + node.id.charCodeAt(0)) * 3
                  : r + 2 + Math.sin(tickRef.current * 0.04 + node.id.charCodeAt(0) * 0.3) * (1.5 + f * 2.5);

                const filterId = node.status === "revoked" ? "glow-terra"
                  : isSevere   ? "glow-mutation"
                  : isMutating ? "glow-amber"
                  : node.isRoot ? "glow-gold"
                  : "glow-sage";

                // Mutation warp path (organic cell shape)
                const mutPath = isMutating
                  ? mutationPath(node.x, node.y, r, tickRef.current, drift)
                  : null;

                return (
                  <g
                    key={node.id}
                    style={{ cursor: "pointer" }}
                    onClick={e => { e.stopPropagation(); handleNodeClick(e, node); }}
                    onContextMenu={e => handleNodeRightClick(e, node)}
                  >
                    {/* Selection ring */}
                    {isSelected && (
                      <circle cx={node.x} cy={node.y} r={r + 11}
                        fill="none" stroke={P.blue} strokeWidth="2.5" opacity="0.9" />
                    )}

                    {/* Outer glow halo */}
                    <circle cx={node.x} cy={node.y} r={glowPulse}
                      fill="none"
                      stroke={color}
                      strokeWidth={node.isRoot ? 2.5 : 1.5}
                      opacity={node.isRoot ? 0.35 : f * 0.3 + 0.08}
                      filter={`url(#${filterId})`}
                    />

                    {/* Fitness aura ring (LUCA only — extra sovereignty ring) */}
                    {node.isRoot && (
                      <>
                        <circle cx={node.x} cy={node.y}
                          r={r + 12 + Math.sin(tickRef.current * 0.022) * 3}
                          fill="none" stroke={P.gold} strokeWidth="1.2"
                          strokeDasharray="3,5" opacity="0.35" />
                        <circle cx={node.x} cy={node.y}
                          r={r + 20 + Math.sin(tickRef.current * 0.015 + 1) * 4}
                          fill="none" stroke={P.gold} strokeWidth="0.6"
                          strokeDasharray="2,8" opacity="0.15" />
                      </>
                    )}

                    {/* Mutation warp body (organic cell) */}
                    {mutPath && (
                      <path d={mutPath}
                        fill={color} fillOpacity={0.12}
                        stroke={isSevere ? P.mutation : P.amber}
                        strokeWidth="1.5"
                        opacity="0.7"
                      />
                    )}

                    {/* Node body */}
                    <circle cx={node.x} cy={node.y} r={r}
                      fill={color} fillOpacity={nodeBrightness(node) * 0.22}
                      stroke={color} strokeWidth={node.isRoot ? 2.5 : 2}
                      filter={`url(#${filterId})`}
                    />

                    {/* Inner nucleus — fitness-driven brightness */}
                    <circle cx={node.x} cy={node.y} r={r * (0.45 + f * 0.2)}
                      fill={color} fillOpacity={0.6 + f * 0.3} />

                    {/* Status icon */}
                    <text x={node.x} y={node.y}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={node.isRoot ? 12 : 9}
                      fill={node.isRoot ? P.bg : "#fff"}
                      fontWeight={node.isRoot ? "bold" : "normal"}
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {node.status === "revoked"     ? "✕"
                        : node.status === "drift-locked" ? "⚠"
                        : node.isRoot                ? "◆"
                        : isSevere                   ? "⚡"
                        : "●"}
                    </text>

                    {/* Label */}
                    <text x={node.x} y={node.y + r + 13}
                      textAnchor="middle"
                      fontSize="8"
                      fill={P.dim}
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {node.label.length > 14 ? node.label.slice(0, 12) + "…" : node.label}
                    </text>

                    {/* Fitness score badge (above node) */}
                    {node.status !== "revoked" && (
                      <text x={node.x} y={node.y - r - 7}
                        textAnchor="middle"
                        fontSize="7"
                        fill={isSevere ? P.mutation : isMutating ? P.amber : P.sage}
                        fontWeight="bold"
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {isSevere ? `⚠ ${drift.toFixed(0)}%`
                          : isMutating ? `Δ${drift.toFixed(0)}%`
                          : node.isRoot ? "LUCA"
                          : `fit:${(f * 100).toFixed(0)}%`}
                      </text>
                    )}

                    {/* CRISPR glow after white-gold surge (RECURSIVE_FIX_VERIFIED) */}
                    {node.isRoot && (
                      <circle cx={node.x} cy={node.y}
                        r={r * 0.3}
                        fill={P.gold}
                        fillOpacity={0.5 + Math.sin(tickRef.current * 0.05) * 0.2}
                        style={{ filter: "blur(2px)" }}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* ── Right panel ── */}
        <div className="w-80 shrink-0 flex flex-col gap-2 min-h-0">

          {/* Node info card */}
          {selectedNode && (
            <div className="shrink-0 flex flex-col gap-2 animate-in slide-in-from-right-4">
              <NodeInfoPanel
                node={selectedNode}
                lineageRate={selectedLineageRate}
                onClose={() => setSelectedNode(null)}
              />
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}`, background: "rgba(13,17,23,0.85)" }}>
                <div className="p-2 space-y-1">
                  <button onClick={() => handleTrace(selectedNode)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono transition-colors hover:bg-white/5">
                    <Activity className="w-3 h-3 shrink-0" style={{ color: P.blue }} />
                    <span style={{ color: "#e0e6ed" }}>Open Trace Explorer</span>
                    <ChevronRight className="w-2.5 h-2.5 ml-auto opacity-40" />
                  </button>
                  {selectedNode.status === "active" && (
                    <button onClick={() => handleRevoke(selectedNode)} disabled={revoking}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono transition-colors hover:bg-red-500/10 disabled:opacity-40">
                      <Skull className="w-3 h-3 shrink-0" style={{ color: P.terra }} />
                      <span style={{ color: P.terra }}>{revoking ? "Collapsing…" : "Trigger Cellular Collapse"}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Lattice Telemetry Terminal ── */}
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
                <button onClick={() => setStreamEvents([])}
                  className="text-[9px] font-mono opacity-40 hover:opacity-100" style={{ color: P.dim }}>CLR</button>
              </div>
            </div>

            <div ref={feedRef} className="flex-1 overflow-y-auto overflow-x-hidden"
              style={{ scrollbarWidth: "thin", scrollbarColor: `${P.border} transparent` }}>
              {streamEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4" style={{ color: P.dim }}>
                  <Activity className="w-6 h-6 mb-2 opacity-20" />
                  <div className="text-[10px] font-mono opacity-60">
                    {wsConnected ? "Awaiting genome events…" : "Connecting to stream…"}
                  </div>
                </div>
              )}
              {streamEvents.map((ev, idx) => {
                const isBreach  = ev.r;
                const isDrift   = ev.d > 15 && !isBreach;
                const color     = isBreach ? P.terra : isDrift ? P.amber : P.sage;
                const isFocused = focusedStreamId === ev.lid;
                const driftHist = driftHistoryRef.current.get(ev.a) ?? [];
                const agentNode = nodeMap.get(ev.a);

                return (
                  <button
                    key={`${ev.lid}-${idx}`}
                    className="w-full text-left px-2.5 py-1.5 border-b transition-all"
                    style={{
                      borderColor: P.border + "44",
                      background: isFocused ? color + "18" : isBreach ? P.terra + "0a" : "transparent",
                      animation: isBreach ? "evo-collapse 0.5s ease-out 1" : "evo-birth 0.18s ease-out 1",
                      animationFillMode: "both",
                    }}
                    onClick={() => {
                      setFocusedStreamId(ev.lid);
                      if (agentNode) {
                        setSelectedNode(agentNode);
                        simRef.current?.alphaTarget(0.1).restart();
                        setTimeout(() => simRef.current?.alphaTarget(0), 500);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] font-mono shrink-0" style={{ color: P.dim }}>
                        {new Date(ev.t).toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className="text-[9px] font-mono font-bold truncate flex-1" style={{ color }}>{ev.e}</span>
                      {ev.q && <span className="text-[9px] shrink-0" title="ML-DSA-87 verified" style={{ color: P.sage }}>⚡</span>}
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
                      {ev.d > 0 && (
                        <span className="text-[9px] font-mono font-bold shrink-0" style={{ color: ev.d > 15 ? P.amber : P.dim }}>
                          {ev.d.toFixed(0)}%
                        </span>
                      )}
                      {ev.p && (
                        <span className="text-[9px] font-mono shrink-0 truncate" title={`Spawned by: ${ev.p}`}
                          style={{ color: P.blue + "bb", maxWidth: "64px" }}>
                          [{ev.p.substring(0, 8)}]
                        </span>
                      )}
                      {(ev.x || isBreach) && (
                        <span className="ml-auto text-[8px] font-mono font-bold shrink-0" style={{ color }}>
                          {isBreach ? "EXTINCT" : "MUTANT"}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── CSS animations ── */}
      <style>{`
        @keyframes evo-birth {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes evo-collapse {
          0%   { opacity: 0; transform: translateX(12px) scaleX(1.05); }
          20%  { opacity: 1; transform: translateX(-4px); background: rgba(217,97,97,0.28); }
          40%  { transform: translateX(2px) scaleX(0.98); }
          70%  { background: rgba(217,97,97,0.10); }
          100% { opacity: 1; transform: translateX(0) scaleX(1); }
        }
        @keyframes evo-crispr-surge {
          0%   { opacity: 0; r: 0; }
          30%  { opacity: 1; }
          100% { opacity: 0; r: 60; }
        }
      `}</style>

      {/* ── Context Menu ── */}
      {ctxMenu && (
        <SovereignContextMenu
          node={ctxMenu.node} x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onRevoke={() => handleRevoke(ctxMenu.node)}
          onTrace={() => handleTrace(ctxMenu.node)}
          onDriftLock={async () => {
            setCtxMenu(null);
            await fetch(`${BASE}/api/v1/swarm/sessions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: ctxMenu.node.id + "-drift-flagged",
                swarmId: ctxMenu.node.swarmId ?? "default",
              }),
            });
            fetchData();
          }}
        />
      )}
    </div>
  );
}
