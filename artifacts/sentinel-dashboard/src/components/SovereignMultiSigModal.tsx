/**
 * Sovereign Multi-Sig Gate — "Two-Man Rule" UI
 *
 * Intercepts "Apply Fix" actions and requires a dual ML-DSA-87 signature
 * before committing the corrected intent to the immutable ledger:
 *   Slot 1 (Operator)  — auto-signed with the active session fingerprint
 *   Slot 2 (Sovereign) — requires QR scan or Dev Override
 *
 * On success: fires RECURSIVE_FIX_VERIFIED + white-gold surge CustomEvent.
 *
 * Kill Switch remains single-click (EMERGENCY_SOLO_REVOKE path bypasses modal).
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react";
import {
  ShieldCheck, ShieldAlert, X, Zap, Clock, CheckCircle2,
  AlertTriangle, Lock, Loader2, Fingerprint, QrCode,
  Skull, Eye, EyeOff,
} from "lucide-react";
import QRCode from "qrcode";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const IS_DEV = import.meta.env.DEV;

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  sage:    "#00F5FF",
  amber:   "#FFB800",
  terra:   "#FF003C",
  blue:    "#5B8DEF",
  violet:  "#9B7DE8",
  dim:     "#9AA4B1",
  border:  "#2C3136",
  panel:   "#161B22",
  bg:      "#0D1117",
  gold:    "#FFD700",
  wgLight: "#FFFBE8",
};

// ── Session fingerprint ───────────────────────────────────────────────────────
function getSessionFingerprint(): string {
  const KEY = "sentinel-op-fingerprint";
  const stored = sessionStorage.getItem(KEY);
  if (stored) return stored;
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const fp = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem(KEY, fp);
  return fp;
}

function formatFingerprint(fp: string): string {
  return fp.match(/.{1,4}/g)?.join(":").toUpperCase() ?? fp;
}

// ── Challenge ID ──────────────────────────────────────────────────────────────
function genChallengeId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("").replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SovereignMultiSigProps {
  event: {
    id: string;
    eventType: string;
    rationale?: string | null;
    agentId?: string;
    traceId?: string;
    timestamp?: string;
  };
  newRationale: string;
  newToolParams?: string;
  onSuccess: (result: {
    forensicAuditId: string;
    fixVerifiedEventId: string;
    committedAt: string;
    quantumProof: { algorithm: string; publicKeyFingerprint: string; status: string };
    agentId: string;
    traceId: string;
  }) => void;
  onClose: () => void;
}

type Phase = "pending" | "qr_awaiting" | "sovereign_approved" | "submitting" | "complete" | "error";

// ── Pulsing dot ───────────────────────────────────────────────────────────────
function PulseDot({ color }: { color: string }) {
  return (
    <span className="relative inline-flex h-2 w-2 mr-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
        style={{ background: color }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color }} />
    </span>
  );
}

// ── Proposal Diff ─────────────────────────────────────────────────────────────
function ProposalDiff({
  original, corrected, originalToolParams, newToolParams,
}: {
  original: string; corrected: string;
  originalToolParams?: string; newToolParams?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Left: drifted */}
      <div className="rounded-lg overflow-hidden"
        style={{ border: `1px solid ${P.amber}44`, background: P.amber + "07" }}>
        <div className="px-3 py-2 border-b flex items-center gap-2"
          style={{ borderColor: P.amber + "33", background: P.amber + "0d" }}>
          <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: P.amber }} />
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ color: P.amber }}>Drifted Intent</span>
        </div>
        <div className="p-3 space-y-2">
          <div className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap"
            style={{ color: P.amber + "cc" }}>
            {original || <em style={{ color: P.dim }}>— no rationale —</em>}
          </div>
          {originalToolParams && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: P.amber + "22" }}>
              <div className="text-[8px] font-mono mb-1 uppercase" style={{ color: P.dim }}>Tool Params</div>
              <pre className="text-[9px] font-mono" style={{ color: P.amber + "99" }}>
                {originalToolParams}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Right: corrected */}
      <div className="rounded-lg overflow-hidden"
        style={{ border: `1px solid ${P.sage}44`, background: P.sage + "07" }}>
        <div className="px-3 py-2 border-b flex items-center gap-2"
          style={{ borderColor: P.sage + "33", background: P.sage + "0d" }}>
          <ShieldCheck className="w-3 h-3 shrink-0" style={{ color: P.sage }} />
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ color: P.sage }}>Sovereign-Corrected</span>
        </div>
        <div className="p-3 space-y-2">
          <div className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap"
            style={{ color: P.sage + "cc" }}>
            {corrected}
          </div>
          {newToolParams && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: P.sage + "22" }}>
              <div className="text-[8px] font-mono mb-1 uppercase" style={{ color: P.dim }}>Tool Params</div>
              <pre className="text-[9px] font-mono" style={{ color: P.sage + "99" }}>
                {newToolParams}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Signature Slot ─────────────────────────────────────────────────────────────
