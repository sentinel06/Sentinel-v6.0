export default function Slide05WhyNow() {
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
          Why Now
        </div>
        <div style={{ height: "0.2vh", backgroundColor: "#334155" }} />
      </div>

      {/* Body: 4 horizontal numbered tiles */}
      <div
        style={{
          flex: 1,
          display: "flex",
          padding: "5vh 8vw 9vh 8vw",
          gap: "2vw",
          alignItems: "stretch",
        }}
      >
        {/* Tile 1 */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#1E293B",
            padding: "4vh 2.5vw",
            borderTop: "0.4vh solid #14B8A6",
            display: "flex",
            flexDirection: "column",
            gap: "2.5vh",
          }}
        >
          <div
            style={{
              fontSize: "4vw",
              fontWeight: 700,
              color: "#14B8A6",
              lineHeight: 1,
              opacity: 0.4,
            }}
          >
            01
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.4,
            }}
          >
            2026 marks the shift from chatbots to autonomous AI agents
          </div>
        </div>

        {/* Tile 2 */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#1E293B",
            padding: "4vh 2.5vw",
            borderTop: "0.4vh solid #334155",
            display: "flex",
            flexDirection: "column",
            gap: "2.5vh",
          }}
        >
          <div
            style={{
              fontSize: "4vw",
              fontWeight: 700,
              color: "#94A3B8",
              lineHeight: 1,
              opacity: 0.4,
            }}
          >
            02
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.4,
            }}
          >
            Enterprises now allow AI systems to take direct actions
          </div>
        </div>

        {/* Tile 3 */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#1E293B",
            padding: "4vh 2.5vw",
            borderTop: "0.4vh solid #334155",
            display: "flex",
            flexDirection: "column",
            gap: "2.5vh",
          }}
        >
          <div
            style={{
              fontSize: "4vw",
              fontWeight: 700,
              color: "#94A3B8",
              lineHeight: 1,
              opacity: 0.4,
            }}
          >
            03
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.4,
            }}
          >
            Regulators are increasing AI accountability requirements
          </div>
        </div>

        {/* Tile 4 */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#1E293B",
            padding: "4vh 2.5vw",
            borderTop: "0.4vh solid #334155",
            display: "flex",
            flexDirection: "column",
            gap: "2.5vh",
          }}
        >
          <div
            style={{
              fontSize: "4vw",
              fontWeight: 700,
              color: "#94A3B8",
              lineHeight: 1,
              opacity: 0.4,
            }}
          >
            04
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.4,
            }}
          >
            Security and compliance infrastructure is lagging behind adoption
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
        <span style={{ color: "#14B8A6" }}>05</span>
      </div>
    </div>
  );
}
