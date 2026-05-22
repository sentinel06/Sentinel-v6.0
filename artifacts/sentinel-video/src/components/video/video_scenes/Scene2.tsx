import { motion } from "framer-motion";
import { useState, useEffect } from "react";

const CYAN = "#00F5FF";
const CRIMSON = "#FF003C";
const AMBER = "#FFB800";

const HASH_CHARS = "0123456789abcdef";
const randomHex = (len: number) => Array.from({ length: len }, () => HASH_CHARS[Math.floor(Math.random() * 16)]).join("");

const BLOCKS = [
  { label: "a1b2c3d4", hash: randomHex(8), ok: true },
  { label: "f8e7d6c5", hash: randomHex(8), ok: true },
  { label: "9x4z2q1p", hash: "????????", ok: false },
  { label: "3m7k5r2n", hash: randomHex(8), ok: false },
];

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1400),
      setTimeout(() => setPhase(4), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ clipPath: "circle(0% at 50% 50%)" }}
      animate={{ clipPath: "circle(100% at 50% 50%)" }}
      exit={{ opacity: 0, scale: 1.06, filter: "blur(12px)", transition: { duration: 0.6 } }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Grid bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${CYAN}08 1px, transparent 1px),
            linear-gradient(90deg, ${CYAN}08 1px, transparent 1px)
          `,
          backgroundSize: "4vw 4vw",
        }}
      />

      {/* Title */}
      <motion.div
        className="absolute"
        style={{ top: "10vh", fontFamily: "var(--font-mono)", fontSize: "0.9vw", color: AMBER, letterSpacing: "0.25em", textTransform: "uppercase" }}
        initial={{ opacity: 0, x: -20 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        transition={{ duration: 0.5 }}
      >
        ▸ INTEGRITY BREACH DETECTED
      </motion.div>

      {/* Chain of blocks */}
      <div className="relative z-10 flex items-center gap-0" style={{ marginTop: "-4vh" }}>
        {BLOCKS.map((block, i) => (
          <div key={i} className="flex items-center">
            {/* Link connector */}
            {i > 0 && (
              <motion.div
                style={{
                  width: "3vw", height: "2px",
                  background: i >= 2
                    ? `linear-gradient(90deg, ${CYAN}88, ${CRIMSON})`
                    : `linear-gradient(90deg, ${CYAN}88, ${CYAN}88)`,
                  position: "relative",
                }}
                initial={{ scaleX: 0 }}
                animate={phase >= 2 ? { scaleX: 1 } : { scaleX: 0 }}
                transition={{ duration: 0.4, delay: i * 0.12 }}
              >
                {i >= 2 && (
                  <motion.div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(90deg, transparent, ${CRIMSON}88)` }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                  />
                )}
              </motion.div>
            )}

            {/* Block */}
            <motion.div
              style={{
                width: "9vw", height: "9vw",
                background: block.ok
                  ? `linear-gradient(135deg, #0d1a2e, #112240)`
                  : `linear-gradient(135deg, #1a0d0d, #2d0f0f)`,
                border: `1px solid ${block.ok ? `${CYAN}44` : `${CRIMSON}88`}`,
                borderRadius: "0.6vw",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5vh",
                boxShadow: block.ok
                  ? `0 0 20px ${CYAN}18`
                  : `0 0 30px ${CRIMSON}44`,
                position: "relative",
                overflow: "hidden",
              }}
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 30, scale: 0.85 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.1 }}
            >
              {/* Corrupted overlay for broken blocks */}
              {!block.ok && (
                <motion.div
                  className="absolute inset-0"
                  style={{ background: `${CRIMSON}0a` }}
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                />
              )}

              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "0.6vw",
                color: block.ok ? `${CYAN}aa` : `${CRIMSON}aa`,
                letterSpacing: "0.1em",
              }}>BLOCK</span>

              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "1.3vw",
                fontWeight: 700,
                color: block.ok ? CYAN : CRIMSON,
                textShadow: block.ok ? `0 0 12px ${CYAN}88` : `0 0 12px ${CRIMSON}`,
              }}>
                {block.ok ? "✓" : "✗"}
              </span>

              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "0.55vw",
                color: block.ok ? `${CYAN}66` : `${CRIMSON}88`,
                letterSpacing: "0.05em",
              }}>
                #{block.hash}
              </span>

              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "0.5vw",
                color: "#475569",
              }}>
                {block.label}
              </span>
            </motion.div>
          </div>
        ))}
      </div>

      {/* Error caption */}
      <motion.div
        className="absolute"
        style={{ bottom: "18vh", textAlign: "center" }}
        initial={{ opacity: 0, y: 15 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{
          fontFamily: "var(--font-display)", fontSize: "3.5vw", fontWeight: 700,
          color: CRIMSON, letterSpacing: "-0.01em",
          textShadow: `0 0 40px ${CRIMSON}88`,
        }}>
          Hash chain corrupted.
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "1vw", color: "#475569", marginTop: "1vh", letterSpacing: "0.1em" }}>
          Who tampered with block 3?
        </div>
      </motion.div>

      {/* Blame indicator */}
      <motion.div
        className="absolute"
        style={{ bottom: "8vh", display: "flex", alignItems: "center", gap: "1vw" }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: AMBER }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8vw", color: `${AMBER}cc`, letterSpacing: "0.12em" }}>
          NO_AUDIT_TRAIL → UNTRACEABLE
        </span>
      </motion.div>
    </motion.div>
  );
}
