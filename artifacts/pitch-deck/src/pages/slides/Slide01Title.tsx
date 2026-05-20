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

        {/* Live link badge */}
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

      {/* Right: coded decorative panel — no screenshot */}
      <div
        style={{
          width: "50%",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "2vh",
          padding: "6vh 5vw 6vh 3vw",
          backgroundColor: "#080F1C",
        }}
      >
        {/* Radial teal glow background */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "50vw",
            height: "50vw",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(20,184,166,0.1) 0%, transparent 65%)",
            pointerEvents: "none",
          }}
        />

        {/* SYSTEM LIVE status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.7vw",
            marginBottom: "0.5vh",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "0.55vw",
              height: "0.55vw",
              borderRadius: "50%",
              backgroundColor: "#14B8A6",
              boxShadow: "0 0 8px rgba(20,184,166,0.8)",
            }}
          />
          <span
            style={{
              fontSize: "1.2vw",
              fontWeight: 700,
              color: "#14B8A6",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            System Live
          </span>
        </div>

        {/* 3 stat cards */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.5vh",
            width: "100%",
            zIndex: 1,
          }}
        >
          {/* Stat 1 */}
          <div
            style={{
              backgroundColor: "#111827",
              border: "1px solid #1E293B",
              borderLeft: "0.35vw solid #14B8A6",
              padding: "2vh 2.5vw",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "1.4vw", fontWeight: 400, color: "#94A3B8" }}>
              Audit Logs Sealed
            </span>
            <span style={{ fontSize: "2.2vw", fontWeight: 700, color: "#14B8A6" }}>
              1,535+
            </span>
          </div>

          {/* Stat 2 */}
          <div
            style={{
              backgroundColor: "#111827",
              border: "1px solid #1E293B",
              borderLeft: "0.35vw solid #334155",
              padding: "2vh 2.5vw",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "1.4vw", fontWeight: 400, color: "#94A3B8" }}>
              Chain Integrity
            </span>
            <span style={{ fontSize: "2.2vw", fontWeight: 700, color: "#F8FAFC" }}>
              100%
            </span>
          </div>

          {/* Stat 3 */}
          <div
            style={{
              backgroundColor: "#111827",
              border: "1px solid #1E293B",
              borderLeft: "0.35vw solid #334155",
              padding: "2vh 2.5vw",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "1.4vw", fontWeight: 400, color: "#94A3B8" }}>
              Agents Monitored
            </span>
            <span style={{ fontSize: "2.2vw", fontWeight: 700, color: "#F8FAFC" }}>
              41
            </span>
          </div>
        </div>

        {/* Tech badge */}
        <div
          style={{
            marginTop: "1vh",
            padding: "1.3vh 2vw",
            backgroundColor: "rgba(20,184,166,0.06)",
            border: "1px solid rgba(20,184,166,0.18)",
            fontSize: "1.25vw",
            fontWeight: 500,
            color: "#475569",
            letterSpacing: "0.04em",
            textAlign: "center",
            zIndex: 1,
          }}
        >
          SHA-256 Hash Chain + PostgreSQL WORM — EU AI Act Art. 12
        </div>
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
