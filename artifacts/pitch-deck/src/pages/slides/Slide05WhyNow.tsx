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
      <div style={{ padding: "4.5vh 8vw 0 8vw" }}>
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

      {/* Body: 4 tiles top row + full-width regulatory tile bottom */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "3vh 8vw 8vh 8vw",
          gap: "2vh",
        }}
      >
        {/* Top row: 4 numbered tiles */}
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: "2vw",
            alignItems: "stretch",
          }}
        >
          {/* Tile 1 */}
          <div
            style={{
              flex: 1,
              backgroundColor: "#1E293B",
              padding: "3vh 2.5vw",
              borderTop: "0.4vh solid #14B8A6",
              display: "flex",
              flexDirection: "column",
              gap: "1.8vh",
            }}
          >
            <div
              style={{
                fontSize: "3.5vw",
                fontWeight: 700,
                color: "#14B8A6",
                lineHeight: 1,
                opacity: 0.35,
              }}
            >
              01
            </div>
            <div
              style={{
                fontSize: "1.85vw",
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
              padding: "3vh 2.5vw",
              borderTop: "0.4vh solid #334155",
              display: "flex",
              flexDirection: "column",
              gap: "1.8vh",
            }}
          >
            <div
              style={{
                fontSize: "3.5vw",
                fontWeight: 700,
                color: "#94A3B8",
                lineHeight: 1,
                opacity: 0.35,
              }}
            >
              02
            </div>
            <div
              style={{
                fontSize: "1.85vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.4,
              }}
            >
              Enterprises now allow AI systems to take direct autonomous actions
            </div>
          </div>

          {/* Tile 3 */}
          <div
            style={{
              flex: 1,
              backgroundColor: "#1E293B",
              padding: "3vh 2.5vw",
              borderTop: "0.4vh solid #334155",
              display: "flex",
              flexDirection: "column",
              gap: "1.8vh",
            }}
          >
            <div
              style={{
                fontSize: "3.5vw",
                fontWeight: 700,
                color: "#94A3B8",
                lineHeight: 1,
                opacity: 0.35,
              }}
            >
              03
            </div>
            <div
              style={{
                fontSize: "1.85vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.4,
              }}
            >
              Regulators are increasing AI accountability requirements globally
            </div>
          </div>

          {/* Tile 4 */}
          <div
            style={{
              flex: 1,
              backgroundColor: "#1E293B",
              padding: "3vh 2.5vw",
              borderTop: "0.4vh solid #334155",
              display: "flex",
              flexDirection: "column",
              gap: "1.8vh",
            }}
          >
            <div
              style={{
                fontSize: "3.5vw",
                fontWeight: 700,
                color: "#94A3B8",
                lineHeight: 1,
                opacity: 0.35,
              }}
            >
              04
            </div>
            <div
              style={{
                fontSize: "1.85vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.4,
              }}
            >
              Security and compliance infrastructure is lagging behind adoption
            </div>
          </div>
        </div>

        {/* Bottom: full-width regulatory mandate tile */}
        <div
          style={{
            backgroundColor: "#0D1F2E",
            border: "1px solid rgba(20,184,166,0.3)",
            borderLeft: "0.5vw solid #14B8A6",
            padding: "2.8vh 3.5vw",
            display: "flex",
            alignItems: "center",
            gap: "3vw",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.8vh",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "1.2vw",
                fontWeight: 700,
                color: "#14B8A6",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
              }}
            >
              Regulatory Mandate
            </div>
            <div
              style={{
                fontSize: "1.1vw",
                fontWeight: 400,
                color: "#475569",
                letterSpacing: "0.05em",
              }}
            >
              EU AI Act Art. 12 &amp; 14
            </div>
          </div>

          <div
            style={{
              width: "0.15vw",
              alignSelf: "stretch",
              backgroundColor: "#334155",
              flexShrink: 0,
            }}
          />

          <div
            style={{
              fontSize: "1.85vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.4,
              flex: 1,
            }}
          >
            Enforcement of EU AI Act Articles 12 &amp; 14 mandates independent, tamper-proof logging and real-time traceability for autonomous enterprise deployments.
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
