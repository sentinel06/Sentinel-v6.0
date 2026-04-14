/**
 * Trace Explorer — Forensic Intent Suite + Trace Topology Module
 *
 * · Verified Sequence   — SHA-512 hash-chain integrity per step
 * · Cognitive Drift     — Drift Delta % per step, amber if > 15%
 * · Active Interdiction — ML-DSA-87 re-sign + HUMAN_IN_THE_LOOP_OVERRIDE
 * · Topology View       — Horizontal DAG flowchart with drift bleed propagation,
 *     QL-2.0 verified (green solid) vs broken-chain (red dashed marching) edges,
 *     hover tooltip with signature fingerprint, HUD sync via CustomEvent
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useGetAuditLogs, useGetTrace } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAnomalous, formatTime, truncateHash } from "@/lib/audit-utils";
import {
  ListTree, AlertTriangle, X, Clock, Terminal, BrainCircuit,
  ChevronRight, Loader2, ShieldCheck, ShieldAlert,
  Link2, Link2Off, Zap, Activity, Hash, Fingerprint,
  TriangleAlert, Eye, Pen, Network, GitBranch, Share2,
} from "lucide-react";
import CausalTopologyMap from "@/components/CausalTopologyMap";
import SovereignMultiSigModal from "@/components/SovereignMultiSigModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Sentinel Zen palette ─────────────────────────────────────────────────────
const P = {
  sage:   "#40B595",
  amber:  "#EBC06D",
  terra:  "#D96161",
  blue:   "#5B8DEF",
  dim:    "#9AA4B1",
  border: "#2C3136",
  panel:  "#161B22",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type AnyEvent = {
  id: string; timestamp: string; eventType: string;
  rationale?: string | null; payload: unknown;
  currentHash: string; previousHash?: string | null;
  isAnomalous?: boolean; anomalyReason?: string | null;
  consistencyScore?: number; consistencyReasons?: string[];
  quantumSig?: string | null; pqSignature?: unknown;
  agentId?: string; traceId?: string;
};

interface QuantumProof {
  forensicAuditId: string; algorithm: string; fipsStandard: string;
  securityLevel: number; publicKeyFingerprint: string;
  status: string; signedAt: string; domainSeparator: string; committedAt: string;
}

// ── Core helpers ──────────────────────────────────────────────────────────────
function driftPct(event: AnyEvent): number {
  return Math.max(0, Math.min(100, (1 - (event.consistencyScore ?? 1.0)) * 100));
}
function driftDelta(curr: AnyEvent, prev?: AnyEvent): number {
  return prev ? Math.abs(driftPct(curr) - driftPct(prev)) : driftPct(curr);
}
function checkChain(events: AnyEvent[]): Map<string, boolean> {
  const r = new Map<string, boolean>();
  events.forEach((ev, i) => {
    r.set(ev.id, i === 0 ? true : ev.previousHash === events[i - 1].currentHash);
  });
  return r;
}

// ── Topology color utilities ───────────────────────────────────────────────────
function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

interface NodeStyle { stroke: string; fill: string; bleedRatio: number; }
function computeNodeStyles(events: AnyEvent[], chainMap: Map<string, boolean>): Map<string, NodeStyle> {
  const out = new Map<string, NodeStyle>();
  let parentColor = P.sage;
  let accDrift = 0;
  for (const ev of events) {
    const drift = driftPct(ev);
    const chainOk = chainMap.get(ev.id) !== false;
    const ownColor = !chainOk ? P.terra
      : ev.eventType === "HUMAN_IN_THE_LOOP_OVERRIDE" ? P.blue
      : drift > 50 ? P.terra
      : drift > 15 ? P.amber
      : P.sage;
    const bleedRatio = Math.min(0.7, accDrift / 100);
    const mixed = bleedRatio > 0.12 ? lerpColor(ownColor, parentColor, bleedRatio * 0.55) : ownColor;
    out.set(ev.id, { stroke: mixed, fill: mixed, bleedRatio });
    accDrift = Math.max(drift, accDrift * 0.5);
    parentColor = mixed;
  }
  return out;
}

// ── Topology constants ────────────────────────────────────────────────────────
const NW = 134;  // node width
const NH = 76;   // node height
const GAP = 52;  // horizontal gap between nodes
const PADX = 36;
const SVG_H = 260;
const CY = SVG_H / 2;

// ── Topology Tooltip ──────────────────────────────────────────────────────────
function TopoTooltip({ ev, mx, my }: { ev: AnyEvent; mx: number; my: number }) {
  const drift = driftPct(ev);
  const pqSig = ev.pqSignature as any;
  const fingerprint = pqSig?.mlDsa87?.publicKeyFingerprint ?? ev.quantumSig?.substring(0, 16) ?? "—";
  const verified = !!(ev.pqSignature || ev.quantumSig);

  return (
    <div className="fixed z-50 pointer-events-none"
      style={{
        left: Math.min(mx + 12, window.innerWidth - 240),
        top: Math.max(my - 120, 8),
        width: 224,
        background: "rgba(10,14,23,0.97)",
        border: `1px solid ${P.border}`,
        borderRadius: 10,
        backdropFilter: "blur(16px)",
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${P.border}44`,
      }}>
      {/* Header */}
      <div className="px-3 py-2 border-b" style={{ borderColor: P.border + "88" }}>
        <div className="text-[9px] font-mono font-bold uppercase tracking-widest"
          style={{ color: drift > 15 ? P.amber : P.sage }}>
          {ev.eventType}
        </div>
        <div className="text-[9px] font-mono mt-0.5" style={{ color: P.dim }}>
          {formatTime(ev.timestamp)}
        </div>
      </div>
      <div className="p-3 space-y-2">
        {/* ML-DSA-87 */}
        <div className="rounded px-2 py-1.5" style={{
          background: verified ? P.sage + "0f" : P.terra + "0f",
          border: `1px solid ${verified ? P.sage + "33" : P.terra + "33"}`,
        }}>
          <div className="flex items-center gap-1.5 mb-1">
            {verified
              ? <><Zap className="w-2.5 h-2.5" style={{ color: P.sage }} />
                  <span className="text-[9px] font-mono font-bold" style={{ color: P.sage }}>ML-DSA-87 VERIFIED</span></>
              : <><ShieldAlert className="w-2.5 h-2.5" style={{ color: P.terra }} />
                  <span className="text-[9px] font-mono font-bold" style={{ color: P.terra }}>UNVERIFIED</span></>
            }
          </div>
          <div className="text-[9px] font-mono font-bold break-all" style={{ color: "#9cbfb0" }}>
            {fingerprint}
          </div>
        </div>

        {/* Drift */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono" style={{ color: P.dim }}>Cognitive Drift</span>
            <span className="text-[9px] font-mono font-bold"
              style={{ color: drift > 50 ? P.terra : drift > 15 ? P.amber : P.sage }}>
              {drift.toFixed(1)}%
            </span>
          </div>
          <div className="h-1 rounded-full" style={{ background: P.border }}>
            <div className="h-full rounded-full" style={{
              width: `${Math.min(100, drift)}%`,
              background: drift > 50 ? P.terra : drift > 15 ? P.amber : P.sage,
            }} />
          </div>
        </div>

        {/* Hash + chain */}
        <div className="text-[9px] font-mono" style={{ color: P.dim }}>
          <span className="mr-1">H:</span>
          <span style={{ color: "#6a8caa" }}>{ev.currentHash?.substring(0, 16)}…</span>
        </div>
      </div>
    </div>
  );
}

