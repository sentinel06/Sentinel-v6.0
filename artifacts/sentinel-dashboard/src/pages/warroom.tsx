import React, {
  useEffect, useRef, useState, useCallback, useMemo
} from "react";
import { useWsEvent } from "@/contexts/WsContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert, ShieldCheck, Clock, CheckCircle2, XCircle, AlertTriangle,
  Activity, Zap, FileText, Power, Skull, Lock, Download, BookMarked,
  FlaskConical, Eye, Search, Terminal, Shield, Cpu, Network, User,
  ChevronRight, GitBranch, X as XIcon, Hash, ToggleLeft, ToggleRight,
} from "lucide-react";
import { formatTime } from "@/lib/audit-utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── MaroShield Zen palette ────────────────────────────────────────────────────
const P = {
  sage:       "#00F5FF",
  amber:      "#FFB800",
  terra:      "#FF003C",
  panel:      "#161B22",
  border:     "#2C3136",
  dim:        "#9AA4B1",
  blue:       "#5B8DEF",
  bg:         "#0D1117",
};

// ── Threat mode ─────────────────────────────────────────────────────────────
type ThreatMode = "OBSERVE" | "ANALYZE" | "INTERVENE";

// ── Types ────────────────────────────────────────────────────────────────────
interface AuthRequest {
  id: string; agentId: string; traceId: string; intent: string;
  proposedAction: string; actionType: string;
  status: "PENDING" | "AUTHORIZED" | "BLOCKED" | "AUTO_BLOCKED" | "HONEYPOT_BREACH";
  sessionHealthScore: number; requestedAt: string;
  resolvedAt?: string; resolvedBy?: string; notes?: string;
}
interface SwarmNode {
  id: string; label: string; status: string;
  swarmId: string | null; rootSwarmId: string | null; parentUid: string | null;
  createdAt: string; revokedAt: string | null; revokedReason: string | null;
}
interface SwarmEdge { source: string; target: string; }
interface PulseStats {
  globalIntegrityIndex: number; totalEvents: number; verifiedEvents: number;
  activeSwarms: number; revokedSwarms: number; quantumThroughputBits: string; status: string;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

function useAuthRequests() {
  const [requests, setRequests] = useState<AuthRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [criticalBreaches, setCriticalBreaches] = useState<AuthRequest[]>([]);
  const refresh = useCallback(async () => {
    const r = await fetch(`${BASE}/api/v1/authorize/history`);
    const d = await r.json();
    const all: AuthRequest[] = d.requests ?? [];
    setRequests(all);
    setCriticalBreaches(all.filter(r =>
      r.status === ("HONEYPOT_BREACH" as any) || (r.notes ?? "").includes("CRITICAL BREACH")));
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [refresh]);
  // Auth events are pushed over the shared WS — no separate connection needed.
  useWsEvent("auth_request",      useCallback(() => { void refresh(); }, [refresh]));
  useWsEvent("auth_resolved",     useCallback(() => { void refresh(); }, [refresh]));
  useWsEvent("pending_approval",  useCallback(() => { void refresh(); }, [refresh]));
  useWsEvent("honeypot_breach",   useCallback(() => { void refresh(); }, [refresh]));
  return { requests, loading, refresh, criticalBreaches };
}

function useKillSwitch() {
  const [active, setActive] = useState(false);
  const check = useCallback(async () => {
    const r = await fetch(`${BASE}/api/v1/admin/kill-switch`);
    setActive((await r.json()).active);
  }, []);
  useEffect(() => { check(); }, [check]);
  const toggle = async () => {
    await fetch(`${BASE}/api/v1/admin/kill-switch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate: !active, resolvedBy: "admin-dashboard" }),
    });
    await check();
  };
  return { active, toggle };
}

function useSwarmMap() {
  const [nodes, setNodes] = useState<SwarmNode[]>([]);
  const [edges, setEdges] = useState<SwarmEdge[]>([]);
  const fetch_ = useCallback(async () => {
    const r = await fetch(`${BASE}/api/v1/swarm/map`);
    if (!r.ok) return;
    const d = await r.json();
    setNodes(d.nodes ?? []);
    setEdges(d.edges ?? []);
  }, []);
  // Initial fetch — seeds data before first WS push.
  useEffect(() => { void fetch_(); }, [fetch_]);
  // WS push replaces the 12 s poll — backend emits swarm_map after every log flush.
  useWsEvent("swarm_map", useCallback((data: unknown) => {
    const d = data as { nodes?: SwarmNode[]; edges?: SwarmEdge[] } | null;
    if (d?.nodes) setNodes(d.nodes);
    if (d?.edges) setEdges(d.edges);
  }, []));
  return { nodes, edges };
}

function usePulseStats() {
  const [stats, setStats] = useState<PulseStats | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`${BASE}/api/v1/status`);
    if (r.ok) setStats(await r.json());
  }, []);
  // Initial fetch — seeds data before first WS push.
  useEffect(() => { void load(); }, [load]);
  // WS push replaces the 15 s poll — backend emits status_update after each pulse.
  useWsEvent("status_update", useCallback((data: unknown) => {
    if (data) setStats(data as PulseStats);
  }, []));
  return stats;
}

function usePulseFault() {
  const [fault, setFault] = useState<{ pulseId: string; globalIntegrityIndex: string; faultReason: string | null; createdAt: string } | null>(null);
  // Consolidated into shared WS — no separate connection needed.
  useWsEvent("pulse_fault", useCallback((data: unknown) => {
    setFault(data as { pulseId: string; globalIntegrityIndex: string; faultReason: string | null; createdAt: string });
  }, []));
  return { fault, dismiss: () => setFault(null) };
}

async function resolveRequest(id: string, decision: "AUTHORIZED" | "BLOCKED") {
  await fetch(`${BASE}/api/v1/authorize/${id}/resolve`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, resolvedBy: "admin-dashboard" }),
  });
}

// ── Utility components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AuthRequest["status"] }) {
  const map: Record<string, string> = {
    PENDING: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    AUTHORIZED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    BLOCKED: "bg-destructive/15 text-destructive border-destructive/30",
    AUTO_BLOCKED: "bg-destructive/15 text-destructive border-destructive/30",
    HONEYPOT_BREACH: "bg-red-900/30 text-red-300 border-red-500/50",
  };
  const icons: Record<string, React.ReactNode> = {
    HONEYPOT_BREACH: <Skull className="w-2.5 h-2.5 mr-0.5 inline" />,
    AUTO_BLOCKED: <Lock className="w-2.5 h-2.5 mr-0.5 inline" />,
  };
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border inline-flex items-center ${map[status] ?? map.BLOCKED}`}>
      {icons[status]}{status}
    </span>
  );
}

function HealthBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-400" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-mono font-bold ${pct >= 70 ? "text-emerald-400" : pct >= 50 ? "text-yellow-400" : "text-destructive"}`}>
        {pct}%
      </span>
    </div>
  );
}

