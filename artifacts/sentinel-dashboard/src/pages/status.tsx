/**
 * System Status — /status
 *
 * Public-facing sovereign heartbeat display.
 *
 * • Animated "heartbeat" SVG that pulses on each successful verification
 * • Global Integrity Index arc dial
 * • Swarm Vitality (active vs revoked) + Quantum Throughput KPIs
 * • Pulse History — last 10 snapshots (Timestamp | Integrity % | Status)
 * • "Verify Pulse" — runs live QL-2.0 ML-DSA-87 check on the current pulse's signature
 * • UNDER INVESTIGATION lockout overlay when integrity < 99.9%
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Zap, Activity, RefreshCw, Lock, Cpu, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Design tokens ─────────────────────────────────────────────────────────
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

interface SovereignPulse {
  id:                   string;
  createdAt:            string;
  globalIntegrityIndex: number;
  totalEvents:          number;
  verifiedEvents:       number;
  activeSwarms:         number;
  revokedSwarms:        number;
  quantumThroughputBits: string;
  status:               "NOMINAL" | "ALERT" | "UNDER_INVESTIGATION";
  faultReason:          string | null;
  pulsePayload:         string;
  windowHours:          number;
  signature: {
    version:              string;
    sha512Prefix:         string;
    algorithm:            string;
    publicKeyFingerprint: string;
    fipsStandard:         string;
    securityLevel:        number;
    signedAt:             string;
  } | null;
}

interface VerifyResult {
  verifyStatus:         "QUANTUM-SECURE" | "PARTIAL" | "UNVERIFIED";
  sha512Verified:       boolean;
  mlDsa87Verified:      boolean;
  publicKeyFingerprint: string | null;
  signedAt:             string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function statusColor(s: string) {
  if (s === "ALERT" || s === "UNDER_INVESTIGATION") return C.terra;
  return C.sage;
}

function formatBits(bits: string): string {
  const n = BigInt(bits);
  if (n >= 1_000_000_000_000n) return `${(Number(n) / 1e12).toFixed(2)} Tbits`;
  if (n >= 1_000_000_000n)     return `${(Number(n) / 1e9).toFixed(2)} Gbits`;
  if (n >= 1_000_000n)         return `${(Number(n) / 1e6).toFixed(2)} Mbits`;
  if (n >= 1_000n)             return `${(Number(n) / 1e3).toFixed(2)} Kbits`;
  return `${n} bits`;
}

// ── Heartbeat Animation ───────────────────────────────────────────────────

function HeartbeatAnimation({ pulse, status }: { pulse: boolean; status: string }) {
  const col = statusColor(status);

  // SVG ECG-style heartbeat path
  return (
    <div className="relative flex items-center justify-center w-full h-24 overflow-hidden">
      {/* Glow behind line */}
      <div
        className="absolute inset-0 rounded-lg"
        style={{ background: `radial-gradient(ellipse at center, ${col}08 0%, transparent 70%)` }}
      />
      <svg width="320" height="64" viewBox="0 0 320 64" className="overflow-visible">
        {/* Flat line segments + spike */}
        <path
          d="M0,32 L60,32 L80,32 L90,8 L100,56 L110,20 L120,44 L130,32 L320,32"
          fill="none"
          stroke={col}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: `drop-shadow(0 0 4px ${col})`,
            opacity: 0.9,
          }}
        />
        {/* Animated pulse dot */}
        <circle r="4" fill={col} style={{ filter: `drop-shadow(0 0 6px ${col})` }}>
          <animateMotion
            dur={pulse ? "1.2s" : "2.4s"}
            repeatCount="indefinite"
            path="M0,32 L60,32 L80,32 L90,8 L100,56 L110,20 L120,44 L130,32 L320,32"
          />
        </circle>
      </svg>
    </div>
  );
}

// ── Integrity Arc Dial ────────────────────────────────────────────────────

