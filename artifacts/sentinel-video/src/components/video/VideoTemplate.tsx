import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { useVideoPlayer } from "@/lib/video";
import { Scene1 } from "./video_scenes/Scene1";
import { Scene2 } from "./video_scenes/Scene2";
import { Scene3 } from "./video_scenes/Scene3";
import { Scene4 } from "./video_scenes/Scene4";
import { Scene5 } from "./video_scenes/Scene5";

const CYAN = "#00F5FF";
const VIOLET = "#8B5CF6";

export const SCENE_DURATIONS: Record<string, number> = {
  hook:     3500,
  problem:  4500,
  solution: 5000,
  features: 5000,
  close:    4500,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook:     Scene1,
  problem:  Scene2,
  solution: Scene3,
  features: Scene4,
  close:    Scene5,
};

// Per-scene positions for persistent orb A [left%]
const ORB_A_LEFT = ["42%", "8%",  "60%", "20%", "50%"];
const ORB_A_TOP  = ["15%", "20%", "12%", "25%", "22%"];
// Per-scene positions for persistent orb B
const ORB_B_LEFT = ["72%", "65%", "15%", "70%", "45%"];
const ORB_B_TOP  = ["60%", "50%", "70%", "55%", "48%"];

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, "") as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const AUDIO_SEEK_EPSILON_SEC = 0.18;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const SCENE_START_SEC: Record<string, number> = (() => {
    const out: Record<string, number> = {};
    let cumulativeMs = 0;
    for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
      out[key] = cumulativeMs / 1000;
      cumulativeMs += ms;
    }
    return out;
  })();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "100vh", background: "#020617" }}
    >
      {/* ── Persistent BG: slow drifting gradient orbs ── */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute rounded-full blur-3xl"
          style={{
            width: "45vw", height: "45vw",
            background: `radial-gradient(circle, ${CYAN}0a 0%, transparent 70%)`,
          }}
          animate={{ x: ["-10%", "20%", "-5%"], y: ["5%", "30%", "10%"] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute rounded-full blur-3xl"
          style={{
            width: "55vw", height: "55vw",
            background: `radial-gradient(circle, ${VIOLET}08 0%, transparent 70%)`,
            right: 0, bottom: 0,
          }}
          animate={{ x: ["5%", "-15%", "0%"], y: ["-5%", "-25%", "-10%"] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* ── Persistent midground: roaming accent orb A (cyan) ── */}
      <motion.div
        className="absolute rounded-full blur-2xl pointer-events-none"
        style={{ width: "18vw", height: "18vw", background: `radial-gradient(circle, ${CYAN}14 0%, transparent 70%)` }}
        animate={{ left: ORB_A_LEFT[sceneIndex], top: ORB_A_TOP[sceneIndex] }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* ── Persistent midground: roaming accent orb B (violet) ── */}
      <motion.div
        className="absolute rounded-full blur-2xl pointer-events-none"
        style={{ width: "22vw", height: "22vw", background: `radial-gradient(circle, ${VIOLET}10 0%, transparent 70%)` }}
        animate={{ left: ORB_B_LEFT[sceneIndex], top: ORB_B_TOP[sceneIndex] }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* ── Persistent midground: travelling accent line ── */}
      <motion.div
        className="absolute left-0 right-0 pointer-events-none"
        style={{ height: "1px" }}
        animate={{
          top:       ["72%", "28%", "75%", "18%", "82%"][sceneIndex],
          opacity:   [0.18,  0.25,  0.12,  0.20,  0.15][sceneIndex],
          background:[CYAN, "#FF003C", CYAN, VIOLET, CYAN][sceneIndex],
          scaleX:    [0.7, 1, 0.55, 0.9, 0.65][sceneIndex],
        }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* ── Persistent midground: floating corner node ── */}
      <motion.div
        className="absolute pointer-events-none"
        animate={{
          left:    ["8vw",  "88vw", "6vw",  "85vw", "50vw"][sceneIndex],
          top:     ["8vh",  "80vh", "85vh", "15vh", "90vh"][sceneIndex],
          opacity: [0.5, 0.3, 0.6, 0.4, 0.55][sceneIndex],
          scale:   [1, 1.4, 0.8, 1.2, 1][sceneIndex],
        }}
        transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div style={{
          width: "1.2vw", height: "1.2vw", borderRadius: "50%",
          border: `1px solid ${CYAN}66`,
          background: `${CYAN}22`,
          boxShadow: `0 0 8px ${CYAN}44`,
        }} />
      </motion.div>

      {/* ── Persistent top bar ── */}
      <motion.div
        className="absolute top-0 left-0 right-0 flex items-center justify-between pointer-events-none"
        style={{ padding: "2vh 3vw", zIndex: 20 }}
      >
        <motion.div
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.85vw", letterSpacing: "0.2em", color: "#374151" }}
          animate={{ opacity: sceneIndex === 4 ? 0 : 1 }}
          transition={{ duration: 0.5 }}
        >
          AGENT-SENTINEL
        </motion.div>
        <motion.div
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.75vw", letterSpacing: "0.14em", color: "#374151" }}
        >
          {String(sceneIndex + 1).padStart(2, "0")} / {Object.keys(SCENE_DURATIONS).length.toString().padStart(2, "0")}
        </motion.div>
      </motion.div>

      {/* ── Scene content ── */}
      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      {/* ── Background audio ── */}
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/composite_audio.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
