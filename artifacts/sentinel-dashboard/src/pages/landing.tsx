import React from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Lock, FileCheck2, Activity, ArrowRight, FileText, Cpu, GitBranch, Globe, ChevronDown, ChevronUp } from "lucide-react";

// ── Sovereign palette (must stay in sync with dashboard) ───────────────────
const SLATE   = "#020617";
const VIOLET  = "#8B5CF6";
const SAGE    = "#00F5FF";
const AMBER   = "#FFB800";
const TERRA   = "#FF003C";

// ── FAQ accordion ──────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: "What is an AI agent audit trail and why does it matter?",
    a: "An AI agent audit trail is a complete, ordered record of every action, decision, and output produced by an autonomous AI system. It matters because regulators (EU AI Act), auditors, and security teams need to be able to reconstruct exactly what an agent did, when it did it, and why — especially when things go wrong. Without an immutable audit trail, organisations cannot prove compliance, investigate incidents, or hold AI systems accountable.",
  },
  {
    q: "How does Agent-Sentinel satisfy EU AI Act Article 12?",
    a: "Article 12 of the EU AI Act requires that high-risk AI systems maintain logs sufficient to ensure traceability of the system's operation throughout its lifecycle. Agent-Sentinel satisfies this by recording every agent event into a hash-chained, append-only ledger that cannot be modified or deleted. The integrity of the chain can be verified at any time via the dashboard or the /api/v1/integrity endpoint, and a compliance export maps each log entry to the relevant regulatory obligation.",
  },
  {
    q: "What is hash chaining and how does it prevent tampering?",
    a: "Hash chaining means each audit log entry includes a SHA-256 hash computed from its own content plus the hash of the previous entry. If anyone modifies an earlier record — even a single byte — every subsequent hash in the chain becomes mathematically invalid. Agent-Sentinel can detect this instantly by replaying the chain. Combined with PostgreSQL triggers that block UPDATE and DELETE at the database engine level, the ledger is tamper-evident even against privileged administrators.",
  },
  {
    q: "What does 'post-quantum' cryptography mean for audit logs?",
    a: "Post-quantum cryptography refers to algorithms designed to resist attacks from quantum computers, which could break the RSA and ECDSA signatures used in most current systems. Agent-Sentinel uses ML-DSA-87 (FIPS 204 / CRYSTALS-Dilithium), a lattice-based digital signature scheme standardised by NIST, to seal every audit event. This means your audit records remain cryptographically valid even as quantum computing capabilities advance.",
  },
  {
    q: "How long does it take to integrate Agent-Sentinel?",
    a: "Most teams are submitting their first audit events within 10–15 minutes. The Sentinel-Bridge Python SDK requires three lines of code to initialise, register an agent, and submit an event. The REST API requires only an HTTP POST with your Sentinel key header. No infrastructure changes are needed — Agent-Sentinel runs as a hosted service that your agents call over HTTPS.",
  },
  {
    q: "Is my audit data isolated from other tenants?",
    a: "Yes. Every audit log row is tagged with the Clerk user ID of the authenticated account that ingested it. All read endpoints enforce this at the query level — you only ever see your own organisation's data. Partner API keys are also scoped to a single tenant, so even programmatic access via the Sentinel-Bridge SDK cannot read another organisation's records.",
  },
  {
    q: "What is the Governance Registry?",
    a: "The Governance Registry is a structured inventory of every AI agent your organisation has registered with Agent-Sentinel. Each entry records the agent's ID, model version, owner, risk tier, authorisation status, and operational history. Compliance officers can use the registry to demonstrate that all deployed agents are known, authorised, and monitored — a core requirement of the EU AI Act and ISO/IEC 42001.",
  },
  {
    q: "Can I export audit data for regulators or M&A due diligence?",
    a: "Yes. The Sovereign Data Room export generates a signed, auditor-ready PDF covering every agent action within a specified date range. The document includes a hash chain verification summary, anomaly and intervention counts, a compliance checklist mapped to EU AI Act Articles 12 and 14, and an appendix of individual log entries. It is designed to be handed directly to regulators, legal counsel, or due-diligence reviewers without further manual assembly.",
  },
];

