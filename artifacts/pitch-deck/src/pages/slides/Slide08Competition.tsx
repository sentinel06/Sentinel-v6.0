export default function Slide08Competition() {
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
          Competition & Moat
        </div>
        <div style={{ height: "0.2vh", backgroundColor: "#334155" }} />
      </div>

      {/* Body: two-column comparison */}
      <div
        style={{
          flex: 1,
          display: "flex",
          padding: "3vh 8vw 9vh 8vw",
          gap: "3vw",
          alignItems: "stretch",
        }}
      >
        {/* Left: Legacy Tools */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2vh",
          }}
        >
          <div
            style={{
              fontSize: "1.5vw",
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: "1vh",
            }}
          >
            Legacy Tools
          </div>

          {/* Legacy item 1 */}
          <div
            style={{
              backgroundColor: "#161E2E",
              padding: "3vh 2.5vw",
              borderLeft: "0.4vw solid #334155",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
            }}
          >
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 700,
                color: "#475569",
                flexShrink: 0,
                lineHeight: 1.35,
              }}
            >
              ✗
            </div>
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 500,
                color: "#64748B",
                lineHeight: 1.35,
              }}
            >
              Legacy tools monitor systems, not autonomous decisions
            </div>
          </div>

          {/* Legacy item 2 */}
          <div
            style={{
              backgroundColor: "#161E2E",
              padding: "3vh 2.5vw",
              borderLeft: "0.4vw solid #334155",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
            }}
          >
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 700,
                color: "#475569",
                flexShrink: 0,
                lineHeight: 1.35,
              }}
            >
              ✗
            </div>
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 500,
                color: "#64748B",
                lineHeight: 1.35,
              }}
            >
              No semantic intent tracing or agentic loop analysis
            </div>
          </div>
        </div>

        {/* Vertical divider */}
        <div
          style={{
            width: "0.15vw",
            backgroundColor: "#334155",
            flexShrink: 0,
          }}
        />

        {/* Right: Agent-Sentinel */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2vh",
          }}
        >
          <div
            style={{
              fontSize: "1.5vw",
              fontWeight: 700,
              color: "#14B8A6",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: "1vh",
            }}
          >
            Agent-Sentinel
          </div>

          {/* Sentinel item 1 */}
          <div
            style={{
              backgroundColor: "#0D2320",
              padding: "3vh 2.5vw",
              borderLeft: "0.4vw solid #14B8A6",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
            }}
          >
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 700,
                color: "#14B8A6",
                flexShrink: 0,
                lineHeight: 1.35,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Agent-Sentinel traces semantic intent and agentic loops
            </div>
          </div>

          {/* Sentinel item 2 */}
          <div
            style={{
              backgroundColor: "#0D2320",
              padding: "3vh 2.5vw",
              borderLeft: "0.4vw solid #14B8A6",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
            }}
          >
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 700,
                color: "#14B8A6",
                flexShrink: 0,
                lineHeight: 1.35,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Immutable audit architecture creates high switching costs
            </div>
          </div>

          {/* Sentinel item 3 */}
          <div
            style={{
              backgroundColor: "#0D2320",
              padding: "3vh 2.5vw",
              borderLeft: "0.4vw solid #14B8A6",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
            }}
          >
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 700,
                color: "#14B8A6",
                flexShrink: 0,
                lineHeight: 1.35,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontSize: "2vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Purpose-built for autonomous AI governance
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: "3.5vh",
          left: "8vw",
          right: "8vw",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "1.1vw",
          fontWeight: 400,
          color: "#475569",
        }}
      >
        <span>Agent-Sentinel | Pre-Seed Deck</span>
        <span style={{ color: "#14B8A6" }}>08</span>
      </div>
    </div>
  );
}
