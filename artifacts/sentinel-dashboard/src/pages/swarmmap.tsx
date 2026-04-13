import React, { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  Shield,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Network,
  User,
  ChevronRight,
  Skull,
  Zap,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Palette ────────────────────────────────────────────────────────────────
const COLORS = {
  active: "#40B595",
  revoked: "#D96161",
  driftLocked: "#EBC06D",
  unknown: "#4A5568",
  edge: "#2C3136",
  edgeRevoked: "#D96161",
  bg: "#1A1F24",
  nodeBg: "#1F252B",
  text: "#E2E8F0",
  dim: "#4A5568",
};

interface SwarmNode {
  id: string;
  label: string;
  status: string;
  swarmId: string | null;
  rootSwarmId: string | null;
  parentUid: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

interface SwarmEdge {
  source: string;
  target: string;
}

interface SwarmMap {
  nodes: SwarmNode[];
  edges: SwarmEdge[];
  totalNodes: number;
  totalEdges: number;
}

interface LayoutNode extends SwarmNode {
  x: number;
  y: number;
  level: number;
  children: string[];
}

// ── Hierarchical Layout Calculator ────────────────────────────────────────

function computeLayout(nodes: SwarmNode[], edges: SwarmEdge[]): LayoutNode[] {
  if (nodes.length === 0) return [];

  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  nodes.forEach((n) => childrenMap.set(n.id, []));
  edges.forEach((e) => {
    childrenMap.get(e.source)?.push(e.target);
    parentMap.set(e.target, e.source);
  });

  // Find roots (nodes with no parent in edges)
  const roots = nodes.filter((n) => !parentMap.has(n.id)).map((n) => n.id);

  // BFS to assign levels
  const levels = new Map<string, number>();
  const queue: string[] = [...roots];
  roots.forEach((r) => levels.set(r, 0));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const level = levels.get(current) ?? 0;
    for (const child of childrenMap.get(current) ?? []) {
      if (!levels.has(child)) {
        levels.set(child, level + 1);
        queue.push(child);
      }
    }
  }

  const maxLevel = Math.max(...Array.from(levels.values()), 0);
  const svgHeight = Math.max(400, (maxLevel + 1) * 140 + 80);
  const svgWidth = 900;

  // Group nodes by level
  const byLevel: Map<number, string[]> = new Map();
  for (const [nodeId, level] of levels) {
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(nodeId);
  }

  // Assign x,y based on level + position within level
  const posMap = new Map<string, { x: number; y: number }>();
  for (const [level, levelNodes] of byLevel) {
    const count = levelNodes.length;
    const yStep = svgHeight / (maxLevel + 1);
    const y = 80 + level * yStep;
    levelNodes.forEach((id, idx) => {
      const xStep = svgWidth / (count + 1);
      posMap.set(id, { x: xStep * (idx + 1), y });
    });
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return nodes.map((n) => {
    const pos = posMap.get(n.id) ?? { x: svgWidth / 2, y: 80 };
    return {
      ...n,
      x: pos.x,
      y: pos.y,
      level: levels.get(n.id) ?? 0,
      children: childrenMap.get(n.id) ?? [],
    };
  });
}

// ── Node Component ─────────────────────────────────────────────────────────

function nodeColor(status: string): string {
  if (status === "revoked") return COLORS.revoked;
  if (status === "drift-locked") return COLORS.driftLocked;
  return COLORS.active;
}

function nodeIcon(status: string): React.ReactNode {
  if (status === "revoked") return <Skull className="w-3 h-3" />;
  if (status === "drift-locked") return <AlertTriangle className="w-3 h-3" />;
  return <User className="w-3 h-3" />;
}

// ── Ancestry Trace Panel ───────────────────────────────────────────────────

interface AncestryTrace {
  agentId: string;
  session: SwarmNode;
  ancestors: SwarmNode[];
  depth: number;
  rootAgentId: string;
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function SwarmMapPage() {
  const [swarmData, setSwarmData] = useState<SwarmMap | null>(null);
  const [layout, setLayout] = useState<LayoutNode[]>([]);
  const [selected, setSelected] = useState<SwarmNode | null>(null);
  const [ancestry, setAncestry] = useState<AncestryTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [revokeResult, setRevokeResult] = useState<{ chain: string[]; count: number } | null>(null);
  const [registerForm, setRegisterForm] = useState({ agentId: "", parentUid: "", swarmId: "" });
  const [registering, setRegistering] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const fetchMap = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/v1/swarm/map`);
      if (!r.ok) return;
      const data: SwarmMap = await r.json();
      setSwarmData(data);
      setLayout(computeLayout(data.nodes, data.edges));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMap();
    const id = setInterval(fetchMap, 10_000);
    return () => clearInterval(id);
  }, [fetchMap]);

  const fetchAncestry = async (agentId: string) => {
    try {
      const r = await fetch(`${BASE}/api/v1/swarm/ancestry/${encodeURIComponent(agentId)}`);
      if (!r.ok) { setAncestry(null); return; }
      setAncestry(await r.json());
    } catch { setAncestry(null); }
  };

  const handleNodeClick = (node: SwarmNode) => {
    setSelected(node);
    setRevokeResult(null);
    fetchAncestry(node.id);
  };

  const handleRevokeTree = async () => {
    if (!selected) return;
    setRevoking(true);
    try {
      const r = await fetch(`${BASE}/api/v1/swarm/revoke-tree/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual recursive revocation from Swarm Map" }),
      });
      const data = await r.json();
      setRevokeResult({ chain: data.revokedChain ?? [], count: data.totalRevoked ?? 0 });
      await fetchMap();
    } finally {
      setRevoking(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.agentId) return;
    setRegistering(true);
    try {
      await fetch(`${BASE}/api/v1/swarm/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: registerForm.agentId,
          parentUid: registerForm.parentUid || undefined,
          swarmId: registerForm.swarmId || undefined,
        }),
      });
      setRegisterForm({ agentId: "", parentUid: "", swarmId: "" });
      await fetchMap();
    } finally {
      setRegistering(false);
    }
  };

  // ── SVG dimensions
  const svgWidth = 900;
  const svgHeight = layout.length === 0 ? 280 : Math.max(400, (Math.max(...layout.map((n) => n.level), 0) + 1) * 140 + 80);

  const nodeMap = new Map(layout.map((n) => [n.id, n]));

  // ── Stats
  const total = swarmData?.totalNodes ?? 0;
  const active = swarmData?.nodes.filter((n) => n.status === "active").length ?? 0;
  const revoked = swarmData?.nodes.filter((n) => n.status === "revoked").length ?? 0;
  const driftLocked = swarmData?.nodes.filter((n) => n.status === "drift-locked").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight">Swarm Map</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live agent ancestry topology — parent → child lineage with recursive revocation
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchMap}
          disabled={loading}
          className="font-mono text-xs gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Agents", value: total, color: "text-foreground", icon: Network },
          { label: "Active", value: active, color: "text-[#40B595]", icon: Shield },
          { label: "Revoked", value: revoked, color: "text-[#D96161]", icon: ShieldAlert },
          { label: "Drift-Locked", value: driftLocked, color: "text-[#EBC06D]", icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <Card key={label} className="p-4 border-border/60 bg-card/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* SVG Graph */}
        <Card className="xl:col-span-2 p-4 border-border/60 bg-card/50 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-sm font-medium text-muted-foreground flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-[#40B595]" />
              ANCESTRY TOPOLOGY
            </h2>
            <div className="flex gap-3 text-[10px] font-mono text-muted-foreground">
              {[
                { color: COLORS.active, label: "Active" },
                { color: COLORS.revoked, label: "Revoked" },
                { color: COLORS.driftLocked, label: "Drift-Locked" },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {loading && layout.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground font-mono text-sm">
              Loading swarm topology...
            </div>
          ) : layout.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground font-mono text-sm gap-3">
              <Network className="w-10 h-10 text-muted-foreground/30" />
              <span>No agent sessions registered yet</span>
              <span className="text-xs">Use the panel on the right to register agents</span>
            </div>
          ) : (
            <div className="overflow-auto">
              <svg
                ref={svgRef}
                width={svgWidth}
                height={svgHeight}
                className="w-full"
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              >
                {/* Grid lines */}
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke={COLORS.edge} strokeWidth="0.3" opacity="0.4" />
                  </pattern>
                  <filter id="glow-active">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="glow-revoked">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <marker id="arrow-active" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill={COLORS.active} opacity="0.6" />
                  </marker>
                  <marker id="arrow-revoked" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill={COLORS.revoked} opacity="0.8" />
                  </marker>
                </defs>
                <rect width={svgWidth} height={svgHeight} fill={COLORS.bg} rx="8" />
                <rect width={svgWidth} height={svgHeight} fill="url(#grid)" rx="8" />

                {/* Edges */}
                {swarmData?.edges.map((edge, edgeIdx) => {
                  const src = nodeMap.get(edge.source);
                  const tgt = nodeMap.get(edge.target);
                  if (!src || !tgt) return null;
                  const isRevokedEdge = src.status === "revoked" || tgt.status === "revoked";
                  const color = isRevokedEdge ? COLORS.revoked : COLORS.active;
                  const opacity = isRevokedEdge ? 0.7 : 0.4;
                  const mx = (src.x + tgt.x) / 2;
                  const my = (src.y + tgt.y) / 2 - 20;
                  return (
                    <g key={`edge-${edgeIdx}-${edge.source}-${edge.target}`}>
                      <path
                        d={`M${src.x},${src.y + 24} Q${mx},${my} ${tgt.x},${tgt.y - 24}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={isRevokedEdge ? 1.5 : 1}
                        opacity={opacity}
                        strokeDasharray={isRevokedEdge ? "4,4" : "none"}
                        markerEnd={isRevokedEdge ? "url(#arrow-revoked)" : "url(#arrow-active)"}
                      />
                    </g>
                  );
                })}

                {/* Nodes */}
                {layout.map((node) => {
                  const color = nodeColor(node.status);
                  const isSelected = selected?.id === node.id;
                  const shortId = node.id.length > 16 ? node.id.substring(0, 14) + "…" : node.id;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x},${node.y})`}
                      onClick={() => handleNodeClick(node)}
                      className="cursor-pointer"
                    >
                      {/* Outer glow ring (selected or revoked) */}
                      {(isSelected || node.status === "revoked") && (
                        <circle
                          r={30}
                          fill="none"
                          stroke={color}
                          strokeWidth={isSelected ? 2 : 1}
                          opacity={isSelected ? 0.5 : 0.2}
                          className={node.status === "revoked" ? "animate-pulse" : ""}
                        />
                      )}
                      {/* Main circle */}
                      <circle
                        r={22}
                        fill={COLORS.nodeBg}
                        stroke={color}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        filter={isSelected ? `url(#glow-${node.status === "revoked" ? "revoked" : "active"})` : undefined}
                      />
                      {/* Status indicator */}
                      <circle cx={16} cy={-16} r={5} fill={color} />
                      {/* Swarm membership ring (if has swarmId) */}
                      {node.swarmId && (
                        <circle r={26} fill="none" stroke={COLORS.active} strokeWidth={0.5} opacity={0.3} strokeDasharray="3,3" />
                      )}
                      {/* Label */}
                      <text
                        textAnchor="middle"
                        dy="4"
                        fontSize="8"
                        fontFamily="monospace"
                        fill={COLORS.text}
                        opacity={0.9}
                      >
                        {shortId}
                      </text>
                      {/* Revoked X mark */}
                      {node.status === "revoked" && (
                        <>
                          <line x1="-8" y1="-8" x2="8" y2="8" stroke={COLORS.revoked} strokeWidth="1.5" opacity="0.6" />
                          <line x1="8" y1="-8" x2="-8" y2="8" stroke={COLORS.revoked} strokeWidth="1.5" opacity="0.6" />
                        </>
                      )}
                      {/* Depth label below */}
                      <text
                        textAnchor="middle"
                        dy="34"
                        fontSize="7"
                        fontFamily="monospace"
                        fill={COLORS.dim}
                      >
                        L{node.level}
                        {node.swarmId ? ` · ${node.swarmId.length > 10 ? node.swarmId.substring(0, 8) + "…" : node.swarmId}` : ""}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </Card>

        {/* Right Panel */}
        <div className="flex flex-col gap-4">
          {/* Register Session */}
          <Card className="p-4 border-border/60 bg-card/50">
            <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-[#40B595]" />
              Register Agent Session
            </h3>
            <form onSubmit={handleRegister} className="space-y-2">
              {[
                { key: "agentId", placeholder: "Agent ID *", required: true },
                { key: "parentUid", placeholder: "Parent UID (optional)" },
                { key: "swarmId", placeholder: "Swarm ID (optional)" },
              ].map(({ key, placeholder, required }) => (
                <input
                  key={key}
                  value={(registerForm as any)[key]}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  required={required}
                  className="w-full h-8 bg-muted/50 border border-border rounded px-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
                />
              ))}
              <Button type="submit" size="sm" className="w-full font-mono text-xs" disabled={registering}>
                {registering ? "Registering…" : "Register"}
              </Button>
            </form>
          </Card>

          {/* Selected Node Details */}
          {selected ? (
            <Card className={`p-4 border-border/60 ${selected.status === "revoked" ? "border-[#D96161]/40 bg-[#D96161]/5" : "bg-card/50"}`}>
              <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Network className="w-3.5 h-3.5" />
                Selected Node
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agent ID</span>
                  <span className="text-foreground max-w-[140px] truncate text-right">{selected.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant="outline"
                    style={{
                      borderColor: nodeColor(selected.status),
                      color: nodeColor(selected.status),
                      fontSize: "10px",
                    }}
                  >
                    {selected.status.toUpperCase()}
                  </Badge>
                </div>
                {selected.parentUid && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Parent</span>
                    <span className="text-[#40B595] max-w-[120px] truncate">{selected.parentUid}</span>
                  </div>
                )}
                {selected.swarmId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Swarm</span>
                    <span className="text-[#40B595]">{selected.swarmId}</span>
                  </div>
                )}
                {selected.revokedAt && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Revoked At</span>
                    <span className="text-[#D96161]">{new Date(selected.revokedAt).toLocaleString()}</span>
                    {selected.revokedReason && (
                      <span className="text-[#D96161]/70 text-[10px]">{selected.revokedReason}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Ancestry Trace */}
              {ancestry && (
                <div className="mt-3 border-t border-[#2C3136] pt-3">
                  <div className="text-[10px] font-mono text-muted-foreground mb-2 flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    ANCESTRY TRACE (depth {ancestry.depth})
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-[10px] font-mono">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: nodeColor(selected.status) }} />
                      <span className="text-foreground">{selected.id}</span>
                      <span className="text-muted-foreground ml-auto">(this)</span>
                    </div>
                    {ancestry.ancestors.map((anc, i) => (
                      <div key={anc.agentId} className="flex items-center gap-1 text-[10px] font-mono pl-3">
                        <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: nodeColor(anc.status) }} />
                        <span className={anc.status === "revoked" ? "text-[#D96161]" : "text-[#40B595]"}>
                          {anc.agentId.length > 18 ? anc.agentId.substring(0, 16) + "…" : anc.agentId}
                        </span>
                        {i === ancestry.ancestors.length - 1 && (
                          <span className="text-muted-foreground ml-auto">(root)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recursive Revocation */}
              {selected.status !== "revoked" && (
                <div className="mt-3 border-t border-[#2C3136] pt-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full font-mono text-xs gap-1.5"
                    onClick={handleRevokeTree}
                    disabled={revoking}
                  >
                    <Skull className="w-3 h-3" />
                    {revoking ? "Revoking…" : "Recursive Revoke Tree"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground/60 font-mono mt-1 text-center">
                    Revokes this agent + all ancestors to root
                  </p>
                </div>
              )}

              {revokeResult && (
                <div className="mt-2 p-2 rounded border border-[#D96161]/40 bg-[#D96161]/10">
                  <div className="text-[10px] font-mono text-[#D96161] font-bold">
                    REVOKED {revokeResult.count} AGENT{revokeResult.count !== 1 ? "S" : ""}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-1 space-y-0.5">
                    {revokeResult.chain.map((id) => (
                      <div key={id} className="flex items-center gap-1">
                        <span className="text-[#D96161]">✗</span> {id}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-4 border-border/60 bg-card/50">
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
                <Network className="w-8 h-8 opacity-30" />
                <span className="text-xs font-mono">Click a node to inspect</span>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
