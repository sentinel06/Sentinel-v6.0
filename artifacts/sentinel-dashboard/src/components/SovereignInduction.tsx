import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useForensic } from "../contexts/ForensicContext";

const LS_ONBOARD = "sentinel_onboarded";
const LS_PERSONA = "sentinel_persona";
const LS_HEXID   = "sentinel_operator_hex";

const VIOLET = "#8B5CF6";
const VIOLET_BRIGHT = "#C084FC";
const SAGE = "#00F5FF";
const CRIMSON = "#B91C1C";
const AMBER = "#FFB800";

type Persona = "business" | "technical";

interface Step {
  id: string;
  badge: string;
  title: string;
  body: (p: Persona) => string;
  tour?: string;
  route?: string;
  action?: () => void;
  cta?: string;
}

interface InductionProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

// ── HEX-ID generator: SOV-XXXX-XXXX-XXXX ─────────────────────────────────
function generateOperatorHex(): string {
  const buf = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < 6; i++) buf[i] = Math.floor(Math.random() * 256);
  const hex = Array.from(buf).map(b => b.toString(16).toUpperCase().padStart(2, "0")).join("");
  return `SOV-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

// Suppressed routes: the tour must never overlay these pages
const SUPPRESSED_ROUTES = ["/onboarding", "/sign-in", "/sign-up", "/settings"];

// Outer wrapper: checks route before mounting the hook-heavy inner component
export default function SovereignInduction(props: InductionProps) {
  const [location] = useLocation();
  const isSuppressed = SUPPRESSED_ROUTES.some(
    r => location === r || location.startsWith(r + "/")
  );
  if (isSuppressed && !props.forceOpen) return null;
  return <SovereignInductionInner {...props} />;
}

function SovereignInductionInner({ forceOpen = false, onClose }: InductionProps) {
  const [, navigate] = useLocation();
  const { induceRogueQuarantine, setAgent, clusters, currentCluster, setCurrentCluster } = useForensic();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const previewTimersRef = useRef<number[]>([]);
  const previewOriginRef = useRef<string | null>(null);

  // Generic timers for non-preview side effects (e.g. hive rogue dispatch)
  const sideTimersRef = useRef<number[]>([]);
  const trackTimer = (id: number) => { sideTimersRef.current.push(id); return id; };
  const clearSideTimers = () => {
    sideTimersRef.current.forEach(t => window.clearTimeout(t));
    sideTimersRef.current = [];
  };

  const cancelClusterPreview = (restore: boolean) => {
    previewTimersRef.current.forEach(t => window.clearTimeout(t));
    previewTimersRef.current = [];
    if (restore && previewOriginRef.current !== null) {
      setCurrentCluster(previewOriginRef.current);
    }
    previewOriginRef.current = null;
  };

  // Combined teardown for any exit path (skip / restart / unmount / close)
  const teardownAllInductionEffects = () => {
    clearSideTimers();
    cancelClusterPreview(true);
  };

  const [open, setOpen] = useState<boolean>(() => {
    if (forceOpen) return true;
    try { return localStorage.getItem(LS_ONBOARD) !== "true"; } catch { return true; }
  });
  const [stepIdx, setStepIdx] = useState(-1);          // -1 = persona-select gate
  const [persona, setPersona] = useState<Persona>(() => {
    try { return (localStorage.getItem(LS_PERSONA) as Persona) || "business"; } catch { return "business"; }
  });
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [certified, setCertified] = useState(false);
  const [operatorHex, setOperatorHex] = useState<string>("");
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const inducedRef = useRef(false);

  // Re-trigger via global event
  useEffect(() => {
    const onRestart = () => {
      teardownAllInductionEffects();
      inducedRef.current = false;
      setStepIdx(-1);
      setSkipConfirm(false);
      setCertified(false);
      setOpen(true);
    };
    window.addEventListener("sentinel:induction-restart", onRestart);
    return () => window.removeEventListener("sentinel:induction-restart", onRestart);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On unmount: cancel side timers AND restore the user's original cluster
  // (avoid leaving the app stuck on a preview cluster if induction is unmounted mid-cycle).
  useEffect(() => () => teardownAllInductionEffects(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel cluster preview when leaving the cluster step
  useEffect(() => {
    if (!open || !step || step.id !== "clusters") {
      // If we just left the clusters step but timers still pending, restore origin and cancel
      if (previewTimersRef.current.length || previewOriginRef.current !== null) {
        cancelClusterPreview(true);
      }
    }
  }, [open, stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc key dismisses (uses double-confirm via skip flow)
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); handleSkip(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, skipConfirm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus the card on open / step change for keyboard users
  useEffect(() => {
    if (open && cardRef.current) cardRef.current.focus();
  }, [open, stepIdx]);

  // Adaptive lexicon
  const lex = useMemo(() => ({
    domain: persona === "business" ? "Governance" : "Forensics",
    domainLower: persona === "business" ? "governance" : "forensics",
    actor: persona === "business" ? "Compliance Officer" : "Forensics Engineer",
    drift: "Cognitive Drift (Policy Violation)",
    intervention: persona === "business" ? "Policy Interdiction" : "Token Revocation",
  }), [persona]);

  const steps: Step[] = useMemo(() => [
    {
      id: "pulse",
      badge: "STEP 01 · THE PULSE",
      title: "System Synchronized",
      body: (p) => p === "business"
        ? `Live ${lex.domainLower} telemetry refreshes every 2.5 seconds with zero page reload. The sage pulse is your real-time assurance that the Sovereign Watcher is on guard.`
        : `Live neural telemetry refreshes every 2.5 seconds with zero page reload. The sage pulse confirms your link to the Sovereign Watcher is healthy.`,
      tour: "live-pulse",
    },
    {
      id: "clusters",
      badge: "STEP 02 · MULTI-CLUSTER ISOLATION",
      title: "Enterprise-Grade Tenant Isolation",
      body: (p) => p === "business"
        ? `Every business unit — Legal, Finance, Ops — operates in a cryptographically isolated swarm. A breach in one cannot contaminate another. This proves MaroShield scales from a single agent to a global enterprise.`
        : `Each cluster is a sealed neural domain. Cross-tenant signal propagation is mathematically impossible. Watch as we toggle between Legal and Finance — note the hard cluster filter on the canvas.`,
      tour: "cluster-switcher",
      action: () => {
        previewOriginRef.current = currentCluster;
        const legal   = clusters.find(c => c.label.toLowerCase().includes("legal"));
        const finance = clusters.find(c => c.label.toLowerCase().includes("finance"));
        const fallbacks = clusters.filter(c => c.id !== "ALL" && c.id !== currentCluster);
        const a = legal ?? fallbacks[0];
        const b = finance ?? fallbacks.find(c => c.id !== a?.id) ?? fallbacks[1];
        if (a) {
          setCurrentCluster(a.id);
          if (b && b.id !== a.id) {
            previewTimersRef.current.push(window.setTimeout(() => setCurrentCluster(b.id), 1600));
            previewTimersRef.current.push(window.setTimeout(() => {
              setCurrentCluster(previewOriginRef.current ?? "ALL");
              previewOriginRef.current = null;
            }, 3400));
          } else {
            previewTimersRef.current.push(window.setTimeout(() => {
              setCurrentCluster(previewOriginRef.current ?? "ALL");
              previewOriginRef.current = null;
            }, 2200));
          }
        }
      },
    },
    {
      id: "hive",
      badge: "STEP 03 · NEURAL HIVE",
      title: "The Neural Hive",
      body: (p) => p === "business"
        ? `Each node is an autonomous agent under your ${lex.domainLower}. We are now injecting a synthetic rogue — watch its ${lex.drift} climb past the 25% red-line.`
        : `Each node is an autonomous agent under your ${lex.domainLower}. A synthetic rogue is being injected — observe ${lex.drift} escalation past the 25% quarantine threshold.`,
      tour: "swarm-canvas",
      route: "/swarmmap",
      action: () => {
        if (inducedRef.current) return;
        inducedRef.current = true;
        const id = `induction-rogue-${Date.now()}`;
        window.dispatchEvent(new CustomEvent("sentinel:induction-spawn", { detail: { id, label: "rogue-drill-α" } }));
        trackTimer(window.setTimeout(() => {
          induceRogueQuarantine(id, "rogue-drill-α", 30);
          window.dispatchEvent(new CustomEvent("sentinel:induction-quarantine", { detail: { id, label: "rogue-drill-α" } }));
        }, 2200));
      },
    },
    {
      id: "interdiction",
      badge: "STEP 04 · AUTONOMOUS INTERDICTION",
      title: persona === "business" ? "Policy Violation Auto-Contained" : "Sovereign Token Revoked",
      body: (p) => p === "business"
        ? `${lex.intervention} executed in under 1 millisecond. The rogue agent is sealed in the Quarantine Grid — no contamination, no escalation, no human delay. Your audit trail is automatic.`
        : `${lex.intervention} completed at sub-millisecond latency to prevent logic contamination. The agent is sealed inside the Quarantine Grid; the EQA log block is hash-chained.`,
      tour: "quarantine-zone",
    },
    {
      id: "replay",
      badge: "STEP 05 · FORENSIC TIME-TRAVEL",
      title: "Neural Replay Scrubber",
      body: (p) => p === "business"
        ? `Drag the Neural Replay slider to rewind any agent's decisions to the precise moment of violation. Every snapshot is timestamped and tamper-sealed for legal evidence.`
        : `Scrub the Neural Replay timeline to inspect any agent's prior cognitive state. Every snapshot is SLSA L4 attested and FIPS-204 hash-chained for chain-of-custody.`,
      tour: "neural-replay",
      action: () => {
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
      badge: "STEP 06 · BOARD-READY EVIDENCE",
      title: "The EQA Export",
      body: (p) => p === "business"
        ? `Generate EQA exports a tamper-sealed, FIPS-204 signed audit packet. Hand it to your Board, your auditor, or your regulator — your legal shield under EU AI Act and NIST AI RMF.`
        : `EQA produces a Merkle-rooted, FIPS-204 attested audit bundle. SHA-256 chain integrity is verifiable offline. Drop the JSON into your SIEM or hand to counsel.`,
      tour: "generate-eqa",
      route: "/eqa",
    },
    {
      id: "certify",
      badge: "OPERATOR CERTIFICATION",
      title: "OPERATOR STATUS · CERTIFIED [v6.0]",
      body: () => `Sovereign Token issued. You are now certified to operate MaroShield v6.0 ${lex.domain} fleet. The Neural Hive is yours. Welcome to Neural Sovereignty.`,
      cta: "ASSUME COMMAND",
    },
  ], [persona, lex, induceRogueQuarantine, setAgent, clusters, setCurrentCluster]);

  const step = stepIdx >= 0 ? steps[stepIdx] : null;
  const isLast = stepIdx === steps.length - 1;

  // ── Side-effect on entering each step ────────────────────────────────────
  useEffect(() => {
    if (!open || !step) return undefined;
    if (step.route) navigate(step.route);
    if (step.action) {
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

  // Skip-confirm timeout
  useEffect(() => {
    if (!skipConfirm) return;
    const t = setTimeout(() => setSkipConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [skipConfirm]);

  function persistOnboard() {
    try {
      localStorage.setItem(LS_ONBOARD, "true");
      localStorage.setItem(LS_PERSONA, persona);
    } catch {}
  }
  function persistHex(hex: string) {
    try { localStorage.setItem(LS_HEXID, hex); } catch {}
  }

  function handleStart() {
    try { localStorage.setItem(LS_PERSONA, persona); } catch {}
    setStepIdx(0);
  }

  function handleNext() {
    if (isLast) {
      teardownAllInductionEffects();
      const hex = (() => {
        try { return localStorage.getItem(LS_HEXID) || generateOperatorHex(); }
        catch { return generateOperatorHex(); }
      })();
      persistHex(hex);
      persistOnboard();
      setOperatorHex(hex);
      setCertified(true);
      setOpen(false);
      // Notify the rest of the app (sidebar badge re-reads localStorage)
      window.dispatchEvent(new CustomEvent("sentinel:operator-certified", { detail: { hex, persona } }));
      onClose?.();
      trackTimer(window.setTimeout(() => setCertified(false), 8500));
      return;
    }
    setStepIdx(i => Math.min(i + 1, steps.length - 1));
  }
  function handleBack() {
    if (stepIdx === 0) { setStepIdx(-1); return; }
    setStepIdx(i => Math.max(0, i - 1));
  }
  function handleSkip() {
    if (!skipConfirm) { setSkipConfirm(true); return; }
    teardownAllInductionEffects();
    persistOnboard();
    setOpen(false);
    onClose?.();
  }
  function handleCtaInit() {
    teardownAllInductionEffects();
    persistOnboard();
    setOpen(false);
    onClose?.();
    navigate("/swarmmap");
  }
  function handleCtaChaos() {
    teardownAllInductionEffects();
    persistOnboard();
    setOpen(false);
    onClose?.();
    navigate("/swarmmap");
    setTimeout(() => window.dispatchEvent(new CustomEvent("sentinel:trigger-chaos")), 350);
  }

  if (!open && !certified) return null;

  // ── Spotlight geometry ──────────────────────────────────────────────────
  const padding = 12;
  const sx = spotRect ? spotRect.left - padding : 0;
  const sy = spotRect ? spotRect.top - padding : 0;
  const sw = spotRect ? spotRect.width + padding * 2 : 0;
  const sh = spotRect ? spotRect.height + padding * 2 : 0;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const CARD_W = 480;
  const CARD_H = 260;
  let cardLeft = vw / 2 - CARD_W / 2;
  let cardTop = vh / 2 - CARD_H / 2;
  if (spotRect && step) {
    cardLeft = Math.min(vw - CARD_W - 24, Math.max(24, sx + sw / 2 - CARD_W / 2));
    if (sy + sh + 24 + CARD_H < vh) cardTop = sy + sh + 24;
    else if (sy - 24 - CARD_H > 0) cardTop = sy - 24 - CARD_H;
    else cardTop = vh / 2 - CARD_H / 2;
  }

  // Effective step count for progress dots (excluding gate)
  const totalSteps = steps.length;
  const visibleIdx = Math.max(0, stepIdx);

  return (
    <>
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 99999, pointerEvents: "auto" }}
          aria-modal="true"
          role="dialog"
          aria-labelledby="induction-title"
          aria-describedby="induction-body"
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
                  <rect x={sx} y={sy} width={sw} height={sh} rx={14} ry={14} fill="black" />
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
            {spotRect && (
              <>
                <rect
                  x={sx} y={sy} width={sw} height={sh} rx={14} ry={14}
                  fill="none" stroke={VIOLET_BRIGHT} strokeWidth={2} strokeDasharray="6 4"
                  style={{ filter: `drop-shadow(0 0 10px ${VIOLET})` }}
                >
                  <animate attributeName="stroke-dashoffset" from="0" to="20" dur="1.2s" repeatCount="indefinite" />
                </rect>
                <rect
                  x={sx - 4} y={sy - 4} width={sw + 8} height={sh + 8} rx={18} ry={18}
                  fill="none" stroke={VIOLET} strokeWidth={1} opacity={0.4}
                />
              </>
            )}
          </svg>

          {/* ── Glassmorphic Card ── */}
          <div
            ref={cardRef}
            tabIndex={-1}
            style={{
              position: "absolute",
              left: cardLeft, top: cardTop, width: CARD_W,
              outline: "none",
              padding: "20px 22px", borderRadius: 16,
              background: "linear-gradient(180deg, rgba(20,18,38,0.92) 0%, rgba(13,17,23,0.94) 100%)",
              border: "1px solid rgba(139,92,246,0.45)",
              backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 40px ${VIOLET}33, inset 0 1px 0 rgba(255,255,255,0.06)`,
              transition: "left 0.4s cubic-bezier(.4,0,.2,1), top 0.4s cubic-bezier(.4,0,.2,1)",
              fontFamily: "JetBrains Mono, monospace", color: "#E5E7EB",
              pointerEvents: "auto",
            }}
          >
            {/* Persona-select gate */}
            {stepIdx === -1 && (
              <>
                <div style={{ fontSize: 10, letterSpacing: "0.16em", color: VIOLET_BRIGHT, fontWeight: 600, marginBottom: 6, fontFamily: "Inter, system-ui, sans-serif" }}>
                  Welcome to MaroShield
                </div>
                <div id="induction-title" style={{ fontSize: 19, fontWeight: 600, color: "#F9FAFB", marginBottom: 10, letterSpacing: "-0.01em", fontFamily: "Inter, system-ui, sans-serif" }}>
                  Let's give you a quick tour.
                </div>
                <div id="induction-body" style={{ fontSize: 13, lineHeight: 1.55, color: "#CBD5E1", marginBottom: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
                  Pick your background so we can speak your language. The whole tour takes about 90 seconds.
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {(["business", "technical"] as Persona[]).map(opt => {
                    const sel = persona === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => setPersona(opt)}
                        style={{
                          flex: 1, padding: "12px 10px", borderRadius: 10, cursor: "pointer",
                          background: sel ? `linear-gradient(180deg, ${VIOLET}33 0%, ${VIOLET}11 100%)` : "rgba(255,255,255,0.02)",
                          border: `1px solid ${sel ? VIOLET_BRIGHT : "rgba(255,255,255,0.10)"}`,
                          color: sel ? "#F9FAFB" : "#94A3B8",
                          textAlign: "left", fontFamily: "inherit",
                          boxShadow: sel ? `0 0 20px ${VIOLET}44, inset 0 1px 0 rgba(255,255,255,0.08)` : "none",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <div style={{ fontSize: 10, letterSpacing: "0.06em", fontWeight: 600, color: sel ? VIOLET_BRIGHT : "#64748B", marginBottom: 4, fontFamily: "Inter, system-ui, sans-serif" }}>
                          {opt === "business" ? "I'm in business" : "I'm technical"}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3, fontFamily: "Inter, system-ui, sans-serif" }}>
                          {opt === "business" ? "Governance" : "Forensics"}
                        </div>
                        <div style={{ fontSize: 11, color: sel ? "#CBD5E1" : "#64748B", lineHeight: 1.45, fontFamily: "Inter, system-ui, sans-serif" }}>
                          {opt === "business" ? "Compliance · Board · Audit" : "Engineering · IR · Threat Hunt"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    onClick={handleSkip}
                    style={{
                      fontSize: 12, letterSpacing: "0", fontWeight: 500,
                      fontFamily: "Inter, system-ui, sans-serif",
                      padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                      background: skipConfirm ? `${AMBER}18` : "transparent",
                      color: skipConfirm ? AMBER : "rgba(203,213,225,0.7)",
                      border: `1px solid ${skipConfirm ? `${AMBER}55` : "rgba(203,213,225,0.18)"}`,
                    }}
                  >{skipConfirm ? "Click again to skip" : "Maybe later"}</button>
                  <button
                    onClick={handleStart}
                    style={{
                      fontSize: 13, letterSpacing: "0", fontWeight: 600,
                      fontFamily: "Inter, system-ui, sans-serif",
                      padding: "10px 20px", borderRadius: 8, cursor: "pointer",
                      background: `linear-gradient(180deg, ${VIOLET} 0%, #6D28D9 100%)`,
                      color: "#fff", border: `1px solid ${VIOLET_BRIGHT}`,
                      boxShadow: `0 4px 14px ${VIOLET}66, inset 0 1px 0 rgba(255,255,255,0.18)`,
                    }}
                  >Start the tour →</button>
                </div>
              </>
            )}

            {/* Active step */}
            {step && (
              <>
                <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                  {steps.map((_, i) => (
                    <div key={i}
                      style={{
                        flex: 1, height: 3, borderRadius: 2,
                        background: i <= visibleIdx ? VIOLET_BRIGHT : "rgba(139,92,246,0.18)",
                        boxShadow: i === visibleIdx ? `0 0 8px ${VIOLET}` : undefined,
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.22em", color: VIOLET_BRIGHT, fontWeight: 700 }}>
                    {step.badge}
                  </div>
                  <div style={{ fontSize: 8, letterSpacing: "0.18em", color: "rgba(203,213,225,0.45)", fontWeight: 700 }}>
                    {lex.domain.toUpperCase()} MODE
                  </div>
                </div>
                <div id="induction-title" style={{ fontSize: 17, fontWeight: 700, color: "#F9FAFB", marginBottom: 10, letterSpacing: "-0.01em" }}>
                  {step.title}
                </div>
                <div id="induction-body" style={{ fontSize: 12, lineHeight: 1.55, color: "#CBD5E1", marginBottom: 18, minHeight: 60 }}>
                  {step.body(persona)}
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
                  >{skipConfirm ? "⚠ CONFIRM SKIP" : "SKIP BRIEFING"}</button>

                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={handleBack}
                      style={{
                        fontSize: 9, letterSpacing: "0.16em", fontWeight: 700, fontFamily: "inherit",
                        padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                        background: "transparent", color: "rgba(203,213,225,0.7)",
                        border: "1px solid rgba(203,213,225,0.18)",
                      }}
                    >← BACK</button>
                    <button
                      onClick={handleNext}
                      style={{
                        fontSize: 10, letterSpacing: "0.18em", fontWeight: 700, fontFamily: "inherit",
                        padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                        background: `linear-gradient(180deg, ${VIOLET} 0%, #6D28D9 100%)`,
                        color: "#fff", border: `1px solid ${VIOLET_BRIGHT}`,
                        boxShadow: `0 4px 14px ${VIOLET}66, inset 0 1px 0 rgba(255,255,255,0.18)`,
                      }}
                    >{step.cta ?? (isLast ? "FINISH" : `NEXT · ${visibleIdx + 1}/${totalSteps - 1}`)}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── High-Fidelity Certification Animation ── */}
      {certified && operatorHex && (
        <>
          {/* Ambient violet+sage flash */}
          <div style={{
            position: "fixed", inset: 0, zIndex: 99997, pointerEvents: "none",
            background: `radial-gradient(circle at 50% 50%, ${VIOLET}33 0%, ${SAGE}1A 35%, transparent 65%)`,
            animation: "induction-flash 1.2s ease-out forwards",
          }} />
          {/* Sigil + HEX-ID card */}
          <div
            style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 99998,
              padding: "26px 32px",
              borderRadius: 16,
              background: "linear-gradient(180deg, rgba(20,18,38,0.96) 0%, rgba(13,17,23,0.98) 100%)",
              border: `1px solid ${VIOLET_BRIGHT}`,
              boxShadow: `0 30px 80px rgba(0,0,0,0.7), 0 0 80px ${VIOLET}66, 0 0 120px ${SAGE}33, inset 0 1px 0 rgba(255,255,255,0.08)`,
              fontFamily: "JetBrains Mono, monospace",
              color: "#F9FAFB", minWidth: 380, textAlign: "center",
              animation: "induction-cert-rise 0.9s cubic-bezier(.34,1.56,.64,1) both",
              pointerEvents: "auto",
            }}
          >
            {/* Concentric Sovereign Sigil */}
            <svg width="84" height="84" viewBox="0 0 84 84" style={{ display: "block", margin: "0 auto 14px" }}>
              <defs>
                <radialGradient id="sigil-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={VIOLET_BRIGHT} stopOpacity="0.9" />
                  <stop offset="60%" stopColor={VIOLET} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={VIOLET} stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="42" cy="42" r="36" fill="none" stroke={VIOLET} strokeWidth="1" opacity="0.4">
                <animate attributeName="r" from="20" to="36" dur="0.8s" fill="freeze" />
                <animate attributeName="opacity" from="0" to="0.4" dur="0.8s" fill="freeze" />
              </circle>
              <circle cx="42" cy="42" r="28" fill="url(#sigil-grad)">
                <animate attributeName="opacity" from="0" to="1" dur="0.6s" begin="0.2s" fill="freeze" />
              </circle>
              <circle cx="42" cy="42" r="22" fill="none" stroke={VIOLET_BRIGHT} strokeWidth="1.5" strokeDasharray="3 3">
                <animateTransform attributeName="transform" type="rotate" from="0 42 42" to="360 42 42" dur="8s" repeatCount="indefinite" />
              </circle>
              <path d="M42 22 L52 42 L42 62 L32 42 Z" fill={SAGE} opacity="0.9">
                <animate attributeName="opacity" from="0" to="0.9" dur="0.4s" begin="0.5s" fill="freeze" />
              </path>
              <circle cx="42" cy="42" r="4" fill="#F9FAFB">
                <animate attributeName="r" from="0" to="4" dur="0.3s" begin="0.7s" fill="freeze" />
              </circle>
            </svg>

            <div style={{
              fontSize: 9, letterSpacing: "0.28em", color: SAGE, fontWeight: 700, marginBottom: 4,
            }}>SOVEREIGN TOKEN ISSUED</div>
            <div style={{
              fontSize: 16, fontWeight: 700, letterSpacing: "0.04em", color: "#F9FAFB", marginBottom: 12,
            }}>OPERATOR · CERTIFIED [v6.0]</div>

            <div style={{
              fontSize: 8, letterSpacing: "0.2em", color: VIOLET_BRIGHT, fontWeight: 700, marginBottom: 4,
            }}>SOVEREIGN HEX-ID</div>
            <div style={{
              fontSize: 15, fontWeight: 700, letterSpacing: "0.08em",
              padding: "8px 14px", borderRadius: 8, display: "inline-block",
              background: `linear-gradient(180deg, ${VIOLET}22 0%, ${VIOLET}0A 100%)`,
              border: `1px solid ${VIOLET_BRIGHT}88`,
              color: "#F9FAFB", marginBottom: 14,
              fontFamily: "JetBrains Mono, monospace",
            }}>{operatorHex}</div>

            <div style={{ fontSize: 10, color: "#94A3B8", letterSpacing: "0.04em", lineHeight: 1.5 }}>
              MISSION READY. Welcome to Neural Sovereignty.
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "center" }}>
              <button
                onClick={handleCtaInit}
                style={{
                  fontSize: 9, letterSpacing: "0.16em", fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
                  padding: "9px 14px", borderRadius: 6, cursor: "pointer",
                  background: `linear-gradient(180deg, ${VIOLET} 0%, #6D28D9 100%)`,
                  color: "#fff", border: `1px solid ${VIOLET_BRIGHT}`,
                  boxShadow: `0 4px 14px ${VIOLET}66`,
                }}
              >🛰  INITIALIZE FIRST CLUSTER</button>
              <button
                onClick={handleCtaChaos}
                style={{
                  fontSize: 9, letterSpacing: "0.16em", fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
                  padding: "9px 14px", borderRadius: 6, cursor: "pointer",
                  background: "transparent",
                  color: AMBER, border: `1px solid ${AMBER}66`,
                }}
              >⚡ CHAOS MODE STRESS-TEST</button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes induction-flash {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes induction-cert-rise {
          0%   { opacity: 0; transform: translate(-50%, -45%) scale(0.85); }
          60%  { opacity: 1; transform: translate(-50%, -50%) scale(1.04); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </>
  );
}
