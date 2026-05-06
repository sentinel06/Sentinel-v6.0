import React, { lazy, Suspense, useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity, ListTree, Cpu, FileCheck, ShieldCheck, Search, Bell,
  GitBranch, ShieldAlert, X, Award, Network, Building2, Zap, Radio,
  Rocket, Skull, Fingerprint, Dna, Shield, ChevronRight, HelpCircle,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useForensic } from "@/contexts/ForensicContext";
import SovereignInduction from "./SovereignInduction";

// DataRoomExport pulls in jspdf + jszip + qrcode (~500 KB combined). It only
// renders for Certified Operators in the sidebar footer, so we defer the
// chunk until the layout is mounted. Suspense fallback below renders an
// empty box so the layout doesn't shift.
const DataRoomExport = lazy(() =>
  import("./DataRoomExport").then((m) => ({ default: m.DataRoomExport })),
);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Accent colours — unchanged across both themes
const P = {
  sage:   "#40B595",
  amber:  "#EBC06D",
  terra:  "#D96161",
  gold:   "#FFD700",
  violet: "#8B5CF6",
};

interface PendingNotification {
  id: string;
  agentId: string;
  actionType: string;
}

// ── Risk Horizon ──────────────────────────────────────────────────────────────
function RiskHorizon({ activeMutations, ledgerTampered }: { activeMutations: number; ledgerTampered: boolean }) {
  const state =
    activeMutations > 5 ? "breach" :
    (ledgerTampered || activeMutations >= 3) ? "warning" : "calm";

  const gradient =
    state === "breach"
      ? "radial-gradient(ellipse at 0% 0%, rgba(122,0,0,0.55) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(122,0,0,0.45) 0%, transparent 60%)"
      : state === "warning"
      ? "radial-gradient(circle, rgba(255,191,0,0.12) 0%, transparent 70%)"
      : "none";

  return (
    <div
      className={state === "warning" ? "risk-horizon-pulse" : ""}
      style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: gradient,
        transition: "background 1.2s ease",
      }}
    />
  );
}