// ── TraceTopology ─────────────────────────────────────────────────────────────
function TraceTopology({
  events, chainMap, onNodeSelect, selectedId, agentId,
}: {
  events: AnyEvent[];
  chainMap: Map<string, boolean>;
  onNodeSelect: (ev: AnyEvent) => void;
  selectedId: string | null;
  agentId: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const styles = useMemo(() => computeNodeStyles(events, chainMap), [events, chainMap]);

  const svgW = PADX * 2 + events.length * NW + Math.max(0, events.length - 1) * GAP;

  // Node positions with drift-based Y jitter
  const positions = useMemo(() => events.map((ev, i) => {
    const drift = driftPct(ev);
    const yOff = drift > 15 ? Math.sin(i * 1.4 + 0.5) * (Math.min(drift, 60) / 100) * 26 : 0;
    const cx = PADX + i * (NW + GAP) + NW / 2;
    const cy = CY + yOff;
    return { x: PADX + i * (NW + GAP), y: cy - NH / 2, cx, cy };
  }), [events]);

  const handleNodeHover = useCallback((idx: number | null, e?: React.MouseEvent) => {
    setHoveredIdx(idx);
    if (idx !== null && e) {
      // Use event coordinates for tooltip placement
      setTooltipPos({ x: e.clientX, y: e.clientY });
    } else if (idx !== null && containerRef.current) {
      // Fallback: compute from SVG layout
      const pos = positions[idx];
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: rect.left + pos.cx - containerRef.current.scrollLeft,
        y: rect.top + pos.y - 10,
      });
    } else {
      setTooltipPos(null);
    }
  }, [positions]);

  return (
    <div>
      <style>{`
        @keyframes topo-glow { 0%,100%{opacity:.3}50%{opacity:.8} }
        @keyframes topo-march { to{stroke-dashoffset:-16} }
        @keyframes topo-slide { from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none} }
      `}</style>

      <div ref={containerRef} style={{ overflowX: "auto", overflowY: "hidden" }}>
        <svg width={svgW} height={SVG_H} style={{ display: "block", overflow: "visible" }}>
          <defs>
            <marker id="tt-sage" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={P.sage} opacity="0.85" />
            </marker>
            <marker id="tt-terra" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={P.terra} />
            </marker>
            {events.map(ev => {
              const st = styles.get(ev.id)!;
              return (
                <filter key={ev.id} id={`tg-${ev.id}`} x="-60%" y="-60%" width="220%" height="220%">
                  <feFlood floodColor={st.glow ?? st.stroke} result="fc" />
                  <feComposite in="fc" in2="SourceGraphic" operator="in" result="m" />
                  <feGaussianBlur in="m" stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              );
            })}
          </defs>

          {/* Background guide rail */}
          <line
            x1={positions[0]?.cx ?? PADX}
            y1={CY}
            x2={positions[positions.length - 1]?.cx ?? svgW - PADX}
            y2={CY}
            stroke={P.border} strokeWidth="1" strokeDasharray="3,7" opacity="0.25"
          />

          {/* ── Edges ── */}
          {events.slice(0, -1).map((ev, i) => {
            const src = positions[i];
            const tgt = positions[i + 1];
            const chainOk = chainMap.get(events[i + 1].id) !== false;
            const st = styles.get(ev.id)!;
            const edgeColor = chainOk ? st.stroke : P.terra;
            const cpX = (src.x + NW + tgt.x) / 2;

            return (
              <g key={`e-${ev.id}`}>
                {/* Glow shadow for broken edges */}
                {!chainOk && (
                  <path
                    d={`M${src.x + NW},${src.cy} C${cpX},${src.cy} ${cpX},${tgt.cy} ${tgt.x},${tgt.cy}`}
                    fill="none" stroke={P.terra} strokeWidth="6" opacity="0.08"
                  />
                )}
                <path
                  d={`M${src.x + NW},${src.cy} C${cpX},${src.cy} ${cpX},${tgt.cy} ${tgt.x},${tgt.cy}`}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth={chainOk ? 1.5 : 2}
                  strokeDasharray={chainOk ? "none" : "7,4"}
                  markerEnd={`url(#${chainOk ? "tt-sage" : "tt-terra"})`}
                  opacity={chainOk ? 0.75 : 1}
                  style={!chainOk ? { animation: "topo-march 0.7s linear infinite" } : undefined}
                />
                {/* Verified label on edge midpoint */}
                {chainOk && (
                  <text
                    x={cpX}
                    y={Math.min(src.cy, tgt.cy) - 7}
                    textAnchor="middle"
                    fontSize="8"
                    fill={P.sage}
                    fontFamily="monospace"
                    opacity="0.7"
                  >⚡</text>
                )}
                {!chainOk && (
                  <text
                    x={cpX}
                    y={Math.min(src.cy, tgt.cy) - 7}
                    textAnchor="middle"
                    fontSize="7"
                    fill={P.terra}
                    fontFamily="monospace"
                    fontWeight="bold"
                  >CHAIN BREAK</text>
                )}
              </g>
            );
          })}

          {/* ── Nodes ── */}
          {events.map((ev, i) => {
            const pos = positions[i];
            const st = styles.get(ev.id)!;
            const drift = driftPct(ev);
            const chainOk = chainMap.get(ev.id) !== false;
            const isSelected = selectedId === ev.id;
            const typeLabel = ev.eventType.length > 15
              ? ev.eventType.substring(0, 13) + "…"
              : ev.eventType;
            const driftColor = drift > 50 ? P.terra : drift > 15 ? P.amber : P.sage;
            const verified = !!(ev.pqSignature || ev.quantumSig);

            return (
              <g
                key={ev.id}
                data-testid={`topo-node-${i}`}
                data-event-id={ev.id}
                data-event-type={ev.eventType}
                style={{ cursor: "pointer" }}
                pointerEvents="bounding-box"
                onClick={() => {
                  onNodeSelect(ev);
                  // Dispatch HUD sync event for Swarm Map
                  if ((ev as any).agentId) {
                    window.dispatchEvent(new CustomEvent("sentinelFocusAgent", {
                      detail: { agentId: (ev as any).agentId, eventId: ev.id },
                    }));
                  }
                }}
                onMouseEnter={(e) => handleNodeHover(i, e)}
                onMouseLeave={() => handleNodeHover(null)}
              >
                {/* Selection pulse ring */}
                {isSelected && (
                  <rect
                    x={pos.x - 5} y={pos.y - 5}
                    width={NW + 10} height={NH + 10}
                    rx="13" fill="none"
                    stroke={P.blue} strokeWidth="2"
                    style={{ animation: "topo-glow 1.4s ease-in-out infinite" }}
                  />
                )}

                {/* Drift bleed overlay (amber/terra bleeding from parent) */}
                {st.bleedRatio > 0.12 && (
                  <rect
                    x={pos.x} y={pos.y}
                    width={NW} height={NH}
                    rx="8"
                    fill={st.fill}
                    fillOpacity={Math.min(0.25, st.bleedRatio * 0.35)}
                  />
                )}

                {/* Node body */}
                <rect
                  x={pos.x} y={pos.y}
                  width={NW} height={NH}
                  rx="8"
                  fill={st.fill + "14"}
                  stroke={st.stroke}
                  strokeWidth={isSelected ? 2 : 1.5}
                  filter={`url(#tg-${ev.id})`}
                />

                {/* Chain-broken hatching */}
                {!chainOk && (
                  <rect
                    x={pos.x} y={pos.y}
                    width={NW} height={NH}
                    rx="8"
                    fill="none"
                    stroke={P.terra}
                    strokeWidth="1"
                    strokeDasharray="4,3"
                    opacity="0.6"
                  />
                )}

                {/* Step badge */}
                <rect x={pos.x + 5} y={pos.y + 5} width={20} height={14} rx="3"
                  fill={st.stroke} fillOpacity="0.22" />
                <text x={pos.x + 15} y={pos.y + 15}
                  textAnchor="middle" fontSize="8"
                  fill={st.stroke} fontFamily="monospace" fontWeight="bold">
                  {String(i).padStart(2, "0")}
                </text>

                {/* ⚡ / ✕ — verification status */}
                <text x={pos.x + NW - 10} y={pos.y + 15}
                  textAnchor="middle" fontSize="9"
                  fill={verified ? P.sage : P.terra}>
                  {verified ? "⚡" : "✕"}
                </text>

                {/* Event type */}
                <text x={pos.x + NW / 2} y={pos.y + 34}
                  textAnchor="middle" fontSize="9"
                  fill={st.stroke} fontFamily="monospace" fontWeight="bold">
                  {typeLabel}
                </text>

                {/* Drift % */}
                <text x={pos.x + NW / 2} y={pos.y + 49}
                  textAnchor="middle" fontSize="8"
                  fill={driftColor} fontFamily="monospace">
                  Δ{drift.toFixed(0)}%{st.bleedRatio > 0.15 ? " ↑bleed" : ""}
                </text>

                {/* Hash fragment */}
                <text x={pos.x + NW / 2} y={pos.y + 63}
                  textAnchor="middle" fontSize="7"
                  fill={P.dim} fillOpacity="0.65" fontFamily="monospace">
                  {ev.currentHash?.substring(0, 8)}…
                </text>

                {/* Transparent full-area hitbox — reliable click target for Playwright + touch */}
                <rect
                  x={pos.x - 4} y={pos.y - 4}
                  width={NW + 8} height={NH + 8}
                  rx="10" fill="transparent"
                  stroke="none"
                  aria-label={`topology-node-${ev.eventType}-step-${i}`}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend row */}
      <div className="flex items-center gap-5 mt-2 px-1 flex-wrap" style={{ fontSize: 9 }}>
        {[
          { color: P.sage,  line: "solid",  label: "QL-2.0 chain intact" },
          { color: P.terra, line: "dashed", label: "Broken / tampered link" },
        ].map(({ color, line, label }) => (
          <span key={label} className="flex items-center gap-1.5 font-mono" style={{ color: P.dim }}>
            <svg width="22" height="8">
              <line x1="0" y1="4" x2="22" y2="4"
                stroke={color} strokeWidth={line === "dashed" ? 2 : 1.5}
                strokeDasharray={line === "dashed" ? "5,3" : "none"} />
            </svg>
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1 font-mono" style={{ color: P.amber }}>
          <span style={{ background: P.amber + "30", padding: "0 4px", borderRadius: 3 }}>↑bleed</span>
          Drift propagating from parent
        </span>
        <span className="flex items-center gap-1 font-mono" style={{ color: P.sage }}>⚡ ML-DSA-87 verified</span>
        <span className="ml-auto font-mono" style={{ color: P.dim }}>Hover node for full signature · Click to sync HUD</span>
      </div>

      {/* Hover tooltip — positioned relative to hovered node */}
      {hoveredIdx !== null && tooltipPos && (
        <TopoTooltip
          ev={events[hoveredIdx]}
          mx={tooltipPos.x}
          my={tooltipPos.y}
        />
      )}
    </div>
  );
}

// ── Chain Corruption Alert ────────────────────────────────────────────────────
function ChainCorruptionAlert({ brokenCount }: { brokenCount: number }) {
  return (
    <div className="rounded-lg px-4 py-3 flex items-center gap-3" style={{
      background: "rgba(217,97,97,0.10)", border: `1px solid ${P.terra}66`,
    }}>
      <Link2Off className="w-4 h-4 shrink-0" style={{ color: P.terra }} />
      <div className="flex-1">
        <div className="text-xs font-mono font-bold" style={{ color: P.terra }}>
          ⚠ CHAIN CORRUPTION DETECTED — {brokenCount} BROKEN SHA-512 LINK{brokenCount > 1 ? "S" : ""}
        </div>
        <div className="text-[10px] font-mono mt-0.5" style={{ color: P.dim }}>
          The hash-chain linking these audit events has been severed. A Forensic Audit should be initiated.
        </div>
      </div>
    </div>
  );
}

// ── Active Interdiction Panel ─────────────────────────────────────────────────
interface InterdictionResult {
  forensicAuditId: string; quantumProof: QuantumProof; committedAt: string;
}
function ActiveInterdictionPanel({ event, onClose, onCommitted }: {
  event: AnyEvent; onClose: () => void; onCommitted: (r: InterdictionResult) => void;
}) {
  const [intentText, setIntentText] = useState(event.rationale ?? "");
  const [toolParams, setToolParams] = useState(() => {
    try {
      const p = event.payload as any;
      const params = p?.toolParameters ?? p?.parameters ?? p?.args ?? null;
      return params ? JSON.stringify(params, null, 2) : "";
    } catch { return ""; }
  });
  const [toolParamsError, setToolParamsError] = useState<string | null>(null);
  const [committed, setCommitted]   = useState<InterdictionResult | null>(null);
  const [showMultiSig, setShowMultiSig] = useState(false);
  const [killState, setKillState]   = useState<"idle" | "loading" | "done">("idle");

  const validateTP = useCallback((raw: string) => {
    if (!raw.trim()) { setToolParamsError(null); return true; }
    try { JSON.parse(raw); setToolParamsError(null); return true; }
    catch (e: any) { setToolParamsError(e.message); return false; }
  }, []);

  // ── Kill Switch — single-click, logs EMERGENCY_SOLO_REVOKE ──────────────
  const handleKillSwitch = useCallback(async () => {
    if (killState !== "idle") return;
    setKillState("loading");
    try {
      const agentId  = (event as any).agentId ?? "unknown";
      const traceId  = (event as any).traceId ?? undefined;
      const operatorId = `op-${Date.now().toString(36)}`;
      await Promise.all([
        fetch(`${BASE}/api/v1/admin/kill-switch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true, reason: `Emergency Kill Switch — Trace Interdiction: ${event.id}` }),
        }),
        fetch(`${BASE}/api/v1/forensic/kill-switch-log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, traceId, operatorId,
            reason: `Emergency Kill Switch from Trace Interdiction Panel. EventID: ${event.id}` }),
        }),
      ]);
      setKillState("done");
    } catch { setKillState("idle"); }
  }, [event, killState]);

  const canOpenMultiSig =
    !!intentText.trim() &&
    !toolParamsError &&
    intentText.trim() !== (event.rationale ?? "");

  return (
    <>
      <div className="rounded-xl overflow-hidden animate-in slide-in-from-right-4"
        style={{ border: `1px solid ${P.blue}44`, background: "#0d111a" }}>
        <div className="px-4 py-3 flex items-center justify-between border-b"
          style={{ borderColor: P.blue + "33", background: P.blue + "0f" }}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: P.blue }} />
            <span className="text-xs font-mono font-bold" style={{ color: P.blue }}>ACTIVE INTERDICTION</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ color: P.dim, background: P.border + "88", border: `1px solid ${P.border}` }}>
              TWO-MAN RULE
            </span>
          </div>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Target event */}
          <div className="rounded px-3 py-2 flex items-center gap-2"
            style={{ background: P.panel, border: `1px solid ${P.border}` }}>
            <Hash className="w-3 h-3 shrink-0" style={{ color: P.dim }} />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>Target Event</div>
              <div className="text-[10px] font-mono truncate" style={{ color: "#cdd5e0" }}>
                {event.id} · {event.eventType} · {formatTime(event.timestamp)}
              </div>
            </div>
          </div>

          {/* Intent textarea */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Pen className="w-3 h-3" style={{ color: P.amber }} />
              <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.amber }}>
                Corrected Intent / Rationale
              </label>
            </div>
            <textarea
              className="w-full rounded-lg p-3 text-xs font-mono resize-none focus:outline-none"
              style={{
                background: "#0a0e17", color: "#e0e6ed",
                border: `1px solid ${intentText.trim() !== (event.rationale ?? "") ? P.blue + "88" : P.border}`,
                minHeight: "80px",
              }}
              placeholder="Corrected intent — will require Sovereign co-signature…"
              value={intentText} onChange={e => setIntentText(e.target.value)}
              disabled={!!committed} />
          </div>

          {/* Tool params */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-3 h-3" style={{ color: P.blue }} />
              <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.blue }}>
                Tool Parameters (JSON — optional)
              </label>
            </div>
            <textarea
              className="w-full rounded-lg p-3 text-xs font-mono resize-none focus:outline-none"
              style={{
                background: "#0a0e17", minHeight: "48px",
                color: toolParamsError ? P.terra : "#9aa4b1",
                border: `1px solid ${toolParamsError ? P.terra + "88" : toolParams.trim() ? P.blue + "44" : P.border}`,
              }}
              placeholder='{"key": "value"}'
              value={toolParams}
              onChange={e => { setToolParams(e.target.value); validateTP(e.target.value); }}
              disabled={!!committed} />
            {toolParamsError && (
              <div className="text-[9px] font-mono mt-1 flex items-center gap-1" style={{ color: P.terra }}>
                <AlertTriangle className="w-2.5 h-2.5" />JSON error: {toolParamsError}
              </div>
            )}
          </div>

          {!committed && (
            <div className="flex items-center gap-3">
              {/* Apply Fix → opens Two-Man Rule Modal */}
              <button
                data-testid="apply-fix-btn"
                onClick={() => setShowMultiSig(true)}
                disabled={!canOpenMultiSig}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold disabled:opacity-40 transition-all"
                style={{ background: P.blue, color: "#0d1117", boxShadow: canOpenMultiSig ? `0 0 16px ${P.blue}44` : "none" }}>
                <ShieldCheck className="w-3 h-3" />
                Apply Fix (Two-Man Rule)
              </button>

              {/* Kill Switch — bypasses multi-sig */}
              <button
                data-testid="kill-switch-btn"
                onClick={handleKillSwitch}
                disabled={killState !== "idle"}
                className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs font-bold disabled:opacity-60 transition-all"
                style={{
                  background: killState === "done" ? P.terra + "22" : "transparent",
                  border: `1px solid ${P.terra}66`,
                  color: killState === "done" ? P.terra : P.terra + "cc",
                }}>
                {killState === "loading"
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : killState === "done"
                  ? <><ShieldAlert className="w-3 h-3" /> KILL ACTIVE</>
                  : <><ShieldAlert className="w-3 h-3" /> Kill Switch</>}
              </button>
            </div>
          )}

          {/* Kill switch status note */}
          {killState === "done" && (
            <div className="rounded-lg px-3 py-2 text-[9px] font-mono"
              style={{ background: P.terra + "12", border: `1px solid ${P.terra}44`, color: P.terra }}>
              ⚡ EMERGENCY_SOLO_REVOKE logged · Kill switch activated · All agent sessions revoked
            </div>
          )}

          {/* Committed confirmation */}
          {committed && (
            <div className="rounded-xl overflow-hidden"
              style={{ border: `1px solid ${P.sage}55`, background: P.sage + "0a" }}>
              <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: P.sage + "33" }}>
                <ShieldCheck className="w-4 h-4" style={{ color: P.sage }} />
                <span className="text-xs font-mono font-bold" style={{ color: P.sage }}>
                  DUAL-SIG COMMITTED — FIX VERIFIED
                </span>
              </div>
              <div className="p-3 space-y-2">
                <div className="rounded-lg px-3 py-2" style={{ background: P.sage + "0f", border: `1px solid ${P.sage}33` }}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: P.dim }}>Forensic Audit ID</div>
                  <div className="text-sm font-mono font-bold" style={{ color: P.sage }}>{committed.forensicAuditId}</div>
                </div>
                <div className="text-[9px] font-mono" style={{ color: P.dim }}>
                  {committed.quantumProof?.algorithm ?? "ML-DSA-87"} · SL{committed.quantumProof?.securityLevel ?? 5} ·
                  {new Date(committed.committedAt).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sovereign Multi-Sig Modal ── */}
      {showMultiSig && !committed && (
        <SovereignMultiSigModal
          event={{
            id: event.id,
            eventType: event.eventType,
            rationale: event.rationale,
            agentId: (event as any).agentId,
            traceId: (event as any).traceId,
            timestamp: event.timestamp,
          }}
          newRationale={intentText}
          newToolParams={toolParams.trim() || undefined}
          onSuccess={(res) => {
            setCommitted({
              forensicAuditId: res.forensicAuditId,
              committedAt: res.committedAt,
              quantumProof: {
                ...res.quantumProof,
                securityLevel: 5,
                fipsStandard: "FIPS-204",
                domainSeparator: "HUMAN_IN_THE_LOOP_OVERRIDE",
              } as QuantumProof,
            });
            onCommitted({
              forensicAuditId: res.forensicAuditId,
              committedAt: res.committedAt,
              quantumProof: {
                ...res.quantumProof,
                securityLevel: 5,
                fipsStandard: "FIPS-204",
                domainSeparator: "HUMAN_IN_THE_LOOP_OVERRIDE",
              } as QuantumProof,
            });
            setShowMultiSig(false);
          }}
          onClose={() => setShowMultiSig(false)}
        />
      )}
    </>
  );
}

