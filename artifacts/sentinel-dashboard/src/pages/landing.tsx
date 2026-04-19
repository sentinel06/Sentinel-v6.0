import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Lock, FileCheck2, Activity, ArrowRight, FileText } from "lucide-react";

// ── Sovereign palette (must stay in sync with dashboard) ───────────────────
const SLATE   = "#020617";
const VIOLET  = "#8B5CF6";
const SAGE    = "#40B595";
const AMBER   = "#EBC06D";
const TERRA   = "#D96161";

export default function LandingPage() {
  const [, navigate] = useLocation();

  // Lock the page to a single non-scrolling viewport on DESKTOP only
  // (>= 768px). On mobile the gate gracefully scrolls so the content fits any
  // form factor without clipping behind the URL bar. We re-evaluate on resize.
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    const apply = () => {
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      document.documentElement.style.overflow = desktop ? "hidden" : "";
      document.body.style.overflow = desktop ? "hidden" : "";
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  const proofCards = [
    {
      icon: Activity,
      color: SAGE,
      title: "FORENSIC FIDELITY",
      body: "Sub-1ms interdiction latency. Real-time neural drift detection.",
    },
    {
      icon: Lock,
      color: VIOLET,
      title: "CRYPTOGRAPHIC SEAL",
      body: "FIPS 204 (ML-DSA-87) signatures on every agent lifecycle event.",
    },
    {
      icon: FileCheck2,
      color: AMBER,
      title: "AUDIT-READY",
      body: "Instant Sovereign Data Room generation for M&A and regulatory review.",
    },
  ];

  return (
    <div
      // ── Global mobile lock ──
      // p-4 md:p-10 prevents the headline & cards from kissing the screen edge.
      // Mobile: min-h-screen so content can grow; Desktop: h-screen + overflow
      // hidden enforces the original "single high-impact screen" brief.
      // pb-20 md:pb-0 reserves a safe area on mobile so the vault never sits
      // under the iOS/Android URL bar.
      className="relative min-h-screen md:h-screen overflow-x-hidden md:overflow-hidden p-4 md:p-10 pb-20 md:pb-0 flex flex-col"
      style={{
        background: SLATE,
        color: "#E5E7EB",
        fontFamily: "'Inter', 'JetBrains Mono', ui-monospace, monospace",
      }}
    >
      {/* ── Layer 1: subtle structured grid pattern (suggests structured data) ── */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Layer 2: slow-pulsing radial gradient (the "Sovereign Pulse") ── */}
      <div
        aria-hidden
        className="sovereign-pulse"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "120vmin",
          height: "120vmin",
          background: `radial-gradient(circle at center,
            ${VIOLET}30 0%,
            ${VIOLET}10 25%,
            ${SLATE}00 60%)`,
          pointerEvents: "none",
          filter: "blur(20px)",
        }}
      />

      {/* ── Layer 3: top-left integrity wordmark ── */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 32,
          display: "flex",
          alignItems: "center",
          gap: 10,
          zIndex: 5,
        }}
      >
        <ShieldCheck className="w-5 h-5" style={{ color: SAGE }} />
        <div className="font-mono text-[11px] font-bold tracking-[0.24em]" style={{ color: "#9CA3AF" }}>
          AGENT-SENTINEL
        </div>
        <span
          className="font-mono text-[9px] font-bold px-2 py-0.5 rounded"
          style={{
            color: VIOLET,
            background: VIOLET + "18",
            border: `1px solid ${VIOLET}55`,
            letterSpacing: "0.16em",
          }}
        >
          v6.0 · NEURAL SOVEREIGNTY
        </span>
      </div>

      {/* ── Layer 4: top-right status pill ── */}
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 32,
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 5,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: SAGE,
            boxShadow: `0 0 8px ${SAGE}`,
            animation: "sov-blink 1.6s ease-in-out infinite",
          }}
        />
        <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: SAGE }}>
          SOVEREIGN MESH · ONLINE
        </span>
      </div>

      {/* ── Layer 5: hero content ── */}
      <div
        // Centered column · gap shrinks on mobile · max width prevents stretch
        // on ultra-wide screens. Vertical centering via flex on desktop.
        className="relative z-[2] flex-1 flex flex-col items-center justify-center gap-6 md:gap-8 w-full"
      >
        {/* Headline + sub-headline */}
        <div className="text-center w-full max-w-[980px] mx-auto">
          <h1
            // Fluid typography per brief: text-3xl on phones, text-5xl on
            // tablets, text-6xl on desktops. tracking-tighter on small screens
            // prevents word-break collisions; widens to 0.10em on md+ for the
            // sovereign typographic spec.
            className="font-bold text-3xl md:text-5xl lg:text-6xl leading-tight tracking-tighter md:tracking-[0.08em] lg:tracking-[0.10em] md:leading-[1.05]"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              margin: 0,
              background: `linear-gradient(135deg, ${SAGE} 0%, ${VIOLET} 60%, #C4B5FD 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: `0 0 60px ${VIOLET}40`,
            }}
          >
            NEURAL SOVEREIGNTY.<br />GOVERNANCE AT SCALE.
          </h1>
          <p
            className="mt-4 md:mt-5 mx-auto max-w-[760px] text-[11px] md:text-sm lg:text-base leading-relaxed"
            style={{
              color: "#9CA3AF",
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              letterSpacing: "0.02em",
            }}
          >
            Post-Quantum Interdiction &amp; SLSA L4 Provenance for Autonomous Agent Swarms.
            <br className="hidden sm:inline" />
            {" "}Built for the EU AI Act compliance era.
          </p>
        </div>

        {/* Proof cards — stacked on mobile, three-up on tablet+ */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 w-full max-w-[1080px]">
          {proofCards.map(({ icon: Icon, color, title, body }) => (
            <div
              key={title}
              // Full width on mobile gives icons + headlines room to breathe;
              // exact thirds on md+ so the three proof points align as a row.
              className="w-full md:w-1/3 rounded-xl flex flex-col gap-2 px-4 py-4 md:px-[18px] md:py-4"
              style={{
                background: "rgba(15, 23, 42, 0.55)",
                border: `1px solid ${color}33`,
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.02), 0 0 24px ${color}10`,
                minHeight: 100,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon className="w-4 h-4" style={{ color }} />
                <span
                  className="font-mono font-bold"
                  style={{ color, fontSize: 11, letterSpacing: "0.18em" }}
                >
                  {title}
                </span>
              </div>
              <p
                style={{
                  color: "#CBD5E1",
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  lineHeight: 1.55,
                  margin: 0,
                  letterSpacing: "0.01em",
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>

        {/* Entry Protocol — glassmorphic identity verification box */}
        {/* max-h-[90vh] guarantees the vault never bleeds under the mobile
             URL bar even on the smallest viewports. overflow-y-auto lets the
             internal terminal lines scroll if the screen is truly tiny. */}
        <div
          className="w-full max-w-[540px] text-center rounded-[14px] px-5 py-5 md:px-7 md:pt-[18px] md:pb-[22px] max-h-[90vh] overflow-y-auto"
          style={{
            background: "rgba(2, 6, 23, 0.65)",
            border: `1px solid ${VIOLET}44`,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 0 60px ${VIOLET}28, inset 0 0 30px ${VIOLET}10`,
          }}
        >
          {/* Header strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 14,
              paddingBottom: 12,
              borderBottom: `1px solid ${VIOLET}22`,
            }}
          >
            <Lock className="w-3.5 h-3.5" style={{ color: VIOLET }} />
            <span
              className="font-mono font-bold"
              style={{ color: VIOLET, fontSize: 11, letterSpacing: "0.28em" }}
            >
              IDENTITY VERIFICATION
            </span>
            <span
              style={{
                display: "inline-block",
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: SAGE,
                boxShadow: `0 0 6px ${SAGE}`,
                marginLeft: 4,
              }}
            />
          </div>

          {/* Field-style line for terminal feel */}
          <div
            className="font-mono"
            style={{
              fontSize: 10,
              color: "#64748B",
              letterSpacing: "0.08em",
              marginBottom: 16,
              textAlign: "left",
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}
          >
            <div>&gt; clearance_required: <span style={{ color: AMBER }}>READ-ONLY-AUDIT</span></div>
            <div>&gt; provenance_chain : <span style={{ color: SAGE }}>SLSA L4 ✓</span></div>
            <div>&gt; quantum_seal     : <span style={{ color: SAGE }}>FIPS 204 ✓</span></div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Primary — INITIALIZE GUEST AUDIT */}
            <button
              onClick={() => navigate("/dashboard")}
              className="font-mono font-bold transition-all"
              style={{
                width: "100%",
                padding: "12px 20px",
                background: `linear-gradient(135deg, ${VIOLET}, #7C3AED)`,
                color: "#FFFFFF",
                border: `1px solid ${VIOLET}88`,
                borderRadius: 8,
                fontSize: 12,
                letterSpacing: "0.22em",
                cursor: "pointer",
                boxShadow: `0 0 24px ${VIOLET}66, inset 0 0 12px rgba(255,255,255,0.08)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 40px ${VIOLET}aa, inset 0 0 20px rgba(255,255,255,0.14)`;
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 24px ${VIOLET}66, inset 0 0 12px rgba(255,255,255,0.08)`;
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              }}
            >
              INITIALIZE GUEST AUDIT
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Secondary — DOCUMENTATION / WHITE PAPER */}
            <button
              onClick={() => navigate("/badge")}
              className="font-mono font-bold transition-all"
              style={{
                width: "100%",
                padding: "10px 20px",
                background: "transparent",
                color: "#CBD5E1",
                border: `1px solid ${VIOLET}55`,
                borderRadius: 8,
                fontSize: 11,
                letterSpacing: "0.22em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = VIOLET + "12";
                (e.currentTarget as HTMLButtonElement).style.borderColor = VIOLET + "aa";
                (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                (e.currentTarget as HTMLButtonElement).style.borderColor = VIOLET + "55";
                (e.currentTarget as HTMLButtonElement).style.color = "#CBD5E1";
              }}
            >
              <FileText className="w-3.5 h-3.5" />
              DOCUMENTATION / WHITE PAPER
            </button>
          </div>
        </div>
      </div>

      {/* ── Layer 6: bottom-edge regulatory legend ──
           flex-wrap + gap ensures EU AI ACT / NIST etc. wrap onto multiple
           lines on narrow viewports instead of overlapping or overflowing. */}
      <div
        className="absolute bottom-4 left-0 right-0 z-[3] px-4 flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-[10px] md:text-xs"
        style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          color: "#475569",
          letterSpacing: "0.18em",
        }}
      >
        <span>EU AI ACT</span>
        <span style={{ color: VIOLET + "88" }} className="hidden sm:inline">·</span>
        <span>SOC 2</span>
        <span style={{ color: VIOLET + "88" }} className="hidden sm:inline">·</span>
        <span>NIST AI RMF</span>
        <span style={{ color: VIOLET + "88" }} className="hidden sm:inline">·</span>
        <span>ISO/IEC 42001</span>
      </div>

      {/* Local keyframes — slow Sovereign Pulse + cursor blink */}
      <style>{`
        @keyframes sov-pulse {
          0%, 100% { opacity: 0.55; transform: translate(-50%, -50%) scale(1); }
          50%      { opacity: 1.00; transform: translate(-50%, -50%) scale(1.08); }
        }
        .sovereign-pulse { animation: sov-pulse 6s ease-in-out infinite; }
        @keyframes sov-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
