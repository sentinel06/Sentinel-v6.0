import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useForensic } from "../contexts/ForensicContext";

const LS_ONBOARD = "sentinel_onboarded";

const VIOLET = "#8B5CF6";
const VIOLET_BRIGHT = "#C084FC";
const SAGE = "#40B595";
const CRIMSON = "#B91C1C";
const AMBER = "#EBC06D";

interface Step {
  id: string;
  badge: string;
  title: string;
  body: string;
  tour?: string;          // data-tour-id of the spotlight target
  route?: string;         // wouter location to push before this step
  action?: () => void;    // side-effect on enter
  cta?: string;
}

interface InductionProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function SovereignInduction({ forceOpen = false, onClose }: InductionProps) {
  const [, navigate] = useLocation();
  const { induceRogueQuarantine, setAgent } = useForensic();

  const [open, setOpen] = useState<boolean>(() => {
    if (forceOpen) return true;
    try { return localStorage.getItem(LS_ONBOARD) !== "true"; } catch { return true; }
  });
  const [stepIdx, setStepIdx] = useState(0);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [certified, setCertified] = useState(false);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const inducedRef = useRef(false);

  const steps: Step[] = useMemo(() => [
    {
      id: "welcome",
      badge: "MISSION INDUCTION",
      title: "AGENT-SENTINEL v6.0 — NEURAL SOVEREIGNTY",
      body: "Welcome, Operator. You are about to assume command of an autonomous AI governance fleet. This 90-second induction certifies you to operate the Sovereign Watcher. Sovereign Token issuance pending.",
      cta: "BEGIN INDUCTION",
    },
    {
      id: "pulse",
      badge: "STEP 01 · THE PULSE",
      title: "System Synchronized",
      body: "You are viewing live neural telemetry. Every metric in this dashboard refreshes every 2.5 seconds with zero page reload. The sage pulse confirms your link to the Sovereign Watcher is healthy.",
      tour: "live-pulse",
    },
    {
      id: "hive",
      badge: "STEP 02 · NEURAL HIVE",
      title: "The Neural Hive",
      body: "This is the Neural Hive. Every node is an autonomous agent under your governance. A rogue agent is being injected now to demonstrate your defense systems — watch its drift climb.",
      tour: "swarm-canvas",
      route: "/swarmmap",
      action: () => {
        if (inducedRef.current) return;
        inducedRef.current = true;
        const id = `induction-rogue-${Date.now()}`;
        // Stage the rogue immediately, then escalate drift over ~2s before quarantine fires
        window.dispatchEvent(new CustomEvent("sentinel:induction-spawn", { detail: { id, label: "rogue-drill-α" } }));
        setTimeout(() => {
          induceRogueQuarantine(id, "rogue-drill-α", 30);
          window.dispatchEvent(new CustomEvent("sentinel:induction-quarantine", { detail: { id, label: "rogue-drill-α" } }));
        }, 2200);
      },
    },
    {
      id: "interdiction",
      badge: "STEP 03 · AUTONOMOUS INTERDICTION",
      title: "Sovereign Token Revoked",
      body: "Autonomous Interdiction Successful. The rogue's Sovereign Token has been revoked at sub-millisecond latency to prevent logic contamination. The agent is now sealed inside the Quarantine Grid.",
      tour: "quarantine-zone",
    },
    {
      id: "replay",
      badge: "STEP 04 · FORENSIC TIME-TRAVEL",
      title: "Neural Replay Scrubber",
      body: "Drag the Neural Replay slider to rewind any agent's cognition and pinpoint the exact moment of failure. Every snapshot is timestamped, hashed, and SLSA L4 attested.",
      tour: "neural-replay",
      action: () => {
        // Auto-select the inducted rogue so the scrubber appears
        const id = Array.from(document.querySelectorAll("[data-rogue-id]"))
          .map(el => (el as HTMLElement).dataset.rogueId)
          .find(Boolean);
        if (id) {
          setAgent({
            id, label: "rogue-drill-α", status: "revoked",
            drift: 30, fitnessScore: 0.05, generationDepth: 1,
            isRoot: false, swarmId: "induction-drill", parentUid: null,
            createdAt: new Date().toISOString(),
            revokedAt: new Date().toISOString(),
            revokedReason: "INDUCTION_DRILL",
          } as any);
        }
      },
    },
    {
      id: "eqa",
      badge: "STEP 05 · BOARD-READY EVIDENCE",
      title: "The EQA Export",
      body: "Generate EQA exports a tamper-sealed, FIPS-204 signed audit packet. This document is your legal shield under EU AI Act, NIST AI RMF, and global AI regulatory frameworks. Hand it to your Board, your auditor, or your regulator.",
      tour: "generate-eqa",
      route: "/eqa",
    },
    {
      id: "certify",
      badge: "OPERATOR CERTIFICATION",
      title: "OPERATOR STATUS · CERTIFIED [v6.0]",
      body: "Sovereign Token issued. You are now certified to operate Agent-Sentinel v6.0. The Neural Hive is yours. Welcome to Neural Sovereignty.",
      cta: "ASSUME COMMAND",
    },
  ], [induceRogueQuarantine, setAgent]);

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  // ── Side-effect on entering each step ────────────────────────────────────
  useEffect(() => {
    if (!open || !step) return undefined;
    if (step.route) navigate(step.route);
    if (step.action) {
      // Defer slightly so navigation lands first
      const t = setTimeout(() => step.action!(), 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resolve spotlight target every animation frame while step is active ─
  useEffect(() => {
    if (!open || !step?.tour) { setSpotRect(null); return; }
    let raf = 0;
    const update = () => {
      const el = document.querySelector(`[data-tour-id="${step.tour}"]`) as HTMLElement | null;
      setSpotRect(el ? el.getBoundingClientRect() : null);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [open, step?.tour]);

  // ── Reset skip-confirm timeout ──────────────────────────────────────────
  useEffect(() => {
    if (!skipConfirm) return;
    const t = setTimeout(() => setSkipConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [skipConfirm]);

  function persist() {
    try { localStorage.setItem(LS_ONBOARD, "true"); } catch {}
  }

  function handleNext() {
    if (isLast) {
      persist();
      setCertified(true);
      setOpen(false);
      onClose?.();
      setTimeout(() => setCertified(false), 5500);
      return;
    }
    setStepIdx(i => Math.min(i + 1, steps.length - 1));
  }
  function handleBack() { setStepIdx(i => Math.max(0, i - 1)); }
  function handleSkip() {
    if (!skipConfirm) { setSkipConfirm(true); return; }
    persist();
    setOpen(false);
    onClose?.();
  }

  if (!open && !certified) return null;

  // ── Spotlight geometry ──────────────────────────────────────────────────
  const padding = 12;
  const sx = spotRect ? spotRect.left - padding : 0;
  const sy = spotRect ? spotRect.top - padding : 0;
  const sw = spotRect ? spotRect.width + padding * 2 : 0;
  const sh = spotRect ? spotRect.height + padding * 2 : 0;

  // ── Card placement: prefer above target if room, else below ─────────────
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const CARD_W = 460;
  const CARD_H = 240;
  let cardLeft = vw / 2 - CARD_W / 2;
  let cardTop = vh / 2 - CARD_H / 2;
  if (spotRect) {
    cardLeft = Math.min(vw - CARD_W - 24, Math.max(24, sx + sw / 2 - CARD_W / 2));
    if (sy + sh + 24 + CARD_H < vh) cardTop = sy + sh + 24;
    else if (sy - 24 - CARD_H > 0) cardTop = sy - 24 - CARD_H;
    else cardTop = vh / 2 - CARD_H / 2;
  }

  return (
    <>
      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 99999,
            pointerEvents: "auto",
          }}
          aria-modal="true"
          role="dialog"
        >
          {/* ── Spotlight Mask ── */}
          <svg
            width="100%" height="100%"
            style={{ position: "absolute", inset: 0, display: "block", pointerEvents: "none" }}
          >
            <defs>
              <mask id="induction-mask">
                <rect width="100%" height="100%" fill="white" />
                {spotRect && (
                  <rect
                    x={sx} y={sy} width={sw} height={sh}
                    rx={14} ry={14}
                    fill="black"
                  />
                )}
              </mask>
              <radialGradient id="induction-violet" cx="50%" cy="50%" r="70%">
                <stop offset="0%" stopColor="rgba(139,92,246,0.45)" />
                <stop offset="55%" stopColor="rgba(13,17,23,0.88)" />
                <stop offset="100%" stopColor="rgba(7,10,16,0.97)" />
              </radialGradient>
            </defs>
            <rect
              width="100%" height="100%"
              fill={spotRect ? "rgba(7,10,16,0.78)" : "url(#induction-violet)"}
              mask="url(#induction-mask)"
              style={{ transition: "fill 0.4s ease" }}
            />
            {/* Spotlight ring around target */}
            {spotRect && (
              <>
                <rect
                  x={sx} y={sy} width={sw} height={sh}
                  rx={14} ry={14}
                  fill="none"
                  stroke={VIOLET_BRIGHT}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  style={{ filter: `drop-shadow(0 0 10px ${VIOLET})` }}
                >
                  <animate attributeName="stroke-dashoffset" from="0" to="20" dur="1.2s" repeatCount="indefinite" />
                </rect>
                <rect
                  x={sx - 4} y={sy - 4} width={sw + 8} height={sh + 8}
                  rx={18} ry={18}
                  fill="none"
                  stroke={VIOLET}
                  strokeWidth={1}
                  opacity={0.4}
                />
              </>
            )}
          </svg>

          {/* ── Glassmorphic Step Card ── */}
          <div
            style={{
              position: "absolute",
              left: cardLeft,
              top: cardTop,
              width: CARD_W,
              padding: "20px 22px",
              borderRadius: 16,
              background: "linear-gradient(180deg, rgba(20,18,38,0.88) 0%, rgba(13,17,23,0.92) 100%)",
              border: "1px solid rgba(139,92,246,0.45)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 40px ${VIOLET}33, inset 0 1px 0 rgba(255,255,255,0.06)`,
              transition: "left 0.4s cubic-bezier(.4,0,.2,1), top 0.4s cubic-bezier(.4,0,.2,1)",
              fontFamily: "JetBrains Mono, monospace",
              color: "#E5E7EB",
              pointerEvents: "auto",
            }}
          >
            {/* Progress dots */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {steps.map((_, i) => (
                <div key={i}
                  style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: i <= stepIdx ? VIOLET_BRIGHT : "rgba(139,92,246,0.18)",
                    boxShadow: i === stepIdx ? `0 0 8px ${VIOLET}` : undefined,
                    transition: "all 0.3s ease",
                  }}
                />
              ))}
            </div>

            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: VIOLET_BRIGHT, fontWeight: 700, marginBottom: 6 }}>
              {step.badge}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#F9FAFB", marginBottom: 10, letterSpacing: "-0.01em" }}>
              {step.title}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: "#CBD5E1", marginBottom: 18, minHeight: 60 }}>
              {step.body}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <button
                onClick={handleSkip}
                style={{
                  fontSize: 9, letterSpacing: "0.16em", fontWeight: 700, fontFamily: "inherit",
                  padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                  background: skipConfirm ? `${CRIMSON}22` : "transparent",
                  color: skipConfirm ? "#FCA5A5" : "rgba(203,213,225,0.55)",
                  border: `1px solid ${skipConfirm ? `${CRIMSON}66` : "rgba(203,213,225,0.18)"}`,
                  transition: "all 0.2s ease",
                }}
                title={skipConfirm ? "Click again to confirm" : "Skip the briefing (requires double-confirmation)"}
              >
                {skipConfirm ? "⚠ CONFIRM SKIP" : "SKIP BRIEFING"}
              </button>

              <div style={{ display: "flex", gap: 6 }}>
                {stepIdx > 0 && !isLast && (
                  <button
                    onClick={handleBack}
                    style={{
                      fontSize: 9, letterSpacing: "0.16em", fontWeight: 700, fontFamily: "inherit",
                      padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                      background: "transparent",
                      color: "rgba(203,213,225,0.7)",
                      border: "1px solid rgba(203,213,225,0.18)",
                    }}
                  >
                    ← BACK
                  </button>
                )}
                <button
                  onClick={handleNext}
                  style={{
                    fontSize: 10, letterSpacing: "0.18em", fontWeight: 700, fontFamily: "inherit",
                    padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                    background: `linear-gradient(180deg, ${VIOLET} 0%, #6D28D9 100%)`,
                    color: "#fff",
                    border: `1px solid ${VIOLET_BRIGHT}`,
                    boxShadow: `0 4px 14px ${VIOLET}66, inset 0 1px 0 rgba(255,255,255,0.18)`,
                  }}
                >
                  {step.cta ?? (isLast ? "FINISH" : `NEXT · ${stepIdx + 1}/${steps.length - 1}`)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Certification Toast ── */}
      {certified && (
        <div
          style={{
            position: "fixed",
            top: 80,
            right: 24,
            zIndex: 99998,
            padding: "16px 22px",
            borderRadius: 12,
            background: `linear-gradient(135deg, ${SAGE}22 0%, ${VIOLET}22 100%)`,
            border: `1px solid ${SAGE}88`,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: `0 10px 40px ${SAGE}44, 0 0 30px ${VIOLET}33`,
            fontFamily: "JetBrains Mono, monospace",
            color: "#F9FAFB",
            minWidth: 340,
            animation: "induction-toast-in 0.5s cubic-bezier(.34,1.56,.64,1) both",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: SAGE, boxShadow: `0 0 10px ${SAGE}`,
              animation: "induction-pulse 1.4s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 9, letterSpacing: "0.22em", color: SAGE, fontWeight: 700 }}>
              SOVEREIGN TOKEN ISSUED
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.04em" }}>
            OPERATOR STATUS · CERTIFIED [v6.0]
          </div>
          <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 4, letterSpacing: "0.02em" }}>
            Welcome to Neural Sovereignty, Operator.
          </div>
        </div>
      )}

      <style>{`
        @keyframes induction-toast-in {
          from { opacity: 0; transform: translateX(40px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes induction-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.25); }
        }
      `}</style>
    </>
  );
}
