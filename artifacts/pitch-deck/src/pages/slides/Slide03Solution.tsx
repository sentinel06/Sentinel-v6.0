export default function Slide03Solution() {
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
          Enterprise Guardrails
        </div>
        <div style={{ height: "0.2vh", backgroundColor: "#334155" }} />
      </div>

      {/* Body: left bullets + right decorative panel */}
      <div
        style={{
          flex: 1,
          display: "flex",
          padding: "3vh 8vw 9vh 8vw",
          gap: "6vw",
          alignItems: "center",
        }}
      >
        {/* Left: 4 bullet items */}
        <div
          style={{
            flex: 6,
            display: "flex",
            flexDirection: "column",
            gap: "3.5vh",
          }}
        >
          {/* Item 1 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
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
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Sentinel-Gate Compliance Proxy: Operates an active /authorize circuit breaker to block non-compliant tool executions, high-risk data transfers, and unauthorized API mutations before execution.
            </div>
          </div>

          {/* Item 2 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
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
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Immutable audit ledger for every agent action and decision
            </div>
          </div>

          {/* Item 3 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
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
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Tamper-proof compliance logging and replayability
            </div>
          </div>

          {/* Item 4 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
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
                fontSize: "2.05vw",
                fontWeight: 600,
                color: "#F8FAFC",
                lineHeight: 1.35,
              }}
            >
              Lightweight SDK integration with existing agent frameworks
            </div>
          </div>
        </div>

        {/* Right: decorative terminal block */}
        <div
          style={{
            flex: 4,
            backgroundColor: "#0D1B2E",
            border: "1px solid #334155",
            padding: "3vh 2.5vw",
            display: "flex",
            flexDirection: "column",
            gap: "1.8vh",
            position: "relative",
          }}
        >
          {/* Terminal dot row */}
          <div style={{ display: "flex", gap: "0.5vw", marginBottom: "1vh" }}>
            <div
              style={{
                width: "0.7vw",
                height: "0.7vw",
                borderRadius: "50%",
                backgroundColor: "#475569",
              }}
            />
            <div
              style={{
                width: "0.7vw",
                height: "0.7vw",
                borderRadius: "50%",
                backgroundColor: "#475569",
              }}
            />
            <div
              style={{
                width: "0.7vw",
                height: "0.7vw",
                borderRadius: "50%",
                backgroundColor: "#14B8A6",
              }}
            />
          </div>
          <div
            style={{ fontSize: "1.5vw", fontWeight: 400, color: "#475569", fontFamily: "monospace" }}
          >
            $ sentinel register --agent
          </div>
          <div
            style={{ fontSize: "1.5vw", fontWeight: 400, color: "#14B8A6", fontFamily: "monospace" }}
          >
            &gt; Agent registered: apex-v2
          </div>
          <div
            style={{ fontSize: "1.5vw", fontWeight: 400, color: "#475569", fontFamily: "monospace" }}
          >
            &gt; Ledger chain: 0xf4a...
          </div>
          <div
            style={{ fontSize: "1.5vw", fontWeight: 400, color: "#94A3B8", fontFamily: "monospace" }}
          >
            &gt; Status: ACTIVE
          </div>
          <div
            style={{ fontSize: "1.5vw", fontWeight: 400, color: "#475569", fontFamily: "monospace" }}
          >
            &gt; Compliance: EU AI Act Art.12
          </div>
          <div
            style={{
              marginTop: "1vh",
              padding: "1.5vh 1.5vw",
              backgroundColor: "rgba(20,184,166,0.08)",
              border: "1px solid rgba(20,184,166,0.25)",
              fontSize: "1.4vw",
              fontWeight: 600,
              color: "#14B8A6",
              fontFamily: "monospace",
            }}
          >
            ✓ Audit ledger: IMMUTABLE
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
        <span style={{ color: "#14B8A6" }}>03</span>
      </div>
    </div>
  );
}
