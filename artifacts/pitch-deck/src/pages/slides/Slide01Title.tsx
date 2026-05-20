import landingScreenshot from "@assets/screenshots/agent-sentinel_replit_app.png";

export default function Slide01Title() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{
        backgroundColor: "#0F172A",
        fontFamily: "'Space Grotesk', sans-serif",
        display: "flex",
      }}
    >
      {/* Left content panel */}
      <div
        style={{
          width: "50%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 4vw 0 8vw",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Pre-Seed badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6vw",
            marginBottom: "3vh",
          }}
        >
          <div
            style={{
              width: "0.45vw",
              height: "0.45vw",
              backgroundColor: "#14B8A6",
              borderRadius: "50%",
            }}
          />
          <span
            style={{
              fontSize: "1.2vw",
              fontWeight: 600,
              color: "#14B8A6",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            Pre-Seed 2026
          </span>
        </div>

        {/* Main title */}
        <div
          style={{
            fontSize: "5.8vw",
            fontWeight: 700,
            color: "#14B8A6",
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            marginBottom: "3vh",
          }}
        >
          Agent-Sentinel
        </div>

        {/* Teal divider */}
        <div
          style={{
            width: "5vw",
            height: "0.35vh",
            backgroundColor: "#14B8A6",
            marginBottom: "3.5vh",
          }}
        />

        {/* Primary tagline */}
        <div
          style={{
            fontSize: "2.05vw",
            fontWeight: 600,
            color: "#F8FAFC",
            lineHeight: 1.35,
            marginBottom: "2.5vh",
            maxWidth: "34vw",
          }}
        >
          The Immutable Compliance Ledger for Autonomous AI Agents
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "1.7vw",
            fontWeight: 400,
            color: "#94A3B8",
            lineHeight: 1.5,
            marginBottom: "4vh",
            maxWidth: "32vw",
          }}
        >
          Real-time runtime interdiction, cryptographic audit ledger, and EU AI Act Article 12 compliance
        </div>

        {/* Live MVP badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.8vw",
            padding: "1.2vh 1.6vw",
            backgroundColor: "rgba(20,184,166,0.1)",
            border: "1px solid rgba(20,184,166,0.35)",
            width: "fit-content",
          }}
        >
          <div
            style={{
              width: "0.5vw",
              height: "0.5vw",
              backgroundColor: "#14B8A6",
              borderRadius: "50%",
            }}
          />
          <span
            style={{
              fontSize: "1.4vw",
              fontWeight: 600,
              color: "#14B8A6",
            }}
          >
            https://agent-sentinel.replit.app/
          </span>
        </div>
      </div>

      {/* Right screenshot panel */}
      <div
        style={{
          width: "50%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Left-edge gradient blend */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "10vw",
            height: "100%",
            background: "linear-gradient(to right, #0F172A, transparent)",
            zIndex: 1,
          }}
        />
        {/* Top edge gradient */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "15vh",
            background: "linear-gradient(to bottom, #0F172A, transparent)",
            zIndex: 1,
          }}
        />
        {/* Bottom edge gradient */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "15vh",
            background: "linear-gradient(to top, #0F172A, transparent)",
            zIndex: 1,
          }}
        />
        <img
          src={landingScreenshot}
          crossOrigin="anonymous"
          alt="Agent-Sentinel platform"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "left top",
            opacity: 0.8,
          }}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: "3.5vh",
          left: "8vw",
          right: "3vw",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "1.1vw",
          fontWeight: 400,
          color: "#475569",
          zIndex: 3,
        }}
      >
        <span>Agent-Sentinel | Pre-Seed Deck</span>
        <span style={{ color: "#14B8A6" }}>01</span>
      </div>
    </div>
  );
}
