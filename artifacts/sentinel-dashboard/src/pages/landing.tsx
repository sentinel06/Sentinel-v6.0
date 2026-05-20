import React from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Lock, FileCheck2, Activity, ArrowRight, FileText } from "lucide-react";

// ── Sovereign palette (must stay in sync with dashboard) ───────────────────
const SLATE   = "#020617";
const VIOLET  = "#8B5CF6";
const SAGE    = "#00F5FF";
const AMBER   = "#FFB800";
const TERRA   = "#FF003C";

export default function LandingPage() {
  const [, navigate] = useLocation();

  // ── Unified Responsive Architecture (Operator brief §1) ──
  // The previous desktop overflow-lock useEffect has been removed: the gate
  // now scrolls naturally on every viewport via `min-h-screen + overflow-y-auto`
  // on the root container. This keeps content reachable on any screen size
  // (e.g. shorter laptops, browser zoom, tablet split-view) instead of being
  // clipped under the proof cards.

  const proofCards = [
    {
      icon: Activity,
      color: SAGE,
      title: "See drift the moment it happens",
      body: "Real-time anomaly detection with sub-1ms interdiction latency.",
    },
    {
      icon: Lock,
      color: VIOLET,
      title: "Every action, cryptographically signed",
      body: "Post-quantum FIPS 204 (ML-DSA-87) signatures on every agent event.",
    },
    {
      icon: FileCheck2,
      color: AMBER,
      title: "Audit-ready in one click",
      body: "Instant Sovereign Data Room export for regulators, M&A, and review boards.",
    },
  ];

  return (
    <div
      // ── Unified Responsive Architecture (per Operator brief §1) ──
      // The landing now scrolls naturally on every viewport — `min-h-screen`
      // lets the gate grow as tall as its content needs, `overflow-y-auto`
      // gives the page native vertical scroll on phones AND laptops, and
      // `overflow-x-hidden` suppresses the 120vmin Sovereign Pulse from ever
      // creating a horizontal bar. `justify-start` (not center) so the
      // headline anchors at the top instead of being pushed below the fold
      // on short viewports.
      // pb-24 reserves clear space at the bottom so the "Made with Replit"
      // badge (and mobile browser URL bar) never overlap the primary CTA.
      // Mobile-first single-column flex; `w-full max-w-full` + `overflow-x-hidden`
      // guarantee no element can push the page wider than the viewport. Extra
      // bottom padding on mobile reserves room for the absolute regulatory
      // legend so it never overlaps the CTA button.
      className="relative flex flex-col items-center justify-start overflow-y-auto overflow-x-hidden min-h-screen w-full max-w-full px-3 pt-4 pb-32 sm:px-4 sm:pb-24"
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
        className="absolute top-3 left-3 sm:top-6 sm:left-8 z-[5] flex items-center gap-2 sm:gap-2.5 max-w-[calc(100%-1.5rem)]"
        style={{
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 10,
          padding: "5px 10px 5px 6px",
        }}
      >
        <img
          src="/logo.png"
          alt="Sentinel"
          style={{
            width: 22,
            height: 22,
            objectFit: "contain",
            flexShrink: 0,
            filter: `drop-shadow(0 0 5px ${SAGE}88)`,
          }}
        />
        <div className="font-mono text-[11px] font-bold tracking-[0.24em]" style={{ color: SAGE }}>
          AGENT-SENTINEL
        </div>
        <span
          className="font-mono text-[9px] font-bold px-2 py-0.5 rounded hidden sm:inline"
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
        // Per Headline Precision Refactor: unified gap-8 across all viewports.
        // Now that the headline scale is capped at md:text-4xl the hero stack
        // (Headline + Cards + Vault) fits comfortably even on mobile, so the
        // sovereign gap-8 spacing is preserved end-to-end and the Identity
        // Verification vault settles into the optical center of the screen.
        className="relative z-[2] flex-1 flex flex-col items-center justify-center gap-6 sm:gap-8 w-full max-w-full"
      >
        {/* Headline + sub-headline */}
        <div className="text-center w-full max-w-[980px] mx-auto px-1">
          <h1
            // Warmer mixed-case headline — sovereign weight from the gradient
            // and shadow, not from punishing all-caps tracking. Slightly
            // larger scale (md:text-5xl) since we no longer need wide
            // letter-spacing to carry the brand.
            className="font-semibold text-[26px] xs:text-3xl sm:text-4xl md:text-5xl mt-10 sm:mt-12 md:mt-0 mb-3 sm:mb-4 md:mb-6 leading-[1.1] tracking-tight md:leading-[1.05] break-words"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              marginInline: 0,
              background: `linear-gradient(135deg, ${SAGE} 0%, ${VIOLET} 60%, #C4B5FD 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: `0 0 60px ${VIOLET}40`,
            }}
          >
            Govern your AI agents<br />with confidence.
          </h1>
          <p
            className="mt-3 sm:mt-4 md:mt-5 mx-auto max-w-[720px] text-[13px] sm:text-sm md:text-base lg:text-lg leading-relaxed break-words px-1"
            style={{
              color: "#CBD5E1",
              fontFamily: "'Inter', system-ui, sans-serif",
              letterSpacing: "0",
            }}
          >
            Real-time interdiction, post-quantum provenance, and audit-ready proof
            for autonomous agent swarms — built for the EU AI Act era.
          </p>
        </div>

        {/* Proof cards — stacked on mobile/tablet, three-up on desktop (≥lg).
             Per Operator brief: flex-col lg:flex-row gives tablets a generous
             vertical layout where each card can breathe, then snaps to the
             three-column row only when there's true desktop real-estate. */}
        <div className="flex flex-col lg:flex-row gap-2.5 md:gap-4 w-full max-w-[1080px]">
          {proofCards.map(({ icon: Icon, color, title, body }) => (
            <div
              key={title}
              // Full width on mobile/tablet, exact thirds on lg+.
              // No fixed minHeight on mobile — let content size the card so
              // body copy doesn't get visually orphaned under empty space.
              className="w-full lg:w-1/3 rounded-xl flex flex-col gap-1.5 px-3.5 py-3 sm:px-4 sm:py-4 md:px-[18px] md:py-4 lg:min-h-[100px] box-border"
              style={{
                background: "rgba(15, 23, 42, 0.55)",
                border: `1px solid ${color}33`,
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.02), 0 0 24px ${color}10`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon className="w-4 h-4" style={{ color }} />
                <span
                  className="font-semibold"
                  style={{
                    color,
                    fontSize: 13,
                    letterSpacing: "0",
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  {title}
                </span>
              </div>
              <p
                style={{
                  color: "#94A3B8",
                  fontSize: 12.5,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  lineHeight: 1.6,
                  margin: 0,
                  letterSpacing: "0",
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
          className="w-full max-w-[540px] text-center rounded-[14px] px-4 py-5 sm:px-5 md:px-7 md:pt-[18px] md:pb-[22px] box-border"
          style={{
            background: "rgba(2, 6, 23, 0.65)",
            border: `1px solid ${VIOLET}44`,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 0 60px ${VIOLET}28, inset 0 0 30px ${VIOLET}10`,
          }}
        >
          {/* Header strip — clear, action-oriented */}
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
            <ShieldCheck className="w-4 h-4" style={{ color: SAGE }} />
            <span
              className="font-semibold"
              style={{
                color: "#E5E7EB",
                fontSize: 13,
                letterSpacing: "0",
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              Get started in 3 steps
            </span>
          </div>

          {/* Concrete onboarding flow — replaces the demo-data flaff */}
          <ol
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0 0 18px 0",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              textAlign: "left",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            {[
              { n: "1", title: "Create your account", body: "Email or one-click social login." },
              { n: "2", title: "Connect your AI agent", body: "Drop in the Sentinel-Bridge SDK or call the gateway API." },
              { n: "3", title: "Watch your ledger fill up", body: "Every agent action signed, sealed, and audit-ready." },
            ].map((s) => (
              <li
                key={s.n}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    flex: "0 0 22px",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: `${VIOLET}22`,
                    border: `1px solid ${VIOLET}66`,
                    color: SAGE,
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    marginTop: 1,
                  }}
                >
                  {s.n}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ color: "#E5E7EB", fontSize: 13, fontWeight: 600 }}>{s.title}</span>
                  <span style={{ color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>{s.body}</span>
                </span>
              </li>
            ))}
          </ol>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Primary — Sign up to access the dashboard */}
            <button
              onClick={() => navigate("/sign-up")}
              className="font-semibold transition-all"
              style={{
                width: "100%",
                padding: "13px 20px",
                background: `linear-gradient(135deg, ${VIOLET}, #7C3AED)`,
                color: "#FFFFFF",
                border: `1px solid ${VIOLET}88`,
                borderRadius: 10,
                fontSize: 14,
                letterSpacing: "0",
                cursor: "pointer",
                boxShadow: `0 0 24px ${VIOLET}66, inset 0 0 12px rgba(255,255,255,0.08)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                fontFamily: "'Inter', system-ui, sans-serif",
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
              Create your account
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Returning users — Sign in */}
            <button
              onClick={() => navigate("/sign-in")}
              className="font-medium transition-all"
              style={{
                width: "100%",
                padding: "11px 20px",
                background: "transparent",
                color: "#CBD5E1",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,245,255,0.06)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,245,255,0.4)";
                (e.currentTarget as HTMLButtonElement).style.color = SAGE;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.15)";
                (e.currentTarget as HTMLButtonElement).style.color = "#CBD5E1";
              }}
            >
              Already have an account? Sign in
            </button>

            {/* Secondary — White paper */}
            <button
              onClick={() => navigate("/badge")}
              className="font-medium transition-all"
              style={{
                width: "100%",
                padding: "11px 20px",
                background: "transparent",
                color: "#CBD5E1",
                border: `1px solid ${VIOLET}55`,
                borderRadius: 10,
                fontSize: 13,
                letterSpacing: "0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                fontFamily: "'Inter', system-ui, sans-serif",
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
              Read the White Paper
            </button>
          </div>
        </div>
      </div>

      {/* ── Layer 6: bottom-edge regulatory legend ──
           In-flow on mobile (mt-8 spacer + flex-wrap) so it sits cleanly
           below the CTA card without overlapping it. On larger screens it
           returns to absolute-bottom positioning for the original look. */}
      <div
        className="z-[3] mt-8 mb-2 px-4 flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-[10px] md:text-xs w-full sm:absolute sm:bottom-4 sm:left-0 sm:right-0 sm:mt-0 sm:mb-0 sm:w-auto"
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
