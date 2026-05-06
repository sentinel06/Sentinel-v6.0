import { useEffect, useState } from "react";

interface Props {
  bits?: number;
  maxBits?: number;
  label?: string;
}

export default function LatticeStrengthGauge({ bits = 87, maxBits = 100, label = "Lattice Strength" }: Props) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(bits * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bits]);

  const size = 132;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, shown / maxBits);
  const dash = c * pct;

  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col items-center gap-3">
      <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/75">
        {label}
      </div>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#00F5FF" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            style={{ filter: "drop-shadow(0 0 6px #00F5FF)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono text-3xl font-semibold text-white text-glow-cyan tabular-nums">
            {Math.round(shown)}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
            bits
          </div>
        </div>
      </div>
      <div className="text-[11px] font-mono text-white/70 text-center leading-relaxed">
        ML-DSA-87 entropy<br />
        <span className="text-[#00F5FF]">FIPS-204 SL5</span> · post-quantum
      </div>
    </div>
  );
}
