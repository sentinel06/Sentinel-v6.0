export default function Slide07BusinessModel() {
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
          Business Model
        </div>
        <div style={{ height: "0.2vh", backgroundColor: "#334155" }} />
      </div>

      {/* Body: 2x2 grid */}
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
            gap: "1.8vh",
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
            Platform
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            High-margin B2B SaaS platform
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
            gap: "1.8vh",
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
            Pricing
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            Pricing based on logging volume and secured agents
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
            gap: "1.8vh",
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
            Revenue
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            Recurring enterprise contracts and compliance retention
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
            gap: "1.8vh",
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
            Expansion
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.35,
            }}
          >
            Expansion opportunities via API and workflow integrations
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
        <span style={{ color: "#14B8A6" }}>07</span>
      </div>
    </div>
  );
}
