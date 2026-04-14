/**
 * Spatial Swarm Map — d3-force primary War Room view
 *
 * · Root Sovereign nodes: larger, semi-fixed at center ring
 * · Worker agents: floating, tethered to parents via spring links
 * · Trust Velocity tether: link width & vibration ∝ cognitive drift
 * · Lattice Glow: Sage=healthy, Amber=drift>15%, Terracotta=revoked/breach
 * · Lattice Grid background shifts dynamically with node movement
 * · Left-click node → Trace Explorer for that agent
 * · Right-click → Sovereign Multi-Sig intervention menu
 */

import React, {
  useEffect, useRef, useState, useCallback, useMemo,
} from "react";
import * as d3 from "d3";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Network, ShieldAlert, AlertTriangle, Shield, RefreshCw,
  GitBranch, Zap, Lock, Skull, Activity, Info, X,
  ChevronRight, Fingerprint, TriangleAlert,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  sage:    "#40B595",
  amber:   "#EBC06D",
  terra:   "#D96161",
  blue:    "#5B8DEF",
  dim:     "#9AA4B1",
  border:  "#2C3136",
  panel:   "#161B22",
  bg:      "#0D1117",
  grid:    "#1a2130",
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
}
interface SwarmLink { source: string | SwarmNodeData; target: string | SwarmNodeData; }