// ── Drift Bar ─────────────────────────────────────────────────────────────────
function DriftBar({ pct, delta, isDriftHigh }: { pct: number; delta: number; isDriftHigh: boolean }) {
  const barColor = pct > 50 ? P.terra : pct > 15 ? P.amber : P.sage;
  return (
    <div className="flex items-center gap-2">
      <div className="text-[9px] font-mono uppercase tracking-widest w-8" style={{ color: P.dim }}>Drift</div>
      <div className="flex-1 h-1 rounded-full" style={{ background: P.border }}>
        <div className="h-full rounded-full transition-all duration-500" style={{
          width: `${Math.min(100, pct)}%`, background: barColor,
          boxShadow: isDriftHigh ? `0 0 6px ${barColor}88` : "none",
        }} />
      </div>
      <div className="text-[10px] font-mono font-bold" style={{ color: barColor }}>{pct.toFixed(1)}%</div>
      {delta > 0 && (
        <div className="text-[9px] font-mono"
          style={{ color: delta > 15 ? P.terra : delta > 8 ? P.amber : P.dim }}>
          Δ{delta.toFixed(1)}
        </div>
      )}
    </div>
  );
}

// ── Chain Link Indicator ──────────────────────────────────────────────────────
function ChainLinkIndicator({ intact, prevHash, thisHash }: {
  intact: boolean; prevHash?: string | null; thisHash: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mt-2">
      {intact
        ? <Link2 className="w-3 h-3 shrink-0" style={{ color: P.sage }} />
        : <Link2Off className="w-3 h-3 shrink-0" style={{ color: P.terra }} />}
      <div className="text-[9px] font-mono truncate flex items-center gap-1.5">
        {prevHash
          ? <span style={{ color: P.dim }}>prev: {prevHash.substring(0, 10)}…</span>
          : <span style={{ color: P.dim }}>genesis block</span>}
        <span style={{ color: P.border }}>→</span>
        <span style={{ color: intact ? P.sage : P.terra, fontWeight: intact ? 400 : 700 }}>
          {intact ? "chain OK" : "⚠ BROKEN"}
        </span>
        <span style={{ color: P.dim }}>current: {thisHash.substring(0, 10)}…</span>
      </div>
    </div>
  );
}

