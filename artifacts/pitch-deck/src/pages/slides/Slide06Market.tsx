export default function Slide06Market() {
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
          Market Opportunity
        </div>
        <div style={{ height: "0.2vh", backgroundColor: "#334155" }} />
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
            borderLeft: "0.4vw solid #14B8A6",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "1.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 600,
              color: "#14B8A6",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Buyers
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            Targeting DevSecOps and compliance teams
          </div>
        </div>

        {/* Card 2 */}
        <div
          style={{
            backgroundColor: "#1E293B",
            padding: "3.5vh 3vw",
            borderLeft: "0.4vw solid #334155",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "1.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 600,
              color: "#94A3B8",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Verticals
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            Initial focus: financial services and healthcare
          </div>
        </div>

        {/* Card 3 */}
        <div
          style={{
            backgroundColor: "#1E293B",
            padding: "3.5vh 3vw",
            borderLeft: "0.4vw solid #334155",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "1.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 600,
              color: "#94A3B8",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Demand
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            Massive demand for AI governance infrastructure
          </div>
        </div>

        {/* Card 4 */}
        <div
          style={{
            backgroundColor: "#1E293B",
            padding: "3.5vh 3vw",
            borderLeft: "0.4vw solid #334155",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "1.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 600,
              color: "#94A3B8",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Position
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            Positioned within the rapidly expanding AI infrastructure market
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
        <span style={{ color: "#14B8A6" }}>06</span>
      </div>
    </div>
  );
}
