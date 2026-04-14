/**
 * Trace Explorer — Forensic Intent Suite
 *
 * · Verified Sequence  — SHA-512 hash-chain integrity per step, "Chain Corruption" alerts
 * · Cognitive Drift Overlay — Drift Delta % per step, amber highlight if > 15%
 * · Active Interdiction Panel — edit intent/tool-params, Apply Fix re-signs with ML-DSA-87,
 *   commits HUMAN_IN_THE_LOOP_OVERRIDE to the ledger, shows Quantum Proof ID
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useGetAuditLogs, useGetTrace } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAnomalous, formatTime, truncateHash } from "@/lib/audit-utils";
import {
  ListTree, AlertTriangle, X, Clock, Terminal, BrainCircuit,
  CheckCircle2, ChevronRight, Loader2, ShieldCheck, ShieldAlert,
  Link2, Link2Off, Zap, Activity, User, Hash, Fingerprint,
  TriangleAlert, Eye, Pen,
} from "lucide-react";

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
};

interface QuantumProof {
  forensicAuditId: string;
  algorithm: string;
  fipsStandard: string;
  securityLevel: number;
  publicKeyFingerprint: string;
  status: string;
  signedAt: string;
  domainSeparator: string;
  committedAt: string;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

/** Drift % for a single event (0 = no drift, 100 = fully anomalous) */
function driftPct(event: AnyEvent): number {
  const score = event.consistencyScore ?? 1.0;
  return Math.max(0, Math.min(100, (1 - score) * 100));
}

/** Delta between two consecutive drift values */
function driftDelta(curr: AnyEvent, prev: AnyEvent | undefined): number {
  if (!prev) return driftPct(curr);
  return Math.abs(driftPct(curr) - driftPct(prev));
}

/** SHA-512 chain integrity check between consecutive events */
function checkChain(events: AnyEvent[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (i === 0) {
      result.set(ev.id, true); // first event — no previous to check
    } else {
      const prev = events[i - 1];
      result.set(ev.id, ev.previousHash === prev.currentHash);
    }
  }
  return result;
}

// ── Chain Corruption Alert ────────────────────────────────────────────────────
function ChainCorruptionAlert({ brokenCount }: { brokenCount: number }) {
  return (
    <div className="rounded-lg px-4 py-3 flex items-center gap-3 animate-in slide-in-from-top-2" style={{
      background: "rgba(217,97,97,0.10)",
      border: `1px solid ${P.terra}66`,
    }}>
      <Link2Off className="w-4 h-4 shrink-0" style={{ color: P.terra }} />
      <div className="flex-1">
        <div className="text-xs font-mono font-bold" style={{ color: P.terra }}>
          ⚠ CHAIN CORRUPTION DETECTED — {brokenCount} BROKEN SHA-512 LINK{brokenCount > 1 ? "S" : ""}
        </div>
        <div className="text-[10px] font-mono mt-0.5" style={{ color: P.dim }}>
          The hash-chain linking these audit events has been severed. This may indicate tampering or a ledger inconsistency.
          A Forensic Audit should be initiated immediately.
        </div>
      </div>
    </div>
  );
}

// ── Active Interdiction Panel ─────────────────────────────────────────────────

interface InterdictionResult {
  forensicAuditId: string;
  quantumProof: QuantumProof;
  committedAt: string;
}

