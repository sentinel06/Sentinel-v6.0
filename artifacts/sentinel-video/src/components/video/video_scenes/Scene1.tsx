import { motion } from "framer-motion";
import { useState, useEffect } from "react";

const CYAN = "#00F5FF";
const CRIMSON = "#FF003C";

const WORDS = ["Nobody's", "watching", "your", "AI"];
const CHARS = "SURVEILLANCE_AUDIT_MONITOR_TRACE".split("");

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 0),
      setTimeout(() => setPhase(2), 500),
      setTimeout(() => setPhase(3), 1100),
      setTimeout(() => setPhase(4), 2600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ clipPath: "polygon(50% 0%, 50% 0%, 50% 100%, 50% 100%)" }}
      animate={{ clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)" }}
      exit={{ clipPath: "polygon(50% 0%, 50% 0%, 50% 100%, 50% 100%)", transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Scanning horizontal beam */}
      <motion.div
        className="absolute left-0 right-0 pointer-events-none"
        style={{ height: "1px", background: `linear-gradient(90deg, transparent, ${CYAN}88, transparent)` }}
        animate={{ top: ["10%", "90%", "10%"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Cascading background chars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        {CHARS.map((c, i) => (
          <motion.span
            key={i}
            className="absolute"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.9vw",
              color: `${CYAN}18`,
              left: `${(i * 3.2) % 96}%`,
              top: `${(i * 7.3) % 90}%`,
            }}
            animate={{ opacity: [0.05, 0.3, 0.05], y: [0, -8, 0] }}
            transition={{ duration: 2.5 + (i % 4) * 0.5, repeat: Infinity, delay: (i * 0.13) % 2 }}
          >
            {c}
          </motion.span>
        ))}
      </div>

      {/* Glitch rect */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "20%", top: "38%", right: "20%", height: "28%",
          border: `1px solid ${CRIMSON}30`,
          background: `${CRIMSON}05`,
        }}
        animate={{ opacity: [0, 1, 0], scaleX: [1, 1.005, 1] }}
        transition={{ duration: 2.8, repeat: Infinity, delay: 0.4 }}
      />

      {/* Main headline */}
      <div className="relative z-10 text-center px-[8vw]">
        <div
          className="flex flex-wrap justify-center gap-x-[1.6vw] gap-y-[0.6vh]"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          {WORDS.map((word, wi) => (
            <span key={wi} style={{ overflow: "hidden", display: "inline-block" }}>
              <motion.span
                style={{
                  display: "inline-block",
                  fontSize: "8.5vw",
                  lineHeight: 1.0,
                  color: wi === 3 ? CRIMSON : "#E2E8F0",
                  textShadow: wi === 3 ? `0 0 40px ${CRIMSON}66` : "none",
                  letterSpacing: "-0.02em",
                }}
                initial={{ y: "110%" }}
                animate={phase >= 2 ? { y: "0%" } : { y: "110%" }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: wi * 0.07 }}
              >
                {word}
              </motion.span>
            </span>
          ))}
        </div>

        <motion.p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "1.3vw",
            color: "#475569",
            marginTop: "2.5vh",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
          initial={{ opacity: 0, filter: "blur(8px)" }}
          animate={phase >= 3 ? { opacity: 1, filter: "blur(0px)" } : { opacity: 0, filter: "blur(8px)" }}
          transition={{ duration: 0.6 }}
        >
          Every decision. Every action. Unaccounted.
        </motion.p>
      </div>

      {/* Bottom threat indicator */}
      <motion.div
        className="absolute bottom-[8vh] flex items-center gap-[1vw]"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          style={{ width: "0.6vw", height: "0.6vw", borderRadius: "50%", background: CRIMSON }}
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85vw", color: `${CRIMSON}cc`, letterSpacing: "0.12em" }}>
          AUDIT_LOG_MISSING
        </span>
      </motion.div>
    </motion.div>
  );
}
