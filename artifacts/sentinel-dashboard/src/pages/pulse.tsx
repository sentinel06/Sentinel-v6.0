/**
 * Live Pulse Feed — /pulse
 *
 * Displays the automated 6-hour "System Trust Velocity" pulses in a
 * timeline-style feed, mirroring what is posted to X (Twitter).
 *
 * Features:
 * - Auto-refreshes every 30 seconds
 * - Shows trust velocity gauge, status badge, tweet link
 * - Manual "Fire Pulse Now" button for immediate posting
 * - Countdown to next scheduled pulse
 * - Twitter/X credentials status banner
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Radio, RefreshCw, Zap, ExternalLink, Clock, CheckCircle2, AlertTriangle, XCircle, Twitter, Shield, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Design tokens (Sentinel Zen palette) ──────────────────────────────────
const C = {
  sage:    "#40B595",
  honey:   "#EBC06D",
  terra:   "#D96161",
  panel:   "#161B22",
  border:  "#2C3136",
  dimText: "#9AA4B1",
  blue:    "#5B8DEF",
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
    <div className="relative flex items-center justify-center w-20 h-20">
      <svg width="80" height="80" className="-rotate-90">
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
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-bold font-mono" style={{ color: col }}>
          {value.toFixed(1)}%
        </span>
        <span className="text-[8px] font-mono" style={{ color: C.dimText }}>trust</span>
      </div>
    </div>
  );
}

// ── Countdown Timer ───────────────────────────────────────────────────────

function useCountdown(lastFiredAt: string | null): string {
  const [display, setDisplay] = useState("--:--:--");

  useEffect(() => {
    if (!lastFiredAt) {
      setDisplay("--:--:--");
      return;
    }
    const next = new Date(lastFiredAt).getTime() + 6 * 60 * 60 * 1000;
    const tick = () => {
      const diff = next - Date.now();
      if (diff <= 0) {
        setDisplay("00:00:00");
        return;
      }
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
  const dt    = new Date(entry.firedAt);
  const dateStr = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div
      className="rounded-lg p-4 relative"
      style={{
        background:  C.panel,
        border:      `1px solid ${isLatest ? statusColor(entry.status) : C.border}`,
        boxShadow:   isLatest ? `0 0 12px ${statusColor(entry.status)}22` : undefined,
      }}
    >
      {isLatest && (
        <div
          className="absolute top-3 right-3 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full animate-pulse"
          style={{ background: `${statusColor(entry.status)}22`, color: statusColor(entry.status), border: `1px solid ${statusColor(entry.status)}` }}
        >
          LATEST
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start gap-4">
        <VelocityRing value={entry.trustVelocity} status={entry.status} />

        <div className="flex-1 min-w-0">
          {/* Status + time */}
          <div className="flex items-center gap-2 mb-1">
            {statusIcon(entry.status)}
            <span className="text-[11px] font-mono font-bold" style={{ color: statusColor(entry.status) }}>
              {entry.status} {statusEmoji(entry.status)}
            </span>
            <span className="text-[10px] font-mono ml-auto" style={{ color: C.dimText }}>
              {dateStr} · {timeStr}
            </span>
          </div>

          {/* Tweet text */}
          <div
            className="font-mono text-[11px] leading-relaxed rounded p-2.5 mb-3 break-all"
            style={{ background: `${C.bg}80`, border: `1px solid ${C.border}`, color: "#cdd5e0" }}
          >
            {entry.message}
          </div>

          {/* KPI chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            <Chip label="Events" value={entry.totalEvents.toLocaleString()} color={C.dimText} />
            <Chip label="QL-2.0 Verified" value={entry.verifiedEvents.toLocaleString()} color={C.sage} />
            <Chip label="Anomalies" value={String(entry.anomalyCount)} color={entry.anomalyCount > 0 ? C.terra : C.sage} />
            <Chip label="Window" value={`${entry.windowHours}h`} color={C.dimText} />
          </div>

          {/* Twitter / X link or error */}
          {entry.tweetUrl ? (
            <a
              href={entry.tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] font-mono rounded px-2.5 py-1 transition-opacity hover:opacity-80"
              style={{ background: "#1a1f2e", border: `1px solid #2563eb44`, color: "#5B8DEF" }}
            >
              <Twitter className="w-3 h-3" />
              View on X / Twitter
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ) : entry.tweetError ? (
            <div className="inline-flex items-center gap-1.5 text-[10px] font-mono" style={{ color: C.dimText }}>
              <Twitter className="w-3 h-3" style={{ color: C.dimText }} />
              <span>{entry.tweetError.startsWith("Twitter keys") ? "Logged locally — Twitter keys not configured" : `Post failed: ${entry.tweetError.slice(0, 60)}`}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono"
      style={{ background: `${color}15`, border: `1px solid ${color}33` }}
    >
      <span style={{ color: C.dimText }}>{label}</span>
      <span style={{ color }} className="font-bold">{value}</span>
    </div>
  );
}