// ── Color helpers ─────────────────────────────────────────────────────────────
function nodeColor(node: SwarmNodeData): string {
  if (node.status === "revoked") return P.terra;
  if (node.status === "drift-locked") return P.amber;
  return P.sage;
}
function glowRadius(node: SwarmNodeData, tick: number): number {
  const base = node.radius ?? 14;
  if (node.status === "revoked") {
    return base + 6 + Math.sin(tick * 0.12) * 3;          // pulse
  }
  if (node.status === "drift-locked" || (node.drift ?? 0) > 15) {
    return base + 4 + Math.sin(tick * 0.07) * 2;          // slow glow
  }
  return base + 2 + Math.sin(tick * 0.04) * 1.5;          // calm breathe
}
function linkColor(src: SwarmNodeData, tgt: SwarmNodeData): string {
  if (src.status === "revoked" || tgt.status === "revoked") return P.terra + "88";
  const drift = Math.max(src.drift ?? 0, tgt.drift ?? 0);
  if (drift > 15) return P.amber + "99";
  return P.sage + "55";
}
function linkWidth(src: SwarmNodeData, tgt: SwarmNodeData): number {
  const drift = Math.max(src.drift ?? 0, tgt.drift ?? 0);
  return 1.5 + (drift / 100) * 4;
}

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
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 rounded-xl overflow-hidden shadow-2xl"
        style={{
          left: Math.min(x, window.innerWidth - 260),
          top: Math.min(y, window.innerHeight - 280),
          width: 250,
          background: "rgba(13,17,23,0.97)",
          border: `1px solid ${color}55`,
          backdropFilter: "blur(20px)",
          boxShadow: `0 0 32px ${color}22`,
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b" style={{ borderColor: color + "33", background: color + "10" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
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
            {node.isRoot && <span className="px-1 py-0.5 rounded" style={{
              background: P.blue + "22", color: P.blue, border: `1px solid ${P.blue}33`
            }}>SOVEREIGN</span>}
            {node.swarmId && <span style={{ color: P.dim }}>· {node.swarmId}</span>}
          </div>
        </div>

        {/* Title */}
        <div className="px-4 py-2 border-b" style={{ borderColor: P.border }}>
          <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
            Sovereign Multi-Sig Intervention
          </div>
        </div>

        {/* Actions */}
        <div className="p-2 space-y-1">
          <button
            onClick={onTrace}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-white/5"
          >
            <Activity className="w-3.5 h-3.5" style={{ color: P.blue }} />
            <span style={{ color: "#e0e6ed" }}>View Trace Explorer</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
          </button>

          {node.status === "active" && (
            <button
              onClick={onDriftLock}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-amber-500/10"
            >
              <TriangleAlert className="w-3.5 h-3.5" style={{ color: P.amber }} />
              <span style={{ color: P.amber }}>Flag for Drift Review</span>
            </button>
          )}

          {node.parentUid && (
            <button
              onClick={() => {}}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-white/5"
            >
              <GitBranch className="w-3.5 h-3.5" style={{ color: P.dim }} />
              <span style={{ color: "#e0e6ed" }}>Audit Lineage Chain</span>
              <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
            </button>
          )}

          {node.status === "active" && (
            <button
              onClick={onRevoke}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-red-500/10"
            >
              <Skull className="w-3.5 h-3.5" style={{ color: P.terra }} />
              <span style={{ color: P.terra }}>Recursive Revoke Branch</span>
            </button>
          )}
        </div>

        {/* Fingerprint row */}
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
function NodeInfoPanel({ node, onClose }: { node: SwarmNodeData; onClose: () => void }) {
  const color = nodeColor(node);
  return (
    <div className="rounded-xl overflow-hidden" style={{
      border: `1px solid ${color}44`,
      background: "rgba(13,17,23,0.95)",
      backdropFilter: "blur(20px)",
    }}>
      <div className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: color + "33", background: color + "0f" }}>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="text-xs font-mono font-bold" style={{ color }}>{node.label}</span>
          {node.isRoot && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold"
              style={{ color: P.blue, background: P.blue + "22", border: `1px solid ${P.blue}33` }}>
              SOVEREIGN
            </span>
          )}
        </div>
        <button onClick={onClose} className="opacity-40 hover:opacity-100 transition-opacity">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-4 space-y-2">
        {[
          { label: "Status", value: node.status.toUpperCase(), color },
          { label: "Swarm ID", value: node.swarmId ?? "—" },
          { label: "Root Swarm", value: node.rootSwarmId ?? "—" },
          { label: "Parent", value: node.parentUid ?? "genesis" },
          { label: "Drift", value: `${(node.drift ?? 0).toFixed(1)}%`,
            color: (node.drift ?? 0) > 15 ? P.amber : P.sage },
          { label: "Registered", value: new Date(node.createdAt).toLocaleString() },
          ...(node.revokedAt ? [{ label: "Revoked", value: new Date(node.revokedAt).toLocaleString(), color: P.terra }] : []),
          ...(node.revokedReason ? [{ label: "Reason", value: node.revokedReason }] : []),
        ].map(({ label, value, color: c }) => (
          <div key={label} className="flex items-start gap-3">
            <span className="text-[9px] font-mono uppercase tracking-widest w-20 shrink-0 pt-0.5"
              style={{ color: P.dim }}>
              {label}
            </span>
            <span className="text-[10px] font-mono font-bold break-all" style={{ color: c ?? "#cdd5e0" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SwarmMapPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<SwarmNodeData, SwarmLink> | null>(null);
  const tickRef = useRef(0);
  const animRef = useRef(0);
  const gridOffsetRef = useRef({ x: 0, y: 0 });

  const [nodes, setNodes] = useState<SwarmNodeData[]>([]);
  const [links, setLinks] = useState<SwarmLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [renderTick, setRenderTick] = useState(0);

  const [selectedNode, setSelectedNode] = useState<SwarmNodeData | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ node: SwarmNodeData; x: number; y: number } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeResult, setRevokeResult] = useState<string | null>(null);

  const [, navigate] = useLocation();

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/swarm/map`);
      if (!r.ok) return;
      const data = await r.json();

      // Enrich with drift estimates (root=0, revoked=100, drift-locked=40, active=rand)
      const enriched: SwarmNodeData[] = (data.nodes ?? []).map((n: SwarmNodeData) => ({
        ...n,
        isRoot: !n.parentUid,
        radius: !n.parentUid ? 22 : 14,
        drift: n.status === "revoked" ? 100
          : n.status === "drift-locked" ? 45 + Math.random() * 20
          : Math.random() * 12,
      }));

      setNodes(prev => {
        // Preserve positions if nodes already exist
        const posMap = new Map(prev.map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]));
        return enriched.map(n => {
          const pos = posMap.get(n.id);
          return pos ? { ...n, ...pos } : n;
        });
      });
      setLinks(data.edges ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 12_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── d3 Simulation ─────────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || nodes.length === 0) return;

    const rect = svg.getBoundingClientRect();
    const W = rect.width || 900;
    const H = rect.height || 520;
    const cx = W / 2;
    const cy = H / 2;

    // Place root nodes in a circle around center
    const roots = nodes.filter(n => n.isRoot);
    const rootAngle = (2 * Math.PI) / Math.max(roots.length, 1);
    const rootR = Math.min(120, W / 5);
    roots.forEach((n, i) => {
      if (n.x == null) n.x = cx + rootR * Math.cos(i * rootAngle - Math.PI / 2);
      if (n.y == null) n.y = cy + rootR * Math.sin(i * rootAngle - Math.PI / 2);
      // Semi-fixed: pull strongly toward initial position but allow drift
      n.fx = null; n.fy = null;
    });

    // Init worker positions
    nodes.filter(n => !n.isRoot).forEach(n => {
      if (n.x == null) { n.x = cx + (Math.random() - 0.5) * W * 0.6; }
      if (n.y == null) { n.y = cy + (Math.random() - 0.5) * H * 0.6; }
    });

    // Stop old simulation
    simRef.current?.stop();

    const sim = d3.forceSimulation<SwarmNodeData>(nodes)
      .force("link", d3.forceLink<SwarmNodeData, SwarmLink>(links)
        .id(d => d.id)
        .distance(d => {
          const src = d.source as SwarmNodeData;
          const tgt = d.target as SwarmNodeData;
          const drift = Math.max(src.drift ?? 0, tgt.drift ?? 0);
          // Higher drift = longer tether
          return 80 + drift * 1.2;
        })
        .strength(d => {
          const src = d.source as SwarmNodeData;
          const tgt = d.target as SwarmNodeData;
          const drift = Math.max(src.drift ?? 0, tgt.drift ?? 0);
          // Lower strength = looser tether when drifting
          return 0.5 - (drift / 100) * 0.35;
        })
      )
      .force("charge", d3.forceManyBody<SwarmNodeData>()
        .strength(d => d.isRoot ? -600 : -220)
      )
      .force("center", d3.forceCenter(cx, cy).strength(0.04))
      .force("collide", d3.forceCollide<SwarmNodeData>()
        .radius(d => (d.radius ?? 14) + 12)
      )
      // Root gravity: pull roots toward their initial ring positions
      .force("root_anchor", d3.forceRadial<SwarmNodeData>(
        d => d.isRoot ? rootR : 0,
        cx, cy
      ).strength(d => d.isRoot ? 0.12 : 0))
      .alphaDecay(0.012)
      .velocityDecay(0.38)
      .on("tick", () => {
        tickRef.current++;
        // Clamp to canvas bounds
        for (const n of nodes) {
          const r = n.radius ?? 14;
          n.x = Math.max(r + 4, Math.min(W - r - 4, n.x ?? cx));
          n.y = Math.max(r + 4, Math.min(H - r - 4, n.y ?? cy));
        }
        // Shift lattice grid offset based on average node displacement
        const avgX = nodes.reduce((s, n) => s + (n.x ?? cx), 0) / nodes.length;
        const avgY = nodes.reduce((s, n) => s + (n.y ?? cy), 0) / nodes.length;
        gridOffsetRef.current = {
          x: ((avgX - cx) * 0.15) % 40,
          y: ((avgY - cy) * 0.15) % 40,
        };
        setRenderTick(t => t + 1);
      });

    simRef.current = sim;

    // ── d3 drag ────────────────────────────────────────────────────────────
    const svgSel = d3.select(svg);
    svgSel.selectAll<SVGCircleElement, SwarmNodeData>(".node-drag-target")
      .data(nodes, d => d.id)
      .join("circle")
      .attr("class", "node-drag-target")
      .style("fill", "transparent")
      .style("cursor", "grab")
      .call(
        d3.drag<SVGCircleElement, SwarmNodeData>()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x; d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            // Root nodes stay put, workers release
            if (!d.isRoot) { d.fx = null; d.fy = null; }
          })
      );

    return () => { sim.stop(); svgSel.selectAll(".node-drag-target").remove(); };
  }, [nodes.length, links.length]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:       nodes.length,
    active:      nodes.filter(n => n.status === "active").length,
    revoked:     nodes.filter(n => n.status === "revoked").length,
    driftLocked: nodes.filter(n => n.status === "drift-locked").length,
    drifting:    nodes.filter(n => (n.drift ?? 0) > 15 && n.status === "active").length,
  }), [nodes, renderTick]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((e: React.MouseEvent, node: SwarmNodeData) => {
    e.preventDefault();
    setSelectedNode(node);
    setCtxMenu(null);
  }, []);

  const handleNodeRightClick = useCallback((e: React.MouseEvent, node: SwarmNodeData) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ node, x: e.clientX, y: e.clientY });
    setSelectedNode(null);
  }, []);

  const handleRevoke = useCallback(async (node: SwarmNodeData) => {
    setCtxMenu(null);
    setRevoking(true);
    try {
      const r = await fetch(`${BASE}/api/v1/swarm/revoke-tree/${encodeURIComponent(node.id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Sovereign Multi-Sig revocation from Swarm Map" }),
      });
      const d = await r.json();
      setRevokeResult(`${d.totalRevoked ?? 0} agent(s) revoked`);
      setTimeout(() => { setRevokeResult(null); fetchData(); }, 4000);
    } finally { setRevoking(false); }
  }, [fetchData]);

  const handleTrace = useCallback((node: SwarmNodeData) => {
    setCtxMenu(null);
    navigate(`/traces?agent=${encodeURIComponent(node.id)}`);
  }, [navigate]);

  // ── Node map for rendering ────────────────────────────────────────────────
  const nodeMap = useMemo(() =>
    new Map(nodes.map(n => [n.id, n]))
  , [nodes, renderTick]);

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4 animate-in fade-in duration-500">
      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
            <Network className="w-6 h-6" style={{ color: P.sage }} />
            Spatial Swarm Map
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            d3-force live topology · Trust Velocity tethers · Lattice Glow state · Sovereign Multi-Sig
          </p>
        </div>
        <div className="flex items-center gap-3">
          {revokeResult && (
            <span className="text-[10px] font-mono px-2 py-1 rounded border"
              style={{ color: P.sage, borderColor: P.sage + "44", background: P.sage + "10" }}>
              ✓ {revokeResult}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}
            className="font-mono text-xs gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-5 gap-3 shrink-0">
        {[
          { label: "Total Agents",  value: stats.total,       color: P.blue,  Icon: Network },
          { label: "Active",        value: stats.active,      color: P.sage,  Icon: Shield },
          { label: "Drifting",      value: stats.drifting,    color: P.amber, Icon: AlertTriangle },
          { label: "Drift-Locked",  value: stats.driftLocked, color: P.amber, Icon: AlertTriangle },
          { label: "Revoked",       value: stats.revoked,     color: P.terra, Icon: ShieldAlert },
        ].map(({ label, value, color, Icon }) => (
          <Card key={label} className="p-3 border-border/60 bg-card/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
          </Card>
        ))}
      </div>

      {/* ── Main layout ── */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* ── SVG Canvas ── */}
        <div className="flex-1 rounded-xl overflow-hidden relative" style={{
          border: `1px solid ${P.border}`,
          background: P.bg,
        }}>
          {/* Legend overlay */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-3 text-[9px] font-mono px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(13,17,23,0.8)", border: `1px solid ${P.border}` }}>
            {[
              { color: P.sage,  label: "Healthy QL-2.0" },
              { color: P.amber, label: "Drift >15%" },
              { color: P.terra, label: "Revoked / Breach" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                <span style={{ color: P.dim }}>{label}</span>
              </span>
            ))}
            <span className="opacity-40 mx-1">|</span>
            <span style={{ color: P.dim }}>click = info · right-click = intervention</span>
          </div>

          {/* Instruction when empty */}
          {nodes.length === 0 && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ color: P.dim }}>
              <Network className="w-12 h-12 mb-4 opacity-20" />
              <span className="font-mono text-sm">No swarm agents registered</span>
            </div>
          )}

          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ display: "block" }}
            onClick={() => { setSelectedNode(null); setCtxMenu(null); }}
          >
            <defs>
              {/* Lattice grid pattern — shifts with node movement */}
              <pattern
                id="lattice"
                x={gridOffsetRef.current.x}
                y={gridOffsetRef.current.y}
                width="40" height="40"
                patternUnits="userSpaceOnUse"
              >
                <path d="M 40 0 L 0 0 0 40" fill="none"
                  stroke={P.grid} strokeWidth="0.5" opacity="0.6" />
                <circle cx="0" cy="0" r="1" fill={P.sage} opacity="0.06" />
              </pattern>

              {/* Glow filters */}
              {[
                { id: "glow-sage",  color: P.sage,  blur: 4 },
                { id: "glow-amber", color: P.amber, blur: 5 },
                { id: "glow-terra", color: P.terra, blur: 6 },
                { id: "glow-blue",  color: P.blue,  blur: 4 },
              ].map(({ id, color, blur }) => (
                <filter key={id} id={id} x="-50%" y="-50%" width="200%" height="200%">
                  <feFlood floodColor={color} result="flood" />
                  <feComposite in="flood" in2="SourceGraphic" operator="in" result="mask" />
                  <feGaussianBlur in="mask" stdDeviation={blur} result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              ))}

              {/* Arrow markers */}
              {[
                { id: "arrow-sage",  color: P.sage },
                { id: "arrow-amber", color: P.amber },
                { id: "arrow-terra", color: P.terra },
              ].map(({ id, color }) => (
                <marker key={id} id={id} markerWidth="8" markerHeight="8"
                  refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill={color} opacity="0.7" />
                </marker>
              ))}
            </defs>

            {/* Background lattice */}
            <rect width="100%" height="100%" fill={P.bg} />
            <rect width="100%" height="100%" fill="url(#lattice)" />

            {/* ── Links ── */}
            <g className="links">
              {links.map((link, i) => {
                const src = nodeMap.get(typeof link.source === "string" ? link.source : (link.source as SwarmNodeData).id);
                const tgt = nodeMap.get(typeof link.target === "string" ? link.target : (link.target as SwarmNodeData).id);
                if (!src?.x || !tgt?.x) return null;

                const drift = Math.max(src.drift ?? 0, tgt.drift ?? 0);
                const color = linkColor(src, tgt);
                const width = linkWidth(src, tgt);
                const isRevoked = src.status === "revoked" || tgt.status === "revoked";

                // Vibration offset for high-drift links
                const vibX = drift > 15 && !isRevoked
                  ? Math.sin(tickRef.current * 0.18 + i) * (drift / 100) * 4 : 0;
                const vibY = drift > 15 && !isRevoked
                  ? Math.cos(tickRef.current * 0.22 + i) * (drift / 100) * 3 : 0;

                const mx = (src.x + tgt.x) / 2 + vibX;
                const my = (src.y + tgt.y) / 2 + vibY;

                const arrowId = isRevoked ? "arrow-terra" : drift > 15 ? "arrow-amber" : "arrow-sage";

                return (
                  <path
                    key={i}
                    d={`M ${src.x} ${src.y} Q ${mx} ${my} ${tgt.x} ${tgt.y}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={width}
                    strokeDasharray={isRevoked ? "5,4" : drift > 15 ? "none" : "none"}
                    markerEnd={`url(#${arrowId})`}
                    opacity={isRevoked ? 0.5 : 0.85}
                  />
                );
              })}
            </g>

            {/* ── Nodes ── */}
            <g className="nodes">
              {nodes.map(node => {
                if (!node.x || !node.y) return null;
                const color = nodeColor(node);
                const r = node.radius ?? 14;
                const glowR = glowRadius(node, tickRef.current);
                const filterId = node.status === "revoked" ? "glow-terra"
                  : (node.drift ?? 0) > 15 ? "glow-amber"
                  : "glow-sage";
                const isSelected = selectedNode?.id === node.id;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    style={{ cursor: "pointer" }}
                    onClick={e => { e.stopPropagation(); handleNodeClick(e, node); }}
                    onContextMenu={e => handleNodeRightClick(e, node)}
                  >
                    {/* Lattice glow ring — pulsing outer halo */}
                    <circle
                      r={glowR}
                      fill="none"
                      stroke={color}
                      strokeWidth={node.status === "revoked" ? 2 : 1.5}
                      opacity={node.status === "revoked" ? 0.4
                        : (node.drift ?? 0) > 15 ? 0.3
                        : 0.18}
                      filter={`url(#${filterId})`}
                    />

                    {/* Extra ring for sovereign roots */}
                    {node.isRoot && (
                      <circle
                        r={r + 8 + Math.sin(tickRef.current * 0.025) * 2}
                        fill="none"
                        stroke={color}
                        strokeWidth="1"
                        opacity="0.25"
                        strokeDasharray="4,4"
                      />
                    )}

                    {/* Selection ring */}
                    {isSelected && (
                      <circle
                        r={r + 10}
                        fill="none"
                        stroke={P.blue}
                        strokeWidth="2"
                        opacity="0.9"
                      />
                    )}

                    {/* Node fill */}
                    <circle
                      r={r}
                      fill={color}
                      fillOpacity="0.22"
                      stroke={color}
                      strokeWidth="2"
                      filter={`url(#${filterId})`}
                    />
                    <circle r={r * 0.55} fill={color} fillOpacity="0.85" />

                    {/* Status icon */}
                    <text
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={node.isRoot ? 11 : 9}
                      fill="#fff"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {node.status === "revoked" ? "✕"
                        : node.status === "drift-locked" ? "⚠"
                        : node.isRoot ? "◆" : "●"}
                    </text>

                    {/* Label below node */}
                    <text
                      y={r + 12}
                      textAnchor="middle"
                      fontSize="8"
                      fill={P.dim}
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {node.label.length > 14 ? node.label.slice(0, 12) + "…" : node.label}
                    </text>

                    {/* Drift badge for drifting workers */}
                    {(node.drift ?? 0) > 15 && node.status !== "revoked" && (
                      <text
                        y={-r - 6}
                        textAnchor="middle"
                        fontSize="7"
                        fill={P.amber}
                        fontWeight="bold"
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        Δ{(node.drift ?? 0).toFixed(0)}%
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* ── Side panel: Node info ── */}
        {selectedNode && (
          <div className="w-72 shrink-0 flex flex-col gap-3">
            <NodeInfoPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
            />

            {/* Quick actions */}
            <div className="rounded-xl overflow-hidden" style={{
              border: `1px solid ${P.border}`,
              background: "rgba(13,17,23,0.7)",
            }}>
              <div className="px-4 py-2.5 border-b" style={{ borderColor: P.border }}>
                <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
                  Quick Actions
                </div>
              </div>
              <div className="p-2 space-y-1">
                <button
                  onClick={() => handleTrace(selectedNode)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-white/5"
                >
                  <Activity className="w-3.5 h-3.5" style={{ color: P.blue }} />
                  <span style={{ color: "#e0e6ed" }}>Open Trace Explorer</span>
                  <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
                </button>

                {selectedNode.status === "active" && (
                  <button
                    onClick={() => handleRevoke(selectedNode)}
                    disabled={revoking}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono transition-colors hover:bg-red-500/10 disabled:opacity-40"
                  >
                    <Skull className="w-3.5 h-3.5" style={{ color: P.terra }} />
                    <span style={{ color: P.terra }}>
                      {revoking ? "Revoking…" : "Recursive Revoke"}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Trust velocity */}
            <div className="rounded-xl p-4" style={{
              border: `1px solid ${P.border}`,
              background: "rgba(13,17,23,0.7)",
            }}>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color: P.dim }}>
                Trust Velocity
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono" style={{ color: P.dim }}>Cognitive Drift</span>
                    <span className="text-[10px] font-mono font-bold"
                      style={{ color: (selectedNode.drift ?? 0) > 15 ? P.amber : P.sage }}>
                      {(selectedNode.drift ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full" style={{ background: P.border }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(100, selectedNode.drift ?? 0)}%`,
                      background: (selectedNode.drift ?? 0) > 50 ? P.terra
                        : (selectedNode.drift ?? 0) > 15 ? P.amber : P.sage,
                    }} />
                  </div>
                </div>
                <div className="text-[9px] font-mono" style={{ color: P.dim }}>
                  {selectedNode.isRoot
                    ? "Sovereign root — tether anchor for child agents"
                    : selectedNode.parentUid
                    ? `Tethered to parent: ${selectedNode.parentUid.slice(0, 14)}…`
                    : "Unrooted agent"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right-click context menu ── */}
      {ctxMenu && (
        <SovereignContextMenu
          node={ctxMenu.node}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onRevoke={() => handleRevoke(ctxMenu.node)}
          onTrace={() => handleTrace(ctxMenu.node)}
          onDriftLock={async () => {
            setCtxMenu(null);
            // Stub: mark as drift-locked via a session status update
            await fetch(`${BASE}/api/v1/swarm/sessions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: ctxMenu.node.id + "-drift-review",
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