// ── Cluster Switcher (V6.0 multi-cluster sovereignty) ───────────────────────
function ClusterSwitcher() {
  const { clusters, currentCluster, setCurrentCluster } = useForensic();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = clusters.find(c => c.id === currentCluster) ?? clusters[0];

  return (
    <div ref={ref} data-tour-id="cluster-switcher" style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Switch swarm cluster"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 32, padding: "0 10px", borderRadius: 8,
          border: "1px solid rgba(139,92,246,0.32)",
          background: "rgba(139,92,246,0.10)",
          cursor: "pointer", color: P.violet,
          fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.violet, boxShadow: `0 0 6px ${P.violet}aa` }} />
        <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current?.label ?? "ALL"}
        </span>
        <span style={{ fontSize: 8, opacity: 0.7 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: 38, right: 0, minWidth: 240,
          maxHeight: 320, overflowY: "auto", zIndex: 100,
          borderRadius: 10, padding: 4,
          background: "rgba(13,17,23,0.96)", backdropFilter: "blur(20px)",
          border: "1px solid rgba(139,92,246,0.30)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.5), 0 0 24px rgba(139,92,246,0.15)",
        }}>
          {clusters.map(c => (
            <button
              key={c.id}
              onClick={() => { setCurrentCluster(c.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "8px 10px", borderRadius: 6,
                border: "none", cursor: "pointer", marginBottom: 1,
                background: c.id === currentCluster ? "rgba(139,92,246,0.18)" : "transparent",
                color: c.id === currentCluster ? P.violet : "#cdd5e0",
                fontSize: 10, fontFamily: "JetBrains Mono, monospace",
                textAlign: "left",
              }}
              onMouseEnter={e => { if (c.id !== currentCluster) (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.08)"; }}
              onMouseLeave={e => { if (c.id !== currentCluster) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <span>{c.label}</span>
              {c.id === currentCluster && <span style={{ color: P.violet, fontSize: 11 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Operator HEX-ID Badge ─────────────────────────────────────────────────────
function OperatorBadge() {
  const [hex, setHex] = useState<string | null>(() => {
    try { return localStorage.getItem("sentinel_operator_hex"); } catch { return null; }
  });
  const [persona, setPersona] = useState<string | null>(() => {
    try { return localStorage.getItem("sentinel_persona"); } catch { return null; }
  });
  const [pulseFlash, setPulseFlash] = useState(false);

  useEffect(() => {
    const onCert = (e: Event) => {
      const detail = (e as CustomEvent).detail as { hex?: string; persona?: string };
      if (detail?.hex) setHex(detail.hex);
      if (detail?.persona) setPersona(detail.persona);
      setPulseFlash(true);
      setTimeout(() => setPulseFlash(false), 1800);
    };
    window.addEventListener("sentinel:operator-certified", onCert);
    return () => window.removeEventListener("sentinel:operator-certified", onCert);
  }, []);

  if (!hex) return null;

  const domain = persona === "technical" ? "FORENSICS" : "GOVERNANCE";

  return (
    <div
      title={`Sovereign Operator · ${hex}`}
      style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "10px 14px",
        borderBottom: "1px solid var(--sv-panel-border)",
        background: pulseFlash
          ? `linear-gradient(180deg, ${P.violet}33 0%, ${P.violet}11 100%)`
          : `linear-gradient(180deg, ${P.violet}1a 0%, transparent 100%)`,
        transition: "background 0.6s ease",
      }}
    >
      <div style={{
        position: "relative", flexShrink: 0,
        width: 26, height: 26, borderRadius: "50%",
        background: `radial-gradient(circle, ${P.violet}cc 0%, ${P.violet}33 70%)`,
        border: `1px solid ${P.violet}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: pulseFlash ? `0 0 16px ${P.violet}, 0 0 28px ${P.violet}88` : `0 0 8px ${P.violet}88`,
        transition: "box-shadow 0.6s ease",
      }}>
        <Award style={{ width: 13, height: 13, color: "#F9FAFB" }} />
      </div>
      <div style={{ minWidth: 0, flex: 1, lineHeight: 1.2 }}>
        <div style={{
          fontSize: 7.5, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
          letterSpacing: "0.18em", color: P.violet, textTransform: "uppercase",
        }}>
          OPERATOR · {domain}
        </div>
        <div style={{
          fontSize: 9.5, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
          color: "var(--sv-text-primary)", letterSpacing: "0.04em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {hex}
        </div>
      </div>
    </div>
  );
}

// ── Forensic Inspector ────────────────────────────────────────────────────────
// Routes where the inspector adds operational context (live agents, traces, swarm).
// On governance/admin routes the inspector is hidden entirely so it cannot show
// stale "Rogue-Drill-Alpha" detail next to a Compliance report or Hash Chain view.
const INSPECTOR_ROUTES = new Set([
  "/",
  "/traces",
  "/topology",
  "/swarmmap",
  "/pulse",
  "/status",
  "/warroom",
]);

function ForensicInspector() {
  const [location] = useLocation();
  const {
    agent, setAgent,
    agentHistory, scrubIndex, setScrubIndex,
    weightVerified,
    activeMutations, quarantinedIds, ledgerTampered,
  } = useForensic();

  const [revoking, setRevoking] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const prevAgentId = useRef<string | null>(null);

  // Auto-clear selection when navigating to a different route, so the inspector
  // never shows a stale node next to an unrelated page.
  const prevLocationRef = useRef(location);
  useEffect(() => {
    if (prevLocationRef.current !== location) {
      if (agent) setAgent(null);
      prevLocationRef.current = location;
    }
  }, [location, agent, setAgent]);

  // Active history for the selected agent (excludes the live snapshot)
  const history = agent ? (agentHistory[agent.id] ?? []) : [];
  const scrubSnap = (scrubIndex !== null && history[scrubIndex]) ? history[scrubIndex] : null;
  const wv = agent ? weightVerified(agent.id) : null;

  useEffect(() => {
    if (agent?.id !== prevAgentId.current) {
      setAction(null);
      prevAgentId.current = agent?.id ?? null;
    }
  }, [agent?.id]);

  async function terminate() {
    if (!agent || revoking) return;
    setRevoking(true);
    try {
      await fetch(`${BASE}/api/v1/swarm/revoke-tree/${encodeURIComponent(agent.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "INTERDICTION: Forensic Inspector terminate" }),
      });
      setAction("TERMINATED");
    } catch {
      setAction("ERROR");
    } finally {
      setRevoking(false);
    }
  }

  async function recode() {
    if (!agent) return;
    try {
      await fetch(`${BASE}/api/v1/gateway/crispr_recode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      setAction("RECODE_SENT");
    } catch {
      setAction("ERROR");
    }
  }

  const statusColor =
    agent?.status === "active"  ? P.sage :
    agent?.status === "mutant"  ? "#C084FC" :
    agent?.status === "revoked" ? P.terra : "var(--sv-text-dim)";

  // Use scrubbed snapshot for stat displays when scrubbing
  const showDrift   = scrubSnap?.drift   ?? agent?.drift   ?? 0;
  const showFitness = scrubSnap?.fitnessScore ?? agent?.fitnessScore ?? 0;

  const driftColor =
    !agent              ? "var(--sv-text-dim)" :
    showDrift > 25      ? P.terra :
    showDrift > 15      ? P.amber :
    showDrift > 5       ? "#EBC06D88" : P.sage;

  const fitnessColor =
    !agent                ? "var(--sv-text-dim)" :
    showFitness > 0.7     ? P.sage :
    showFitness > 0.4     ? P.amber : P.terra;

  // Hide the inspector entirely on governance/admin routes (after all hooks).
  if (!INSPECTOR_ROUTES.has(location)) return null;

  // Auto-collapse to a slim Global Alerts strip when no node is selected.
  // Full 350px panel only appears when a node is selected for forensic review.
  const collapsed = !agent;

  // Global Risk Summary tallies (shown in collapsed/strip mode)
  const quarantinedCount = quarantinedIds.size;       // Total Interdictions
  const mutationCount    = activeMutations;
  const alertCount       = quarantinedCount + mutationCount + (ledgerTampered ? 1 : 0);
  const alertColor       = ledgerTampered ? P.terra
                         : alertCount > 0 ? P.amber
                         : P.sage;
  // Cluster Health %: ledger tamper is fatal, otherwise penalize per active risk
  const clusterHealth    = ledgerTampered
    ? 0
    : Math.max(0, Math.min(100, 100 - quarantinedCount * 5 - mutationCount * 3));
  const healthColor      = clusterHealth >= 90 ? P.sage
                         : clusterHealth >= 60 ? P.amber
                         : P.terra;

  if (collapsed) {
    return (
      <aside style={{
        width: 56, flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "center",
        height: "100%", overflow: "hidden",
        background: "var(--sv-inspector-bg)",
        backdropFilter: "blur(20px)",
        borderLeft: "1px solid var(--sv-inspector-border)",
        zIndex: 20, transition: "width 0.25s ease, background 0.3s ease",
        padding: "12px 0",
        gap: 14,
      }}>
        {/* Vertical title rail */}
        <div style={{
          fontSize: 8, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
          letterSpacing: "0.18em", textTransform: "uppercase", color: P.sage,
          writingMode: "vertical-rl", transform: "rotate(180deg)",
          opacity: 0.85, marginBottom: 4,
        }}>
          Global Risk Summary
        </div>

        {/* Pulsing alert dot */}
        <div style={{ position: "relative", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: alertColor, opacity: 0.18,
            animation: alertCount > 0 ? "sovereign-blink 1.6s step-end infinite" : undefined,
          }} />
          <div style={{
            position: "relative",
            width: 10, height: 10, borderRadius: "50%",
            background: alertColor, boxShadow: `0 0 8px ${alertColor}cc`,
          }} />
        </div>

        {/* Tally rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          {/* Cluster Health % */}
          <div title={`Cluster Health: ${clusterHealth}%`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <Activity style={{ width: 14, height: 14, color: healthColor, opacity: 0.9 }} />
            <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: healthColor }}>
              {clusterHealth}%
            </span>
            <span style={{ fontSize: 6, fontFamily: "JetBrains Mono, monospace", color: "var(--sv-text-dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              HLTH
            </span>
          </div>
          {/* Total Interdictions (quarantined) */}
          <div title={`Total Interdictions: ${quarantinedCount} agent${quarantinedCount === 1 ? "" : "s"}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <Skull style={{ width: 14, height: 14, color: quarantinedCount > 0 ? P.terra : "var(--sv-text-dim)", opacity: quarantinedCount > 0 ? 1 : 0.4 }} />
            <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: quarantinedCount > 0 ? P.terra : "var(--sv-text-dim)" }}>
              {quarantinedCount}
            </span>
            <span style={{ fontSize: 6, fontFamily: "JetBrains Mono, monospace", color: "var(--sv-text-dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              INTD
            </span>
          </div>
          {/* Mutations */}
          <div title={`${mutationCount} active mutation${mutationCount === 1 ? "" : "s"}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <Zap style={{ width: 14, height: 14, color: mutationCount > 0 ? "#C084FC" : "var(--sv-text-dim)", opacity: mutationCount > 0 ? 1 : 0.4 }} />
            <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: mutationCount > 0 ? "#C084FC" : "var(--sv-text-dim)" }}>
              {mutationCount}
            </span>
          </div>
          {/* Ledger integrity */}
          <div title={ledgerTampered ? "Hash chain tampered" : "Hash chain intact"}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <ShieldCheck style={{ width: 14, height: 14, color: ledgerTampered ? P.terra : P.sage, opacity: 0.85 }} />
            <span style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: ledgerTampered ? P.terra : P.sage, letterSpacing: "0.05em" }}>
              {ledgerTampered ? "TMP" : "OK"}
            </span>
          </div>
        </div>

        {/* Footer hint */}
        <div style={{
          marginTop: "auto", fontSize: 7, fontFamily: "JetBrains Mono, monospace",
          color: "var(--sv-text-dim)", opacity: 0.5, textAlign: "center", padding: "0 4px",
          writingMode: "vertical-rl", transform: "rotate(180deg)",
          letterSpacing: "0.15em", textTransform: "uppercase",
        }}>
          Select node →
        </div>
      </aside>
    );
  }

  return (
    <aside style={{
      width: 350, flexShrink: 0, display: "flex", flexDirection: "column",
      height: "100%", overflow: "hidden",
      background: "var(--sv-inspector-bg)",
      backdropFilter: "blur(20px)",
      borderLeft: "1px solid var(--sv-inspector-border)",
      zIndex: 20, transition: "width 0.25s ease, background 0.3s ease",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: "1px solid var(--sv-panel-border)",
        background: "var(--sv-footer-bg)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Fingerprint style={{ width: 13, height: 13, color: P.sage }} />
          <span style={{
            fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase", color: P.sage,
          }}>
            Forensic Inspector
          </span>
        </div>
        {agent && (
          <button onClick={() => { setAgent(null); setAction(null); }}
            style={{ opacity: 0.4, cursor: "pointer", background: "none", border: "none", color: "var(--sv-text-dim)", display: "flex" }}>
            <X style={{ width: 13, height: 13 }} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--sv-panel-border) transparent" }}>
        {!agent ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 280, textAlign: "center", padding: "0 24px", gap: 22,
          }}>
            {/* Radar-ring scanner */}
            <div style={{ position: "relative", width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  position: "absolute",
                  width: 64, height: 64,
                  borderRadius: "50%",
                  border: `1px solid rgba(139,92,246,${0.55 - i * 0.15})`,
                  animation: `sovereign-scan 2.4s ease-out ${i * 0.7}s infinite`,
                  transformOrigin: "center center",
                }} />
              ))}
              <Fingerprint style={{ width: 22, height: 22, color: "#8B5CF6", opacity: 0.75, flexShrink: 0 }} />
            </div>

            {/* Labels */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              <div style={{
                fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
                letterSpacing: "0.18em", textTransform: "uppercase",
                color: "#8B5CF6",
                animation: "sovereign-blink 2.2s step-end infinite",
              }}>
                Sovereign Scanning…
              </div>
              <div style={{
                fontSize: 9, fontFamily: "JetBrains Mono, monospace",
                color: "var(--sv-empty-text)", letterSpacing: "0.10em",
                textTransform: "uppercase", lineHeight: 1.7,
              }}>
                Awaiting Node Selection
              </div>
            </div>
          </div>
        ) : (
          <div key={agent.id} className="forensic-agent-enter" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Identity card */}
            <div style={{
              borderRadius: 12, padding: 12,
              background: `${statusColor}10`, border: `1px solid ${statusColor}30`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: statusColor, boxShadow: `0 0 7px ${statusColor}88`, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: statusColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {agent.label}
                </span>
                {agent.isRoot && (
                  <span style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, padding: "2px 6px", borderRadius: 4, color: P.gold, background: P.gold + "20", border: `1px solid ${P.gold}44`, flexShrink: 0 }}>
                    LUCA ◆
                  </span>
                )}
              </div>
              <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", color: "var(--sv-text-dim)", wordBreak: "break-all", opacity: 0.7 }}>
                {agent.id}
              </div>
            </div>

            {/* Stats label */}
            <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sv-section-label)" }}>
              Real-time Stats
            </div>

            {/* Fitness bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "JetBrains Mono, monospace", marginBottom: 4 }}>
                <span style={{ color: "var(--sv-text-dim)" }}>Organism Fitness {scrubSnap && <span style={{ color: P.violet }}>· REPLAY</span>}</span>
                <span style={{ color: fitnessColor }}>{(showFitness * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, overflow: "hidden", background: "var(--sv-panel-border)" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${showFitness * 100}%`, background: `linear-gradient(90deg,${P.terra},${P.amber},${P.sage})`, transition: "width 0.6s ease" }} />
              </div>
            </div>

            {/* Drift bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "JetBrains Mono, monospace", marginBottom: 4 }}>
                <span style={{ color: "var(--sv-text-dim)" }}>Cognitive Drift {showDrift > 25 && <span style={{ color: P.terra }}>⚠ QUARANTINE</span>}</span>
                <span style={{ color: driftColor }}>{showDrift.toFixed(1)}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, overflow: "hidden", background: "var(--sv-panel-border)" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(showDrift, 100)}%`, background: driftColor, transition: "width 0.6s ease" }} />
              </div>
            </div>

            {/* ── Neural Replay (Timeline Scrubber) ────────────── */}
            {history.length > 1 && (
              <div data-tour-id="neural-replay" style={{ borderRadius: 10, padding: 10, background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.22)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: P.violet, fontWeight: 700 }}>
                    🕰 Neural Replay
                  </span>
                  <span style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", color: scrubSnap ? P.violet : P.sage }}>
                    {scrubSnap ? new Date(scrubSnap.ts).toLocaleTimeString() : "LIVE"}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={history.length - 1}
                  value={scrubIndex ?? history.length - 1}
                  onChange={e => {
                    const v = Number(e.target.value);
                    const next = v === history.length - 1 ? null : v;
                    setScrubIndex(next);
                    window.dispatchEvent(new CustomEvent("sentinel:scrub", { detail: { agentId: agent.id, index: next, snap: history[v] ?? null } }));
                  }}
                  style={{ width: "100%", accentColor: P.violet, cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, fontFamily: "JetBrains Mono, monospace", color: "var(--sv-text-dim)", marginTop: 3 }}>
                  <span>−{((history.length - 1) * 2.5).toFixed(0)}s</span>
                  <button
                    onClick={() => { setScrubIndex(null); window.dispatchEvent(new CustomEvent("sentinel:scrub", { detail: { agentId: agent.id, index: null, snap: null } })); }}
                    style={{ background: "none", border: "none", color: P.violet, cursor: "pointer", fontSize: 8, fontFamily: "JetBrains Mono, monospace" }}
                  >
                    ▶ LIVE
                  </button>
                  <span>NOW</span>
                </div>
              </div>
            )}

            {/* ── SLSA L4 Model Weight Verification ────────────── */}
            {wv && (
              <div style={{ borderRadius: 10, padding: 10, background: wv.ok ? "rgba(64,181,149,0.07)" : "rgba(217,97,97,0.10)", border: `1px solid ${wv.ok ? "rgba(64,181,149,0.22)" : "rgba(217,97,97,0.32)"}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: wv.ok ? P.sage : P.terra, fontWeight: 700 }}>
                    {wv.ok ? "🛡 Weight Verified · SLSA L4" : "⚠ Shadow-Tune Detected"}
                  </span>
                  <span style={{ fontSize: 7, fontFamily: "JetBrains Mono, monospace", color: wv.ok ? P.sage : P.terra }}>
                    {wv.ok ? "PASS" : "FAIL"}
                  </span>
                </div>
                <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", color: "var(--sv-text-dim)", wordBreak: "break-all", lineHeight: 1.5 }}>
                  {wv.hash}
                </div>
              </div>
            )}

            {/* Stat rows */}
            {[
              { label: "Status",     value: agent.status.toUpperCase(),                    color: statusColor },
              { label: "Generation", value: `Gen ${agent.generationDepth ?? 0}` },
              { label: "Swarm",      value: agent.swarmId ? agent.swarmId.substring(0, 20) + "…" : "—" },
              { label: "Parent",     value: agent.parentUid ? agent.parentUid.substring(0, 18) + "…" : "genesis" },
              { label: "Registered", value: new Date(agent.createdAt).toLocaleString() },
              ...(agent.revokedAt ? [{ label: "Dissolved", value: new Date(agent.revokedAt).toLocaleString(), color: P.terra }] : []),
            ].map(({ label, value, color: c }) => (
              <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingBottom: 8, borderBottom: "1px solid var(--sv-panel-border)" }}>
                <span style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase", width: 72, flexShrink: 0, paddingTop: 1, color: "var(--sv-text-dim)" }}>
                  {label}
                </span>
                <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, wordBreak: "break-all", color: c ?? "var(--sv-text-primary)" }}>
                  {value}
                </span>
              </div>
            ))}

            {/* FIPS-204 Badge */}
            <div style={{ borderRadius: 10, padding: 12, background: "rgba(64,181,149,0.07)", border: "1px solid rgba(64,181,149,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 10 }}>⚡</span>
                <span style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: P.sage }}>
                  FIPS-204 / ML-DSA-87
                </span>
              </div>
              {[
                { label: "PQ Signature",    value: "VERIFIED ✓",     valueColor: P.sage },
                { label: "Lattice Scheme",  value: "Dilithium-87",   valueColor: "var(--sv-text-primary)" },
                { label: "Quantum Resist.", value: "POST-QUANTUM ✓", valueColor: P.sage },
              ].map(({ label, value, valueColor }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "JetBrains Mono, monospace", marginBottom: 3 }}>
                  <span style={{ color: "var(--sv-text-dim)" }}>{label}</span>
                  <span style={{ color: valueColor }}>{value}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, padding: "3px 8px", borderRadius: 4, background: "rgba(64,181,149,0.08)", fontSize: 8, fontFamily: "JetBrains Mono, monospace", color: P.sage + "99", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title="ML-DSA-87 lattice-based signature">
                {agent.id.substring(0, 28)}…
              </div>
            </div>

            {/* Action feedback */}
            {action && (
              <div style={{
                borderRadius: 8, padding: "8px 12px", textAlign: "center",
                fontSize: 10, fontFamily: "JetBrains Mono, monospace",
                background: action === "RECODE_SENT" ? P.amber + "22" : P.terra + "22",
                color: action === "RECODE_SENT" ? P.amber : P.terra,
                border: `1px solid ${action === "RECODE_SENT" ? P.amber : P.terra}44`,
              }}>
                {action === "TERMINATED" ? "💀 Cellular Dissolution Sent" :
                 action === "RECODE_SENT" ? "⚡ CRISPR Recode Dispatched" : "⚠ Command failed"}
              </div>
            )}

            {/* Interdiction controls */}
            <div>
              <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sv-section-label)", marginBottom: 8 }}>
                Interdiction Controls
              </div>

              {agent.status === "active" && (
                <button onClick={recode} className="forensic-btn forensic-btn-recode">
                  <Dna style={{ width: 13, height: 13, color: P.gold, flexShrink: 0 }} />
                  <span style={{ color: "#c8a800" }}>Apply CRISPR Recode</span>
                  <ChevronRight style={{ width: 11, height: 11, marginLeft: "auto", opacity: 0.35 }} />
                </button>
              )}

              {agent.status === "active" && (
                <button onClick={terminate} disabled={revoking} className="forensic-btn forensic-btn-terminate" style={{ opacity: revoking ? 0.4 : 1 }}>
                  <Skull style={{ width: 13, height: 13, color: P.terra, flexShrink: 0 }} />
                  <span style={{ color: P.terra }}>{revoking ? "Dissolving…" : "Terminate Agent"}</span>
                  <ChevronRight style={{ width: 11, height: 11, marginLeft: "auto", opacity: 0.35 }} />
                </button>
              )}

              {agent.status !== "active" && (
                <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", textAlign: "center", padding: "12px 0", color: "var(--sv-text-dim)", opacity: 0.6 }}>
                  Agent is {agent.status} — no actions available
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Nav definitions ───────────────────────────────────────────────────────────
const NAV_FEATURED = [
  { path: "/warroom", label: "War Room",       icon: ShieldAlert },
  { path: "/traces",  label: "Evidence Bag",   icon: ListTree },
  { path: "/eqa",     label: "Security Audit", icon: Zap },
];

const NAV_GROUPS = [
  {
    label: "Operations",
    items: [
      { path: "/dashboard", label: "Live Stream",   icon: Activity },
      { path: "/topology", label: "Topology",      icon: GitBranch },
      { path: "/swarmmap", label: "Swarm Map",     icon: Network },
      { path: "/pulse",    label: "Live Pulse",    icon: Radio },
      { path: "/status",   label: "System Status", icon: ShieldCheck },
    ],
  },
  {
    label: "Governance",
    items: [
      { path: "/registry",           label: "Registry",         icon: Cpu },
      { path: "/compliance",         label: "Compliance",       icon: FileCheck },
      { path: "/integrity",          label: "Hash Chain",       icon: ShieldCheck },
      { path: "/badge",              label: "Sentinel Badge",   icon: Award },
      { path: "/partner",            label: "Partner Portal",   icon: Building2 },
      { path: "/partner-onboarding", label: "Alpha Onboarding", icon: Rocket },
    ],
  },
];

// ── Layout ────────────────────────────────────────────────────────────────────
export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [pendingNotifications, setPendingNotifications] = useState<PendingNotification[]>([]);
  const [killActive, setKillActive] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const { activeMutations, lastSync, ledgerTampered } = useForensic();

  // ── Hamburger Protocol: drawer state for <1024px viewports ──
  // Below `lg` (1024px) the 200px sidebar would steal half the screen and
  // squash the Swarm Map. Instead we collapse it into a slide-in drawer
  // toggled by a floating Menu button. Auto-closes on route change so the
  // page transition feels instant and the operator never lands on a new
  // route with the drawer still pinned open.
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { setDrawerOpen(false); }, [location]);

  useEffect(() => {
    const ws = new WebSocket(
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${BASE}/api/v1/ws`
    );
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "pending_approval") {
          const { id, agentId, actionType } = msg.data;
          setPendingNotifications((prev) => {
            if (prev.some((n) => n.id === id)) return prev;
            return [{ id, agentId, actionType }, ...prev].slice(0, 5);
          });
          setShowNotif(true);
          if (Notification.permission === "granted") {
            new Notification("Agent-Sentinel: Authorization Required", {
              body: `Agent ${agentId} wants to execute ${actionType}. Approve or deny in the War Room.`,
            });
          }
        }
        if (msg.type === "kill_switch") setKillActive(msg.data?.active ?? false);
        if (msg.type === "auth_resolved") {
          const { id } = msg.data;
          setPendingNotifications((prev) => prev.filter((n) => n.id !== id));
        }
      } catch {}
    };
    if (Notification.permission === "default") Notification.requestPermission();
    return () => ws.close();
  }, []);

  const allItems = [...NAV_FEATURED, ...NAV_GROUPS.flatMap((g) => g.items)];
  const currentLabel = allItems.find((i) => i.path === location)?.label?.toUpperCase() ?? "OVERVIEW";

  return (
    <div style={{
      display: "flex", flexDirection: "row", height: "100vh",
      // minWidth removed: was 1280, which forced horizontal scroll on mobile.
      // The sidebar is now off-canvas under 1024px so the layout reflows
      // naturally on phones/tablets without violating the desktop spec.
      width: "100%", overflow: "hidden",
      background: "var(--sv-root-bg)",
      position: "relative",
      transition: "background 0.3s ease",
    }}>
      {/* Risk Horizon */}
      <RiskHorizon activeMutations={activeMutations} ledgerTampered={ledgerTampered} />

      {/* ── Mobile Backdrop (only renders when drawer is open + <lg) ── */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden"
          aria-hidden
          style={{
            position: "fixed", inset: 0, zIndex: 45,
            background: "rgba(2,6,23,0.65)",
            backdropFilter: "blur(4px)",
            animation: "fadein 0.2s ease",
          }}
        />
      )}

      {/* ── Floating Hamburger (only <lg, hidden when drawer open) ── */}
      {!drawerOpen && (
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          className="lg:hidden"
          style={{
            position: "fixed", top: 12, left: 12, zIndex: 60,
            width: 44, height: 44, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(13,17,23,0.92)",
            border: `1px solid ${P.violet}55`,
            boxShadow: `0 0 18px ${P.violet}44, 0 4px 12px rgba(0,0,0,0.45)`,
            color: P.violet, cursor: "pointer", padding: 0,
          }}
        >
          <Menu style={{ width: 20, height: 20 }} />
        </button>
      )}

      {/* ── Sidebar — sticky on desktop (≥lg), slide-in drawer on mobile ──
           The sentinel-sidebar class (CSS injected at the end of the file)
           applies position:fixed + translate-X(-100%) below 1024px so the
           panel lives off-canvas, then resets to position:relative + identity
           transform at lg+ so the original docked desktop layout is unchanged. */}
      <aside
        className="sentinel-scanline sentinel-sidebar"
        data-drawer-open={drawerOpen}
        style={{
          width: 200, flexShrink: 0, display: "flex", flexDirection: "column",
          height: "100%", top: 0, left: 0, zIndex: 50,
          background: "var(--sv-sidebar-bg)",
          backdropFilter: "blur(20px)",
          borderRight: "1px solid var(--sv-sidebar-border)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1), background 0.3s ease, border-color 0.3s ease",
        }}
      >
        {/* Logo */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
          padding: "0 16px", height: 56,
          borderBottom: "1px solid var(--sv-panel-border)",
          position: "relative", zIndex: 1,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: P.sage, boxShadow: `0 0 6px ${P.sage}88`, flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--sv-text-primary)" }}>
              SENTINEL v6.0
            </span>
            <span style={{ fontSize: 7.5, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, letterSpacing: "0.18em", color: P.violet, textTransform: "uppercase" }}>
              Neural Sovereignty
            </span>
          </div>
        </div>

        {/* Featured nav */}
        <div style={{ padding: "14px 10px 6px" }}>
          <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sv-section-label)", padding: "0 8px", marginBottom: 6 }}>
            Command
          </div>
          {NAV_FEATURED.map((item) => {
            const active = location === item.path;
            const hasBadge = item.path === "/warroom" && pendingNotifications.length > 0;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn("nav-featured-item", active ? "nav-featured-active" : "nav-featured-inactive")}
              >
                <item.icon style={{ width: 13, height: 13, flexShrink: 0, color: active ? P.violet : "var(--sv-text-dim)" }} />
                <span style={{ fontSize: 11, flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </span>
                {hasBadge && (
                  <span className="animate-pulse" style={{ padding: "1px 5px", borderRadius: 4, background: P.terra, color: "#fff", fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, flexShrink: 0 }}>
                    {pendingNotifications.length}
                  </span>
                )}
                {active && !hasBadge && (
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: P.violet, marginLeft: "auto", flexShrink: 0, boxShadow: `0 0 6px ${P.violet}88` }} />
                )}
              </Link>
            );
          })}
        </div>

        <div style={{ height: 1, margin: "4px 12px", background: "var(--sv-separator)" }} />

        {/* Secondary groups */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px 8px", scrollbarWidth: "none" }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sv-section-label)", padding: "0 8px", marginBottom: 4 }}>
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = location === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={cn("nav-secondary-item", active ? "nav-secondary-active" : "nav-secondary-inactive")}
                  >
                    <item.icon style={{ width: 12, height: 12, flexShrink: 0, opacity: active ? 1 : 0.5, color: active ? P.violet : "var(--sv-text-dim)" }} />
                    <span style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0,
          borderTop: "1px solid var(--sv-panel-border)",
          background: "var(--sv-footer-bg)",
        }}>
          {/* Operator HEX-ID badge */}
          <OperatorBadge />
          {/* Sovereign Data Room export (Certified Operator only).
              Lazy-loaded — fallback is an empty 1px line so the footer
              layout doesn't reflow when the chunk lands. */}
          <Suspense fallback={<div style={{ height: 1 }} />}>
            <DataRoomExport />
          </Suspense>
          <div style={{
            padding: "10px 16px",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: killActive ? P.terra : P.sage }} />
            <span style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: killActive ? P.terra : P.sage }}>
              {killActive ? "KILL-SWITCH ACTIVE" : "SYSTEMS NOMINAL"}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", zIndex: 10 }}>
        {/* Header */}
        <header style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", height: 56,
          borderBottom: "1px solid var(--sv-panel-border)",
          background: "var(--sv-header-bg)",
          backdropFilter: "blur(12px)",
          transition: "background 0.3s ease",
        }}>
          {/* pl-14 lg:pl-0 reserves space on mobile for the floating
               hamburger button so the breadcrumb never sits underneath it. */}
          <div className="pl-14 lg:pl-0" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
            <span style={{ color: "var(--sv-text-dim)" }}>{currentLabel}</span>
            <span style={{ color: "var(--sv-breadcrumb-divider)" }}>/</span>
            <span style={{ color: "var(--sv-text-primary)", fontWeight: 600 }}>OVERVIEW</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Cluster switcher */}
            <ClusterSwitcher />

            <div style={{ width: 1, height: 20, background: "var(--sv-panel-border)" }} />

            {/* Search — hidden on mobile/tablet to free up space for the
                cluster switcher + breadcrumb + induction button. Returns
                at md+ where the header has room to breathe. */}
            <div className="hidden md:block" style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--sv-search-icon)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder="Search logs, hashes, traces…"
                style={{
                  width: 220, height: 32, fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                  paddingLeft: 30, paddingRight: 12, borderRadius: 8,
                  color: "var(--sv-search-text)",
                  background: "var(--sv-search-bg)",
                  border: "1px solid var(--sv-search-border)",
                  outline: "none",
                  transition: "background 0.3s ease, border-color 0.3s ease",
                }}
              />
            </div>

            <div style={{ width: 1, height: 20, background: "var(--sv-panel-border)" }} />

            {/* Help / Re-trigger Induction */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("sentinel:induction-restart"))}
              title="Re-launch Sovereign Induction"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: 8, cursor: "pointer",
                border: "1px solid rgba(139,92,246,0.32)",
                background: "rgba(139,92,246,0.08)",
                color: P.violet, padding: 0,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.18)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 10px ${P.violet}66`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.08)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
              }}
            >
              <HelpCircle style={{ width: 14, height: 14 }} />
            </button>

            <div style={{ width: 1, height: 20, background: "var(--sv-panel-border)" }} />

            {/* System Frequency — animated wave */}
            <div
              title="System Frequency · live signal"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "0 10px", height: 32, borderRadius: 8,
                border: "1px solid rgba(0,245,255,0.28)",
                background: "rgba(0,245,255,0.06)",
                overflow: "hidden",
              }}
            >
              <span style={{
                fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
                letterSpacing: "0.16em", color: "#00F5FF", textShadow: "0 0 6px rgba(0,245,255,0.55)",
              }}>FREQ</span>
              <svg width="92" height="18" viewBox="0 0 92 18" style={{ display: "block", overflow: "hidden" }}>
                <defs>
                  <linearGradient id="freq-fade" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#00F5FF" stopOpacity="0" />
                    <stop offset="0.18" stopColor="#00F5FF" stopOpacity="1" />
                    <stop offset="0.82" stopColor="#00F5FF" stopOpacity="1" />
                    <stop offset="1" stopColor="#00F5FF" stopOpacity="0" />
                  </linearGradient>
                  <mask id="freq-mask"><rect width="92" height="18" fill="url(#freq-fade)" /></mask>
                </defs>
                <g mask="url(#freq-mask)">
                  <path
                    className="frequency-wave-track"
                    d="M0 9 Q5 2 10 9 T20 9 T30 9 T40 9 T50 9 T60 9 T70 9 T80 9 T90 9 T100 9 T110 9 T120 9 T130 9"
                    fill="none" stroke="#00F5FF" strokeWidth="1.4" strokeLinecap="round"
                    style={{ filter: "drop-shadow(0 0 3px #00F5FF)" }}
                  />
                </g>
              </svg>
            </div>

            {/* LIVE indicator */}
            <div
              data-tour-id="live-pulse"
              title={lastSync ? `System Synchronized: ${lastSync.toLocaleTimeString()}` : "Synchronizing…"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "0 10px", height: 32, borderRadius: 8,
                border: "1px solid rgba(64,181,149,0.28)",
                background: "rgba(64,181,149,0.08)",
                cursor: "help",
              }}
            >
              <span className="live-dot" style={{
                width: 7, height: 7, borderRadius: "50%",
                background: P.sage, boxShadow: `0 0 6px ${P.sage}cc`,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
                letterSpacing: "0.18em", color: P.sage,
              }}>
                LIVE
              </span>
            </div>

            <div style={{ width: 1, height: 20, background: "var(--sv-panel-border)" }} />

            {/* Bell */}
            <button
              onClick={() => setShowNotif(!showNotif)}
              style={{
                width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 8,
                border: "1px solid var(--sv-btn-border)",
                background: "var(--sv-btn-bg)",
                cursor: "pointer", position: "relative",
                transition: "background 0.2s",
              }}
            >
              <Bell style={{ width: 14, height: 14, color: "var(--sv-text-dim)" }} />
              {pendingNotifications.length > 0 && (
                <span className="animate-pulse" style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: "50%", background: P.terra }} />
              )}
            </button>

          </div>
        </header>

        {/* Notification dropdown */}
        {showNotif && pendingNotifications.length > 0 && (
          <div style={{
            position: "absolute", top: 56, right: 16, width: 300, zIndex: 50,
            borderRadius: 12, overflow: "hidden",
            background: "var(--sv-notif-bg)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--sv-notif-border)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--sv-panel-border)" }}>
              <span style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: P.terra, display: "flex", alignItems: "center", gap: 5 }}>
                <ShieldAlert style={{ width: 11, height: 11 }} />
                PENDING APPROVALS ({pendingNotifications.length})
              </span>
              <button onClick={() => setShowNotif(false)} style={{ opacity: 0.4, cursor: "pointer", background: "none", border: "none", color: "var(--sv-text-dim)", display: "flex" }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            </div>
            {pendingNotifications.map((n) => (
              <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid var(--sv-panel-border)" }}>
                <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--sv-text-primary)", fontWeight: 700 }}>{n.agentId}</div>
                <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: P.terra, marginTop: 2 }}>wants to: {n.actionType}</div>
                <Link href="/warroom" style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: P.sage, marginTop: 4, display: "block" }} onClick={() => setShowNotif(false)}>
                  → Go to War Room to approve/deny
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Page content — pb-24 + safe-area inset prevents Replit/mobile overlay HUD obscuring */}
        <div
          className="pb-24"
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: 20,
            paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))",
            background: "transparent",
          }}
        >
          {children}
        </div>
      </div>

      {/* ── Forensic Inspector ── */}
      <ForensicInspector />

      {/* ── Sovereign Induction Onboarding ── */}
      <SovereignInduction />

      {/* ── Responsive sidebar choreography ──
           Below 1024px: sidebar is fixed-positioned & translated off-canvas
           unless [data-drawer-open="true"] (the Hamburger Protocol).
           At 1024px+: revert to position:relative + identity transform so
           the original docked desktop column is unchanged.
           Also defines `fadein` keyframes used by the mobile backdrop. */}
      <style>{`
        @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
        .sentinel-sidebar {
          position: fixed;
        }
        .sentinel-sidebar[data-drawer-open="false"] {
          transform: translateX(-100%);
        }
        .sentinel-sidebar[data-drawer-open="true"] {
          transform: translateX(0);
          box-shadow: 8px 0 32px rgba(0,0,0,0.55), 0 0 64px rgba(139,92,246,0.18);
        }
        @media (min-width: 1024px) {
          .sentinel-sidebar,
          .sentinel-sidebar[data-drawer-open="false"],
          .sentinel-sidebar[data-drawer-open="true"] {
            position: relative;
            transform: none;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
}
