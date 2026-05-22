import { motion } from "framer-motion";
import { useState, useEffect } from "react";

const CYAN = "#00F5FF";
const VIOLET = "#8B5CF6";
const AMBER = "#FFB800";

const FEATURES = [
  {
    icon: "⛓",
    title: "Immutable Ledger",
    sub: "Hash-chained audit logs",
    body: "Every agent action is cryptographically sealed. PostgreSQL triggers block UPDATE and DELETE. Tamper-proof by design.",
    color: CYAN,
  },
  {
    icon: "⚡",
    title: "Real-time Monitor",
    sub: "Live stream of decisions",
    body: "WebSocket feed of every event as it happens. Anomaly detection flags irregular patterns before they escalate.",
    color: VIOLET,
  },
  {
    icon: "📋",
    title: "EU AI Act Ready",
    sub: "Article 12 compliance",
    body: "Automated compliance exports. Audit reports for regulators. One-click proof that your AI operates as intended.",
    color: AMBER,
  },
];

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 0),
      setTimeout(() => setPhase(2), 300),
      setTimeout(() => setPhase(3), 900),
      setTimeout(() => setPhase(4), 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, filter: "blur(8px)", transition: { duration: 0.55 } }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Section label */}
      <motion.div
        style={{ fontFamily: "var(--font-mono)", fontSize: "0.8vw", color: CYAN, letterSpacing: "0.3em", marginBottom: "2.5vh" }}
        initial={{ opacity: 0, x: -15 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -15 }}
        transition={{ duration: 0.4 }}
      >
        THE SENTINEL LAYER
      </motion.div>

      {/* Cards row */}
      <div
        className="relative z-10 flex gap-[2vw]"
        style={{ maxWidth: "82vw" }}
      >
        {FEATURES.map((feat, i) => (
          <motion.div
            key={i}
            style={{
              flex: 1,
              background: `linear-gradient(145deg, #0a0f1e, #0d1428)`,
              border: `1px solid ${feat.color}33`,
              borderRadius: "1vw",
              padding: "2.5vw 2vw",
              display: "flex",
              flexDirection: "column",
              gap: "1.2vh",
              boxShadow: `0 0 40px ${feat.color}12`,
              position: "relative",
              overflow: "hidden",
            }}
            initial={{ opacity: 0, y: 35, scale: 0.92 }}
            animate={phase >= 2 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 35, scale: 0.92 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: i * 0.12 }}
          >
            {/* Card top accent */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              height: "2px",
              background: `linear-gradient(90deg, transparent, ${feat.color}, transparent)`,
            }} />

            {/* Glow */}
            <motion.div
              style={{
                position: "absolute", top: "-50%", left: "-50%", right: "-50%",
                height: "60%",
                background: `radial-gradient(ellipse, ${feat.color}08 0%, transparent 60%)`,
              }}
              animate={{ y: ["0%", "30%", "0%"] }}
              transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }}
            />

            <div style={{ fontSize: "2.8vw", lineHeight: 1 }}>{feat.icon}</div>

            <div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "1.6vw", fontWeight: 700,
                color: feat.color, letterSpacing: "-0.01em",
              }}>
                {feat.title}
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: "0.65vw", color: `${feat.color}88`,
                letterSpacing: "0.12em", textTransform: "uppercase", marginTop: "0.3vh",
              }}>
                {feat.sub}
              </div>
            </div>

            <motion.p
              style={{
                fontFamily: "var(--font-display)", fontSize: "0.85vw",
                color: "#64748b", lineHeight: 1.6, margin: 0,
              }}
              initial={{ opacity: 0 }}
              animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              {feat.body}
            </motion.p>

            {/* Pulsing bottom corner indicator */}
            <motion.div
              style={{
                position: "absolute", bottom: "1.2vw", right: "1.2vw",
                width: "0.5vw", height: "0.5vw", borderRadius: "50%",
                background: feat.color,
              }}
              animate={{ opacity: [1, 0.2, 1], scale: [1, 1.3, 1] }}
              transition={{ duration: 2 + i * 0.3, repeat: Infinity }}
            />
          </motion.div>
        ))}
      </div>

      {/* Connector line */}
      <motion.div
        style={{
          position: "absolute", bottom: "9vh", left: "10vw", right: "10vw",
          height: "1px",
          background: `linear-gradient(90deg, transparent, ${CYAN}44, ${VIOLET}44, ${AMBER}44, transparent)`,
        }}
        initial={{ scaleX: 0 }}
        animate={phase >= 4 ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.div>
  );
}
