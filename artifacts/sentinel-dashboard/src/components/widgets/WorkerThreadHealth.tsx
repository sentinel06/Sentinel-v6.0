import { useEffect, useState } from "react";

interface ThreadState {
  id: string;
  load: number;
}

const THREADS_INIT: ThreadState[] = [
  { id: "T-01", load: 42 },
  { id: "T-02", load: 67 },
  { id: "T-03", load: 28 },
];

export default function WorkerThreadHealth() {
  const [threads, setThreads] = useState<ThreadState[]>(THREADS_INIT);

  useEffect(() => {
    const id = window.setInterval(() => {
      setThreads((prev) =>
        prev.map((t) => {
          const drift = (Math.random() - 0.5) * 18;
          const next = Math.max(8, Math.min(96, t.load + drift));
          return { ...t, load: next };
        }),
      );
    }, 1200);
    return () => window.clearInterval(id);
  }, []);

  const accent = (load: number) =>
    load > 85 ? "#FF003C" : load > 65 ? "#FFB800" : "#00F5FF";

  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/75">
          Worker Threads
        </div>
        <div className="text-[9px] font-mono text-white/70">crypto pool · CPU%</div>
      </div>

      <div className="flex items-end justify-between gap-3 h-[68px]">
        {threads.map((t) => {
          const color = accent(t.load);
          return (
            <div key={t.id} className="flex-1 flex flex-col items-center gap-2">
              <div className="font-mono text-[10px] tabular-nums" style={{ color }}>
                {Math.round(t.load)}%
              </div>
              <div className="relative w-full h-[44px] rounded-sm overflow-hidden bg-white/5 border border-white/10">
                <div
                  className="absolute bottom-0 left-0 right-0 transition-[height] duration-700 ease-out"
                  style={{
                    height: `${t.load}%`,
                    background: `linear-gradient(180deg, ${color} 0%, ${color}55 100%)`,
                    boxShadow: `0 0 8px ${color}88`,
                  }}
                />
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/70">
                {t.id}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
