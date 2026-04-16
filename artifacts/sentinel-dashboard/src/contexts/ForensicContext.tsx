import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LS_AGENT = "sentinel.forensic.agent";
const PULSE_MS = 2500;

export interface ForensicAgent {
  id: string;
  label: string;
  status: string;
  drift: number;
  fitnessScore: number;
  generationDepth: number;
  isRoot?: boolean;
  swarmId: string | null;
  parentUid: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  quantumSig?: string;
}

interface ForensicContextType {
  agent: ForensicAgent | null;
  setAgent: (agent: ForensicAgent | null) => void;
  activeMutations: number;
  setActiveMutations: (n: number) => void;
  pulse: number;
  lastSync: Date | null;
  ledgerTampered: boolean;
}

const ForensicContext = createContext<ForensicContextType>({
  agent: null,
  setAgent: () => {},
  activeMutations: 0,
  setActiveMutations: () => {},
  pulse: 0,
  lastSync: null,
  ledgerTampered: false,
});

export function ForensicProvider({ children }: { children: React.ReactNode }) {
  const [agent, setAgentState] = useState<ForensicAgent | null>(() => {
    try {
      const raw = localStorage.getItem(LS_AGENT);
      return raw ? (JSON.parse(raw) as ForensicAgent) : null;
    } catch { return null; }
  });
  const [activeMutations, setActiveMutations] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [ledgerTampered, setLedgerTampered] = useState(false);
  const mounted = useRef(true);

  const setAgent = (next: ForensicAgent | null) => {
    setAgentState(next);
    try {
      if (next) localStorage.setItem(LS_AGENT, JSON.stringify(next));
      else localStorage.removeItem(LS_AGENT);
    } catch {}
  };

  // Global pulse tick — every page can subscribe via `pulse` to refetch.
  useEffect(() => {
    mounted.current = true;
    const id = setInterval(() => {
      if (!mounted.current) return;
      setPulse(p => p + 1);
      setLastSync(new Date());
    }, PULSE_MS);
    setLastSync(new Date());
    return () => { mounted.current = false; clearInterval(id); };
  }, []);

  // Global ledger-tamper watcher — feeds Risk Horizon (Nominal → Amber).
  useEffect(() => {
    let abort = false;
    async function check() {
      try {
        const r = await fetch(`${BASE}/api/v1/integrity/status`);
        if (!r.ok) return;
        const j = await r.json();
        if (abort) return;
        setLedgerTampered(j?.ok === false);
      } catch {}
    }
    check();
    const id = setInterval(check, PULSE_MS);
    return () => { abort = true; clearInterval(id); };
  }, []);

  return (
    <ForensicContext.Provider value={{
      agent, setAgent, activeMutations, setActiveMutations,
      pulse, lastSync, ledgerTampered,
    }}>
      {children}
    </ForensicContext.Provider>
  );
}

export function useForensic() {
  return useContext(ForensicContext);
}

export function useLivePulse() {
  const { pulse, lastSync } = useContext(ForensicContext);
  return { pulse, lastSync };
}
