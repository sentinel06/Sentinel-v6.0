import { useEffect, useRef, useState } from "react";

const POINTS = 60;

export default function RedisPulse() {
  const [series, setSeries] = useState<number[]>(() =>
    Array.from({ length: POINTS }, () => 4 + Math.random() * 6),
  );
  const tickRef = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      tickRef.current += 1;
      const pulse =
        4 +
        Math.random() * 5 +
        (tickRef.current % 12 === 0 ? 6 : 0); // periodic ledger sync spike
      setSeries((s) => [...s.slice(1), pulse]);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const w = 220;
  const h = 56;
  const max = Math.max(12, ...series);
  const step = w / (POINTS - 1);
  const pts = series
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`)
    .join(" ");
  const last = series[series.length - 1];

  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/75">
          Redis Pulse
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#00F5FF] glow-cyan"
            style={{ animation: "live-pulse 2s ease-in-out infinite" }}
          />
          <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#00F5FF]">
            connected
          </span>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
        <defs>
          <linearGradient id="redis-pulse-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00F5FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00F5FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="#00F5FF"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={pts}
          style={{ filter: "drop-shadow(0 0 4px #00F5FF)" }}
        />
        <polygon
          fill="url(#redis-pulse-fill)"
          points={`0,${h} ${pts} ${w},${h}`}
        />
      </svg>

      <div className="flex items-center justify-between mt-2 font-mono text-[10px]">
        <span className="text-white/70">last 60s</span>
        <span className="text-white tabular-nums">
          {last.toFixed(1)} <span className="text-white/70">syncs/s</span>
        </span>
      </div>
    </div>
  );
}