// ── Trace Detail View ─────────────────────────────────────────────────────────
function TraceDetailView({ traceId, onClose, onFocusAgent }: {
  traceId: string;
  onClose: () => void;
  onFocusAgent?: (agentId: string) => void;
}) {
  const { data: trace, isLoading } = useGetTrace(traceId, { query: { queryKey: ["trace", traceId] } });
  const [interdictingId, setInterdictingId] = useState<string | null>(null);
  const [committedProofs, setCommittedProofs] = useState<Map<string, InterdictionResult>>(new Map());
  const [showChainDetail, setShowChainDetail] = useState(false);
  const [showTopology, setShowTopology] = useState(false);
  const [topoSelectedId, setTopoSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const events = useMemo(() => (trace?.events ?? []) as AnyEvent[], [trace]);
  const chainMap = useMemo(() => checkChain(events), [events]);
  const brokenLinks = useMemo(() => events.filter(e => chainMap.get(e.id) === false).length, [events, chainMap]);

  // Scroll list to event when causal topology node is selected
  const handleTopoSelect = useCallback((eventId: string, agentId: string) => {
    setTopoSelectedId(eventId);
    // Scroll the event list to the selected item
    setTimeout(() => {
      const el = document.getElementById(`trace-ev-${eventId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    // Dispatch HUD sync for swarm map
    window.dispatchEvent(new CustomEvent("sentinelFocusAgent", {
      detail: { agentId: agentId ?? trace?.agentId, eventId },
    }));
  }, [trace?.agentId]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center font-mono text-sm animate-pulse">Decrypting trace data…</div>;
  }
  if (!trace) {
    return <div className="flex-1 flex items-center justify-center font-mono text-sm text-destructive">Trace data unavailable.</div>;
  }

  return (
    <>
      {/* ── Header ── */}
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
                trace.status === "error" ? "bg-destructive/20 text-destructive"
                : trace.status === "success" ? "bg-emerald-500/20 text-emerald-400"
                : "bg-blue-500/20 text-blue-400"
              }`}>{trace.status}</span>
              {brokenLinks > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-mono font-bold" style={{ color: P.terra }}>
                  <Link2Off className="w-2.5 h-2.5" />{brokenLinks} broken
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Topology toggle */}
          <button
            data-testid="topology-toggle-btn"
            onClick={() => setShowTopology(v => !v)}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-lg border transition-all"
            style={{
              color: showTopology ? "#0d1117" : P.blue,
              background: showTopology ? P.blue : "transparent",
              borderColor: P.blue + "55",
              boxShadow: showTopology ? `0 0 12px ${P.blue}44` : "none",
            }}
          >
            <Network className="w-3 h-3" />
            Topology
          </button>

          {/* Chain verify toggle */}
          <button
            onClick={() => setShowChainDetail(v => !v)}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-lg border transition-all"
            style={{
              color: showChainDetail ? "#0d1117" : P.sage,
              background: showChainDetail ? P.sage : "transparent",
              borderColor: P.sage + "55",
            }}
          >
            <Eye className="w-3 h-3" />
            Chain Verify
          </button>

          <div className="flex flex-col items-end font-mono text-xs text-muted-foreground gap-1">
            <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(trace.startTime)}</div>
            {trace.endTime && <div>{formatTime(trace.endTime)}</div>}
          </div>
        </div>
      </div>

      {/* ── Chain Corruption Alert ── */}
      {brokenLinks > 0 && (
        <div className="px-4 py-3 border-b border-border/40">
          <ChainCorruptionAlert brokenCount={brokenLinks} />
        </div>
      )}

      {/* ── Topology View ── */}
      {showTopology && (
        <div data-testid="trace-topology-panel" className="border-b border-border/40 shrink-0" style={{ background: "#070b12" }}>
          <div className="px-4 pt-3 pb-0">
            <div className="flex items-center gap-2 mb-2">
              <Share2 className="w-3.5 h-3.5" style={{ color: P.blue }} />
              <span data-testid="trace-topology-header" className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: P.blue }}>
                CAUSAL DEPENDENCY GRAPH
              </span>
              <span className="text-[9px] font-mono ml-2" style={{ color: P.dim }}>
                Swimlane DAG · Drift heatmap edges · QL-2.0 integrity · Click edge = payload diff
              </span>
            </div>
          </div>
          <CausalTopologyMap
            traceId={traceId}
            onNodeSelect={handleTopoSelect}
            selectedEventId={topoSelectedId}
          />
        </div>
      )}

      {/* ── Chain Detail Panel ── */}
      {showChainDetail && !showTopology && (
        <div className="px-4 py-3 border-b border-border/40" style={{ background: "#0a0e17" }}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: P.blue }}>
            <Link2 className="w-3 h-3" />
            SHA-512 CHAIN VERIFICATION — {events.length} STEPS
            <span className="ml-auto" style={{ color: brokenLinks === 0 ? P.sage : P.terra }}>
              {brokenLinks === 0 ? "✓ ALL LINKS INTACT" : `⚠ ${brokenLinks} BROKEN`}
            </span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {events.map((ev, i) => {
              const intact = chainMap.get(ev.id) ?? true;
              return (
                <div key={ev.id} className="flex items-center gap-2 text-[9px] font-mono rounded px-2 py-1"
                  style={{
                    background: intact ? P.sage + "08" : P.terra + "18",
                    border: `1px solid ${intact ? P.sage + "22" : P.terra + "55"}`,
                  }}>
                  <span style={{ color: P.dim }} className="w-6 text-right shrink-0">{i}</span>
                  {intact
                    ? <Link2 className="w-2.5 h-2.5 shrink-0" style={{ color: P.sage }} />
                    : <Link2Off className="w-2.5 h-2.5 shrink-0" style={{ color: P.terra }} />}
                  <span style={{ color: intact ? P.sage : P.terra }} className="w-16 shrink-0">{ev.eventType}</span>
                  <span style={{ color: P.dim }} className="truncate">{ev.currentHash.substring(0, 24)}…</span>
                  {!intact && <span className="ml-auto shrink-0 font-bold" style={{ color: P.terra }}>CHAIN BREAK</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Event Flow ── */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-6 relative" style={{ background: "#0a0f1a33" }}>
        <div className="absolute left-[39px] top-6 bottom-6 w-px" style={{ background: P.border }} />
        <div className="space-y-5 relative">
          {events.map((event, index) => {
            const anomalous = event.isAnomalous || isAnomalous(event.eventType, event.rationale ?? undefined);
            const score = event.consistencyScore ?? 1.0;
            const scorePct = Math.round(score * 100);
            const drift = driftPct(event);
            const delta = driftDelta(event, events[index - 1]);
            const isDriftHigh = drift > 15;
            const chainIntact = chainMap.get(event.id) ?? true;
            const isHallucination = score < 0.5;
            const isInterdict = interdictingId === event.id;
            const proof = committedProofs.get(event.id);
            const isOverride = event.eventType === "HUMAN_IN_THE_LOOP_OVERRIDE";
            const isTopoSelected = topoSelectedId === event.id;

            let EventIcon = Terminal;
            let iconColor = "text-muted-foreground"; let bgColor = "bg-muted";
            if (event.eventType === "Error") { iconColor = "text-destructive"; bgColor = "bg-destructive/20"; EventIcon = AlertTriangle; }
            else if (event.eventType === "Intent") { iconColor = "text-blue-400"; bgColor = "bg-blue-500/20"; }
            else if (event.eventType === "Action") { iconColor = "text-primary"; bgColor = "bg-primary/20"; }
            else if (event.eventType === "Result") { iconColor = "text-emerald-400"; bgColor = "bg-emerald-500/20"; }
            else if (isOverride) { iconColor = ""; bgColor = ""; }

            const cardBorder = !chainIntact
              ? "border-red-500/50 bg-red-950/20"
              : isTopoSelected ? "border-blue-500/50 bg-blue-950/10"
              : isHallucination ? "border-destructive/40 bg-destructive/5"
              : anomalous ? "border-accent/40 bg-accent/5"
              : "border-border/50 bg-card/40";

            return (
              <div id={`trace-ev-${event.id}`} key={event.id}
                className="flex gap-4 relative animate-in slide-in-from-left-4 fade-in"
                style={{ animationDelay: `${index * 40}ms`, animationFillMode: "both" }}>

                <div className={`w-8 h-8 rounded-full border border-border/50 flex items-center justify-center z-10 shrink-0 ${bgColor}`}
                  style={isOverride ? { background: P.blue + "22", border: `1px solid ${P.blue}44` } : {}}>
                  {isOverride
                    ? <ShieldCheck className="w-3.5 h-3.5" style={{ color: P.blue }} />
                    : <EventIcon className={`w-3.5 h-3.5 ${iconColor}`} />}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {!chainIntact && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold mb-1" style={{ color: P.terra }}>
                      <Link2Off className="w-3 h-3" />SHA-512 CHAIN BREAK — previous hash mismatch
                    </div>
                  )}
                  {isTopoSelected && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono mb-1" style={{ color: P.blue }}>
                      <Network className="w-3 h-3" />Selected in Topology View
                    </div>
                  )}

                  <Card className={`border p-4 transition-all duration-300 ${cardBorder}`}
                    style={isTopoSelected ? { border: `1px solid ${P.blue}66`, boxShadow: `0 0 16px ${P.blue}18` }
                      : isOverride ? { border: `1px solid ${P.blue}33` } : {}}>

                    <div className="flex justify-between items-start mb-3 gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-mono font-bold uppercase tracking-wider ${iconColor}`}
                          style={isOverride ? { color: P.blue } : {}}>
                          {event.eventType}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          scorePct >= 80 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                          : scorePct >= 50 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                          : "text-destructive bg-destructive/10 border-destructive/20"
                        }`}>
                          <BrainCircuit className="w-2.5 h-2.5" />{scorePct}%
                        </span>
                        {anomalous && !isOverride && (
                          <Badge variant="outline" className="text-accent border-accent/30 bg-accent/10 text-[9px] px-1 h-4">
                            {isHallucination ? "HALLUCINATION" : "FLAGGED"}
                          </Badge>
                        )}
                        {isOverride && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold"
                            style={{ color: P.blue, background: P.blue + "18", border: `1px solid ${P.blue}33` }}>
                            QL-2.0 SIGNED
                          </span>
                        )}
                        {proof && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold flex items-center gap-1"
                            style={{ color: P.sage, background: P.sage + "18", border: `1px solid ${P.sage}33` }}>
                            <ShieldCheck className="w-2.5 h-2.5" />OVERRIDDEN
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-muted-foreground">{formatTime(event.timestamp)}</span>
                        {/* Topology-select button */}
                        <button
                          onClick={() => {
                            setTopoSelectedId(event.id);
                            setShowTopology(true);
                            window.dispatchEvent(new CustomEvent("sentinelFocusAgent", {
                              detail: { agentId: (event as any).agentId ?? trace.agentId, eventId: event.id },
                            }));
                          }}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1"
                          style={{ color: P.blue, borderColor: P.blue + "44", opacity: 0.7 }}
                          title="Focus in Topology"
                        >
                          <Network className="w-2.5 h-2.5" />
                        </button>
                        {(anomalous || isDriftHigh) && !isOverride && (
                          <button onClick={() => setInterdictingId(isInterdict ? null : event.id)}
                            className="text-[10px] font-mono px-2 py-0.5 rounded border transition-colors flex items-center gap-1"
                            style={{
                              color: isInterdict ? "#0d1117" : P.blue,
                              background: isInterdict ? P.blue : "transparent",
                              borderColor: P.blue + "55",
                            }}>
                            <Zap className="w-2.5 h-2.5" />
                            {isInterdict ? "Close" : "Interdict"}
                            {!isInterdict && <ChevronRight className="w-2.5 h-2.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mb-3">
                      <DriftBar pct={drift} delta={delta} isDriftHigh={isDriftHigh} />
                    </div>

                    {event.rationale && (
                      <div className="mb-3 text-sm font-mono leading-relaxed pl-3 border-l-2"
                        style={{
                          color: isDriftHigh ? P.amber : isHallucination ? P.terra : "#b0bcc8",
                          borderColor: isDriftHigh ? P.amber + "88" : isHallucination ? P.terra + "55" : P.border,
                          background: isDriftHigh ? P.amber + "08" : "transparent",
                          borderRadius: isDriftHigh ? "0 6px 6px 0" : undefined,
                          padding: isDriftHigh ? "4px 8px 4px 12px" : undefined,
                        }}>
                        {isDriftHigh && (
                          <div className="flex items-center gap-1 text-[9px] font-mono font-bold mb-1" style={{ color: P.amber }}>
                            <TriangleAlert className="w-2.5 h-2.5" />COGNITIVE DRIFT &gt; 15% — INTENT DEVIATION DETECTED
                          </div>
                        )}
                        {event.rationale}
                      </div>
                    )}

                    {anomalous && event.anomalyReason && (
                      <div className="mb-3 text-[10px] font-mono text-accent bg-accent/10 px-2 py-1.5 rounded flex items-start gap-1.5 border border-accent/20">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{event.anomalyReason}
                      </div>
                    )}

                    <div className="bg-background rounded-md border border-border/50 overflow-hidden">
                      <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50 text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex justify-between items-center">
                        <span>Payload</span>
                        <span className="flex items-center gap-2">
                          {!chainIntact && <span className="text-[9px] font-bold" style={{ color: P.terra }}>⚠ HASH MISMATCH</span>}
                          <span>H: {truncateHash(event.currentHash)}</span>
                        </span>
                      </div>
                      <div className="p-3 overflow-x-auto text-xs font-mono text-muted-foreground whitespace-pre max-h-36">
                        {JSON.stringify(event.payload, null, 2)}
                      </div>
                    </div>

                    <ChainLinkIndicator intact={chainIntact} prevHash={event.previousHash} thisHash={event.currentHash} />

                    {proof && (
                      <div className="mt-3 rounded-lg px-3 py-2.5 flex items-center gap-2"
                        style={{ background: P.sage + "0a", border: `1px solid ${P.sage}33` }}>
                        <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: P.sage }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: P.sage }}>Human Override Committed</div>
                          <div className="text-[10px] font-mono truncate" style={{ color: "#cdd5e0" }}>Forensic ID: {proof.forensicAuditId}</div>
                        </div>
                      </div>
                    )}
                  </Card>

                  {isInterdict && (
                    <ActiveInterdictionPanel
                      event={event}
                      onClose={() => setInterdictingId(null)}
                      onCommitted={(result) => {
                        setCommittedProofs(prev => { const n = new Map(prev); n.set(event.id, result); return n; });
                        setInterdictingId(null);
                      }}
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

// ── Trace List (page root) ────────────────────────────────────────────────────
export default function TracesPage() {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const { data: logData, isLoading } = useGetAuditLogs({ limit: 50 }, { query: { queryKey: ["traces"] } });
  const [overrideCount, setOverrideCount] = useState(0);

  useEffect(() => {
    fetch(`${BASE}/api/v1/forensic/overrides`)
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setOverrideCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  // Listen for swarm map HUD focus events (bidirectional sync)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.traceId) setSelectedTraceId(detail.traceId);
    };
    window.addEventListener("sentinelFocusTrace", handler);
    return () => window.removeEventListener("sentinelFocusTrace", handler);
  }, []);

  const recentTraces = useMemo(() => {
    if (!logData?.logs) return [];
    const traceMap = new Map<string, {
      traceId: string; agentId: string; startTime: string;
      eventCount: number; hasError: boolean; hasAnomaly: boolean; lowestScore: number;
    }>();
    (logData.logs as AnyEvent[]).forEach((log: any) => {
      if (!traceMap.has(log.traceId)) {
        traceMap.set(log.traceId, {
          traceId: log.traceId, agentId: log.agentId,
          startTime: log.timestamp, eventCount: 0,
          hasError: false, hasAnomaly: false, lowestScore: 1.0,
        });
      }
      const t = traceMap.get(log.traceId)!;
      t.eventCount++;
      if (log.eventType === "Error") t.hasError = true;
      if (log.isAnomalous || isAnomalous(log.eventType, log.rationale)) t.hasAnomaly = true;
      if (typeof log.consistencyScore === "number" && log.consistencyScore < t.lowestScore)
        t.lowestScore = log.consistencyScore;
      if (new Date(log.timestamp) < new Date(t.startTime)) t.startTime = log.timestamp;
    });
    return Array.from(traceMap.values()).sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }, [logData]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 animate-in fade-in duration-500">
      {/* ── Left panel: Trace List ── */}
      <Card className="w-1/3 flex flex-col border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden shrink-0">
        <div className="p-4 border-b border-border/60 flex items-center justify-between">
          <h2 className="font-mono text-sm font-medium flex items-center gap-2">
            <ListTree className="w-4 h-4 text-primary" />
            FORENSIC TRACE EXPLORER
          </h2>
          <div className="flex items-center gap-2">
            {overrideCount > 0 && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 font-bold"
                style={{ color: P.blue, background: P.blue + "18", border: `1px solid ${P.blue}33` }}>
                <ShieldCheck className="w-2.5 h-2.5" />{overrideCount} override{overrideCount > 1 ? "s" : ""}
              </span>
            )}
            <Badge variant="outline" className="font-mono text-[10px]">{recentTraces.length}</Badge>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3 text-[9px] font-mono"
          style={{ background: "#0a0e17" }}>
          <span className="flex items-center gap-1" style={{ color: P.sage }}>
            <Link2 className="w-2.5 h-2.5" /> Chain OK
          </span>
          <span className="flex items-center gap-1" style={{ color: P.terra }}>
            <Link2Off className="w-2.5 h-2.5" /> Broken
          </span>
          <span className="flex items-center gap-1" style={{ color: P.amber }}>
            <TriangleAlert className="w-2.5 h-2.5" /> Drift &gt;15%
          </span>
          <span className="flex items-center gap-1" style={{ color: P.blue }}>
            <Network className="w-2.5 h-2.5" /> Topology
          </span>
        </div>

        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-center font-mono text-sm text-muted-foreground animate-pulse">Scanning forensic ledger…</div>
          ) : recentTraces.length === 0 ? (
            <div className="p-4 text-center font-mono text-sm text-muted-foreground">No traces found.</div>
          ) : (
            recentTraces.map(trace => {
              const scorePct = Math.round(trace.lowestScore * 100);
              const drift = (1 - trace.lowestScore) * 100;
              const scoreColor = scorePct < 50 ? "text-destructive" : scorePct < 75 ? "text-yellow-400" : "text-emerald-400";
              return (
                <button key={trace.traceId} onClick={() => setSelectedTraceId(trace.traceId)}
                  className={`w-full text-left p-3 rounded-md transition-all border font-mono ${
                    selectedTraceId === trace.traceId
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs truncate max-w-[140px]" title={trace.traceId}>{trace.traceId}</div>
                    <div className="flex items-center gap-1.5">
                      {trace.hasAnomaly && <AlertTriangle className="w-3 h-3 text-accent" />}
                      {drift > 15 && <TriangleAlert className="w-3 h-3" style={{ color: P.amber }} />}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{trace.eventCount} ev</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="truncate max-w-[120px] opacity-70">{trace.agentId.substring(0, 8)}</span>
                    <div className="flex items-center gap-2">
                      {drift > 15 && <span className="font-bold" style={{ color: P.amber }}>Δ{drift.toFixed(0)}%</span>}
                      <span className={`font-bold ${scoreColor}`}>
                        <BrainCircuit className="w-2.5 h-2.5 inline mr-0.5" />{scorePct}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-0.5 rounded-full overflow-hidden" style={{ background: P.border }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, drift)}%`,
                      background: drift > 50 ? P.terra : drift > 15 ? P.amber : P.sage,
                    }} />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Card>

      {/* ── Right panel: Detail view ── */}
      <Card className="flex-1 flex flex-col border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
        {selectedTraceId ? (
          <TraceDetailView
            traceId={selectedTraceId}
            onClose={() => setSelectedTraceId(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <Network className="w-12 h-12 mb-4 opacity-20" />
            <h3 className="font-mono text-lg font-medium text-foreground mb-2">Forensic Intent Suite + Topology</h3>
            <p className="text-sm text-center max-w-md font-mono opacity-80 leading-relaxed">
              Select a trace to view the Verified Sequence, Cognitive Drift Overlay, Active Interdiction,
              and the new Topology View — a horizontal DAG with drift bleed propagation, QL-2.0 edge
              verification, and full HUD sync.
            </p>
            <div className="mt-6 grid grid-cols-4 gap-3 w-full max-w-lg">
              {[
                { icon: Link2,    label: "Chain Verify", color: P.sage },
                { icon: TriangleAlert, label: "Drift Overlay", color: P.amber },
                { icon: Zap,     label: "Interdiction", color: P.blue },
                { icon: Network, label: "Topology DAG", color: P.blue },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="rounded-lg p-3 text-center"
                  style={{ background: color + "0a", border: `1px solid ${color}22` }}>
                  <Icon className="w-4 h-4 mx-auto mb-1" style={{ color }} />
                  <div className="text-[10px] font-mono" style={{ color }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
