export default function Slide02Problem() {
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
          The Liability Blindspot
        </div>
        <div
          style={{
            height: "0.2vh",
            backgroundColor: "#334155",
          }}
        />
      </div>

      {/* 2x2 card grid */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: "2vh 2vw",
          padding: "3vh 8vw 9vh 8vw",
        }}
      >
        {/* Card 1 */}
        <div
          style={{
            backgroundColor: "#1E293B",
            padding: "3.5vh 3vw",
            borderTop: "0.4vh solid #14B8A6",
            display: "flex",
            flexDirection: "column",
            gap: "1.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 700,
              color: "#14B8A6",
              letterSpacing: "0.1em",
            }}
          >
            01
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            Enterprises are deploying autonomous AI agents without governance
          </div>
        </div>

        {/* Card 2 */}
        <div
          style={{
            backgroundColor: "#1E293B",
            padding: "3.5vh 3vw",
            borderTop: "0.4vh solid #334155",
            display: "flex",
            flexDirection: "column",
            gap: "1.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 700,
              color: "#475569",
              letterSpacing: "0.1em",
            }}
          >
            02
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            AI agents can trigger legal, security, and compliance failures
          </div>
        </div>

        {/* Card 3 */}
        <div
          style={{
            backgroundColor: "#1E293B",
            padding: "3.5vh 3vw",
            borderTop: "0.4vh solid #334155",
            display: "flex",
            flexDirection: "column",
            gap: "1.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 700,
              color: "#475569",
              letterSpacing: "0.1em",
            }}
          >
            03
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            Existing logging tools cannot trace semantic agent decisions
          </div>
        </div>

        {/* Card 4 */}
        <div
          style={{
            backgroundColor: "#1E293B",
            padding: "3.5vh 3vw",
            borderTop: "0.4vh solid #334155",
            display: "flex",
            flexDirection: "column",
            gap: "1.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 700,
              color: "#475569",
              letterSpacing: "0.1em",
            }}
          >
            04
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            No immutable audit trail for AI-driven actions
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
        <span style={{ color: "#14B8A6" }}>02</span>
      </div>
    </div>
  );
}
