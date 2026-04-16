import React, { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "next-themes";
import {
  Activity, ListTree, Cpu, FileCheck, ShieldCheck, Search, Bell,
  GitBranch, ShieldAlert, X, Award, Network, Building2, Zap, Radio,
  Rocket, Sun, Moon, Skull, Fingerprint, Dna, Shield, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useForensic } from "@/contexts/ForensicContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const P = {
  sage:   "#40B595",
  amber:  "#EBC06D",
  terra:  "#D96161",
  dim:    "#9AA4B1",
  gold:   "#FFD700",
  border: "rgba(255,255,255,0.08)",
};

interface PendingNotification {
  id: string;
  agentId: string;
  actionType: string;
}

// ── Sovereign Switch ──────────────────────────────────────────────────────────
function SovereignSwitch() {
  const { theme, setTheme } = useTheme();
  const isDark = theme !== "light";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 34, height: 34,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.05)",
        cursor: "pointer", transition: "background 0.2s",
      }}
    >
      {isDark
        ? <Sun style={{ width: 15, height: 15, color: "#facc15" }} />
        : <Moon style={{ width: 15, height: 15, color: "#93c5fd" }} />
      }
    </button>
  );
}

// ── Risk Horizon ──────────────────────────────────────────────────────────────
function RiskHorizon({ activeMutations }: { activeMutations: number }) {
  const state: "calm" | "warning" | "breach" =
    activeMutations > 5 ? "breach" :
    activeMutations >= 3 ? "warning" : "calm";

  const gradient =
    state === "breach"
      ? "radial-gradient(ellipse at 0% 0%, rgba(122,0,0,0.55) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(122,0,0,0.45) 0%, transparent 60%)"
      : state === "warning"
      ? "radial-gradient(circle, rgba(255,191,0,0.15) 0%, transparent 70%)"
      : "transparent";

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

// ── Forensic Inspector ────────────────────────────────────────────────────────
function ForensicInspector() {
  const { agent, setAgent } = useForensic();
  const [revoking, setRevoking] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const prevAgentId = useRef<string | null>(null);

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
    agent?.status === "revoked" ? P.terra : P.dim;

  const driftColor =
    !agent        ? P.dim :
    agent.drift > 15 ? P.amber :
    agent.drift > 5  ? "#EBC06D88" : P.sage;

  const fitnessColor =
    !agent                    ? P.dim :
    agent.fitnessScore > 0.7  ? P.sage :
    agent.fitnessScore > 0.4  ? P.amber : P.terra;

  return (
    <aside
      style={{
        width: 350, flexShrink: 0, display: "flex", flexDirection: "column",
        height: "100%", overflow: "hidden",
        background: "rgba(10,12,18,0.88)",
        backdropFilter: "blur(16px)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        zIndex: 20,
      }}
    >
      {/* Header */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Fingerprint style={{ width: 13, height: 13, color: P.sage }} />
          <span style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: P.sage }}>
            Forensic Inspector
          </span>
        </div>
        {agent && (
          <button onClick={() => { setAgent(null); setAction(null); }}
            style={{ opacity: 0.4, cursor: "pointer", background: "none", border: "none", color: P.dim, display: "flex" }}>
            <X style={{ width: 13, height: 13 }} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
        {!agent ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 240, textAlign: "center", padding: "0 24px", gap: 12 }}>
            <Shield style={{ width: 40, height: 40, opacity: 0.08, color: P.dim }} />
            <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", opacity: 0.35, color: P.dim, lineHeight: 1.6 }}>
              Select an agent in the Swarm Map<br />to begin forensic analysis
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
              <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", opacity: 0.45, color: P.dim, wordBreak: "break-all" }}>
                {agent.id}
              </div>
            </div>

            {/* Real-time stats header */}
            <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: P.dim + "88" }}>
              Real-time Stats
            </div>

            {/* Fitness bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "JetBrains Mono, monospace", marginBottom: 4 }}>
                <span style={{ color: P.dim }}>Organism Fitness</span>
                <span style={{ color: fitnessColor }}>{(agent.fitnessScore * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${agent.fitnessScore * 100}%`, background: `linear-gradient(90deg,${P.terra},${P.amber},${P.sage})`, transition: "width 0.6s ease" }} />
              </div>
            </div>

            {/* Drift bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "JetBrains Mono, monospace", marginBottom: 4 }}>
                <span style={{ color: P.dim }}>Genetic Drift</span>
                <span style={{ color: driftColor }}>{(agent.drift ?? 0).toFixed(1)}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(agent.drift ?? 0, 100)}%`, background: driftColor, transition: "width 0.6s ease" }} />
              </div>
            </div>

            {/* Stat rows */}
            {[
              { label: "Status",     value: agent.status.toUpperCase(),                    color: statusColor },
              { label: "Generation", value: `Gen ${agent.generationDepth ?? 0}` },
              { label: "Swarm",      value: agent.swarmId ? agent.swarmId.substring(0, 20) + "…" : "—" },
              { label: "Parent",     value: agent.parentUid ? agent.parentUid.substring(0, 18) + "…" : "genesis" },
              { label: "Registered", value: new Date(agent.createdAt).toLocaleString() },
              ...(agent.revokedAt ? [{ label: "Dissolved", value: new Date(agent.revokedAt).toLocaleString(), color: P.terra }] : []),
            ].map(({ label, value, color: c }) => (
              <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase", width: 72, flexShrink: 0, paddingTop: 1, color: P.dim }}>
                  {label}
                </span>
                <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, wordBreak: "break-all", color: c ?? "#cdd5e0" }}>
                  {value}
                </span>
              </div>
            ))}

            {/* FIPS-204 Quantum Signature Badge */}
            <div style={{ borderRadius: 10, padding: 12, background: "rgba(64,181,149,0.07)", border: "1px solid rgba(64,181,149,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 10 }}>⚡</span>
                <span style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: P.sage }}>
                  FIPS-204 / ML-DSA-87
                </span>
              </div>
              {[
                { label: "PQ Signature",     value: "VERIFIED ✓",       valueColor: P.sage },
                { label: "Lattice Scheme",   value: "Dilithium-87",     valueColor: "#cdd5e0" },
                { label: "Quantum Resist.",  value: "POST-QUANTUM ✓",   valueColor: P.sage },
              ].map(({ label, value, valueColor }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "JetBrains Mono, monospace", marginBottom: 3 }}>
                  <span style={{ color: P.dim }}>{label}</span>
                  <span style={{ color: valueColor }}>{value}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, padding: "3px 8px", borderRadius: 4, background: "rgba(64,181,149,0.08)", fontSize: 8, fontFamily: "JetBrains Mono, monospace", color: P.sage + "77", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
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
                 action === "RECODE_SENT" ? "⚡ CRISPR Recode Dispatched" :
                 "⚠ Command failed"}
              </div>
            )}

            {/* Interdiction controls */}
            <div>
              <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: P.dim + "88", marginBottom: 8 }}>
                Interdiction Controls
              </div>

              {agent.status === "active" && (
                <button
                  onClick={recode}
                  className="forensic-btn forensic-btn-recode"
                >
                  <Dna style={{ width: 13, height: 13, color: P.gold, flexShrink: 0 }} />
                  <span style={{ color: "#FFF8C5" }}>Apply CRISPR Recode</span>
                  <ChevronRight style={{ width: 11, height: 11, marginLeft: "auto", opacity: 0.35 }} />
                </button>
              )}

              {agent.status === "active" && (
                <button
                  onClick={terminate}
                  disabled={revoking}
                  className="forensic-btn forensic-btn-terminate"
                  style={{ opacity: revoking ? 0.4 : 1 }}
                >
                  <Skull style={{ width: 13, height: 13, color: P.terra, flexShrink: 0 }} />
                  <span style={{ color: P.terra }}>{revoking ? "Dissolving…" : "Terminate Agent"}</span>
                  <ChevronRight style={{ width: 11, height: 11, marginLeft: "auto", opacity: 0.35 }} />
                </button>
              )}

              {agent.status !== "active" && (
                <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", textAlign: "center", padding: "12px 0", opacity: 0.35, color: P.dim }}>
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
      { path: "/",         label: "Live Stream",   icon: Activity },
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
  const { activeMutations } = useForensic();

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
    <div
      className="dark"
      style={{
        display: "flex", flexDirection: "row", height: "100vh",
        minWidth: 1280, width: "100%", overflow: "hidden",
        background: "#0a0a0a", position: "relative",
      }}
    >
      {/* Risk Horizon */}
      <RiskHorizon activeMutations={activeMutations} />

      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 200, flexShrink: 0, display: "flex", flexDirection: "column",
          height: "100%", position: "relative", zIndex: 20,
          background: "rgba(10,12,20,0.84)",
          backdropFilter: "blur(12px)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Logo */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", height: 56, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: P.sage, boxShadow: `0 0 6px ${P.sage}88` }} />
          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, letterSpacing: "-0.01em", color: "#fff" }}>AGENT-SENTINEL</span>
        </div>

        {/* Featured nav */}
        <div style={{ padding: "14px 10px 6px" }}>
          <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: P.dim + "77", padding: "0 8px", marginBottom: 6 }}>
            Command
          </div>
          {NAV_FEATURED.map((item) => {
            const active = location === item.path;
            const hasBadge = item.path === "/warroom" && pendingNotifications.length > 0;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "nav-featured-item",
                  active ? "nav-featured-active" : "nav-featured-inactive"
                )}
              >
                <item.icon style={{ width: 13, height: 13, flexShrink: 0, color: active ? P.sage : P.dim }} />
                <span style={{ fontSize: 11, flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                {hasBadge && (
                  <span className="animate-pulse" style={{ padding: "1px 5px", borderRadius: 4, background: P.terra, color: "#fff", fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, flexShrink: 0 }}>
                    {pendingNotifications.length}
                  </span>
                )}
                {active && !hasBadge && (
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: P.sage, marginLeft: "auto", flexShrink: 0 }} />
                )}
              </Link>
            );
          })}
        </div>

        <div style={{ height: 1, margin: "4px 12px", background: "rgba(255,255,255,0.06)" }} />

        {/* Secondary groups */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px 8px", scrollbarWidth: "none" }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: P.dim + "66", padding: "0 8px", marginBottom: 4 }}>
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
                    <item.icon style={{ width: 12, height: 12, flexShrink: 0, opacity: active ? 1 : 0.5, color: active ? P.sage : P.dim }} />
                    <span style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Status footer */}
        <div style={{ flexShrink: 0, padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", gap: 8 }}>
          <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: killActive ? P.terra : P.sage }} />
          <span style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: killActive ? P.terra : P.sage }}>
            {killActive ? "KILL-SWITCH ACTIVE" : "SYSTEMS NOMINAL"}
          </span>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", zIndex: 10 }}>
        {/* Header */}
        <header style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", height: 56, borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(10,12,20,0.78)", backdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
            <span style={{ color: P.dim }}>{currentLabel}</span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>/</span>
            <span style={{ color: "#fff", fontWeight: 600 }}>OVERVIEW</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(255,255,255,0.25)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder="Search logs, hashes, traces…"
                style={{
                  width: 220, height: 32, fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                  paddingLeft: 30, paddingRight: 12, borderRadius: 8, color: "rgba(255,255,255,0.75)",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />

            {/* Bell */}
            <button
              onClick={() => setShowNotif(!showNotif)}
              style={{
                width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
                cursor: "pointer", position: "relative",
              }}
            >
              <Bell style={{ width: 14, height: 14, color: "rgba(255,255,255,0.4)" }} />
              {pendingNotifications.length > 0 && (
                <span className="animate-pulse" style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: "50%", background: P.terra }} />
              )}
            </button>

            {/* Sovereign Switch */}
            <SovereignSwitch />
          </div>
        </header>

        {/* Notification dropdown */}
        {showNotif && pendingNotifications.length > 0 && (
          <div style={{
            position: "absolute", top: 56, right: 16, width: 300, zIndex: 50,
            borderRadius: 12, overflow: "hidden",
            background: "rgba(10,12,20,0.97)", backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: P.terra, display: "flex", alignItems: "center", gap: 5 }}>
                <ShieldAlert style={{ width: 11, height: 11 }} />
                PENDING APPROVALS ({pendingNotifications.length})
              </span>
              <button onClick={() => setShowNotif(false)} style={{ opacity: 0.4, cursor: "pointer", background: "none", border: "none", color: "#fff", display: "flex" }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            </div>
            {pendingNotifications.map((n) => (
              <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "#fff", fontWeight: 700 }}>{n.agentId}</div>
                <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: P.terra, marginTop: 2 }}>wants to: {n.actionType}</div>
                <Link href="/warroom" style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: P.sage, marginTop: 4, display: "block" }} onClick={() => setShowNotif(false)}>
                  → Go to War Room to approve/deny
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: 20, background: "transparent" }}>
          {children}
        </div>
      </div>

      {/* ── Forensic Inspector ── */}
      <ForensicInspector />
    </div>
  );
}
