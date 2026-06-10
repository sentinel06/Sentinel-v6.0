import landingScreenshot from "@assets/screenshots/agent-sentinel_replit_app.png";

export default function Slide04Product() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{
        backgroundColor: "#0F172A",
        fontFamily: "'Space Grotesk', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ padding: "5vh 8vw 0 8vw" }}>
        <div
          style={{
            fontSize: "3vw",
            fontWeight: 700,
            color: "#14B8A6",
            letterSpacing: "-0.02em",
            marginBottom: "2vh",
          }}
        >
          Product & Architecture
        </div>
        <div style={{ height: "0.2vh", backgroundColor: "#334155" }} />
      </div>

      {/* Body: left bullets + right screenshot */}
      <div
        style={{
          flex: 1,
          display: "flex",
          padding: "3vh 0 9vh 8vw",
          gap: "4vw",
          alignItems: "center",
        }}
      >
        {/* Left: 4 bullet items */}
        <div
          style={{
            flex: 5,
            display: "flex",
            flexDirection: "column",
            gap: "3.5vh",
          }}
        >
          {/* Item 1 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div
              style={{
                width: "0.4vw",
                height: "0.4vw",
                backgroundColor: "#14B8A6",
                borderRadius: "50%",
                marginTop: "1.1vh",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Cryptographic Ledger Architecture: Implements append-only PostgreSQL WORM triggers and SHA-256 hash chaining to ensure tamper-proof provenance of all agent decisions.
            </div>
          </div>

          {/* Item 2 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div
              style={{
                width: "0.4vw",
                height: "0.4vw",
                backgroundColor: "#14B8A6",
                borderRadius: "50%",
                marginTop: "1.1vh",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Proxy-layer architecture between agents and external systems
            </div>
          </div>

          {/* Item 3 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div
              style={{
                width: "0.4vw",
                height: "0.4vw",
                backgroundColor: "#14B8A6",
                borderRadius: "50%",
                marginTop: "1.1vh",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Captures prompts, actions, tool calls, and semantic intent
            </div>
          </div>

          {/* Item 4 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div
              style={{
                width: "0.4vw",
                height: "0.4vw",
                backgroundColor: "#14B8A6",
                borderRadius: "50%",
                marginTop: "1.1vh",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Built for scalable enterprise deployment
            </div>
          </div>
        </div>

        {/* Right: screenshot with frame */}
        <div
          style={{
            flex: 6,
            height: "72vh",
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
              width: "6vw",
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
              height: "8vh",
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
              height: "8vh",
              background: "linear-gradient(to top, #0F172A, transparent)",
              zIndex: 1,
            }}
          />
          <img
            src={landingScreenshot}
            crossOrigin="anonymous"
            alt="MaroShield product"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "left top",
              opacity: 0.85,
            }}
          />
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
        <span>MaroShield | Pre-Seed Deck</span>
        <span style={{ color: "#14B8A6" }}>04</span>
      </div>
    </div>
  );
}
