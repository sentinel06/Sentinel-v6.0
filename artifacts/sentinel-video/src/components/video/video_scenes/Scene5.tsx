import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import logoImg from "@assets/logo_sentinel_transparent.png";

const CYAN = "#00F5FF";
const VIOLET = "#8B5CF6";

const LINE1 = "Govern your".split(" ");
const LINE2 = "agents.".split("");

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 0),
      setTimeout(() => setPhase(2), 400),
      setTimeout(() => setPhase(3), 1100),
      setTimeout(() => setPhase(4), 2100),
      setTimeout(() => setPhase(5), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.7 } }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Full-screen radial glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 60% at 50% 50%, ${CYAN}0f 0%, transparent 70%)` }}
        animate={{ opacity: [0, 1, 0.7] }}
        transition={{ duration: 1.5 }}
      />

      {/* Particle ring */}
      {Array.from({ length: 20 }, (_, i) => {
        const angle = (i / 20) * Math.PI * 2;
        const r = 22;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        return (
          <motion.div
            key={i}
            className="absolute pointer-events-none"
            style={{
              width: "0.35vw", height: "0.35vw",
              borderRadius: "50%",
              background: i % 3 === 0 ? VIOLET : CYAN,
              left: `calc(50% + ${x}vw)`,
              top: `calc(50% + ${y}vh - 8vh)`,
              opacity: 0.6,
            }}
            animate={{ scale: [0, 1.2, 0.8], opacity: [0, 0.8, 0] }}
            transition={{ duration: 1.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}

      {/* Logo */}
      <motion.div
        style={{ position: "relative", marginBottom: "3vh", zIndex: 10 }}
        initial={{ scale: 0, rotate: -30, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, rotate: 0, opacity: 1 } : { scale: 0, rotate: -30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
      >
        <img
          src={logoImg}
          alt="Agent-Sentinel"
          style={{
            width: "9vw", height: "9vw", objectFit: "contain",
            filter: `drop-shadow(0 0 30px ${CYAN}aa) drop-shadow(0 0 60px ${CYAN}44)`,
          }}
        />
      </motion.div>

      {/* Headline */}
      <div className="relative z-10 text-center" style={{ marginBottom: "2vh" }}>
        {/* Line 1 */}
        <div className="flex justify-center" style={{ gap: "1.5vw", marginBottom: "0.5vh" }}>
          {LINE1.map((word, wi) => (
            <span key={wi} style={{ overflow: "hidden", display: "inline-block" }}>
              <motion.span
                style={{
                  display: "inline-block",
                  fontFamily: "var(--font-display)",
                  fontSize: "7vw",
                  fontWeight: 700,
                  color: "#E2E8F0",
                  lineHeight: 1.0,
                  letterSpacing: "-0.025em",
                }}
                initial={{ y: "110%" }}
                animate={phase >= 2 ? { y: "0%" } : { y: "110%" }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: wi * 0.06 }}
              >
                {word}
              </motion.span>
            </span>
          ))}
        </div>

        {/* Line 2 — cyan with per-char spring */}
        <div className="flex justify-center">
          {LINE2.map((char, ci) => (
            <span key={ci} style={{ overflow: "hidden", display: "inline-block" }}>
              <motion.span
                style={{
                  display: "inline-block",
                  fontFamily: "var(--font-display)",
                  fontSize: "7vw",
                  fontWeight: 700,
                  color: CYAN,
                  lineHeight: 1.0,
                  letterSpacing: "-0.025em",
                  textShadow: `0 0 40px ${CYAN}88`,
                }}
                initial={{ y: "110%", scale: 0.8 }}
                animate={phase >= 3 ? { y: "0%", scale: 1 } : { y: "110%", scale: 0.8 }}
                transition={{ type: "spring", stiffness: 350, damping: 24, delay: ci * 0.05 }}
              >
                {char}
              </motion.span>
            </span>
          ))}
        </div>
      </div>

      {/* URL / CTA label */}
      <motion.div
        className="relative z-10"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "1.1vw",
          color: "#475569",
          letterSpacing: "0.18em",
          marginBottom: "4vh",
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        agent-sentinel.replit.app
      </motion.div>

      {/* Bottom sweep line */}
      <motion.div
        style={{
          position: "absolute",
          bottom: "10vh",
          left: "20vw",
          right: "20vw",
          height: "1px",
          background: `linear-gradient(90deg, transparent, ${CYAN}, ${VIOLET}, transparent)`,
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={phase >= 5 ? { scaleX: 1, opacity: 0.7 } : { scaleX: 0, opacity: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Brand lock-up */}
      <motion.div
        style={{
          position: "absolute",
          bottom: "6vh",
          fontFamily: "var(--font-mono)",
          fontSize: "0.7vw",
          color: `${VIOLET}88`,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        Sovereign AI Governance
      </motion.div>
    </motion.div>
  );
}