// ── Header stats bar ──────────────────────────────────────────────────────

function StatsBar({ pulses }: { pulses: PulseEntry[] }) {
  if (pulses.length === 0) return null;
  const avgVel = pulses.reduce((a, p) => a + p.trustVelocity, 0) / pulses.length;
  const totalAnomalies = pulses.reduce((a, p) => a + p.anomalyCount, 0);
  const tweeted = pulses.filter((p) => p.tweetId).length;
  const criticals = pulses.filter((p) => p.status === "CRITICAL").length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: "Avg Trust Velocity", value: `${avgVel.toFixed(2)}%`, color: C.sage, icon: <Shield className="w-4 h-4" /> },
        { label: "Total Anomalies", value: totalAnomalies.toString(), color: totalAnomalies > 0 ? C.terra : C.sage, icon: <AlertTriangle className="w-4 h-4" /> },
        { label: "Posted to X", value: `${tweeted} / ${pulses.length}`, color: C.blue, icon: <Twitter className="w-4 h-4" /> },
        { label: "CRITICAL Pulses", value: criticals.toString(), color: criticals > 0 ? C.terra : C.sage, icon: <Activity className="w-4 h-4" /> },
      ].map((s) => (
        <div key={s.label} className="rounded-lg p-3 flex items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <div className="opacity-70" style={{ color: s.color }}>{s.icon}</div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: C.dimText }}>{s.label}</div>
            <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
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
      // ignore — keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPulses();
    intervalRef.current = setInterval(fetchPulses, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
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
    } catch (e) {
      setFireMsg("Network error");
    } finally {
      setFiring(false);
    }
  };

  const twitterConfigured = pulses.length > 0 && pulses.some((p) => p.tweetId);
  const twitterStatus = pulses.length === 0 ? "unknown" :
    pulses[0]!.tweetId ? "active" :
    (pulses[0]!.tweetError?.startsWith("Twitter keys") ? "unconfigured" : "error");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-5 h-5" style={{ color: C.sage }} />
            <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground">
              Live Pulse Feed
            </h1>
            <div className="text-[10px] font-mono px-2 py-0.5 rounded border font-bold" style={{ color: C.sage, borderColor: C.sage, background: `${C.sage}15` }}>
              SYSTEM PULSE
            </div>
          </div>
          <p className="text-sm font-mono" style={{ color: C.dimText }}>
            Global System Trust Velocity · ML-DSA-87 (FIPS-204 SL5) · auto-posted to X every 6 hours
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchPulses}
              className="font-mono text-xs gap-1.5 h-8"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
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
            <div
              className="text-[10px] font-mono text-right max-w-[260px]"
              style={{ color: fireMsg.startsWith("✓") ? C.sage : C.terra }}
            >
              {fireMsg}
            </div>
          )}
          {lastRefresh && (
            <div className="text-[9px] font-mono" style={{ color: C.dimText }}>
              refreshed {lastRefresh.toLocaleTimeString()} · auto in 30s
            </div>
          )}
        </div>
      </div>

      {/* Twitter config banner */}
      <div
        className="rounded-lg p-3 flex items-center gap-3"
        style={{
          background: twitterStatus === "active" ? `${C.sage}10` : twitterStatus === "error" ? `${C.terra}10` : `${C.dimText}10`,
          border: `1px solid ${twitterStatus === "active" ? C.sage : twitterStatus === "error" ? C.terra : C.border}`,
        }}
      >
        <Twitter className="w-4 h-4 flex-shrink-0" style={{ color: twitterStatus === "active" ? C.sage : C.dimText }} />
        <div className="flex-1 min-w-0">
          {twitterStatus === "active" && (
            <span className="text-xs font-mono" style={{ color: C.sage }}>
              X / Twitter integration <strong>active</strong> — pulses are posted automatically every 6 hours
            </span>
          )}
          {twitterStatus === "unconfigured" && (
            <span className="text-xs font-mono" style={{ color: C.dimText }}>
              X / Twitter posting not configured — add <code className="text-[10px] px-1 rounded" style={{ background: C.panel }}>TWITTER_API_KEY</code>,{" "}
              <code className="text-[10px] px-1 rounded" style={{ background: C.panel }}>TWITTER_API_SECRET</code>,{" "}
              <code className="text-[10px] px-1 rounded" style={{ background: C.panel }}>TWITTER_ACCESS_TOKEN</code>, and{" "}
              <code className="text-[10px] px-1 rounded" style={{ background: C.panel }}>TWITTER_ACCESS_TOKEN_SECRET</code> to Replit Secrets to enable it
            </span>
          )}
          {twitterStatus === "error" && (
            <span className="text-xs font-mono" style={{ color: C.terra }}>
              X / Twitter posting failed — check your API keys in Replit Secrets
            </span>
          )}
          {twitterStatus === "unknown" && (
            <span className="text-xs font-mono" style={{ color: C.dimText }}>
              No pulses yet — fire the first pulse to test Twitter/X connectivity
            </span>
          )}
        </div>

        {/* Next pulse countdown */}
        {lastFiredAt && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Clock className="w-3.5 h-3.5" style={{ color: C.dimText }} />
            <span className="text-[10px] font-mono" style={{ color: C.dimText }}>
              Next pulse in
            </span>
            <span className="text-[11px] font-mono font-bold" style={{ color: C.honey }}>
              {countdown}
            </span>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <StatsBar pulses={pulses} />

      {/* Pulse feed */}
      {loading ? (
        <div className="text-center py-16 font-mono text-sm" style={{ color: C.dimText }}>
          Loading pulse feed…
        </div>
      ) : pulses.length === 0 ? (
        <div
          className="rounded-lg p-10 text-center"
          style={{ background: C.panel, border: `1px solid ${C.border}` }}
        >
          <Radio className="w-8 h-8 mx-auto mb-3" style={{ color: C.dimText }} />
          <div className="font-mono font-bold mb-1" style={{ color: C.dimText }}>No pulses recorded yet</div>
          <div className="text-xs font-mono mb-4" style={{ color: C.dimText }}>
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
        <div className="space-y-4">
          {pulses.map((entry, i) => (
            <PulseCard key={entry.id} entry={entry} isLatest={i === 0} />
          ))}
        </div>
      )}

      {/* How it works footer */}
      <div
        className="rounded-lg p-4 text-[10px] font-mono leading-relaxed"
        style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.dimText }}
      >
        <div className="font-bold mb-1" style={{ color: "#cdd5e0" }}>HOW SYSTEM PULSE WORKS</div>
        <div className="space-y-0.5">
          <div>① Every 6 hours the Pulse Engine queries all audit_logs in the rolling window.</div>
          <div>② System Trust Velocity = (events with ML-DSA-87 pq_signature) ÷ (total events) × 100</div>
          <div>③ Status is rated NOMINAL / ELEVATED / CRITICAL based on velocity and anomaly count.</div>
          <div>④ A formatted status message is posted to X via the Twitter v2 API (OAuth 1.0a).</div>
          <div>⑤ Each pulse is persisted to the pulse_logs table and shown in this feed.</div>
          <div>⑥ The feed auto-refreshes every 30 seconds. Use "Fire Pulse Now" for an instant snapshot.</div>
        </div>
      </div>
    </div>
  );
}
