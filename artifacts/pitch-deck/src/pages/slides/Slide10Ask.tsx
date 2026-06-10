export default function Slide10Ask() {
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
          The Ask & Milestones
        </div>
        <div style={{ height: "0.2vh", backgroundColor: "#334155" }} />
      </div>

      {/* Body: left hero number + right milestones */}
      <div
        style={{
          flex: 1,
          display: "flex",
          padding: "4vh 8vw 9vh 8vw",
          gap: "6vw",
          alignItems: "stretch",
        }}
      >
        {/* Left: Hero ask */}
        <div
          style={{
            flex: 4,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "2.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 600,
              color: "#94A3B8",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
            }}
          >
            Raising
          </div>
          <div
            style={{
              fontSize: "8.5vw",
              fontWeight: 700,
              color: "#14B8A6",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
            }}
          >
            £200k
          </div>
          <div
            style={{
              fontSize: "2vw",
              fontWeight: 600,
              color: "#F8FAFC",
              lineHeight: 1.3,
            }}
          >
            Pre-Seed Round
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.8vw",
              padding: "1.2vh 1.8vw",
              backgroundColor: "rgba(20,184,166,0.1)",
              border: "1px solid rgba(20,184,166,0.3)",
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
                fontSize: "1.6vw",
                fontWeight: 600,
                color: "#14B8A6",
              }}
            >
              SEIS Eligible
            </span>
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

        {/* Right: Milestones */}
        <div
          style={{
            flex: 5,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "3.5vh",
          }}
        >
          <div
            style={{
              fontSize: "1.3vw",
              fontWeight: 600,
              color: "#94A3B8",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              marginBottom: "0.5vh",
            }}
          >
            12-Month Milestones
          </div>

          {/* Milestone 1 */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "2vw",
              paddingBottom: "3.5vh",
              borderBottom: "0.15vh solid #1E293B",
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
              01
            </div>
            <div
              style={{
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Deploy 3 commercial enterprise pilots
            </div>
          </div>

          {/* Milestone 2 */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "2vw",
              paddingBottom: "3.5vh",
              borderBottom: "0.15vh solid #1E293B",
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
              02
            </div>
            <div
              style={{
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Expand SDK integrations and compliance tooling
            </div>
          </div>

          {/* Milestone 3 */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "2vw",
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
              03
            </div>
            <div
              style={{
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Target: £15k MRR within 12 months
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
        <span>MaroShield | Pre-Seed Deck</span>
        <span style={{ color: "#14B8A6" }}>10</span>
      </div>
    </div>
  );
}
