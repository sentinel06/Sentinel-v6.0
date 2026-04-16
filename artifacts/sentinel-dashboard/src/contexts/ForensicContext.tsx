import React, { createContext, useContext, useState } from "react";

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
}

const ForensicContext = createContext<ForensicContextType>({
  agent: null,
  setAgent: () => {},
  activeMutations: 0,
  setActiveMutations: () => {},
});

export function ForensicProvider({ children }: { children: React.ReactNode }) {
  const [agent, setAgent] = useState<ForensicAgent | null>(null);
  const [activeMutations, setActiveMutations] = useState(0);

  return (
    <ForensicContext.Provider value={{ agent, setAgent, activeMutations, setActiveMutations }}>
      {children}
    </ForensicContext.Provider>
  );
}

export function useForensic() {
  return useContext(ForensicContext);
}
