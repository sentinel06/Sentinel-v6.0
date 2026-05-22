import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import logoImg from "@assets/logo_sentinel_transparent.png";

const CYAN = "#00F5FF";
const VIOLET = "#8B5CF6";

const TAGLINE_CHARS = "AGENT-SENTINEL".split("");

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 2500),
      setTimeout(() => setPhase(5), 3600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 1.08 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -30, transition: { duration: 0.5 } }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Radial light burst from center */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: "60vw", height: "60vw",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${CYAN}18 0%, transparent 65%)`,
        }}
        animate={{ scale: [0.6, 1.2, 1], opacity: [0, 0.8, 0.5] }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Logo */}
      <motion.div
        className="relative z-10"
        style={{ marginBottom: "3vh" }}
        initial={{ scale: 0.2, opacity: 0, filter: "blur(20px)" }}
        animate={phase >= 1 ? { scale: 1, opacity: 1, filter: "blur(0px)" } : { scale: 0.2, opacity: 0, filter: "blur(20px)" }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={logoImg}
          alt="Agent-Sentinel"
          style={{ width: "11vw", height: "11vw", objectFit: "contain", filter: `drop-shadow(0 0 30px ${CYAN}88)` }}
        />
        {/* Orbit ring */}
        <motion.div
          className="absolute"
          style={{
            inset: "-10%",
            borderRadius: "50%",
            border: `1px solid ${CYAN}44`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute"
          style={{
            inset: "-20%",
            borderRadius: "50%",
            border: `1px solid ${VIOLET}33`,
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>

      {/* Brand name character stagger */}
      <motion.div
        className="relative z-10 flex"
        style={{ gap: "0.1vw", marginBottom: "1.5vh" }}
        initial="hidden"
        animate={phase >= 2 ? "visible" : "hidden"}
        variants={{ visible: { transition: { staggerChildren: 0.04, delayChildren: 0 } }, hidden: {} }}
      >
        {TAGLINE_CHARS.map((char, i) => (
          <motion.span
            key={i}
            style={{
              display: "inline-block",
              fontFamily: "var(--font-display)",
              fontSize: char === "-" ? "5vw" : "5.5vw",
              fontWeight: 700,
              color: char === "-" ? VIOLET : CYAN,
              letterSpacing: "0.08em",
              textShadow: `0 0 20px ${char === "-" ? VIOLET : CYAN}66`,
            }}
            variants={{
              hidden: { opacity: 0, y: 30, rotateX: -40 },
              visible: { opacity: 1, y: 0, rotateX: 0, transition: { type: "spring", stiffness: 400, damping: 28 } },
            }}
          >
            {char}
          </motion.span>
        ))}
      </motion.div>

      {/* Tagline */}
      <motion.p
        className="relative z-10"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "1.1vw",
          color: "#94a3b8",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
        initial={{ opacity: 0, filter: "blur(10px)" }}
        animate={phase >= 3 ? { opacity: 1, filter: "blur(0px)" } : { opacity: 0, filter: "blur(10px)" }}
        transition={{ duration: 0.6 }}
      >
        Governance infrastructure for AI agents
      </motion.p>

      {/* Hash chain growing bar */}
      <motion.div
        className="absolute"
        style={{ bottom: "16vh", left: "15vw", right: "15vw", display: "flex", gap: "0.4vw" }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        {Array.from({ length: 18 }, (_, i) => (
          <motion.div
            key={i}
            style={{
              flex: 1,
              height: "3px",
              borderRadius: "2px",
              background: i < 12 ? CYAN : VIOLET,
              opacity: 0.6 + (i % 3) * 0.13,
            }}
            initial={{ scaleX: 0 }}
            animate={phase >= 4 ? { scaleX: 1 } : { scaleX: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
          />
        ))}
      </motion.div>

      <motion.p
        className="absolute"
        style={{ bottom: "9vh", fontFamily: "var(--font-mono)", fontSize: "0.75vw", color: `${CYAN}88`, letterSpacing: "0.18em" }}
        initial={{ opacity: 0 }}
        animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        IMMUTABLE · CRYPTOGRAPHIC · COMPLIANT
      </motion.p>
    </motion.div>
  );
}