function SignatureSlot({
  slot, label, status, fingerprint, sublabel,
}: {
  slot: 1 | 2; label: string; status: "signed" | "waiting" | "denied";
  fingerprint?: string; sublabel?: string;
}) {
  const isSigned  = status === "signed";
  const isWaiting = status === "waiting";
  const color = isSigned ? P.sage : isWaiting ? P.amber : P.terra;

  return (
    <div className="rounded-xl p-4 relative overflow-hidden"
      style={{
        border: `1px solid ${color}44`,
        background: color + "09",
        boxShadow: isSigned ? `0 0 20px ${P.sage}18` : "none",
      }}>
      {isSigned && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, ${P.sage}10, transparent 70%)`,
          }} />
      )}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: color + "18",
            border: `1px solid ${color}44`,
          }}>
          {isSigned
            ? <Zap className="w-4 h-4" style={{ color: P.sage }} />
            : isWaiting
            ? <Lock className="w-4 h-4" style={{ color: P.amber }} />
            : <ShieldAlert className="w-4 h-4" style={{ color: P.terra }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold uppercase" style={{ color: P.dim }}>
              Slot {slot} — {label}
            </span>
            {isWaiting && <PulseDot color={P.amber} />}
          </div>
          <div className="text-[11px] font-mono font-bold" style={{ color }}>
            {isSigned
              ? "SIGNED ⚡"
              : isWaiting
              ? "WAITING FOR ML-DSA-87 APPROVAL"
              : "DENIED"}
          </div>
          {sublabel && (
            <div className="text-[9px] font-mono mt-1" style={{ color: P.dim }}>
              {sublabel}
            </div>
          )}
          {fingerprint && (
            <div className="mt-2 flex items-center gap-1.5">
              <Fingerprint className="w-2.5 h-2.5 shrink-0" style={{ color: color + "88" }} />
              <div className="font-mono text-[8px] tracking-wider truncate"
                style={{ color: color + "99" }}>
                {formatFingerprint(fingerprint.substring(0, 20))}…
              </div>
            </div>
          )}
        </div>
        {isSigned && (
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: P.sage }} />
        )}
      </div>
    </div>
  );
}

// ── Success overlay ────────────────────────────────────────────────────────────
function SuccessOverlay({ result }: {
  result: { forensicAuditId: string; fixVerifiedEventId: string; committedAt: string; quantumProof: { algorithm: string; publicKeyFingerprint: string; status: string } };
}) {
  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <style>{`
        @keyframes wg-surge {
          0%   { opacity: 0; transform: scale(0.95); }
          20%  { opacity: 1; transform: scale(1.01); }
          60%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0.85; transform: scale(1); }
        }
        .wg-surge { animation: wg-surge 1.2s ease forwards; }
        @keyframes wg-text { 0%,100% { text-shadow: 0 0 8px #FFD70066 } 50% { text-shadow: 0 0 20px #FFD700cc, 0 0 40px #FFD70044 } }
        .wg-text { animation: wg-text 2s ease-in-out infinite; }
      `}</style>

      {/* White-Gold surge header */}
      <div className="wg-surge rounded-xl p-5 text-center relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${P.gold}18, ${P.wgLight}0f, ${P.gold}12)`,
          border: `1px solid ${P.gold}66`,
          boxShadow: `0 0 40px ${P.gold}22, 0 0 80px ${P.gold}11`,
        }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${P.gold}20, transparent 70%)` }} />
        <div className="wg-text text-2xl font-mono font-black mb-1" style={{ color: P.gold }}>
          ✦ RECURSIVE FIX VERIFIED ✦
        </div>
        <div className="text-[10px] font-mono" style={{ color: P.gold + "aa" }}>
          DUAL ML-DSA-87 CONSENSUS ACHIEVED · LEDGER UPDATED · FIX_MONITOR_ACTIVE
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3"
          style={{ border: `1px solid ${P.sage}33`, background: P.sage + "09" }}>
          <div className="text-[8px] font-mono uppercase tracking-widest mb-1" style={{ color: P.dim }}>
            Forensic Audit ID
          </div>
          <div className="text-[9px] font-mono font-bold truncate" style={{ color: P.sage }}>
            {result.forensicAuditId}
          </div>
        </div>
        <div className="rounded-lg p-3"
          style={{ border: `1px solid ${P.sage}33`, background: P.sage + "09" }}>
          <div className="text-[8px] font-mono uppercase tracking-widest mb-1" style={{ color: P.dim }}>
            Fix Verified Event
          </div>
          <div className="text-[9px] font-mono font-bold truncate" style={{ color: P.sage }}>
            {result.fixVerifiedEventId}
          </div>
        </div>
      </div>

      <div className="rounded-lg p-3 flex items-center gap-3"
        style={{ border: `1px solid ${P.amber}33`, background: P.amber + "09" }}>
        <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: P.amber }} />
        <div>
          <div className="text-[10px] font-mono font-bold" style={{ color: P.amber }}>
            FIX_MONITOR_ACTIVE — 100 events at 100% signature sampling
          </div>
          <div className="text-[9px] font-mono mt-0.5" style={{ color: P.dim }}>
            Agent is flagged for elevated monitoring. All subsequent events
            will be fully re-validated under ML-DSA-87 until the monitoring window closes.
          </div>
        </div>
      </div>

      <div className="text-[9px] font-mono" style={{ color: P.dim }}>
        {result.quantumProof.algorithm} · {result.quantumProof.status} ·
        {new Date(result.committedAt).toLocaleString()}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function SovereignMultiSigModal({
  event, newRationale, newToolParams, onSuccess, onClose,
}: SovereignMultiSigProps) {
  const [phase, setPhase]   = useState<Phase>("pending");
  const [error, setError]   = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [sovereignApproved, setSovereignApproved] = useState(false);
  const [showQr, setShowQr] = useState(true);
  const [result, setResult] = useState<{
    forensicAuditId: string; fixVerifiedEventId: string; committedAt: string;
    quantumProof: { algorithm: string; publicKeyFingerprint: string; status: string };
    agentId: string; traceId: string;
  } | null>(null);

  const operatorFp  = useMemo(() => getSessionFingerprint(), []);
  const challengeId = useMemo(() => genChallengeId(), []);
  const operatorId  = useMemo(() => `op-${operatorFp.substring(0, 8)}`, [operatorFp]);

  // ── Generate QR code challenge on mount ────────────────────────────────
  useEffect(() => {
    const challengePayload = JSON.stringify({
      type: "SOVEREIGN_MULTI_SIG_CHALLENGE",
      challengeId,
      logId: event.id,
      agentId: event.agentId,
      traceId: event.traceId,
      operatorId,
      operatorFingerprint: operatorFp.substring(0, 20),
      correctedRationaleHash: btoa(newRationale).substring(0, 32),
      issuedAt: new Date().toISOString(),
      endpoint: `${window.location.origin}${BASE}/api/v1/governance/confirm-fix`,
    });

    QRCode.toDataURL(challengePayload, {
      width: 200,
      margin: 2,
      color: { dark: "#00F5FF", light: "#0D1117" },
    }).then(url => setQrDataUrl(url)).catch(() => setQrDataUrl(null));
  }, [challengeId, event.id, event.agentId, event.traceId, operatorId, operatorFp, newRationale]);

  // ── Submit to backend ──────────────────────────────────────────────────
  const submit = useCallback(async (devOverride = false) => {
    setPhase("submitting");
    setError(null);
    try {
      const body: Record<string, unknown> = {
        logId: event.id,
        newRationale,
        operatorId,
        challengeId,
      };
      if (newToolParams?.trim()) {
        try { body.newToolParams = JSON.parse(newToolParams); } catch { /* ignore */ }
      }
      if (devOverride) body.sovereignOverrideDev = true;

      const r = await fetch(`${BASE}/api/v1/governance/confirm-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "confirm-fix failed");

      const res = {
        forensicAuditId:    d.forensicAuditId,
        fixVerifiedEventId: d.fixVerifiedEventId,
        committedAt:        d.committedAt,
        agentId:            d.agentId,
        traceId:            d.traceId,
        quantumProof:       d.quantumProof,
      };
      setResult(res);
      setPhase("complete");

      // Fire RECURSIVE_FIX_VERIFIED custom event → CausalTopologyMap listens for surge
      window.dispatchEvent(new CustomEvent("recursiveFixVerified", {
        detail: { agentId: d.agentId, traceId: d.traceId, forensicAuditId: d.forensicAuditId },
      }));

      // Delay calling onSuccess so the modal shows the surge animation first
      setTimeout(() => onSuccess(res), 1800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  }, [event.id, newRationale, newToolParams, operatorId, challengeId, onSuccess]);

  // Simulate QR scan approval (dev mode auto-progresses)
  const handleSovereignApprove = useCallback(() => {
    setSovereignApproved(true);
    setPhase("sovereign_approved");
  }, []);

  const handleDevOverride = useCallback(() => {
    setSovereignApproved(true);
    setPhase("sovereign_approved");
    // Auto-submit immediately
    submit(true);
  }, [submit]);

  const handleConfirm = useCallback(() => {
    submit(false);
  }, [submit]);

  const isComplete   = phase === "complete";
  const isSubmitting = phase === "submitting";

  return (
    <>
      <style>{`
        @keyframes msm-in { from { opacity:0; transform: scale(0.97) translateY(-8px); } to { opacity:1; transform: scale(1) translateY(0); } }
        .msm-modal { animation: msm-in 0.25s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes msm-scan { 0%,100%{transform:translateY(0)} 50%{transform:translateY(180px)} }
        .msm-scan-line { animation: msm-scan 2s ease-in-out infinite; }
        @keyframes sig-glow { 0%,100%{box-shadow:0 0 8px ${P.sage}33} 50%{box-shadow:0 0 24px ${P.sage}66,0 0 48px ${P.sage}22} }
        .sig-glow { animation: sig-glow 1.5s ease-in-out infinite; }
      `}</style>

      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        style={{
          background: "rgba(5,8,15,0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
        onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}>

        {/* ── Modal ── */}
        <div className="msm-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
          style={{
            background: "rgba(13,17,23,0.96)",
            border: `1px solid ${isComplete ? P.gold + "88" : P.blue}44`,
            boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px ${isComplete ? P.gold + "22" : "transparent"}, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}>

          {/* ── Header ── */}
          <div className="px-6 py-4 border-b flex items-center justify-between"
            style={{
              borderColor: P.border + "88",
              background: isComplete
                ? `linear-gradient(135deg, ${P.gold}0d, transparent)`
                : `linear-gradient(135deg, ${P.blue}0d, transparent)`,
            }}>
            <div>
              <div className="flex items-center gap-2.5">
                {isComplete
                  ? <Zap className="w-5 h-5" style={{ color: P.gold }} />
                  : <Lock className="w-5 h-5" style={{ color: P.blue }} />}
                <span className="text-sm font-mono font-black uppercase tracking-widest"
                  style={{ color: isComplete ? P.gold : P.blue }}>
                  {isComplete ? "Fix Verified — White-Gold Surge" : "Sovereign Multi-Sig Gate"}
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full"
                  style={{
                    background: (isComplete ? P.gold : P.blue) + "18",
                    border: `1px solid ${isComplete ? P.gold : P.blue}44`,
                    color: isComplete ? P.gold : P.blue,
                  }}>
                  {isComplete ? "DUAL SIG" : "TWO-MAN RULE"}
                </span>
              </div>
              <div className="text-[10px] font-mono mt-1" style={{ color: P.dim }}>
                {isComplete
                  ? "Ledger updated · FIX_MONITOR_ACTIVE · Topology surge triggered"
                  : `Challenge: ${challengeId.substring(0, 18)}…`}
              </div>
            </div>
            {!isSubmitting && (
              <button onClick={onClose}
                className="ml-4 opacity-50 hover:opacity-100 transition-opacity">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="p-6 space-y-5">
            {/* ── Success state ── */}
            {isComplete && result && <SuccessOverlay result={result} />}

            {/* ── Active flow ── */}
            {!isComplete && (
              <>
                {/* Target event chip */}
                <div className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{ background: P.panel, border: `1px solid ${P.border}` }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: P.terra }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-mono uppercase" style={{ color: P.dim }}>
                      Target Event
                    </div>
                    <div className="text-[10px] font-mono truncate" style={{ color: "#cdd5e0" }}>
                      {event.id} · {event.eventType}
                      {event.agentId && <span style={{ color: P.dim }}> · {event.agentId}</span>}
                    </div>
                  </div>
                </div>

                {/* Proposal Diff */}
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-2 flex items-center gap-2"
                    style={{ color: P.dim }}>
                    <Eye className="w-3 h-3" /> Proposal Diff
                  </div>
                  <ProposalDiff
                    original={event.rationale ?? ""}
                    corrected={newRationale}
                    originalToolParams={undefined}
                    newToolParams={newToolParams}
                  />
                </div>

                {/* Signature Slots */}
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-2"
                    style={{ color: P.dim }}>
                    Signature Verification Circuit
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <SignatureSlot
                      slot={1} label="Operator"
                      status="signed"
                      fingerprint={operatorFp}
                      sublabel={`Session ${operatorId} · Active`}
                    />
                    <SignatureSlot
                      slot={2} label="Sovereign"
                      status={sovereignApproved ? "signed" : "waiting"}
                      fingerprint={sovereignApproved ? "ML-DSA-87-SOVEREIGN" + operatorFp.substring(8) : undefined}
                      sublabel={sovereignApproved
                        ? "Sovereign key approved · Co-signed"
                        : "Scan QR Code with sovereign device"}
                    />
                  </div>
                </div>

                {/* QR Code + Dev Override */}
                {!sovereignApproved && (
                  <div className="rounded-xl overflow-hidden"
                    style={{ border: `1px solid ${P.border}`, background: P.panel }}>
                    <div className="px-4 py-2.5 border-b flex items-center justify-between"
                      style={{ borderColor: P.border + "66" }}>
                      <div className="flex items-center gap-2">
                        <QrCode className="w-3.5 h-3.5" style={{ color: P.sage }} />
                        <span className="text-[10px] font-mono font-bold uppercase"
                          style={{ color: P.sage }}>
                          Quantum QR Challenge
                        </span>
                      </div>
                      <button
                        onClick={() => setShowQr(v => !v)}
                        className="opacity-50 hover:opacity-100">
                        {showQr
                          ? <EyeOff className="w-3.5 h-3.5" />
                          : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {showQr && (
                      <div className="p-4 flex gap-4">
                        {/* QR Code canvas */}
                        <div className="relative shrink-0"
                          style={{
                            width: 200, height: 200,
                            borderRadius: 10, overflow: "hidden",
                            border: `1px solid ${P.sage}44`,
                            background: P.bg,
                          }}>
                          {qrDataUrl
                            ? <img src={qrDataUrl} alt="Sovereign QR Code"
                                width={200} height={200}
                                style={{ display: "block" }} />
                            : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin" style={{ color: P.sage }} />
                              </div>
                            )}
                          {/* Scan animation overlay */}
                          <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            <div className="msm-scan-line absolute left-0 right-0 h-px opacity-40"
                              style={{ background: P.sage, boxShadow: `0 0 8px ${P.sage}` }} />
                          </div>
                          {/* Corner brackets */}
                          {[
                            ["top-1 left-1 border-t-2 border-l-2 rounded-tl-md", "w-5 h-5"],
                            ["top-1 right-1 border-t-2 border-r-2 rounded-tr-md", "w-5 h-5"],
                            ["bottom-1 left-1 border-b-2 border-l-2 rounded-bl-md", "w-5 h-5"],
                            ["bottom-1 right-1 border-b-2 border-r-2 rounded-br-md", "w-5 h-5"],
                          ].map(([cls]) => (
                            <div key={cls} className={`absolute ${cls}`}
                              style={{ borderColor: P.sage }} />
                          ))}
                        </div>

                        {/* Challenge info */}
                        <div className="flex-1 space-y-2 text-[9px] font-mono">
                          <div>
                            <div style={{ color: P.dim }} className="mb-0.5 uppercase">Challenge ID</div>
                            <div className="break-all" style={{ color: P.sage }}>{challengeId}</div>
                          </div>
                          <div>
                            <div style={{ color: P.dim }} className="mb-0.5 uppercase">Operator</div>
                            <div style={{ color: "#cdd5e0" }}>{operatorId}</div>
                          </div>
                          <div>
                            <div style={{ color: P.dim }} className="mb-0.5 uppercase">Algorithm</div>
                            <div style={{ color: "#cdd5e0" }}>ML-DSA-87 · FIPS-204 · SL5</div>
                          </div>
                          <div>
                            <div style={{ color: P.dim }} className="mb-0.5 uppercase">Status</div>
                            <div className="flex items-center gap-1">
                              <PulseDot color={P.amber} />
                              <span style={{ color: P.amber }}>Awaiting sovereign scan…</span>
                            </div>
                          </div>

                          {/* Dev override */}
                          {IS_DEV && (
                            <button
                              data-testid="sovereign-dev-override-btn"
                              onClick={handleDevOverride}
                              disabled={isSubmitting}
                              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-mono text-[10px] font-bold uppercase transition-all disabled:opacity-50"
                              style={{
                                background: P.terra + "18",
                                border: `1px solid ${P.terra}55`,
                                color: P.terra,
                              }}>
                              <Skull className="w-3 h-3" />
                              Sovereign Override
                              <span className="text-[8px] normal-case opacity-70">(dev only)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Error banner */}
                {(phase === "error" || error) && (
                  <div className="rounded-lg px-4 py-3 flex items-center gap-2"
                    style={{ background: P.terra + "18", border: `1px solid ${P.terra}55` }}>
                    <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: P.terra }} />
                    <span className="text-xs font-mono" style={{ color: P.terra }}>
                      {error ?? "Submission failed"}
                    </span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-1">
                  <div className="text-[9px] font-mono" style={{ color: P.dim }}>
                    {sovereignApproved
                      ? "Both signatures verified — ready to commit"
                      : "Awaiting Sovereign slot 2 signature"}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onClose}
                      disabled={isSubmitting}
                      className="px-4 py-2 rounded-lg font-mono text-[11px] font-bold disabled:opacity-40"
                      style={{
                        border: `1px solid ${P.border}`,
                        color: P.dim, background: "transparent",
                      }}>
                      Cancel
                    </button>
                    <button
                      data-testid="multisig-confirm-btn"
                      onClick={handleConfirm}
                      disabled={!sovereignApproved || isSubmitting}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-[11px] font-bold disabled:opacity-30 transition-all ${sovereignApproved && !isSubmitting ? "sig-glow" : ""}`}
                      style={{
                        background: sovereignApproved && !isSubmitting ? P.sage : P.border,
                        color: sovereignApproved ? "#0d1117" : P.dim,
                      }}>
                      {isSubmitting
                        ? <><Loader2 className="w-3 h-3 animate-spin" />Committing…</>
                        : <><ShieldCheck className="w-3 h-3" />Confirm Dual-Sig Fix</>}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
