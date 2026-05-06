/**
 * Live Pulse Feed — /pulse
 *
 * Displays automated 6-hour "System Trust Velocity" pulses in a
 * timeline-style feed. Internal system trust only — no social posting.
 *
 * Features:
 * - Auto-refreshes every 30 seconds
 * - Trust velocity gauge, FIPS-204 / ML-DSA-87 quantum-signature badge
 * - Manual "Fire Pulse Now" button for immediate snapshot
 * - Countdown to next scheduled pulse
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Radio, Zap, Clock,
  CheckCircle2, AlertTriangle, XCircle,
  Shield, Activity, Fingerprint, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useForensic } from "@/contexts/ForensicContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  sage:    "#00F5FF",
  honey:   "#FFB800",
  terra:   "#FF003C",
  panel:   "#161B22",
  border:  "#2C3136",
  dimText: "#9AA4B1",
  gold:    "#FFD700",
  bg:      "#0D1117",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────

interface PulseEntry {
  id:             string;
  firedAt:        string;
  trustVelocity:  number;
  totalEvents:    number;
  verifiedEvents: number;
  anomalyCount:   number;
  status:         "NOMINAL" | "ELEVATED" | "CRITICAL";
  message:        string;
  tweetUrl:       string | null;
  tweetId:        string | null;
  tweetError:     string | null;
  windowHours:    number;
}

// ── Status helpers ────────────────────────────────────────────────────────

function statusColor(s: string): string {
  if (s === "CRITICAL") return C.terra;
  if (s === "ELEVATED") return C.honey;
  return C.sage;
}

function statusIcon(s: string) {
  if (s === "CRITICAL") return <XCircle className="w-3.5 h-3.5" style={{ color: C.terra }} />;
  if (s === "ELEVATED") return <AlertTriangle className="w-3.5 h-3.5" style={{ color: C.honey }} />;
  return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: C.sage }} />;
}

function statusEmoji(s: string): string {
  if (s === "CRITICAL") return "🚨";
  if (s === "ELEVATED") return "⚠️";
  return "🛡️";
}

// ── Trust Velocity Ring ───────────────────────────────────────────────────

function VelocityRing({ value, status }: { value: number; status: string }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const filled = (value / 100) * circ;
  const col = statusColor(status);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 80, height: 80 }}>
      <svg width="80" height="80" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke={C.border} strokeWidth="6" />
        <circle
          cx="40" cy="40" r={r}
          fill="none"
          stroke={col}
          strokeWidth="6"
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: col }}>
          {value.toFixed(1)}%
        </span>
        <span style={{ fontSize: 8, fontFamily: "JetBrains Mono, monospace", color: C.dimText }}>trust</span>
      </div>
    </div>
  );
}

// ── FIPS-204 Badge ────────────────────────────────────────────────────────

function Fips204Badge() {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 16px",
      borderRadius: 10, background: `${C.sage}0f`, border: `1px solid ${C.sage}33`,
    }}>
      <span style={{ fontSize: 14 }}>⚡</span>
      <div>
        <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sage, marginBottom: 2 }}>
          FIPS-204 / ML-DSA-87 · Security Level 5
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Scheme",     value: "Dilithium-87" },
            { label: "PQ Status",  value: "POST-QUANTUM ✓", color: C.sage },
            { label: "Verify",     value: "ML-DSA-87 ✓",    color: C.sage },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: "flex", gap: 5, fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>
              <span style={{ color: C.dimText }}>{label}:</span>
              <span style={{ color: color ?? "#cdd5e0", fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Countdown Timer ───────────────────────────────────────────────────────

function useCountdown(lastFiredAt: string | null): string {
  const [display, setDisplay] = useState("--:--:--");

  useEffect(() => {
    if (!lastFiredAt) { setDisplay("--:--:--"); return; }
    const next = new Date(lastFiredAt).getTime() + 6 * 60 * 60 * 1000;
    const tick = () => {
      const diff = next - Date.now();
      if (diff <= 0) { setDisplay("00:00:00"); return; }
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setDisplay(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastFiredAt]);

  return display;
}

// ── Single Pulse Card ─────────────────────────────────────────────────────

function PulseCard({ entry, isLatest }: { entry: PulseEntry; isLatest: boolean }) {
  const dt = new Date(entry.firedAt);
  const dateStr = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const col = statusColor(entry.status);

  return (
    <div style={{
      borderRadius: 10, padding: 16, position: "relative",
      background: C.panel,
      border: `1px solid ${isLatest ? col : C.border}`,
      boxShadow: isLatest ? `0 0 12px ${col}22` : undefined,
    }}>
      {isLatest && (
        <div className="animate-pulse" style={{
          position: "absolute", top: 12, right: 12,
          fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
          padding: "2px 8px", borderRadius: 999,
          background: `${col}22`, color: col, border: `1px solid ${col}`,
        }}>
          LATEST
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <VelocityRing value={entry.trustVelocity} status={entry.status} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {statusIcon(entry.status)}
            <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: col }}>
              {entry.status} {statusEmoji(entry.status)}
            </span>
            <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: C.dimText, marginLeft: "auto" }}>
              {dateStr} · {timeStr}
            </span>
          </div>

          <div style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 11, lineHeight: 1.6,
            borderRadius: 6, padding: "10px 12px", marginBottom: 12, wordBreak: "break-all",
            background: `${C.bg}80`, border: `1px solid ${C.border}`, color: "#cdd5e0",
          }}>
            {entry.message}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Chip label="Events"         value={entry.totalEvents.toLocaleString()}   color={C.dimText} />
            <Chip label="QL-2.0 Verified" value={entry.verifiedEvents.toLocaleString()} color={C.sage} />
            <Chip label="Anomalies"      value={String(entry.anomalyCount)}            color={entry.anomalyCount > 0 ? C.terra : C.sage} />
            <Chip label="Window"         value={`${entry.windowHours}h`}              color={C.dimText} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 5, fontSize: 10, fontFamily: "JetBrains Mono, monospace",
      background: `${color}15`, border: `1px solid ${color}33`,
    }}>
      <span style={{ color: C.dimText }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

// ── Stats cards ───────────────────────────────────────────────────────────

function StatsBar({ pulses }: { pulses: PulseEntry[] }) {
  if (pulses.length === 0) return null;
  const avgVel        = pulses.reduce((a, p) => a + p.trustVelocity, 0) / pulses.length;
  const totalAnomalies = pulses.reduce((a, p) => a + p.anomalyCount, 0);
  const criticals      = pulses.filter((p) => p.status === "CRITICAL").length;

  const cards = [
    { label: "Avg Trust Velocity", value: `${avgVel.toFixed(2)}%`,      color: C.sage,  icon: <Shield style={{ width: 16, height: 16 }} /> },
    { label: "Total Anomalies",    value: totalAnomalies.toString(),     color: totalAnomalies > 0 ? C.terra : C.sage, icon: <AlertTriangle style={{ width: 16, height: 16 }} /> },
    { label: "Critical Pulses",    value: criticals.toString(),          color: criticals > 0 ? C.terra : C.sage,     icon: <Activity style={{ width: 16, height: 16 }} /> },
  ];

  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
      {cards.map((s) => (
        <div key={s.label} style={{
          flex: "1 1 0", maxWidth: 280, display: "flex", alignItems: "center", gap: 14,
          padding: "14px 20px", borderRadius: 10,
          background: C.panel, border: `1px solid ${C.border}`,
        }}>
          <div style={{ color: s.color, opacity: 0.7, flexShrink: 0 }}>{s.icon}</div>
          <div>
            <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: C.dimText, marginBottom: 2 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: s.color }}>
              {s.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PulsePage() {
  const [pulses, setPulses]       = useState<PulseEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [firing, setFiring]       = useState(false);
  const [fireMsg, setFireMsg]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { activeMutations }       = useForensic();

  const lastFiredAt = pulses[0]?.firedAt ?? null;
  const countdown   = useCountdown(lastFiredAt);

  const fetchPulses = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/pulse/latest?limit=20`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setPulses(data.pulses ?? []);
      setLastRefresh(new Date());
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPulses();
    intervalRef.current = setInterval(fetchPulses, 2_500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchPulses]);

  const handleFireNow = async () => {
    setFiring(true);
    setFireMsg(null);
    try {
      const r = await fetch(`${BASE}/api/v1/pulse/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowHours: 6 }),
      });
      const data = await r.json();
      if (!r.ok) {
        setFireMsg(`Error: ${data.error}`);
      } else {
        setFireMsg(`✓ Pulse fired — integrity ${data.trustVelocity.toFixed(2)}% · status ${data.status}`);
        await fetchPulses();
      }
    } catch {
      setFireMsg("Network error");
    } finally {
      setFiring(false);
    }
  };

  const riskState =
    activeMutations > 5 ? "BREACH" :
    activeMutations >= 3 ? "WARNING" : "NOMINAL";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Radio style={{ width: 20, height: 20, color: C.sage }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", letterSpacing: "-0.01em", color: "#fff", margin: 0 }}>
              Live Pulse Feed
            </h1>
            <div style={{
              fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
              padding: "3px 8px", borderRadius: 5, color: C.sage,
              border: `1px solid ${C.sage}`, background: `${C.sage}15`,
            }}>
              SYSTEM PULSE
            </div>
          </div>
          <p style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", color: C.dimText, margin: 0 }}>
            Global System Trust Velocity · ML-DSA-87 (FIPS-204 SL5) · 6-hour rolling window
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="sm"
              onClick={handleFireNow}
              disabled={firing}
              className="font-mono text-xs gap-1.5 h-8"
              style={{ background: firing ? `${C.honey}80` : C.honey, color: "#0a0f13", border: "none" }}
            >
              <Zap className="w-3.5 h-3.5" />
              {firing ? "Firing…" : "Fire Pulse Now"}
            </Button>
          </div>
          {fireMsg && (
            <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textAlign: "right", maxWidth: 260, color: fireMsg.startsWith("✓") ? C.sage : C.terra }}>
              {fireMsg}
            </div>
          )}
          {lastRefresh && (
            <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: C.dimText }}>
              live · synced {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* ── FIPS-204 primary badge + countdown ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <Fips204Badge />

        {/* Countdown + Risk Horizon sync */}
        <div style={{ display: "flex", gap: 12 }}>
          {lastFiredAt && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10,
              background: C.panel, border: `1px solid ${C.border}`,
            }}>
              <Clock style={{ width: 14, height: 14, color: C.dimText }} />
              <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: C.dimText }}>Next pulse</span>
              <span style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: C.honey }}>{countdown}</span>
            </div>
          )}

          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10,
            background: C.panel,
            border: `1px solid ${riskState === "BREACH" ? C.terra : riskState === "WARNING" ? C.honey : C.border}`,
          }}>
            <ShieldCheck style={{
              width: 14, height: 14,
              color: riskState === "BREACH" ? C.terra : riskState === "WARNING" ? C.honey : C.sage,
            }} />
            <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: C.dimText }}>Risk Horizon</span>
            <span style={{
              fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
              color: riskState === "BREACH" ? C.terra : riskState === "WARNING" ? C.honey : C.sage,
            }}>
              {riskState}
            </span>
            <span style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: C.dimText }}>
              ({activeMutations} mutations)
            </span>
          </div>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <StatsBar pulses={pulses} />

      {/* ── Pulse feed ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "64px 0", fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: C.dimText }}>
          Loading pulse feed…
        </div>
      ) : pulses.length === 0 ? (
        <div style={{ borderRadius: 10, padding: 40, textAlign: "center", background: C.panel, border: `1px solid ${C.border}` }}>
          <Radio style={{ width: 32, height: 32, margin: "0 auto 12px", color: C.dimText, opacity: 0.4 }} />
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: C.dimText, marginBottom: 6 }}>No pulses recorded yet</div>
          <div style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", color: C.dimText, marginBottom: 16 }}>
            The first pulse fires 30 seconds after API server startup, or click "Fire Pulse Now".
          </div>
          <Button
            size="sm"
            onClick={handleFireNow}
            disabled={firing}
            style={{ background: C.honey, color: "#0a0f13", border: "none" }}
            className="font-mono text-xs gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            {firing ? "Firing…" : "Fire First Pulse"}
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pulses.map((entry, i) => (
            <PulseCard key={entry.id} entry={entry} isLatest={i === 0} />
          ))}
        </div>
      )}

      {/* ── How it works ── */}
      <div style={{
        borderRadius: 10, padding: 16, fontSize: 10, fontFamily: "JetBrains Mono, monospace", lineHeight: 1.8,
        background: C.panel, border: `1px solid ${C.border}`, color: C.dimText,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "#cdd5e0" }}>HOW SYSTEM PULSE WORKS</div>
        <div>① Every 6 hours the Pulse Engine queries all audit_logs in the rolling window.</div>
        <div>② System Trust Velocity = (events with ML-DSA-87 pq_signature) ÷ (total events) × 100</div>
        <div>③ Status is rated NOMINAL / ELEVATED / CRITICAL based on velocity and anomaly count.</div>
        <div>④ Each pulse is persisted to the pulse_logs table and shown in this feed.</div>
        <div>⑤ The feed auto-refreshes every 30 seconds. Use "Fire Pulse Now" for an instant snapshot.</div>
        <div>⑥ Risk Horizon syncs live from the Swarm Map via the Forensic Inspector context.</div>
      </div>
    </div>
  );
}
