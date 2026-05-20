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
      <div style={{ padding: "4vh 8vw 0 8vw" }}>
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
          padding: "2.5vh 8vw 8vh 8vw",
          gap: "3vw",
          alignItems: "stretch",
          minHeight: 0,
        }}
      >
        {/* Left: Legacy Tools */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "1.5vh",
            minHeight: 0,
          }}
        >
          <div
            style={{
              fontSize: "1.4vw",
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: "0.5vh",
              flexShrink: 0,
            }}
          >
            Legacy Tools
          </div>

          {/* Legacy item 1 */}
          <div
            style={{
              backgroundColor: "#161E2E",
              padding: "2.5vh 2.5vw",
              borderLeft: "0.4vw solid #334155",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "1.9vw",
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
                fontSize: "1.9vw",
                fontWeight: 500,
                color: "#64748B",
                lineHeight: 1.4,
              }}
            >
              Legacy tools monitor systems, not autonomous decisions
            </div>
          </div>

          {/* Legacy item 2 */}
          <div
            style={{
              backgroundColor: "#161E2E",
              padding: "2.5vh 2.5vw",
              borderLeft: "0.4vw solid #334155",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "1.9vw",
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
                fontSize: "1.9vw",
                fontWeight: 500,
                color: "#64748B",
                lineHeight: 1.4,
              }}
            >
              No semantic intent tracing or agentic loop analysis
            </div>
          </div>

          {/* Legacy item 3 */}
          <div
            style={{
              backgroundColor: "#161E2E",
              padding: "2.5vh 2.5vw",
              borderLeft: "0.4vw solid #334155",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "1.9vw",
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
                fontSize: "1.9vw",
                fontWeight: 500,
                color: "#64748B",
                lineHeight: 1.4,
              }}
            >
              No graph-level multi-agent topology visibility
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
            gap: "1.5vh",
            minHeight: 0,
          }}
        >
          <div
            style={{
              fontSize: "1.4vw",
              fontWeight: 700,
              color: "#14B8A6",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: "0.5vh",
              flexShrink: 0,
            }}
          >
            Agent-Sentinel
          </div>

          {/* Sentinel item 1 */}
          <div
            style={{
              backgroundColor: "#0D2320",
              padding: "2vh 2.5vw",
              borderLeft: "0.4vw solid #14B8A6",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "1.9vw",
                fontWeight: 700,
                color: "#14B8A6",
                flexShrink: 0,
                lineHeight: 1.4,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontSize: "1.9vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.4,
              }}
            >
              Traces semantic intent and agentic loops in real time
            </div>
          </div>

          {/* Sentinel item 2 */}
          <div
            style={{
              backgroundColor: "#0D2320",
              padding: "2vh 2.5vw",
              borderLeft: "0.4vw solid #14B8A6",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "1.9vw",
                fontWeight: 700,
                color: "#14B8A6",
                flexShrink: 0,
                lineHeight: 1.4,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontSize: "1.9vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.4,
              }}
            >
              Immutable audit architecture creates high switching costs
            </div>
          </div>

          {/* Sentinel item 3 */}
          <div
            style={{
              backgroundColor: "#0D2320",
              padding: "2vh 2.5vw",
              borderLeft: "0.4vw solid #14B8A6",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "1.9vw",
                fontWeight: 700,
                color: "#14B8A6",
                flexShrink: 0,
                lineHeight: 1.4,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontSize: "1.9vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.4,
              }}
            >
              Purpose-built for autonomous AI governance at enterprise scale
            </div>
          </div>

          {/* Sentinel item 4 */}
          <div
            style={{
              backgroundColor: "#0D2320",
              padding: "2vh 2.5vw",
              borderLeft: "0.4vw solid #14B8A6",
              display: "flex",
              alignItems: "flex-start",
              gap: "1.5vw",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "1.9vw",
                fontWeight: 700,
                color: "#14B8A6",
                flexShrink: 0,
                lineHeight: 1.4,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontSize: "1.9vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.4,
              }}
            >
              Graph-Based Trace Topologies: Maps multi-agent interactions into visual dependencies to isolate and neutralize Patient Zero during cascading agent loop failures
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