function IntegrityArc({ value, status }: { value: number; status: string }) {
  const r    = 52;
  const circ = 2 * Math.PI * r;
  // Only the top 270° of the circle is used (sweeping from 135° to 405°)
  const sweep  = (value / 100) * (circ * 0.75);
  const col    = statusColor(status);

  return (
    <div className="relative flex items-center justify-center w-36 h-36">
      <svg width="144" height="144" className="absolute">
        {/* Background arc */}
        <circle
          cx="72" cy="72" r={r}
          fill="none" stroke={C.border} strokeWidth="10"
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          transform="rotate(135 72 72)"
        />
        {/* Value arc */}
        <circle
          cx="72" cy="72" r={r}
          fill="none" stroke={col} strokeWidth="10"
          strokeDasharray={`${sweep} ${circ}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          transform="rotate(135 72 72)"
          style={{ transition: "stroke-dasharray 0.8s ease", filter: `drop-shadow(0 0 6px ${col}88)` }}
        />
      </svg>
      <div className="z-10 flex flex-col items-center">
        <span className="text-2xl font-bold font-mono" style={{ color: col }}>
          {value.toFixed(2)}%
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest mt-0.5" style={{ color: C.dimText }}>
          integrity
        </span>
      </div>
    </div>
  );
}

// ── Under Investigation Overlay ───────────────────────────────────────────

function InvestigationOverlay({ reason }: { reason: string | null }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: `${C.bg}f0`,
        backdropFilter: "blur(12px)",
      }}
    >
      <Lock className="w-16 h-16 mb-4" style={{ color: C.terra }} />
      <div className="text-2xl font-mono font-bold mb-2" style={{ color: C.terra }}>
        SYSTEM UNDER INVESTIGATION
      </div>
      <div className="text-sm font-mono text-center max-w-md px-4" style={{ color: C.dimText }}>
        {reason ?? "Global Integrity Index has fallen below the 99.9% threshold. The Sovereign Pulse Engine has flagged this system for investigation."}
      </div>
      <div
        className="mt-6 px-4 py-2 rounded font-mono text-xs"
        style={{ background: `${C.terra}15`, border: `1px solid ${C.terra}`, color: C.terra }}
      >
        WAR ROOM HAS BEEN NOTIFIED — OPERATORS ALERTED
      </div>
    </div>
  );
}

// ── Verify Pulse Result Panel ─────────────────────────────────────────────

function VerifyPanel({ result, onClose }: { result: VerifyResult; onClose: () => void }) {
  const secure = result.verifyStatus === "QUANTUM-SECURE";
  const col    = secure ? C.sage : result.verifyStatus === "PARTIAL" ? C.honey : C.terra;

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: C.panel, border: `1px solid ${col}`, boxShadow: `0 0 16px ${col}22` }}
    >
      <div className="flex items-center gap-2 mb-3">
        {secure
          ? <CheckCircle2 className="w-5 h-5" style={{ color: C.sage }} />
          : <XCircle className="w-5 h-5" style={{ color: C.terra }} />}
        <span className="font-mono font-bold text-sm" style={{ color: col }}>
          {result.verifyStatus} — ML-DSA-87 Signature Check
        </span>
        <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto h-6 px-2 font-mono text-xs">
          ✕
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        {[
          { label: "SHA-512 Layer",  value: result.sha512Verified  ? "VERIFIED ✓" : "FAILED ✗",  ok: result.sha512Verified },
          { label: "ML-DSA-87 Layer", value: result.mlDsa87Verified ? "VERIFIED ✓" : "FAILED ✗", ok: result.mlDsa87Verified },
          { label: "Algorithm",      value: "ML-DSA-87 (FIPS-204 SL5)",  ok: true },
          { label: "Key Fingerprint", value: result.publicKeyFingerprint ?? "—", ok: true },
          { label: "Signed At",      value: result.signedAt ? new Date(result.signedAt).toLocaleString() : "—", ok: true },
          { label: "Overall",        value: result.verifyStatus,          ok: secure },
        ].map((row) => (
          <div key={row.label} className="rounded p-2" style={{ background: `${C.bg}80` }}>
            <div style={{ color: C.dimText }}>{row.label}</div>
            <div style={{ color: row.ok ? C.sage : C.terra }}>{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pulse History Row ─────────────────────────────────────────────────────

function HistoryRow({ p, idx, onVerify, isVerifying }: {
  p: SovereignPulse; idx: number; onVerify: (id: string) => void; isVerifying: boolean;
}) {
  const col = statusColor(p.status);
  const dt  = new Date(p.createdAt);
  const ts  = `${dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })} ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded"
      style={{
        background: idx === 0 ? `${col}0e` : `${C.bg}60`,
        border: `1px solid ${idx === 0 ? col + "44" : C.border}`,
      }}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono" style={{ color: C.dimText }}>{ts}</span>
          <span className="text-[11px] font-mono font-bold" style={{ color: col }}>
            {p.globalIntegrityIndex.toFixed(4)}%
          </span>
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: `${col}20`, color: col, border: `1px solid ${col}44` }}
          >
            {p.status}
          </span>
          <span className="text-[9px] font-mono ml-auto" style={{ color: C.dimText }}>
            {p.totalEvents.toLocaleString()} events · {p.activeSwarms} active swarms
          </span>
        </div>
        {p.faultReason && (
          <div className="text-[9px] font-mono mt-0.5 truncate" style={{ color: C.terra }}>
            {p.faultReason}
          </div>
        )}
      </div>
      {idx === 0 && (
        <Button
          size="sm"
          onClick={() => onVerify(p.id)}
          disabled={isVerifying}
          className="h-6 px-2 font-mono text-[10px] flex-shrink-0 gap-1"
          style={{ background: C.sage, color: "#0a0f13", border: "none" }}
        >
          <ShieldCheck className="w-3 h-3" />
          {isVerifying ? "Verifying…" : "Verify"}
        </Button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [latest,   setLatest]   = useState<SovereignPulse | null>(null);
  const [history,  setHistory]  = useState<SovereignPulse[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [heartbeat, setHeartbeat] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [pulseFiring, setPulseFiring] = useState(false);
  const [pulseMsg, setPulseMsg] = useState<string | null>(null);
  const [fault, setFault] = useState<{ message: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const [latestRes, historyRes] = await Promise.all([
        fetch(`${BASE}/api/v1/status`),
        fetch(`${BASE}/api/v1/status/history?limit=10`),
      ]);
      const latestData  = await latestRes.json();
      const historyData = await historyRes.json();

      if (latestData.id) {
        setLatest(latestData);
        setHeartbeat((prev) => !prev); // toggle to retrigger animation
      }
      if (historyData.pulses) {
        setHistory(historyData.pulses);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus]);

  // WebSocket — listen for pulse_fault
  useEffect(() => {
    const ws = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${BASE}/api/v1/ws`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "pulse_fault") {
          setFault({ message: msg.data?.faultReason ?? "Integrity fault detected" });
          fetchStatus();
        }
      } catch {}
    };
    return () => ws.close();
  }, [fetchStatus]);

  const handleVerify = async (id: string) => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const r = await fetch(`${BASE}/api/v1/status/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await r.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ verifyStatus: "UNVERIFIED", sha512Verified: false, mlDsa87Verified: false, publicKeyFingerprint: null, signedAt: null });
    } finally {
      setVerifying(false);
    }
  };

  const handleFirePulse = async () => {
    setPulseFiring(true);
    setPulseMsg(null);
    try {
      const r = await fetch(`${BASE}/api/v1/status/pulse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowHours: 6 }),
      });
      const data = await r.json();
      if (!r.ok) { setPulseMsg(`Error: ${data.error}`); return; }
      setPulseMsg(`✓ Pulse fired — integrity ${data.globalIntegrityIndex.toFixed(4)}% · ${data.status}`);
      await fetchStatus();
    } catch { setPulseMsg("Network error"); }
    finally { setPulseFiring(false); }
  };

  // UNDER INVESTIGATION lockout
  const isUnderInvestigation = latest?.status === "UNDER_INVESTIGATION";
  const isAlert = latest?.status === "ALERT";

  return (
    <div className="space-y-6">
      {/* UNDER_INVESTIGATION hard lockout */}
      {isUnderInvestigation && (
        <InvestigationOverlay reason={latest.faultReason} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-5 h-5" style={{ color: C.sage }} />
            <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground">
              System Status
            </h1>
            <div
              className="text-[10px] font-mono px-2 py-0.5 rounded border font-bold"
              style={{
                color:        statusColor(latest?.status ?? "NOMINAL"),
                borderColor:  statusColor(latest?.status ?? "NOMINAL"),
                background:   `${statusColor(latest?.status ?? "NOMINAL")}15`,
              }}
            >
              {latest?.status ?? "BOOTSTRAPPING"}
            </div>
          </div>
          <p className="text-sm font-mono" style={{ color: C.dimText }}>
            Sovereign Pulse Engine · QL-2.0 self-signed snapshots · ML-DSA-87 (FIPS-204 SL5)
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline" onClick={fetchStatus}
              className="font-mono text-xs gap-1.5 h-8"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
            <Button
              size="sm" onClick={handleFirePulse} disabled={pulseFiring}
              className="font-mono text-xs gap-1.5 h-8"
              style={{ background: pulseFiring ? `${C.honey}80` : C.honey, color: "#0a0f13", border: "none" }}
            >
              <Zap className="w-3.5 h-3.5" />
              {pulseFiring ? "Firing…" : "Fire Sovereign Pulse"}
            </Button>
          </div>
          {pulseMsg && (
            <div className="text-[10px] font-mono" style={{ color: pulseMsg.startsWith("✓") ? C.sage : C.terra }}>
              {pulseMsg}
            </div>
          )}
        </div>
      </div>

      {/* Pulse Fault Banner */}
      {(isAlert || fault) && !isUnderInvestigation && (
        <div
          className="rounded-lg p-3 flex items-start gap-3"
          style={{ background: `${C.terra}12`, border: `1px solid ${C.terra}` }}
        >
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.terra }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono font-bold mb-0.5" style={{ color: C.terra }}>
              PULSE FAULT — WAR ROOM NOTIFIED
            </div>
            <div className="text-[11px] font-mono" style={{ color: C.dimText }}>
              {latest?.faultReason ?? fault?.message ?? "Global Integrity Index below 99.9% threshold"}
            </div>
          </div>
          {fault && (
            <button onClick={() => setFault(null)} className="text-[10px] font-mono ml-auto" style={{ color: C.dimText }}>
              ✕
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 font-mono text-sm" style={{ color: C.dimText }}>
          Loading sovereign pulse data…
        </div>
      ) : !latest ? (
        <div
          className="rounded-lg p-10 text-center"
          style={{ background: C.panel, border: `1px solid ${C.border}` }}
        >
          <Activity className="w-8 h-8 mx-auto mb-3" style={{ color: C.dimText }} />
          <div className="font-mono font-bold mb-1" style={{ color: C.dimText }}>
            No sovereign pulse data yet
          </div>
          <div className="text-xs font-mono mb-4" style={{ color: C.dimText }}>
            First pulse fires ~45 seconds after API server startup. Click below to fire immediately.
          </div>
          <Button
            size="sm" onClick={handleFirePulse} disabled={pulseFiring}
            style={{ background: C.honey, color: "#0a0f13", border: "none" }}
            className="font-mono text-xs gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            {pulseFiring ? "Firing…" : "Fire First Sovereign Pulse"}
          </Button>
        </div>
      ) : (
        <>
          {/* Heartbeat + metrics row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Left: Heartbeat + dial */}
            <div
              className="md:col-span-1 rounded-lg p-4 flex flex-col items-center gap-4"
              style={{ background: C.panel, border: `1px solid ${statusColor(latest.status)}44` }}
            >
              <HeartbeatAnimation pulse={heartbeat} status={latest.status} />
              <IntegrityArc value={latest.globalIntegrityIndex} status={latest.status} />
              <div className="text-[9px] font-mono text-center" style={{ color: C.dimText }}>
                {latest.verifiedEvents.toLocaleString()} / {latest.totalEvents.toLocaleString()} events ML-DSA-87 verified
              </div>
              {latest.signature && (
                <div className="text-[9px] font-mono text-center opacity-60" style={{ color: C.dimText }}>
                  Signed · {latest.signature.algorithm} · FIPS-204 SL{latest.signature.securityLevel}<br />
                  Key: {latest.signature.publicKeyFingerprint}
                </div>
              )}
            </div>

            {/* Right: KPI grid */}
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              {[
                {
                  icon:    <ShieldCheck className="w-5 h-5" />,
                  label:   "Global Integrity Index",
                  value:   `${latest.globalIntegrityIndex.toFixed(4)}%`,
                  sub:     "Lifetime · all ledger events",
                  color:   statusColor(latest.status),
                },
                {
                  icon:    <Activity className="w-5 h-5" />,
                  label:   "Swarm Vitality",
                  value:   `${latest.activeSwarms} active`,
                  sub:     `${latest.revokedSwarms} revoked / offline`,
                  color:   latest.revokedSwarms > 0 ? C.honey : C.sage,
                },
                {
                  icon:    <Zap className="w-5 h-5" />,
                  label:   "Quantum Throughput",
                  value:   formatBits(latest.quantumThroughputBits),
                  sub:     `${latest.windowHours}h window · ML-DSA-87 sigBytes × 8`,
                  color:   C.blue,
                },
                {
                  icon:    <Cpu className="w-5 h-5" />,
                  label:   "Lattice Params",
                  value:   "k=8  l=7",
                  sub:     "FIPS-204 SL5 · λ=256 bits · q=8,380,417",
                  color:   C.dimText,
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-lg p-3 flex flex-col gap-1"
                  style={{ background: C.panel, border: `1px solid ${C.border}` }}
                >
                  <div className="opacity-70" style={{ color: kpi.color }}>{kpi.icon}</div>
                  <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: C.dimText }}>
                    {kpi.label}
                  </div>
                  <div className="text-xl font-bold font-mono" style={{ color: kpi.color }}>
                    {kpi.value}
                  </div>
                  <div className="text-[9px] font-mono" style={{ color: C.dimText }}>
                    {kpi.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Verify result */}
          {verifyResult && (
            <VerifyPanel result={verifyResult} onClose={() => setVerifyResult(null)} />
          )}

          {/* Pulse History */}
          <div className="rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4" style={{ color: C.sage }} />
              <span className="font-mono text-sm font-bold" style={{ color: "#cdd5e0" }}>
                Pulse History
              </span>
              <span className="text-[10px] font-mono ml-auto" style={{ color: C.dimText }}>
                Last {history.length} sovereign snapshots · QL-2.0 self-signed
              </span>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-6 text-xs font-mono" style={{ color: C.dimText }}>
                No history yet
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((p, i) => (
                  <HistoryRow
                    key={p.id}
                    p={p}
                    idx={i}
                    onVerify={handleVerify}
                    isVerifying={verifying}
                  />
                ))}
              </div>
            )}
          </div>

          {/* How it works */}
          <div
            className="rounded-lg p-4 text-[10px] font-mono leading-relaxed"
            style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.dimText }}
          >
            <div className="font-bold mb-1" style={{ color: "#cdd5e0" }}>HOW THE SOVEREIGN PULSE ENGINE WORKS</div>
            <div className="space-y-0.5">
              <div>① Every 6 hours PulseEngine.execute() aggregates across the ENTIRE audit_logs ledger.</div>
              <div>② Global Integrity Index = (rows with pq_signature IS NOT NULL) ÷ (total rows) × 100</div>
              <div>③ Swarm Vitality = active vs. revoked agent_sessions at snapshot time.</div>
              <div>④ Quantum Throughput = verified events in window × 4,595 bytes (ML-DSA-87) × 8 bits/byte.</div>
              <div>⑤ A canonical payload string is built from all metrics and self-signed with QL-2.0 Master Key.</div>
              <div>⑥ The HybridSignatureEnvelope (SHA-512 + ML-DSA-87) is stored in system_pulses.pulse_signature.</div>
              <div>⑦ If integrity &lt; 99.9%, a pulse_fault WebSocket event is broadcast to the War Room.</div>
              <div>⑧ "Verify Pulse" replays the canonical payload against the stored signature — both layers must pass.</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