function FaqList() {
  const [open, setOpen] = React.useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {FAQ_ITEMS.map((item, i) => (
        <div
          key={i}
          className="rounded-xl overflow-hidden"
          style={{ background: "rgba(15,23,42,0.55)", border: `1px solid rgba(139,92,246,0.2)` }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full text-left px-5 py-4 flex items-start justify-between gap-3 transition-colors"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#E5E7EB" }}
            aria-expanded={open === i}
          >
            <span className="font-semibold text-sm sm:text-[15px] leading-snug" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              {item.q}
            </span>
            {open === i
              ? <ChevronUp className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: VIOLET }} />
              : <ChevronDown className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#475569" }} />}
          </button>
          {open === i && (
            <div className="px-5 pb-4">
              <p className="text-sm leading-relaxed" style={{ color: "#94A3B8", fontFamily: "'Inter', system-ui, sans-serif" }}>
                {item.a}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

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
      // pb-28 on mobile reserves clearance for any sticky bottom widget (FAB,
      // browser nav bar, or the "Build yours free" CTA) so it never masks the
      // compliance footer or the "Read the White Paper" button.
      // min-h-[100dvh] uses the dynamic viewport height unit so mobile Chrome /
      // Safari address-bar retraction never clips the bottom of the layout.
      className="relative flex flex-col items-center justify-start overflow-y-auto overflow-x-hidden min-h-[100dvh] w-full max-w-full px-3 pt-4 pb-28 sm:px-4 sm:pb-24"
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

      {/* ── Layer 4: top-right status pill (hidden on small phones — too cramped) ── */}
      <div
        className="hidden sm:flex"
        style={{
          position: "absolute",
          top: 24,
          right: 32,
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
              margin: "0 0 20px 0",
              display: "flex",
              flexDirection: "column",
              gap: 14,
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

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Primary — Sign up to access the dashboard */}
            <button
              onClick={() => navigate("/sign-up")}
              className="font-semibold transition-all"
              style={{
                width: "100%",
                padding: "14px 20px",
                minHeight: 48,
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
                padding: "13px 20px",
                minHeight: 48,
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
                padding: "13px 20px",
                minHeight: 48,
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

      {/* ── Deep Content Sections (SEO / topical depth) ── */}
      <div
        className="relative z-[2] w-full max-w-[1080px] mx-auto flex flex-col gap-16 px-3 sm:px-4 mt-16 mb-8"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >

        {/* ── How Agent-Sentinel Works ── */}
        <section aria-labelledby="how-it-works-heading">
          <h2
            id="how-it-works-heading"
            className="text-xl sm:text-2xl font-semibold mb-2"
            style={{ color: SAGE, letterSpacing: "-0.01em" }}
          >
            How Agent-Sentinel Works
          </h2>
          <p className="mb-8 text-sm sm:text-base leading-relaxed" style={{ color: "#94A3B8", maxWidth: 760 }}>
            Agent-Sentinel sits between your AI agents and the rest of your infrastructure, recording every decision,
            tool call, and output into a tamper-proof ledger before it reaches downstream systems.
            The platform operates in three layers: ingestion, verification, and governance.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                step: "01",
                icon: Cpu,
                color: SAGE,
                heading: "Ingestion & Sealing",
                body: "Every agent event — tool invocation, model output, permission grant, or error — is submitted to the Sentinel Gateway via the Sentinel-Bridge SDK or REST API. Each event is timestamped, assigned a SHA-256 hash that incorporates the previous hash, and sealed with a ML-DSA-87 post-quantum signature. The result is an immutable, hash-chained audit log that cannot be altered retroactively.",
              },
              {
                step: "02",
                icon: Activity,
                color: VIOLET,
                heading: "Real-Time Analysis",
                body: "As events arrive, Agent-Sentinel runs anomaly scoring, hallucination detection, and drift analysis. Suspicious patterns — unexpected permission escalations, financial transfers, or off-policy tool use — trigger sub-1ms interdiction signals. Human-in-the-loop War Room approvals can block any agent action before it propagates to production systems.",
              },
              {
                step: "03",
                icon: FileCheck2,
                color: AMBER,
                heading: "Compliance & Export",
                body: "Compliance officers can export a Sovereign Data Room PDF at any time — a complete, auditor-ready package covering every agent action within a defined timeframe. The export includes hash chain verification status, anomaly summaries, and a mapping to EU AI Act Article 12 (traceability) and Article 14 (human oversight) obligations.",
              },
            ].map(({ step, icon: Icon, color, heading, body }) => (
              <div
                key={step}
                className="rounded-xl p-5 flex flex-col gap-3"
                style={{
                  background: "rgba(15,23,42,0.55)",
                  border: `1px solid ${color}28`,
                  backdropFilter: "blur(10px)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold" style={{ color: color + "88" }}>{step}</span>
                  <Icon className="w-4 h-4" style={{ color }} />
                  <h3 className="font-semibold text-sm" style={{ color }}>{heading}</h3>
                </div>
                <p className="text-xs sm:text-[13px] leading-relaxed" style={{ color: "#94A3B8" }}>{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── EU AI Act Compliance Workflow ── */}
        <section aria-labelledby="eu-ai-act-heading">
          <h2
            id="eu-ai-act-heading"
            className="text-xl sm:text-2xl font-semibold mb-2"
            style={{ color: "#E5E7EB", letterSpacing: "-0.01em" }}
          >
            EU AI Act Compliance for AI Agents
          </h2>
          <p className="mb-6 text-sm sm:text-base leading-relaxed" style={{ color: "#94A3B8", maxWidth: 760 }}>
            The EU AI Act imposes strict traceability and human-oversight requirements on high-risk AI systems.
            Agent-Sentinel is purpose-built to satisfy Articles 12 and 14 without requiring changes to your agent codebase.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                label: "Article 12 — Traceability",
                color: SAGE,
                points: [
                  "Immutable, hash-chained log of every agent decision and output",
                  "SHA-256 integrity verification on demand or on a schedule",
                  "Complete audit trail exportable as a signed PDF for regulators",
                  "Retention-friendly: ledger rows are append-only; no DELETE or UPDATE permitted via database triggers",
                ],
              },
              {
                label: "Article 14 — Human Oversight",
                color: VIOLET,
                points: [
                  "Real-time War Room: humans approve or block pending agent actions before execution",
                  "Kill-switch endpoint: immediately halt all agent activity across the swarm with a single API call",
                  "Governance Registry: register every agent, track its authorisation status, and annotate risk tier",
                  "Anomaly alerts surface immediately — operators are notified before edge cases become incidents",
                ],
              },
              {
                label: "SOC 2 & NIST AI RMF",
                color: AMBER,
                points: [
                  "Per-tenant data isolation: each organisation's audit data is scoped to their authenticated identity",
                  "API key rotation and revocation via the self-service Settings page",
                  "Partner key access logs with last-used timestamps for access control audits",
                  "Structured compliance report mapped to NIST AI RMF Govern, Map, Measure, and Manage functions",
                ],
              },
              {
                label: "ISO/IEC 42001 — AI Management",
                color: TERRA,
                points: [
                  "Agent Registry tracks model version, owner, risk tier, and operational status",
                  "Drift detection flags agents whose behaviour deviates from their registered baseline",
                  "Topology diff view shows exactly which edges in an agent's decision graph changed between runs",
                  "Quantum Audit endpoint provides a cryptographic attestation of the full ledger state",
                ],
              },
            ].map(({ label, color, points }) => (
              <div
                key={label}
                className="rounded-xl p-5 flex flex-col gap-3"
                style={{
                  background: "rgba(15,23,42,0.45)",
                  border: `1px solid ${color}22`,
                }}
              >
                <h3 className="font-semibold text-sm" style={{ color }}>{label}</h3>
                <ul className="flex flex-col gap-2">
                  {points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-xs sm:text-[13px] leading-relaxed" style={{ color: "#94A3B8" }}>
                      <span style={{ color, flexShrink: 0, marginTop: 2 }}>›</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Use Cases ── */}
        <section aria-labelledby="use-cases-heading">
          <h2
            id="use-cases-heading"
            className="text-xl sm:text-2xl font-semibold mb-2"
            style={{ color: "#E5E7EB", letterSpacing: "-0.01em" }}
          >
            Use Cases for AI Governance Teams
          </h2>
          <p className="mb-6 text-sm sm:text-base leading-relaxed" style={{ color: "#94A3B8", maxWidth: 760 }}>
            Agent-Sentinel serves every stakeholder involved in deploying and auditing autonomous AI systems —
            from platform engineers building agent infrastructure to compliance officers preparing for regulatory review.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: ShieldCheck,
                color: SAGE,
                heading: "Security & Threat Teams",
                body: "Detect privilege escalation, prompt injection attempts, and unexpected tool invocations in real time. Every anomaly is scored, timestamped, and linked to the triggering agent event — giving security teams a full forensic trail without manual log correlation.",
              },
              {
                icon: Globe,
                color: VIOLET,
                heading: "Platform & ML Ops Teams",
                body: "Register every agent model version in the Governance Registry. Track which model is running in production, compare decision-graph topologies between deployments, and receive drift alerts the moment an agent's behaviour deviates from its registered baseline.",
              },
              {
                icon: FileCheck2,
                color: AMBER,
                heading: "Compliance & Legal Teams",
                body: "Generate an audit-ready PDF export — a Sovereign Data Room — covering any date range at a click. The export is pre-mapped to EU AI Act Articles 12 and 14, SOC 2 Trust Services Criteria, and NIST AI RMF. No manual report assembly required.",
              },
              {
                icon: GitBranch,
                color: TERRA,
                heading: "Agentic Product Teams",
                body: "Integrate the Sentinel-Bridge Python SDK in under ten minutes. Each agent run automatically records tool calls, model outputs, and decision rationale. The swarm map gives product teams a live visual of every agent's lifecycle, mutations, and interventions.",
              },
              {
                icon: Lock,
                color: "#00C6FF",
                heading: "Enterprise Risk & Audit",
                body: "Agent-Sentinel's immutable ledger satisfies the evidentiary standard required for internal audit, M&A due diligence, and regulatory examination. Hash chain verification proves that no log entry has been altered since ingestion — even by administrators.",
              },
              {
                icon: Activity,
                color: "#C4B5FD",
                heading: "AI Governance Officers",
                body: "The Agent Registry and Governance Registry provide a single source of truth for every AI agent in the organisation — its owner, risk tier, authorisation status, and full operational history. Governance officers can revoke an agent's access or initiate a kill-switch from the dashboard in seconds.",
              },
            ].map(({ icon: Icon, color, heading, body }) => (
              <div
                key={heading}
                className="rounded-xl p-4 sm:p-5 flex flex-col gap-2.5"
                style={{
                  background: "rgba(15,23,42,0.45)",
                  border: `1px solid ${color}22`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <h3 className="font-semibold text-sm" style={{ color }}>{heading}</h3>
                </div>
                <p className="text-xs sm:text-[13px] leading-relaxed" style={{ color: "#94A3B8" }}>{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Why Hash-Chained Audit Trails Matter ── */}
        <section aria-labelledby="hash-chain-heading">
          <h2
            id="hash-chain-heading"
            className="text-xl sm:text-2xl font-semibold mb-2"
            style={{ color: "#E5E7EB", letterSpacing: "-0.01em" }}
          >
            Why Hash-Chained Audit Trails Matter for AI Agents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div>
              <p className="text-sm sm:text-base leading-relaxed mb-4" style={{ color: "#94A3B8" }}>
                Traditional logging systems write records to append-friendly storage, but nothing prevents a privileged
                administrator — or a compromised system — from modifying or deleting entries after the fact. For AI
                agents operating autonomously in production, that gap in integrity is a material compliance risk.
              </p>
              <p className="text-sm sm:text-base leading-relaxed mb-4" style={{ color: "#94A3B8" }}>
                Agent-Sentinel's hash-chaining approach solves this at the data layer. Every audit log row stores a
                SHA-256 hash computed from its own content <em>and</em> the hash of the previous row. Alter any earlier
                record — even a single byte — and every subsequent hash in the chain becomes invalid. The integrity of
                the entire ledger can be verified in O(n) time by replaying the chain, and the verification result is
                exposed via the dashboard and the <code style={{ color: SAGE, fontSize: 12 }}>GET /api/v1/integrity</code> endpoint.
              </p>
              <p className="text-sm sm:text-base leading-relaxed" style={{ color: "#94A3B8" }}>
                PostgreSQL-level triggers enforce the immutability guarantee at the database layer —
                <code style={{ color: SAGE, fontSize: 12 }}> UPDATE</code> and <code style={{ color: SAGE, fontSize: 12 }}>DELETE</code> on
                the <code style={{ color: SAGE, fontSize: 12 }}>audit_logs</code> table raise an exception and rollback
                the transaction. This means even a direct database connection cannot silently corrupt the record.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: "Tamper-evident by design", detail: "Any modification to a sealed record breaks the hash chain — detectable instantly." },
                { label: "Post-quantum resilient", detail: "Events are sealed with ML-DSA-87 (FIPS 204) signatures, resistant to Grover and Shor attacks." },
                { label: "Database-enforced immutability", detail: "PostgreSQL triggers block UPDATE and DELETE at the engine level — not just application logic." },
                { label: "Chain reconstruction for recovery", detail: "If a partial import is needed, the admin chain-reconstruct endpoint re-derives all hashes from source data while preserving the sequence." },
                { label: "Verifiable in real time", detail: "The integrity check runs on-demand or on a schedule. Status is surfaced in the dashboard health panel and via the public /v1/integrity API." },
              ].map(({ label, detail }) => (
                <div key={label} className="rounded-lg px-4 py-3 flex flex-col gap-1"
                  style={{ background: "rgba(15,23,42,0.55)", border: `1px solid ${VIOLET}22` }}>
                  <span className="text-xs font-semibold" style={{ color: SAGE }}>{label}</span>
                  <span className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>{detail}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Integration Options / SDK ── */}
        <section aria-labelledby="integration-heading">
          <h2
            id="integration-heading"
            className="text-xl sm:text-2xl font-semibold mb-2"
            style={{ color: "#E5E7EB", letterSpacing: "-0.01em" }}
          >
            Integration Options
          </h2>
          <p className="mb-6 text-sm sm:text-base leading-relaxed" style={{ color: "#94A3B8", maxWidth: 760 }}>
            Agent-Sentinel is designed to integrate with any AI agent stack — from LangChain and AutoGPT to custom
            Python orchestration or REST-based microservice agents. Choose the integration method that fits your
            architecture.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              {
                color: SAGE,
                label: "Sentinel-Bridge Python SDK",
                detail: "The official Python SDK provides a SovereignGateway class with methods for agent registration, pre-flight governance checks, telemetry ingestion, and liveness pings. Works with any Python-based agent framework. Install via pip and authenticate with your Sentinel key.",
                code: "pip install sentinel-bridge",
              },
              {
                color: VIOLET,
                label: "REST Gateway API",
                detail: "All SDK functionality is also available via the JSON REST API at /api/v1/gateway. Submit log events, register agents, check authorisation status, or trigger kill-switches from any language or platform. Authenticate with the X-Sentinel-Key header.",
                code: "POST /api/v1/gateway/log",
              },
              {
                color: AMBER,
                label: "Webhook & Stream Ingestion",
                detail: "For high-volume agent swarms, Agent-Sentinel accepts bulk event batches and supports real-time streaming via WebSocket. The dashboard live-updates without polling — events appear in the audit log within milliseconds of ingestion.",
                code: "wss://agent-sentinel.net/api/v1/stream",
              },
            ].map(({ color, label, detail, code }) => (
              <div
                key={label}
                className="rounded-xl p-5 flex flex-col gap-3"
                style={{ background: "rgba(15,23,42,0.55)", border: `1px solid ${color}28` }}
              >
                <h3 className="font-semibold text-sm" style={{ color }}>{label}</h3>
                <p className="text-xs sm:text-[13px] leading-relaxed flex-1" style={{ color: "#94A3B8" }}>{detail}</p>
                <code
                  className="text-xs px-3 py-2 rounded-md"
                  style={{ background: "rgba(0,0,0,0.4)", color: SAGE, fontFamily: "'JetBrains Mono', monospace", display: "block" }}
                >
                  {code}
                </code>
              </div>
            ))}
          </div>
          <div
            className="rounded-xl p-5"
            style={{ background: "rgba(15,23,42,0.45)", border: `1px solid ${VIOLET}22` }}
          >
            <h3 className="font-semibold text-sm mb-3" style={{ color: VIOLET }}>Quick Start — Python SDK</h3>
            <pre
              className="text-xs leading-relaxed overflow-x-auto"
              style={{ color: "#94A3B8", fontFamily: "'JetBrains Mono', monospace", margin: 0 }}
            >{`from sentinel_bridge import SovereignGateway

# Initialise — validates your key against the live ledger on startup
gw = SovereignGateway(sentinel_key="sk_sent_core_...")

# Register your agent in the Governance Registry
gw.register_agent(agent_id="my-agent-v1", risk_tier="high")

# Submit a governance pre-flight check before any consequential action
result = gw.preflight(agent_id="my-agent-v1", action="transfer_funds", context={...})
if not result.approved:
    raise PermissionError(result.reason)

# Commit a signed, hash-chained audit event
gw.log_event(agent_id="my-agent-v1", event_type="tool_call", payload={...})`}
            </pre>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section aria-labelledby="faq-heading">
          <h2
            id="faq-heading"
            className="text-xl sm:text-2xl font-semibold mb-6"
            style={{ color: "#E5E7EB", letterSpacing: "-0.01em" }}
          >
            Frequently Asked Questions
          </h2>
          <FaqList />
        </section>

      </div>

      {/* ── Layer 6: bottom-edge regulatory legend — always in-flow now that the page scrolls ── */}
      <div
        className="z-[3] mt-8 mb-6 px-4 flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-[10px] md:text-xs w-full"
        style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          color: "#475569",
          letterSpacing: "0.18em",
        }}
      >
        <span>EU AI ACT</span>
        <span style={{ color: VIOLET + "88" }}>·</span>
        <span>SOC 2</span>
        <span style={{ color: VIOLET + "88" }}>·</span>
        <span>NIST AI RMF</span>
        <span style={{ color: VIOLET + "88" }}>·</span>
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