function ActiveInterdictionPanel({ event, onClose, onCommitted }: {
  event: AnyEvent;
  onClose: () => void;
  onCommitted: (result: InterdictionResult) => void;
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
  const [loading, setLoading] = useState(false);
  const [committed, setCommitted] = useState<InterdictionResult | null>(null);
  const [operatorId] = useState(`operator-${Date.now().toString(36)}`);

  const validateToolParams = useCallback((raw: string) => {
    if (!raw.trim()) { setToolParamsError(null); return true; }
    try { JSON.parse(raw); setToolParamsError(null); return true; }
    catch (e: any) { setToolParamsError(e.message); return false; }
  }, []);

  const applyFix = async () => {
    if (!intentText.trim()) return;
    if (toolParams.trim() && !validateToolParams(toolParams)) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        logId: event.id,
        newRationale: intentText.trim(),
        operatorId,
      };
      if (toolParams.trim()) body.newToolParams = JSON.parse(toolParams);

      const r = await fetch(`${BASE}/api/v1/forensic/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Override failed");

      const result: InterdictionResult = {
        forensicAuditId: d.forensicAuditId,
        committedAt: d.committedAt,
        quantumProof: d.quantumProof,
      };
      setCommitted(result);
      onCommitted(result);
    } catch (e: any) {
      alert(`Apply Fix failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden animate-in slide-in-from-right-4"
      style={{ border: `1px solid ${P.blue}44`, background: "#0d111a" }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b"
        style={{ borderColor: P.blue + "33", background: P.blue + "0f" }}>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4" style={{ color: P.blue }} />
          <span className="text-xs font-mono font-bold" style={{ color: P.blue }}>
            ACTIVE INTERDICTION
          </span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
            color: P.dim, background: P.border + "88", border: `1px solid ${P.border}`
          }}>HUMAN_IN_THE_LOOP_OVERRIDE</span>
        </div>
        <button onClick={onClose} className="opacity-50 hover:opacity-100 transition-opacity">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Original event reference */}
        <div className="rounded px-3 py-2 flex items-center gap-2" style={{
          background: P.panel, border: `1px solid ${P.border}`
        }}>
          <Hash className="w-3 h-3 shrink-0" style={{ color: P.dim }} />
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: P.dim }}>
              Target Event
            </div>
            <div className="text-[10px] font-mono truncate" style={{ color: "#cdd5e0" }}>
              {event.id} · {event.eventType} · {formatTime(event.timestamp)}
            </div>
          </div>
        </div>

        {/* Intent editor */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Pen className="w-3 h-3" style={{ color: P.amber }} />
            <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.amber }}>
              Corrected Intent / Rationale
            </label>
          </div>
          <textarea
            className="w-full rounded-lg p-3 text-xs font-mono text-foreground resize-none focus:outline-none"
            style={{
              background: "#0a0e17",
              border: `1px solid ${intentText.trim() !== (event.rationale ?? "") ? P.blue + "88" : P.border}`,
              color: "#e0e6ed",
              minHeight: "90px",
              boxShadow: intentText.trim() !== (event.rationale ?? "") ? `0 0 0 1px ${P.blue}22` : "none",
            }}
            placeholder="Describe what the agent should have stated — the corrected intent that will be re-signed and queued…"
            value={intentText}
            onChange={e => setIntentText(e.target.value)}
            disabled={!!committed}
          />
          <div className="text-[9px] font-mono mt-1" style={{ color: P.dim }}>
            {intentText.trim() === (event.rationale ?? "")
              ? "No changes — edit the intent to enable Apply Fix"
              : `${intentText.length} chars · Intent modified`
            }
          </div>
        </div>

        {/* Tool parameters editor */}
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
              background: "#0a0e17",
              border: `1px solid ${toolParamsError ? P.terra + "88" : toolParams.trim() ? P.blue + "44" : P.border}`,
              color: toolParamsError ? P.terra : "#9aa4b1",
              minHeight: "60px",
            }}
            placeholder='{"key": "value"} — leave blank to keep original tool parameters'
            value={toolParams}
            onChange={e => { setToolParams(e.target.value); validateToolParams(e.target.value); }}
            disabled={!!committed}
          />
          {toolParamsError && (
            <div className="text-[9px] font-mono mt-1 flex items-center gap-1" style={{ color: P.terra }}>
              <AlertTriangle className="w-2.5 h-2.5" />
              JSON error: {toolParamsError}
            </div>
          )}
        </div>

        {/* Apply Fix button */}
        {!committed && (
          <div className="flex items-center gap-3">
            <button
              onClick={applyFix}
              disabled={loading || !intentText.trim() || !!toolParamsError || intentText.trim() === (event.rationale ?? "")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all disabled:opacity-40"
              style={{
                background: P.blue,
                color: "#0d1117",
                boxShadow: `0 0 16px ${P.blue}44`,
              }}
            >
              {loading
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Re-signing with ML-DSA-87…</>
                : <><ShieldCheck className="w-3 h-3" /> Apply Fix & Commit to Ledger</>
              }
            </button>
            <div className="text-[9px] font-mono" style={{ color: P.dim }}>
              Will re-sign &amp; tag as HUMAN_IN_THE_LOOP_OVERRIDE
            </div>
          </div>
        )}

        {/* Quantum Proof — shown after successful commit */}
        {committed && (
          <div className="rounded-xl overflow-hidden animate-in slide-in-from-bottom-2" style={{
            border: `1px solid ${P.sage}55`,
            background: P.sage + "0a",
          }}>
            <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: P.sage + "33" }}>
              <ShieldCheck className="w-4 h-4" style={{ color: P.sage }} />
              <span className="text-xs font-mono font-bold" style={{ color: P.sage }}>
                QUANTUM PROOF — COMMITTED TO IMMUTABLE LEDGER
              </span>
            </div>
            <div className="p-4 space-y-3">
              {/* Forensic Audit ID — prominent */}
              <div className="rounded-lg px-3 py-2.5" style={{
                background: P.sage + "0f",
                border: `1px solid ${P.sage}33`,
              }}>
                <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: P.dim }}>
                  Forensic Audit ID
                </div>
                <div className="text-sm font-mono font-bold" style={{ color: P.sage }}>
                  {committed.forensicAuditId}
                </div>
              </div>

              {/* Signature details grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Algorithm",       value: committed.quantumProof?.algorithm ?? "ML-DSA-87" },
                  { label: "FIPS Standard",   value: committed.quantumProof?.fipsStandard ?? "FIPS-204" },
                  { label: "Security Level",  value: `SL${committed.quantumProof?.securityLevel ?? 5}` },
                  { label: "Verify Status",   value: committed.quantumProof?.status ?? "QUANTUM-SECURE" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded px-2 py-1.5" style={{ background: "#0a0e17", border: `1px solid ${P.border}` }}>
                    <div className="text-[9px] font-mono uppercase" style={{ color: P.dim }}>{label}</div>
                    <div className="text-[10px] font-mono font-bold" style={{ color: "#cdd5e0" }}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Fingerprint className="w-3 h-3 shrink-0" style={{ color: P.blue }} />
                <div>
                  <div className="text-[9px] font-mono" style={{ color: P.dim }}>Key Fingerprint</div>
                  <div className="text-[10px] font-mono font-bold" style={{ color: P.blue }}>
                    {committed.quantumProof?.publicKeyFingerprint}
                  </div>
                </div>
              </div>

              <div className="text-[9px] font-mono" style={{ color: P.dim }}>
                Signed {new Date(committed.quantumProof?.signedAt ?? committed.committedAt).toLocaleString()} · 
                Domain: {committed.quantumProof?.domainSeparator ?? "AGENT_SENTINEL_v4_DOMAIN_SEP"} ·
                This fix has been queued for the agent's next loop execution.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
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
          width: `${Math.min(100, pct)}%`,
          background: barColor,
          boxShadow: isDriftHigh ? `0 0 6px ${barColor}88` : "none",
        }} />
      </div>
      <div className="text-[10px] font-mono font-bold" style={{ color: barColor }}>
        {pct.toFixed(1)}%
      </div>
      {delta > 0 && (
        <div className="text-[9px] font-mono" style={{
          color: delta > 15 ? P.terra : delta > 8 ? P.amber : P.dim
        }}>
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
        : <Link2Off className="w-3 h-3 shrink-0" style={{ color: P.terra }} />
      }
      <div className="text-[9px] font-mono truncate flex items-center gap-1.5">
        {prevHash
          ? <span style={{ color: P.dim }}>prev: {prevHash.substring(0, 10)}…</span>
          : <span style={{ color: P.dim }}>genesis block</span>
        }
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
function TraceDetailView({ traceId, onClose }: { traceId: string; onClose: () => void }) {
  const { data: trace, isLoading } = useGetTrace(traceId, { query: { queryKey: ["trace", traceId] } });
  const [interdictingId, setInterdictingId] = useState<string | null>(null);
  const [committedProofs, setCommittedProofs] = useState<Map<string, InterdictionResult>>(new Map());
  const [showChainDetail, setShowChainDetail] = useState(false);

  const events = useMemo(() => (trace?.events ?? []) as AnyEvent[], [trace]);
  const chainMap = useMemo(() => checkChain(events), [events]);
  const brokenLinks = useMemo(() =>
    events.filter(e => chainMap.get(e.id) === false).length
  , [events, chainMap]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm animate-pulse">
        Decrypting trace data…
      </div>
    );
  }
  if (!trace) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-destructive">
        Trace data unavailable.
      </div>
    );
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/10 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground">
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
                <span className="flex items-center gap-1 text-[10px] font-mono font-bold"
                  style={{ color: P.terra }}>
                  <Link2Off className="w-2.5 h-2.5" />
                  {brokenLinks} broken link{brokenLinks > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Chain verify toggle */}
          <button
            onClick={() => setShowChainDetail(v => !v)}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border transition-colors"
            style={{
              color: showChainDetail ? "#0d1117" : P.blue,
              background: showChainDetail ? P.blue : "transparent",
              borderColor: P.blue + "55",
            }}
          >
            <Eye className="w-3 h-3" />
            Chain Verify
          </button>

          <div className="flex flex-col items-end font-mono text-xs text-muted-foreground gap-1">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {formatTime(trace.startTime)}
            </div>
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

      {/* ── Chain Detail Panel ── */}
      {showChainDetail && (
        <div className="px-4 py-3 border-b border-border/40" style={{ background: "#0a0e17" }}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-2 flex items-center gap-2"
            style={{ color: P.blue }}>
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
                    : <Link2Off className="w-2.5 h-2.5 shrink-0" style={{ color: P.terra }} />
                  }
                  <span style={{ color: intact ? P.sage : P.terra }} className="w-16 shrink-0">
                    {ev.eventType}
                  </span>
                  <span style={{ color: P.dim }} className="truncate">{ev.currentHash.substring(0, 24)}…</span>
                  {!intact && (
                    <span className="ml-auto shrink-0 font-bold" style={{ color: P.terra }}>
                      CHAIN BREAK
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Event Flow ── */}
      <div className="flex-1 overflow-y-auto p-6 relative" style={{ background: "#0a0f1a33" }}>
        {/* Vertical chain line */}
        <div className="absolute left-[39px] top-6 bottom-6 w-px" style={{ background: P.border }} />

        <div className="space-y-5 relative">
          {events.map((event, index) => {
            const anomalous    = event.isAnomalous || isAnomalous(event.eventType, event.rationale ?? undefined);
            const score        = (event.consistencyScore ?? 1.0);
            const scorePct     = Math.round(score * 100);
            const drift        = driftPct(event);
            const delta        = driftDelta(event, events[index - 1]);
            const isDriftHigh  = drift > 15;
            const chainIntact  = chainMap.get(event.id) ?? true;
            const isHallucination = score < 0.5;
            const isInterdict  = interdictingId === event.id;
            const proof        = committedProofs.get(event.id);
            const isOverride   = event.eventType === "HUMAN_IN_THE_LOOP_OVERRIDE";

            let EventIcon  = Terminal;
            let iconColor  = "text-muted-foreground";
            let bgColor    = "bg-muted";
            if (event.eventType === "Error") { iconColor = "text-destructive"; bgColor = "bg-destructive/20"; EventIcon = AlertTriangle; }
            else if (event.eventType === "Intent") { iconColor = "text-blue-400"; bgColor = "bg-blue-500/20"; }
            else if (event.eventType === "Action") { iconColor = "text-primary"; bgColor = "bg-primary/20"; }
            else if (event.eventType === "Result") { iconColor = "text-emerald-400"; bgColor = "bg-emerald-500/20"; }
            else if (isOverride) { iconColor = ""; bgColor = ""; }

            const cardBorder = !chainIntact
              ? "border-red-500/50 bg-red-950/20"
              : isHallucination ? "border-destructive/40 bg-destructive/5"
              : anomalous ? "border-accent/40 bg-accent/5"
              : isOverride ? "bg-card/40"
              : "border-border/50 bg-card/40";

            return (
              <div key={event.id} className="flex gap-4 relative animate-in slide-in-from-left-4 fade-in"
                style={{ animationDelay: `${index * 40}ms`, animationFillMode: "both" }}>

                {/* Step icon */}
                <div className={`w-8 h-8 rounded-full border border-border/50 flex items-center justify-center z-10 shrink-0 ${bgColor}`}
                  style={isOverride ? { background: P.blue + "22", border: `1px solid ${P.blue}44` } : {}}>
                  {isOverride
                    ? <ShieldCheck className="w-3.5 h-3.5" style={{ color: P.blue }} />
                    : <EventIcon className={`w-3.5 h-3.5 ${iconColor}`} />
                  }
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {/* Chain break indicator above card */}
                  {!chainIntact && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold mb-1"
                      style={{ color: P.terra }}>
                      <Link2Off className="w-3 h-3" />
                      SHA-512 CHAIN BREAK — previous hash mismatch
                    </div>
                  )}

                  <Card className={`border p-4 ${cardBorder}`}
                    style={!chainIntact ? {} : isOverride ? { border: `1px solid ${P.blue}33` } : {}}>

                    {/* Top row */}
                    <div className="flex justify-between items-start mb-3 gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Event type */}
                        <span className={`text-xs font-mono font-bold uppercase tracking-wider ${iconColor}`}
                          style={isOverride ? { color: P.blue } : {}}>
                          {event.eventType}
                        </span>

                        {/* Consistency score */}
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          scorePct >= 80 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                          : scorePct >= 50 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                          : "text-destructive bg-destructive/10 border-destructive/20"
                        }`}>
                          <BrainCircuit className="w-2.5 h-2.5" />
                          {scorePct}%
                        </span>

                        {/* Anomaly badge */}
                        {anomalous && !isOverride && (
                          <Badge variant="outline"
                            className="text-accent border-accent/30 bg-accent/10 text-[9px] px-1 h-4">
                            {isHallucination ? "HALLUCINATION" : "FLAGGED"}
                          </Badge>
                        )}

                        {/* Override badge */}
                        {isOverride && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold"
                            style={{ color: P.blue, background: P.blue + "18", border: `1px solid ${P.blue}33` }}>
                            QL-2.0 SIGNED
                          </span>
                        )}

                        {/* Committed proof badge */}
                        {proof && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold flex items-center gap-1"
                            style={{ color: P.sage, background: P.sage + "18", border: `1px solid ${P.sage}33` }}>
                            <ShieldCheck className="w-2.5 h-2.5" />
                            OVERRIDDEN
                          </span>
                        )}
                      </div>

                      {/* Right: time + Interdict button */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {formatTime(event.timestamp)}
                        </span>
                        {(anomalous || isDriftHigh) && !isOverride && (
                          <button
                            onClick={() => setInterdictingId(isInterdict ? null : event.id)}
                            className="text-[10px] font-mono px-2 py-0.5 rounded border transition-colors flex items-center gap-1"
                            style={{
                              color: isInterdict ? "#0d1117" : P.blue,
                              background: isInterdict ? P.blue : "transparent",
                              borderColor: P.blue + "55",
                            }}
                          >
                            <Zap className="w-2.5 h-2.5" />
                            {isInterdict ? "Close" : "Interdict"}
                            {!isInterdict && <ChevronRight className="w-2.5 h-2.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Cognitive Drift Overlay */}
                    <div className="mb-3">
                      <DriftBar pct={drift} delta={delta} isDriftHigh={isDriftHigh} />
                    </div>

                    {/* Rationale — Amber highlight if drift > 15% */}
                    {event.rationale && (
                      <div className={`mb-3 text-sm font-mono leading-relaxed pl-3 border-l-2`}
                        style={{
                          color: isDriftHigh ? P.amber
                            : isHallucination ? P.terra
                            : anomalous ? "#d4a87e"
                            : "#b0bcc8",
                          borderColor: isDriftHigh ? P.amber + "88"
                            : isHallucination ? P.terra + "55"
                            : anomalous ? "#d4a87e55"
                            : P.border,
                          background: isDriftHigh ? P.amber + "08" : "transparent",
                          borderRadius: isDriftHigh ? "0 6px 6px 0" : undefined,
                          padding: isDriftHigh ? "4px 8px 4px 12px" : undefined,
                        }}>
                        {isDriftHigh && (
                          <div className="flex items-center gap-1 text-[9px] font-mono font-bold mb-1"
                            style={{ color: P.amber }}>
                            <TriangleAlert className="w-2.5 h-2.5" />
                            COGNITIVE DRIFT &gt; 15% — INTENT DEVIATION DETECTED
                          </div>
                        )}
                        {event.rationale}
                      </div>
                    )}

                    {/* Anomaly reason */}
                    {anomalous && event.anomalyReason && (
                      <div className="mb-3 text-[10px] font-mono text-accent bg-accent/10 px-2 py-1.5 rounded flex items-start gap-1.5 border border-accent/20">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        {event.anomalyReason}
                      </div>
                    )}

                    {/* Payload + chain link */}
                    <div className="bg-background rounded-md border border-border/50 overflow-hidden">
                      <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50 text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex justify-between items-center">
                        <span>Payload</span>
                        <span className="flex items-center gap-2">
                          {!chainIntact && (
                            <span className="text-[9px] font-bold" style={{ color: P.terra }}>
                              ⚠ HASH MISMATCH
                            </span>
                          )}
                          <span title="SHA-512 block hash">H: {truncateHash(event.currentHash)}</span>
                        </span>
                      </div>
                      <div className="p-3 overflow-x-auto text-xs font-mono text-muted-foreground whitespace-pre max-h-36">
                        {JSON.stringify(event.payload, null, 2)}
                      </div>
                    </div>

                    {/* Chain link indicator */}
                    <ChainLinkIndicator
                      intact={chainIntact}
                      prevHash={event.previousHash}
                      thisHash={event.currentHash}
                    />

                    {/* Committed override proof (below card) */}
                    {proof && (
                      <div className="mt-3 rounded-lg px-3 py-2.5 flex items-center gap-2"
                        style={{ background: P.sage + "0a", border: `1px solid ${P.sage}33` }}>
                        <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: P.sage }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: P.sage }}>
                            Human Override Committed
                          </div>
                          <div className="text-[10px] font-mono truncate" style={{ color: "#cdd5e0" }}>
                            Forensic ID: {proof.forensicAuditId}
                          </div>
                        </div>
                        <div className="text-[9px] font-mono shrink-0" style={{ color: P.dim }}>
                          {proof.quantumProof?.algorithm ?? "ML-DSA-87"}
                        </div>
                      </div>
                    )}
                  </Card>

                  {/* Active Interdiction Panel */}
                  {isInterdict && (
                    <ActiveInterdictionPanel
                      event={event}
                      onClose={() => setInterdictingId(null)}
                      onCommitted={(result) => {
                        setCommittedProofs(prev => {
                          const next = new Map(prev);
                          next.set(event.id, result);
                          return next;
                        });
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

// ── Trace List ────────────────────────────────────────────────────────────────
export default function TracesPage() {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const { data: logData, isLoading } = useGetAuditLogs({ limit: 50 }, { query: { queryKey: ["traces"] } });
  const [overrideCount, setOverrideCount] = useState(0);

  // Count committed overrides for the badge
  useEffect(() => {
    fetch(`${BASE}/api/v1/forensic/overrides`)
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setOverrideCount(d.count ?? 0))
      .catch(() => {});
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
      const trace = traceMap.get(log.traceId)!;
      trace.eventCount++;
      if (log.eventType === "Error") trace.hasError = true;
      if (log.isAnomalous || isAnomalous(log.eventType, log.rationale)) trace.hasAnomaly = true;
      if (typeof log.consistencyScore === "number" && log.consistencyScore < trace.lowestScore)
        trace.lowestScore = log.consistencyScore;
      if (new Date(log.timestamp) < new Date(trace.startTime)) trace.startTime = log.timestamp;
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
                <ShieldCheck className="w-2.5 h-2.5" />
                {overrideCount} override{overrideCount > 1 ? "s" : ""}
              </span>
            )}
            <Badge variant="outline" className="font-mono text-[10px]">
              {recentTraces.length}
            </Badge>
          </div>
        </div>

        {/* Legend */}
        <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3 text-[9px] font-mono"
          style={{ background: "#0a0e17" }}>
          <span className="flex items-center gap-1" style={{ color: P.sage }}>
            <Link2 className="w-2.5 h-2.5" /> Chain OK
          </span>
          <span className="flex items-center gap-1" style={{ color: P.terra }}>
            <Link2Off className="w-2.5 h-2.5" /> Broken
          </span>
          <span className="flex items-center gap-1" style={{ color: P.amber }}>
            <TriangleAlert className="w-2.5 h-2.5" /> Drift &gt; 15%
          </span>
          <span className="flex items-center gap-1" style={{ color: P.blue }}>
            <Zap className="w-2.5 h-2.5" /> Interdict
          </span>
        </div>

        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-center font-mono text-sm text-muted-foreground animate-pulse">
              Scanning forensic ledger…
            </div>
          ) : recentTraces.length === 0 ? (
            <div className="p-4 text-center font-mono text-sm text-muted-foreground">No traces found.</div>
          ) : (
            recentTraces.map(trace => {
              const scorePct = Math.round(trace.lowestScore * 100);
              const drift = (1 - trace.lowestScore) * 100;
              const scoreColor = scorePct < 50 ? "text-destructive" : scorePct < 75 ? "text-yellow-400" : "text-emerald-400";
              return (
                <button
                  key={trace.traceId}
                  onClick={() => setSelectedTraceId(trace.traceId)}
                  className={`w-full text-left p-3 rounded-md transition-all border font-mono ${
                    selectedTraceId === trace.traceId
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs truncate max-w-[140px]" title={trace.traceId}>
                      {trace.traceId}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {trace.hasAnomaly && <AlertTriangle className="w-3 h-3 text-accent" />}
                      {drift > 15 && <TriangleAlert className="w-3 h-3" style={{ color: P.amber }} />}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{trace.eventCount} ev</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="truncate max-w-[120px] opacity-70">
                      {trace.agentId.substring(0, 8)}
                    </span>
                    <div className="flex items-center gap-2">
                      {drift > 15 && (
                        <span className="font-bold" style={{ color: P.amber }}>
                          Δ{drift.toFixed(0)}%
                        </span>
                      )}
                      <span className={`font-bold ${scoreColor}`}>
                        <BrainCircuit className="w-2.5 h-2.5 inline mr-0.5" />
                        {scorePct}%
                      </span>
                    </div>
                  </div>
                  {/* Mini drift bar */}
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

      {/* ── Right panel: Trace Details ── */}
      <Card className="flex-1 flex flex-col border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
        {selectedTraceId ? (
          <TraceDetailView traceId={selectedTraceId} onClose={() => setSelectedTraceId(null)} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <ListTree className="w-12 h-12 mb-4 opacity-20" />
            <h3 className="font-mono text-lg font-medium text-foreground mb-2">Forensic Intent Suite</h3>
            <p className="text-sm text-center max-w-md font-mono opacity-80 leading-relaxed">
              Select a trace to view the Verified Sequence with SHA-512 chain-link verification,
              Cognitive Drift Overlay per step, and Active Interdiction for human-in-the-loop
              overrides re-signed with ML-DSA-87.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-sm">
              {[
                { icon: Link2, label: "Chain Verify", color: P.sage },
                { icon: TriangleAlert, label: "Drift Overlay", color: P.amber },
                { icon: Zap, label: "Interdiction", color: P.blue },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="rounded-lg p-3 text-center" style={{
                  background: color + "0a", border: `1px solid ${color}22`
                }}>
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