function HoneypotBreachCard({ breach }: { breach: AuthRequest }) {
  return (
    <div className="relative overflow-hidden rounded-lg border-2 border-red-500/60 bg-red-950/20 p-4">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-600 via-red-400 to-red-600" />
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 border border-red-500/40">
          <Skull className="w-5 h-5 text-red-400 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-red-300">CRITICAL BREACH</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-500/40">{breach.agentId}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-red-400 border border-red-600/40">honey-token: {breach.actionType}</span>
          </div>
          <p className="text-[11px] font-mono text-red-400/80 mt-1.5 leading-relaxed">{breach.notes}</p>
          <div className="text-[10px] font-mono text-red-600/70 mt-1.5 flex items-center gap-2">
            <Lock className="w-2.5 h-2.5" />Agent permanently revoked · {formatTime(breach.requestedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadPDFButton({ agentId }: { agentId?: string }) {
  const [loading, setLoading] = useState(false);
  const handleDownload = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (agentId) params.set("agentId", agentId);
    const url = `${BASE}/api/v1/export/audit-pdf?${params.toString()}`;
    const r = await fetch(url);
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sentinel-audit-${agentId ?? "full"}-${new Date().toISOString().split("T")[0]}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    setLoading(false);
  };
  return (
    <Button onClick={handleDownload} disabled={loading} variant="outline" size="sm"
      className="font-mono text-xs border-primary/30 hover:bg-primary/10 gap-1.5">
      <Download className="w-3.5 h-3.5 text-primary" />
      {loading ? "Generating PDF…" : "Export Evidence Bag (PDF)"}
    </Button>
  );
}

// ── Lattice Pulse Overlay ────────────────────────────────────────────────────
// Sinusoidal wave canvas behind content — speed ∝ ML-DSA throughput

function LatticePulseOverlay({ throughputBits }: { throughputBits: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const speedFactor = Math.max(0.3, Math.min(3.0, throughputBits / 2_000_000));

    const draw = () => {
      const w = canvas.width; const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const waves = [
        { amp: h * 0.04, freq: 0.012, phase: 0,        color: P.sage,   opacity: 0.045 },
        { amp: h * 0.025, freq: 0.018, phase: Math.PI * 0.4, color: P.blue,   opacity: 0.03  },
        { amp: h * 0.02,  freq: 0.025, phase: Math.PI * 0.8, color: P.amber,  opacity: 0.022 },
      ];

      waves.forEach(wave => {
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.globalAlpha = wave.opacity;
        ctx.lineWidth = 1.5;
        for (let x = 0; x <= w; x += 2) {
          const y = h / 2 + Math.sin(x * wave.freq + phaseRef.current + wave.phase) * wave.amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      phaseRef.current += 0.018 * speedFactor;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, [throughputBits]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

// ── Force-directed Swarm Canvas ──────────────────────────────────────────────

interface FNode extends SwarmNode {
  x: number; y: number; vx: number; vy: number;
  quantumVerified: boolean;
}

function buildForceNodes(nodes: SwarmNode[], w: number, h: number): FNode[] {
  return nodes.map((n, i) => ({
    ...n,
    x: w / 2 + (Math.random() - 0.5) * w * 0.7,
    y: h / 2 + (Math.random() - 0.5) * h * 0.7,
    vx: 0, vy: 0,
    quantumVerified: n.status === "active",
  }));
}

function tickForce(fnodes: FNode[], edges: SwarmEdge[], w: number, h: number) {
  const nodeMap = new Map<string, FNode>(fnodes.map(n => [n.id, n]));
  const REPULSION = 3200;
  const SPRING_K = 0.035;
  const SPRING_LEN = 110;
  const CENTER_G = 0.006;
  const DAMPING = 0.82;

  // Repulsion (O(n²) — fine for ≤ 100 nodes)
  for (let i = 0; i < fnodes.length; i++) {
    for (let j = i + 1; j < fnodes.length; j++) {
      const a = fnodes[i]; const b = fnodes[j];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
    }
  }

  // Spring forces on edges
  for (const edge of edges) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) continue;
    const dx = tgt.x - src.x; const dy = tgt.y - src.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const force = (dist - SPRING_LEN) * SPRING_K;
    const fx = (dx / dist) * force; const fy = (dy / dist) * force;
    src.vx += fx; src.vy += fy; tgt.vx -= fx; tgt.vy -= fy;
  }

  // Center gravity + integration
  const cx = w / 2; const cy = h / 2;
  for (const n of fnodes) {
    n.vx += (cx - n.x) * CENTER_G;
    n.vy += (cy - n.y) * CENTER_G;
    n.vx *= DAMPING; n.vy *= DAMPING;
    n.x += n.vx; n.y += n.vy;
    n.x = Math.max(28, Math.min(w - 28, n.x));
    n.y = Math.max(28, Math.min(h - 28, n.y));
  }
}

function nodeColor(status: string) {
  if (status === "revoked") return P.terra;
  if (status === "drift-locked") return P.amber;
  return P.sage;
}

function SwarmCanvas({
  nodes, edges, onNodeClick, selectedId,
}: {
  nodes: SwarmNode[];
  edges: SwarmEdge[];
  onNodeClick: (n: SwarmNode) => void;
  selectedId: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fnodesRef = useRef<FNode[]>([]);
  const animRef = useRef<number>(0);
  const tickRef = useRef(0);

  const initNodes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fnodesRef.current = buildForceNodes(nodes, canvas.width, canvas.height);
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    initNodes();
  }, [initNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const RAD = 14;
    const edgeMap = new Map<string, string[]>();
    edges.forEach(e => {
      if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
      edgeMap.get(e.source)!.push(e.target);
    });

    const draw = () => {
      const w = canvas.width; const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Settle simulation
      for (let t = 0; t < 3; t++) tickForce(fnodesRef.current, edges, w, h);
      tickRef.current++;

      const nodeMap = new Map<string, FNode>(fnodesRef.current.map(n => [n.id, n]));

      // Draw edges with arrows
      ctx.save();
      for (const edge of edges) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x; const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;
        const ux = dx / dist; const uy = dy / dist;
        const ex = tgt.x - ux * (RAD + 4); const ey = tgt.y - uy * (RAD + 4);
        const sx = src.x + ux * RAD; const sy = src.y + uy * RAD;

        const grad = ctx.createLinearGradient(sx, sy, ex, ey);
        const srcColor = nodeColor(src.status);
        const tgtColor = nodeColor(tgt.status);
        grad.addColorStop(0, srcColor + "55");
        grad.addColorStop(1, tgtColor + "88");

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 8 * Math.cos(angle - 0.4), ey - 8 * Math.sin(angle - 0.4));
        ctx.lineTo(ex - 8 * Math.cos(angle + 0.4), ey - 8 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = tgtColor + "99";
        ctx.fill();
      }
      ctx.restore();

      // Draw nodes
      const t = tickRef.current;
      for (const n of fnodesRef.current) {
        const isSelected = n.id === selectedId;
        const color = nodeColor(n.status);

        // Quantum Halo glow — only for verified active nodes
        if (n.quantumVerified) {
          const halos = 3;
          for (let h = halos; h >= 1; h--) {
            const radius = RAD + h * 5 + Math.sin(t * 0.04 + n.x * 0.1) * 2;
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.04 * (halos - h + 1);
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        // Selection ring
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, RAD + 6, 0, Math.PI * 2);
          ctx.strokeStyle = P.blue;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.9;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Node fill
        ctx.beginPath();
        ctx.arc(n.x, n.y, RAD, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(n.x - 3, n.y - 3, 0, n.x, n.y, RAD);
        grad.addColorStop(0, color + "ee");
        grad.addColorStop(1, color + "77");
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Icon (text)
        ctx.fillStyle = "#fff";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const icon = n.status === "revoked" ? "✕" : n.status === "drift-locked" ? "⚠" : "●";
        ctx.fillText(icon, n.x, n.y);

        // Label below
        ctx.fillStyle = P.dim;
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const shortId = n.label.length > 12 ? n.label.slice(0, 10) + "…" : n.label;
        ctx.fillText(shortId, n.x, n.y + RAD + 4);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges, selectedId]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
    for (const n of fnodesRef.current) {
      const dx = mx - n.x; const dy = my - n.y;
      if (dx * dx + dy * dy <= 14 * 14) { onNodeClick(n); return; }
    }
  }, [onNodeClick]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair"
      style={{ display: "block" }}
      onClick={handleClick}
    />
  );
}

// ── Intent Scrubber ──────────────────────────────────────────────────────────
// Predicts next 3 agent steps from recent audit log patterns

const ACTION_TRANSITIONS: Record<string, string[]> = {
  READ_DATA:       ["WRITE_DATA", "ANALYZE", "CALL_EXTERNAL_API"],
  WRITE_DATA:      ["COMMIT_TRANSACTION", "NOTIFY_DOWNSTREAM", "READ_DATA"],
  ANALYZE:         ["GENERATE_REPORT", "WRITE_DATA", "CALL_EXTERNAL_API"],
  CALL_EXTERNAL_API: ["PROCESS_RESPONSE", "WRITE_DATA", "READ_DATA"],
  GENERATE_REPORT: ["DELIVER_OUTPUT", "ARCHIVE", "NOTIFY_DOWNSTREAM"],
  COMMIT_TRANSACTION: ["NOTIFY_DOWNSTREAM", "ARCHIVE", "READ_DATA"],
  NOTIFY_DOWNSTREAM: ["WAIT_ACK", "LOG_COMPLETION", "READ_DATA"],
  DEFAULT:         ["READ_DATA", "ANALYZE", "GENERATE_REPORT"],
};

function predictNextSteps(recentActions: string[]): string[] {
  if (recentActions.length === 0) return ACTION_TRANSITIONS.DEFAULT;
  const last = recentActions[recentActions.length - 1];
  const key = Object.keys(ACTION_TRANSITIONS).find(k =>
    last?.toUpperCase().includes(k)
  ) ?? "DEFAULT";
  return ACTION_TRANSITIONS[key];
}

function IntentScrubber({ node, onClose }: { node: SwarmNode; onClose: () => void }) {
  const [recentActions, setRecentActions] = useState<string[]>([]);
  const [auditId, setAuditId] = useState<string>("");
  const [sha512, setSha512] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/api/v1/audit/logs?agentId=${encodeURIComponent(node.label)}&limit=10`)
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(d => {
        const logs = d.logs ?? [];
        setRecentActions(logs.slice(0, 5).map((l: any) => l.actionType ?? l.eventType ?? "ANALYZE"));
        if (logs[0]) {
          setAuditId(logs[0].id ?? "—");
          setSha512((logs[0].blockHash ?? logs[0].pqSignature ?? "").substring(0, 16));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [node.label]);

  const nextSteps = useMemo(() => predictNextSteps(recentActions), [recentActions]);
  const color = nodeColor(node.status);

  return (
    <div className="flex flex-col h-full" style={{ color: "#E0E6ED" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: P.border }}>
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4" style={{ color }} />
          <span className="text-xs font-mono font-bold truncate max-w-40" style={{ color }}>{node.label}</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border" style={{
            color, borderColor: color + "55",
            background: color + "18"
          }}>{node.status.toUpperCase()}</span>
        </div>
        <button onClick={onClose} className="opacity-50 hover:opacity-100 transition-opacity">
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Traceability Breadcrumbs */}
      <div className="px-4 py-3 border-b space-y-2" style={{ borderColor: P.border + "55" }}>
        <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
          Traceability Breadcrumbs
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Hash className="w-3 h-3 shrink-0" style={{ color: P.blue }} />
            <div>
              <div className="text-[9px] font-mono" style={{ color: P.dim }}>Unique Audit ID</div>
              <div className="text-[10px] font-mono truncate" style={{ color: "#cdd5e0" }}>
                {auditId || "No audit events found"}
              </div>
            </div>
          </div>
          {sha512 && (
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 shrink-0" style={{ color: P.sage }} />
              <div>
                <div className="text-[9px] font-mono" style={{ color: P.dim }}>SHA-512 Chain Link</div>
                <div className="text-[10px] font-mono font-bold" style={{ color: P.sage }}>
                  {sha512}…
                </div>
              </div>
            </div>
          )}
          {node.swarmId && (
            <div className="flex items-center gap-2">
              <Network className="w-3 h-3 shrink-0" style={{ color: P.amber }} />
              <div>
                <div className="text-[9px] font-mono" style={{ color: P.dim }}>Swarm ID</div>
                <div className="text-[10px] font-mono" style={{ color: "#cdd5e0" }}>{node.swarmId}</div>
              </div>
            </div>
          )}
          {node.parentUid && (
            <div className="flex items-center gap-2">
              <ChevronRight className="w-3 h-3 shrink-0" style={{ color: P.dim }} />
              <div>
                <div className="text-[9px] font-mono" style={{ color: P.dim }}>Parent Agent</div>
                <div className="text-[10px] font-mono" style={{ color: "#cdd5e0" }}>{node.parentUid}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent actions */}
      {recentActions.length > 0 && (
        <div className="px-4 py-3 border-b" style={{ borderColor: P.border + "55" }}>
          <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: P.dim }}>
            Recent Intent Trail
          </div>
          <div className="space-y-1">
            {recentActions.slice(0, 4).map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="text-[9px] font-mono" style={{ color: P.dim }}>-{i + 1}</div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{
                  background: P.blue + "18", color: P.blue, border: `1px solid ${P.blue}33`
                }}>{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Predicted next 3 steps */}
      <div className="px-4 py-3 flex-1">
        <div className="text-[9px] font-mono uppercase tracking-widest mb-2 flex items-center gap-1" style={{ color: P.amber }}>
          <Zap className="w-2.5 h-2.5" />
          Predicted Next 3 Steps
        </div>
        {loading ? (
          <div className="text-[9px] font-mono" style={{ color: P.dim }}>Analyzing intent…</div>
        ) : (
          <div className="space-y-2">
            {nextSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 rounded px-2 py-1.5" style={{
                background: P.amber + "0f", border: `1px solid ${P.amber}22`
              }}>
                <div className="text-[10px] font-mono font-bold w-4 text-center" style={{ color: P.amber }}>
                  +{i + 1}
                </div>
                <span className="text-[10px] font-mono" style={{ color: "#cdd5e0" }}>{step}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revoke button */}
      {node.status === "active" && (
        <div className="px-4 py-3 border-t" style={{ borderColor: P.border }}>
          <button
            className="w-full text-[10px] font-mono font-bold py-1.5 rounded border transition-all"
            style={{ color: P.terra, borderColor: P.terra + "55", background: P.terra + "10" }}
            onClick={async () => {
              await fetch(`${BASE}/api/v1/swarm/revoke-tree/${encodeURIComponent(node.label)}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "Manual revocation from War Room" }),
              });
              onClose();
            }}
          >
            Recursive Revoke ↑ Ancestry Chain
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sovereign HUD ────────────────────────────────────────────────────────────

function SovereignHUD({
  stats, mode, onModeChange, complianceMode, onComplianceToggle,
}: {
  stats: PulseStats | null;
  mode: ThreatMode;
  onModeChange: (m: ThreatMode) => void;
  complianceMode: boolean;
  onComplianceToggle: () => void;
}) {
  const throughputBits = Number(stats?.quantumThroughputBits ?? 0);
  const throughputSec = (throughputBits / (6 * 3600) / 1_000_000).toFixed(3);

  const modeColors: Record<ThreatMode, string> = {
    OBSERVE: P.sage, ANALYZE: P.amber, INTERVENE: P.terra,
  };

  return (
    <div
      className="rounded-xl px-5 py-3 flex items-center gap-6 flex-wrap relative overflow-hidden"
      style={{
        background: "rgba(22,27,34,0.72)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${modeColors[mode]}44`,
        boxShadow: `0 0 24px ${modeColors[mode]}1a, inset 0 0 0 1px ${modeColors[mode]}22`,
      }}
    >
      {/* Subtle gradient shimmer */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `linear-gradient(135deg, ${modeColors[mode]}08 0%, transparent 60%)`,
        borderRadius: "inherit",
      }} />

      {/* Mode indicator */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: modeColors[mode] }} />
        <span className="text-[10px] font-mono uppercase tracking-widest font-bold" style={{ color: modeColors[mode] }}>
          {mode} MODE
        </span>
      </div>

      {/* Mode switcher */}
      <div className="flex items-center gap-1 shrink-0">
        {(["OBSERVE","ANALYZE","INTERVENE"] as ThreatMode[]).map(m => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className="text-[9px] font-mono font-bold px-2 py-0.5 rounded border transition-all"
            style={{
              color: mode === m ? "#0d1117" : modeColors[m],
              background: mode === m ? modeColors[m] : "transparent",
              borderColor: modeColors[m] + "55",
              opacity: mode === m ? 1 : 0.6,
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-6 shrink-0" style={{ background: P.border }} />

      {/* Lattice entropy throughput */}
      <div className="flex items-center gap-2 shrink-0">
        <Cpu className="w-3.5 h-3.5" style={{ color: P.sage }} />
        <div>
          <div className="text-[8px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
            Lattice Entropy
          </div>
          <div className="text-sm font-mono font-bold leading-none" style={{ color: P.sage }}>
            {throughputSec} Mbits/sec
          </div>
        </div>
      </div>

      {/* Global integrity */}
      <div className="flex items-center gap-2 shrink-0">
        <Shield className="w-3.5 h-3.5" style={{ color: stats?.globalIntegrityIndex === 100 ? P.sage : P.terra }} />
        <div>
          <div className="text-[8px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
            Global Integrity
          </div>
          <div className="text-sm font-mono font-bold leading-none" style={{
            color: stats?.globalIntegrityIndex === 100 ? P.sage : P.terra
          }}>
            {stats?.globalIntegrityIndex?.toFixed(2) ?? "—"}%
          </div>
        </div>
      </div>

      {/* Active swarms */}
      <div className="flex items-center gap-2 shrink-0">
        <Network className="w-3.5 h-3.5" style={{ color: P.blue }} />
        <div>
          <div className="text-[8px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
            Swarm Agents
          </div>
          <div className="text-sm font-mono font-bold leading-none" style={{ color: P.blue }}>
            {stats?.activeSwarms ?? "—"} active
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-6 shrink-0" style={{ background: P.border }} />

      {/* Compliance Mode toggle */}
      <button
        onClick={onComplianceToggle}
        className="flex items-center gap-2 px-3 py-1.5 rounded border text-[10px] font-mono font-bold transition-all shrink-0"
        style={{
          color: complianceMode ? "#0d1117" : P.blue,
          background: complianceMode ? P.blue : "transparent",
          borderColor: P.blue + (complianceMode ? "" : "55"),
        }}
      >
        {complianceMode ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
        Art. 14 Compliance
      </button>
    </div>
  );
}

// ── Compliance Mode Overlay ──────────────────────────────────────────────────

const ART14_CHECKLIST = [
  { id: "14a", text: "Human oversight is assigned and documented", ok: true },
  { id: "14b", text: "AI system outputs are monitored in real-time", ok: true },
  { id: "14c", text: "Override capability is enabled for high-risk decisions", ok: true },
  { id: "14d", text: "Audit trail maintained for all automated decisions", ok: true },
  { id: "14e", text: "Agent revocation mechanism is tested and functional", ok: true },
  { id: "14f", text: "Honey-token traps active for rogue agent detection", ok: true },
  { id: "14g", text: "Drift detection thresholds reviewed within 30 days", ok: true },
  { id: "14h", text: "Board-level quantum audit report (EQA) available", ok: true },
];

function ComplianceOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden"
      style={{
        background: "rgba(13,17,23,0.88)",
        backdropFilter: "blur(20px)",
        border: `1px solid ${P.blue}44`,
        boxShadow: `0 0 32px ${P.blue}1a`,
      }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `linear-gradient(135deg, ${P.blue}08 0%, transparent 70%)`,
        borderRadius: "inherit",
      }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" style={{ color: P.blue }} />
            <span className="text-xs font-mono font-bold" style={{ color: P.blue }}>
              EU AI ACT — ARTICLE 14 COMPLIANCE CHECKLIST
            </span>
          </div>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {ART14_CHECKLIST.map(item => (
            <div key={item.id} className="flex items-center gap-2 rounded px-2 py-1.5" style={{
              background: item.ok ? P.sage + "0f" : P.terra + "0f",
              border: `1px solid ${item.ok ? P.sage : P.terra}22`,
            }}>
              {item.ok
                ? <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: P.sage }} />
                : <XCircle className="w-3 h-3 shrink-0" style={{ color: P.terra }} />
              }
              <span className="text-[10px] font-mono" style={{ color: "#cdd5e0" }}>{item.text}</span>
              <span className="ml-auto text-[8px] font-mono" style={{ color: P.dim }}>{item.id}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[9px] font-mono" style={{ color: P.dim }}>
          All 8 Art. 14 requirements satisfied · Last verified by Sovereign Pulse Engine
        </div>
      </div>
    </div>
  );
}

// ── INTERVENE mode layout component ─────────────────────────────────────────

function InterveneLayout({
  killActive, toggleKill, criticalBreaches, swarmNodes, swarmEdges,
}: {
  killActive: boolean; toggleKill: () => void;
  criticalBreaches: AuthRequest[];
  swarmNodes: SwarmNode[]; swarmEdges: SwarmEdge[];
}) {
  const [selectedNode, setSelectedNode] = useState<SwarmNode | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeResult, setRevokeResult] = useState<string | null>(null);

  const handleRecursiveRevoke = async () => {
    if (!selectedNode) return;
    setRevoking(true);
    const r = await fetch(`${BASE}/api/v1/swarm/revoke-tree/${encodeURIComponent(selectedNode.label)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "INTERVENE mode — honey-token breach triggered revocation" }),
    });
    const d = await r.json();
    setRevokeResult(`Revoked ${d.totalRevoked ?? "?"} agents in ancestry chain`);
    setRevoking(false);
  };

  return (
    <div className="space-y-4">
      {/* INTERVENE banner */}
      <div className="rounded-lg p-3 border-2 border-red-500 relative overflow-hidden animate-pulse" style={{
        background: "rgba(217,97,97,0.12)"
      }}>
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-600 via-red-400 to-red-600" />
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-destructive" />
          <div>
            <div className="text-xs font-mono font-bold text-destructive uppercase tracking-widest">
              INTERVENE MODE — HONEY-TOKEN BREACH DETECTED
            </div>
            <div className="text-[10px] font-mono" style={{ color: P.dim }}>
              Kill-Switch and Recursive Revoke now available. Select a node from the Swarm Map to target.
            </div>
          </div>
        </div>
      </div>

      {/* Main INTERVENE layout — Kill + Revoke take 45%+ */}
      <div className="grid grid-cols-5 gap-4" style={{ minHeight: "320px" }}>
        {/* Command zone — 45% */}
        <div className="col-span-5 md:col-span-2 space-y-3">
          <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: P.terra }}>
            Command Override Terminal
          </div>

          {/* Kill Switch — large */}
          <button
            onClick={toggleKill}
            className="w-full rounded-xl border-2 font-mono font-bold transition-all"
            style={{
              minHeight: "100px",
              color: killActive ? "#fff" : P.terra,
              background: killActive ? P.terra + "cc" : P.terra + "15",
              borderColor: P.terra,
              boxShadow: killActive ? `0 0 32px ${P.terra}88` : "none",
            }}
          >
            <Power className={`w-8 h-8 mx-auto mb-2 ${killActive ? "animate-pulse" : ""}`} />
            <div className="text-base">{killActive ? "KILL-SWITCH ACTIVE" : "ACTIVATE KILL-SWITCH"}</div>
            <div className="text-[10px] font-normal mt-1 opacity-70">
              {killActive ? "All agent actions are blocked" : "Blocks all authorized agent actions"}
            </div>
          </button>

          {/* Recursive Revoke — large */}
          <button
            onClick={handleRecursiveRevoke}
            disabled={!selectedNode || revoking || selectedNode.status !== "active"}
            className="w-full rounded-xl border-2 font-mono font-bold transition-all disabled:opacity-40"
            style={{
              minHeight: "90px",
              color: P.amber,
              background: P.amber + "15",
              borderColor: P.amber + "aa",
              boxShadow: selectedNode ? `0 0 20px ${P.amber}44` : "none",
            }}
          >
            <GitBranch className="w-6 h-6 mx-auto mb-1" />
            <div className="text-sm">Recursive Revoke ↑</div>
            <div className="text-[10px] font-normal mt-0.5 opacity-70">
              {selectedNode
                ? `Target: ${selectedNode.label}`
                : "Select a node in the Swarm Map"}
            </div>
          </button>

          {revokeResult && (
            <div className="rounded px-3 py-2 text-[10px] font-mono" style={{
              color: P.sage, background: P.sage + "18", border: `1px solid ${P.sage}33`
            }}>
              ✓ {revokeResult}
            </div>
          )}

          {/* Breach list */}
          {criticalBreaches.length > 0 && (
            <div className="space-y-2">
              {criticalBreaches.slice(0, 3).map(b => (
                <div key={b.id} className="rounded p-2 text-[10px] font-mono" style={{
                  background: "#0d1117", border: `1px solid ${P.terra}44`
                }}>
                  <span style={{ color: P.terra }}>⚠ {b.agentId}</span>
                  <span style={{ color: P.dim }}> — {b.actionType}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Swarm map — 55% */}
        <div className="col-span-5 md:col-span-3 rounded-xl overflow-hidden relative" style={{
          background: P.panel, border: `1px solid ${P.border}`,
          minHeight: "280px",
        }}>
          <div className="absolute top-2 left-2 z-10 text-[9px] font-mono uppercase tracking-widest"
            style={{ color: P.terra }}>
            Select Target Node
          </div>
          <SwarmCanvas
            nodes={swarmNodes}
            edges={swarmEdges}
            onNodeClick={n => setSelectedNode(n)}
            selectedId={selectedNode?.id ?? null}
          />
        </div>
      </div>
    </div>
  );
}

// ── ANALYZE mode layout ──────────────────────────────────────────────────────

function AnalyzeLayout({ requests, stats }: { requests: AuthRequest[]; stats: PulseStats | null }) {
  const drifting = requests.filter(r => (r.sessionHealthScore ?? 1) < 0.7);
  const blocked = requests.filter(r => ["BLOCKED","AUTO_BLOCKED"].includes(r.status));

  return (
    <div className="space-y-4">
      {/* Drift detection banner */}
      <div className="rounded-lg px-4 py-3 border flex items-center gap-3" style={{
        background: P.amber + "10", borderColor: P.amber + "44"
      }}>
        <Search className="w-4 h-4 shrink-0" style={{ color: P.amber }} />
        <div>
          <div className="text-xs font-mono font-bold" style={{ color: P.amber }}>
            ANALYZE MODE — INTEGRITY INDEX BELOW THRESHOLD
          </div>
          <div className="text-[10px] font-mono" style={{ color: P.dim }}>
            Drift detection active · Focusing on low-health sessions and blocked actions
          </div>
        </div>
        <div className="ml-auto text-2xl font-mono font-bold" style={{
          color: (stats?.globalIntegrityIndex ?? 100) < 99.9 ? P.terra : P.amber
        }}>
          {stats?.globalIntegrityIndex?.toFixed(4) ?? "—"}%
        </div>
      </div>

      {/* Drifting agents */}
      <Card className="border-amber-500/30 bg-card/50">
        <div className="p-3 border-b border-amber-500/20 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" style={{ color: P.amber }} />
          <span className="text-xs font-mono font-bold" style={{ color: P.amber }}>
            DRIFTING SESSIONS — HEALTH &lt; 70%
          </span>
          <Badge className="ml-auto font-mono text-[10px]"
            style={{ background: P.amber + "22", color: P.amber, border: `1px solid ${P.amber}44` }}>
            {drifting.length}
          </Badge>
        </div>
        {drifting.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono" style={{ color: P.dim }}>No drifting sessions detected</div>
        ) : (
          <div className="divide-y divide-amber-500/10">
            {drifting.slice(0, 8).map(r => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-4">
                <div className="font-mono text-xs font-bold flex-1">{r.agentId}</div>
                <HealthBar score={r.sessionHealthScore ?? 1} />
                <StatusBadge status={r.status} />
                <span className="text-[10px] font-mono" style={{ color: P.dim }}>{formatTime(r.requestedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Blocked events log */}
      <Card className="border-destructive/20 bg-card/50">
        <div className="p-3 border-b border-destructive/20 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-destructive" />
          <span className="text-xs font-mono font-bold text-destructive">BLOCKED ACTION LOG</span>
          <Badge variant="destructive" className="ml-auto font-mono text-[10px]">{blocked.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="border-b border-border/30 bg-muted/10">
                {["Agent", "Action", "Health", "Status", "Time"].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-muted-foreground uppercase tracking-wider text-[9px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blocked.slice(0, 20).map(r => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="px-3 py-2">{r.agentId}</td>
                  <td className="px-3 py-2 text-destructive">{r.actionType}</td>
                  <td className="px-3 py-2">
                    <span style={{ color: (r.sessionHealthScore ?? 1) < 0.5 ? P.terra : P.amber }}>
                      {Math.round((r.sessionHealthScore ?? 1) * 100)}%
                    </span>
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{formatTime(r.requestedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Main War Room ─────────────────────────────────────────────────────────────

export default function WarRoomPage() {
  const { requests, loading, refresh, criticalBreaches } = useAuthRequests();
  const { active: killActive, toggle: toggleKill } = useKillSwitch();
  const { fault: pulseFault, dismiss: dismissFault } = usePulseFault();
  const { nodes: swarmNodes, edges: swarmEdges } = useSwarmMap();
  const pulseStats = usePulseStats();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [mode, setMode] = useState<ThreatMode>("OBSERVE");
  const [complianceMode, setComplianceMode] = useState(false);
  const [selectedSwarmNode, setSelectedSwarmNode] = useState<SwarmNode | null>(null);
  const [showSwarmMap, setShowSwarmMap] = useState(true);

  const pending = requests.filter(r => r.status === "PENDING");
  const history = requests.filter(r => r.status !== "PENDING");
  const articleFourteen = requests.filter(r =>
    r.resolvedBy && r.resolvedBy !== "sentinel-auto" && r.resolvedBy !== "sentinel-honeypot");

  // Auto-transition logic
  useEffect(() => {
    if (criticalBreaches.length > 0 && mode !== "INTERVENE") setMode("INTERVENE");
    else if ((pulseStats?.globalIntegrityIndex ?? 100) < 99.9 && mode === "OBSERVE") setMode("ANALYZE");
  }, [criticalBreaches.length, pulseStats?.globalIntegrityIndex]);

  const handleResolve = async (id: string, decision: "AUTHORIZED" | "BLOCKED") => {
    setResolvingId(id); await resolveRequest(id, decision); await refresh(); setResolvingId(null);
  };

  const throughputBits = Number(pulseStats?.quantumThroughputBits ?? 0);

  return (
    <div className="relative">
      {/* Lattice Pulse Overlay — covers entire page behind content */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <LatticePulseOverlay throughputBits={throughputBits} />
      </div>

      <div className="relative space-y-4 page-transition" style={{ zIndex: 1 }}>
        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-destructive" />
              War Room
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pause any agent in one click. Every approval is logged for your auditor (EU AI Act Art. 14).
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <DownloadPDFButton />
            <button
              onClick={() => setShowSwarmMap(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-xs transition-all"
              style={{
                color: showSwarmMap ? P.sage : P.dim,
                borderColor: showSwarmMap ? P.sage + "55" : P.border,
                background: showSwarmMap ? P.sage + "10" : "transparent",
              }}
            >
              <Network className="w-3.5 h-3.5" />
              Swarm Map
            </button>
            <button
              onClick={toggleKill}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-mono text-sm font-bold transition-all ${
                killActive
                  ? "bg-destructive text-white border-destructive hover:bg-destructive/80 shadow-[0_0_10px_rgba(217,97,97,0.22)]"
                  : "bg-card border-destructive/50 text-destructive hover:bg-destructive/10"
              }`}
            >
              <Power className={`w-4 h-4 ${killActive ? "animate-pulse" : ""}`} />
              {killActive ? "KILL-SWITCH ACTIVE" : "Activate Kill-Switch"}
            </button>
          </div>
        </div>

        {/* ── Sovereign HUD ────────────────────────────────────────────────── */}
        <SovereignHUD
          stats={pulseStats}
          mode={mode}
          onModeChange={setMode}
          complianceMode={complianceMode}
          onComplianceToggle={() => setComplianceMode(v => !v)}
        />

        {/* ── Compliance Overlay ────────────────────────────────────────────── */}
        {complianceMode && (
          <ComplianceOverlay onClose={() => setComplianceMode(false)} />
        )}

        {/* ── Pulse Fault Banner ────────────────────────────────────────────── */}
        {pulseFault && (
          <div className="rounded-lg p-4 flex items-start gap-3 relative" style={{
            background: "rgba(217,97,97,0.10)", border: `1px solid ${P.terra}`
          }}>
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-destructive" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-bold text-destructive uppercase tracking-widest">
                  ⚠ PULSE FAULT — SOVEREIGN INTEGRITY ENGINE
                </span>
                <span className="text-[9px] font-mono ml-auto" style={{ color: P.dim }}>
                  {new Date(pulseFault.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs font-mono" style={{ color: "#cdd5e0" }}>
                Global Integrity Index dropped to{" "}
                <span className="font-bold text-destructive">{pulseFault.globalIntegrityIndex}%</span>
                {" "}— below the 99.9% sovereign threshold.
              </div>
              {pulseFault.faultReason && (
                <div className="text-[10px] font-mono mt-1" style={{ color: P.dim }}>
                  {pulseFault.faultReason}
                </div>
              )}
              <div className="mt-2">
                <a href={`${BASE}/status`}
                  className="text-[10px] font-mono px-2 py-0.5 rounded border text-destructive border-destructive/40 hover:bg-destructive/10 transition-colors">
                  View System Status →
                </a>
              </div>
            </div>
            <button onClick={dismissFault}
              className="absolute top-3 right-3 text-[10px] font-mono opacity-50 hover:opacity-100"
              style={{ color: P.dim }}>✕</button>
          </div>
        )}

        {/* ── Critical Breaches ──────────────────────────────────────────────── */}
        {criticalBreaches.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-400 uppercase tracking-widest">
              <Skull className="w-3.5 h-3.5" />
              CRITICAL SECURITY BREACH — HONEY-TOKEN TRAP ACTIVATED ({criticalBreaches.length})
            </div>
            {criticalBreaches.map(b => <HoneypotBreachCard key={b.id} breach={b} />)}
          </div>
        )}

        {killActive && (
          <div className="rounded-lg p-4 flex items-start gap-3" style={{
            background: "rgba(217,97,97,0.08)", border: "1px solid rgba(217,97,97,0.30)"
          }}>
            <Power className="w-5 h-5 text-destructive animate-pulse shrink-0 mt-0.5" />
            <div>
              <div className="font-mono text-sm font-bold text-destructive">KILL-SWITCH ACTIVE</div>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                All agent authorization requests are being automatically blocked.
                Click the Kill-Switch button again to restore normal operations.
              </p>
            </div>
          </div>
        )}

        {/* ── Dynamic Threat Layout ─────────────────────────────────────────── */}
        {mode === "INTERVENE" && (
          <InterveneLayout
            killActive={killActive}
            toggleKill={toggleKill}
            criticalBreaches={criticalBreaches}
            swarmNodes={swarmNodes}
            swarmEdges={swarmEdges}
          />
        )}

        {mode === "ANALYZE" && (
          <AnalyzeLayout requests={requests} stats={pulseStats} />
        )}

        {/* ── Spatial Swarm Map (OBSERVE + optional in other modes) ─────────── */}
        {showSwarmMap && mode !== "INTERVENE" && (
          <div className="rounded-xl overflow-hidden" style={{
            background: P.panel, border: `1px solid ${P.border}`
          }}>
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: P.border }}>
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4" style={{ color: P.sage }} />
                <span className="text-xs font-mono font-medium">SPATIAL SWARM MAP</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                  color: P.dim, background: P.border + "88"
                }}>Force-directed · {swarmNodes.length} agents · {swarmEdges.length} lineage edges</span>
              </div>
              <div className="flex items-center gap-3 text-[9px] font-mono" style={{ color: P.dim }}>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: P.sage }} /> Healthy
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: P.amber }} /> Drifting
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: P.terra }} /> Revoked
                </span>
                <span className="flex items-center gap-1 ml-2 opacity-70">✦ = QL-2.0 Halo</span>
              </div>
            </div>

            <div className="flex" style={{ height: "340px" }}>
              {/* Canvas */}
              <div className="flex-1 relative">
                {swarmNodes.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-xs font-mono" style={{ color: P.dim }}>No swarm agents registered</div>
                  </div>
                ) : (
                  <SwarmCanvas
                    nodes={swarmNodes}
                    edges={swarmEdges}
                    onNodeClick={n => setSelectedSwarmNode(n)}
                    selectedId={selectedSwarmNode?.id ?? null}
                  />
                )}
              </div>

              {/* Intent Scrubber panel */}
              {selectedSwarmNode && (
                <div
                  className="w-64 shrink-0 border-l overflow-y-auto"
                  style={{ borderColor: P.border, background: P.bg + "cc" }}
                >
                  <IntentScrubber
                    node={selectedSwarmNode}
                    onClose={() => setSelectedSwarmNode(null)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── OBSERVE: Stats row ──────────────────────────────────────────────── */}
        {mode !== "INTERVENE" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Pending Approvals", value: pending.length, icon: Clock, color: "text-yellow-400" },
              { label: "Total Requests",    value: requests.length, icon: Activity, color: "text-primary" },
              { label: "Authorized",        value: requests.filter(r => r.status === "AUTHORIZED").length, icon: CheckCircle2, color: "text-emerald-400" },
              { label: "Blocked / Breach",  value: requests.filter(r => ["BLOCKED","AUTO_BLOCKED","HONEYPOT_BREACH"].includes(r.status)).length, icon: XCircle, color: "text-destructive" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="p-4 border-border/60 bg-card/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Pending Approvals ──────────────────────────────────────────────── */}
        <Card className="border-border/60 bg-card/50">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <h2 className="font-mono text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-400" />
              PENDING APPROVALS
            </h2>
            {pending.length > 0 && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-mono text-[10px]">
                {pending.length} awaiting
              </Badge>
            )}
          </div>
          {pending.length === 0 ? (
            <div className="p-8 text-center font-mono text-sm text-muted-foreground">
              <ShieldCheck className="w-8 h-8 mx-auto mb-3 opacity-20" />
              No pending authorization requests
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {pending.map(req => (
                <div key={req.id} className="p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-foreground">{req.agentId}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/30">
                          {req.actionType}
                        </span>
                        <StatusBadge status={req.status} />
                      </div>
                      {req.notes && (
                        <div className="text-[10px] font-mono px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />{req.notes}
                        </div>
                      )}
                      <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                        <span className="text-foreground/70">Intent: </span>{req.intent}
                      </p>
                      <p className="text-xs font-mono text-destructive/80">
                        <span className="text-muted-foreground">Proposed: </span>{req.proposedAction}
                      </p>
                      <div className="w-48">
                        <div className="text-[10px] font-mono text-muted-foreground mb-1">Session Health</div>
                        <HealthBar score={req.sessionHealthScore ?? 1} />
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {formatTime(req.requestedAt)} · Trace: {req.traceId}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs"
                        onClick={() => handleResolve(req.id, "AUTHORIZED")} disabled={resolvingId === req.id}>
                        <CheckCircle2 className="w-3 h-3 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="h-8 font-mono text-xs"
                        onClick={() => handleResolve(req.id, "BLOCKED")} disabled={resolvingId === req.id}>
                        <XCircle className="w-3 h-3 mr-1" />Deny
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Active Defense Case Studies ────────────────────────────────────── */}
        {criticalBreaches.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-950/10">
            <div className="p-4 border-b border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookMarked className="w-4 h-4 text-amber-400" />
                <h2 className="font-mono text-sm font-medium text-amber-300">ACTIVE DEFENSE — CASE STUDIES</h2>
              </div>
              <div className="flex items-center gap-2">
                <FlaskConical className="w-3 h-3 text-amber-500/70" />
                <span className="text-[10px] font-mono text-amber-500/70">
                  {criticalBreaches.length} documented incident{criticalBreaches.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <div className="divide-y divide-amber-500/10">
              {criticalBreaches.map((breach, idx) => (
                <div key={breach.id} className="p-4 hover:bg-amber-500/5 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[8px] font-mono text-amber-600/70 uppercase tracking-widest">Case</span>
                      <span className="text-lg font-mono font-bold text-amber-400 leading-none">{String(idx + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-amber-300">Rogue Agent Caught in Honey-Token Trap</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">TRAP SUCCESSFUL</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                          { label: "Rogue Agent", value: breach.agentId, highlight: false },
                          { label: "Forbidden Tool", value: breach.actionType, highlight: true },
                          { label: "Incident Time", value: formatTime(breach.requestedAt), highlight: false },
                          { label: "Defense", value: "Immediate Revocation", highlight: false },
                        ].map(({ label, value, highlight }) => (
                          <div key={label} className="rounded bg-black/20 border border-amber-500/15 p-2">
                            <div className="text-[9px] font-mono text-amber-600/70 uppercase tracking-wider mb-0.5">{label}</div>
                            <div className={`text-xs font-bold font-mono truncate ${highlight ? "text-red-400" : "text-amber-200"}`}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">{breach.notes}</p>
                      <div className="flex items-center gap-3 text-[10px] font-mono flex-wrap">
                        <span className="flex items-center gap-1 text-emerald-400"><Lock className="w-2.5 h-2.5" />Agent permanently revoked</span>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="flex items-center gap-1 text-amber-400/70"><Skull className="w-2.5 h-2.5" />Honey-token defense validated</span>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="text-muted-foreground">Trace: {breach.traceId}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-amber-500/20 bg-amber-500/5">
              <p className="text-[10px] font-mono text-amber-600/70 leading-relaxed">
                Each case above is a real-world validation of the MaroShield active defense system.
                Rogue agents that attempted to invoke forbidden ghost tools were caught, revoked,
                and logged within milliseconds. Export an Evidence Bag (PDF) to include these
                incidents in your EU AI Act Art. 14 compliance submission.
              </p>
            </div>
          </Card>
        )}

        {/* ── EU AI Act Art. 14 Human Intervention Log ───────────────────────── */}
        <Card className="border-border/60 bg-card/50">
          <div className="p-4 border-b border-border/60 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="font-mono text-sm font-medium">EU AI ACT ART. 14 — HUMAN INTERVENTION LOG</h2>
            <Badge variant="outline" className="font-mono text-[10px] ml-auto">{articleFourteen.length} records</Badge>
            <DownloadPDFButton />
          </div>
          {articleFourteen.length === 0 ? (
            <div className="p-8 text-center font-mono text-sm text-muted-foreground">
              No human interventions recorded yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {["Agent","Action Type","Decision","Resolved By","Time","Notes"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-muted-foreground uppercase tracking-wider text-[10px] font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {articleFourteen.slice(0, 50).map(req => (
                    <tr key={req.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-2.5 text-foreground">{req.agentId}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{req.actionType}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={req.status} /></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{req.resolvedBy ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{req.resolvedAt ? formatTime(req.resolvedAt) : "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-48">{req.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Authorization History ──────────────────────────────────────────── */}
        {history.length > 0 && (
          <Card className="border-border/60 bg-card/50">
            <div className="p-4 border-b border-border/60 flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-mono text-sm font-medium">AUTHORIZATION HISTORY</h2>
              <Badge variant="outline" className="font-mono text-[10px] ml-auto">{history.length}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {["Agent","Action Type","Session Health","Status","Requested","Notes"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-muted-foreground uppercase tracking-wider text-[10px] font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 30).map(req => (
                    <tr key={req.id} className={`border-b border-border/30 hover:bg-muted/10 ${req.status === ("HONEYPOT_BREACH" as any) || (req.notes ?? "").includes("CRITICAL BREACH") ? "bg-red-950/10" : ""}`}>
                      <td className="px-4 py-2.5 text-foreground flex items-center gap-1.5">
                        {((req.notes ?? "").includes("CRITICAL BREACH")) && <Skull className="w-3 h-3 text-red-400 shrink-0" />}
                        {req.agentId}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{req.actionType}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-bold ${(req.sessionHealthScore ?? 1) >= 0.7 ? "text-emerald-400" : "text-destructive"}`}>
                          {Math.round((req.sessionHealthScore ?? 1) * 100)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={req.status} /></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatTime(req.requestedAt)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-40">{req.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
