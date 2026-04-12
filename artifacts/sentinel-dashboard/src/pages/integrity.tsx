import React, { useState } from "react";
import { useGetIntegrityStatus } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, ShieldAlert, RefreshCw, Database,
  Link as LinkIcon, GitBranch, Layers, CheckCircle2, XCircle
} from "lucide-react";
import { formatTime, formatDate } from "@/lib/audit-utils";

export default function IntegrityPage() {
  const { data: rawStatus, isLoading, refetch } = useGetIntegrityStatus({ query: { queryKey: ["integrity"] } });
  const status = rawStatus as any;
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      await fetch("/api/v1/integrity/verify", { method: "POST" });
      await refetch();
    } catch (error) {
      console.error("Failed to verify integrity:", error);
    } finally {
      setIsVerifying(false);
    }
  };

  const isOk = status?.ok === true;
  const isCompromised = status?.tamperDetected === true;
  const merkleChecked: number = status?.merkleBlocksChecked ?? 0;
  const merkleFailed: number = status?.merkleBlocksFailed ?? 0;
  const merkleOk = merkleChecked > 0 && merkleFailed === 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hash Chain Integrity</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Two-phase cryptographic verification: SHA-256 sequential chain + Merkle tree
          </p>
        </div>

        <Button
          onClick={handleVerify}
          disabled={isVerifying || isLoading}
          className="font-mono shadow-[0_0_15px_rgba(14,165,233,0.3)]"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isVerifying ? "animate-spin" : ""}`} />
          {isVerifying ? "Verifying Chain..." : "Trigger Manual Verification"}
        </Button>
      </div>

      {isCompromised && (
        <div className="bg-destructive/20 border border-destructive/50 rounded-lg p-4 flex items-start gap-4 animate-in slide-in-from-top-2">
          <ShieldAlert className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
          <div>
            <h3 className="font-mono font-bold text-destructive uppercase tracking-wide">
              Tamper Alert: Ledger Compromised
            </h3>
            <p className="text-sm text-foreground/90 mt-1 font-mono">
              {status?.message || "Cryptographic verification failed. The audit trail has been modified."}
            </p>
            {status?.tamperedEntries?.length > 0 && (
              <div className="mt-3 text-xs font-mono bg-destructive/10 p-3 rounded border border-destructive/20">
                <span className="text-destructive/80 mb-2 block font-bold">AFFECTED ENTRY IDs:</span>
                <ul className="list-disc pl-4 space-y-1 text-destructive/90">
                  {status.tamperedEntries.map((id: string) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main status + ledger stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          className={`md:col-span-2 p-8 border-border/60 backdrop-blur-sm flex flex-col items-center justify-center text-center ${
            isLoading
              ? "bg-card/50"
              : isCompromised
              ? "bg-destructive/5 border-destructive/30"
              : "bg-emerald-500/5 border-emerald-500/30"
          }`}
        >
          {isLoading ? (
            <RefreshCw className="w-20 h-20 text-muted-foreground/30 animate-spin mb-6" />
          ) : isCompromised ? (
            <ShieldAlert className="w-20 h-20 text-destructive mb-6 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
          ) : (
            <ShieldCheck className="w-20 h-20 text-emerald-500 mb-6 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
          )}

          <h2 className="font-mono text-2xl font-bold mb-2">
            {isLoading ? "Checking Ledger..." : isCompromised ? "INTEGRITY BROKEN" : "CHAIN VERIFIED"}
          </h2>
          <p className="text-muted-foreground font-mono max-w-md mx-auto text-sm">
            {isLoading
              ? "Running two-phase verification: Merkle sweep then sequential chain walk…"
              : isCompromised
              ? "The mathematical link between sequential log entries is invalid."
              : "All audit entries mathematically link to their predecessors. No tampering detected."}
          </p>

          {!isLoading && status?.message && (
            <p className="mt-4 text-xs font-mono text-muted-foreground bg-muted/40 px-4 py-2 rounded-full border border-border/40">
              {status.message}
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-sm">
            <h3 className="font-mono text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <Database className="w-4 h-4" /> Ledger Stats
            </h3>
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Total Entries Checked</div>
                <div className="font-mono text-2xl font-semibold">
                  {status?.totalChecked?.toLocaleString() ?? "0"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Last Verification</div>
                <div className="font-mono text-sm">
                  {status?.lastVerifiedAt ? (
                    <>
                      {formatDate(status.lastVerifiedAt)}{" "}
                      <span className="text-muted-foreground">{formatTime(status.lastVerifiedAt)}</span>
                    </>
                  ) : (
                    "Never"
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-sm">
            <h3 className="font-mono text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <LinkIcon className="w-4 h-4" /> Hash Function
            </h3>
            <p className="text-xs text-muted-foreground font-mono leading-relaxed">
              H<sub>n</sub> = SHA-256(timestamp | agentId | payload | H<sub>n-1</sub>)
            </p>
            <p className="text-xs text-muted-foreground font-mono leading-relaxed mt-2">
              First entry uses <span className="text-foreground/70">GENESIS</span> as H<sub>0</sub>.
            </p>
          </Card>
        </div>
      </div>

      {/* Merkle tree layer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-sm">
          <h3 className="font-mono text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <GitBranch className="w-4 h-4" /> Merkle Tree Layer
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Blocks Verified</div>
              <div className="font-mono text-2xl font-semibold text-emerald-400">
                {isLoading ? "—" : merkleChecked}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Blocks Failed</div>
              <div className={`font-mono text-2xl font-semibold ${merkleFailed > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {isLoading ? "—" : merkleFailed}
              </div>
            </div>
          </div>

          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-mono border ${
            isLoading
              ? "bg-muted/30 border-border/30 text-muted-foreground"
              : merkleOk
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : merkleChecked === 0
              ? "bg-sky-500/10 border-sky-500/20 text-sky-400"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}>
            {isLoading ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : merkleOk ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : merkleChecked === 0 ? (
              <Layers className="w-3 h-3" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            {isLoading
              ? "Running Merkle sweep…"
              : merkleOk
              ? `All ${merkleChecked} sealed block(s) match their checkpoints`
              : merkleChecked === 0
              ? "No sealed blocks yet — chain is partial (< 512 entries)"
              : `${merkleFailed} of ${merkleChecked} block(s) failed Merkle root check`}
          </div>
        </Card>

        <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-sm">
          <h3 className="font-mono text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4" /> Verification Design
          </h3>
          <div className="space-y-3 text-xs font-mono text-muted-foreground leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="text-sky-400 font-bold shrink-0">Phase 1</span>
              <span>
                Merkle sweep — recomputes each block&apos;s root from its 512 leaf hashes and compares against the
                stored checkpoint. O(b · log n) where b = blocks. Flags tampered blocks instantly.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-400 font-bold shrink-0">Phase 2</span>
              <span>
                Sequential chain walk — only runs inside blocks that failed Phase 1. Walks entry-by-entry to
                pinpoint the exact tampered row(s). Partial block (tail) always scanned.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold shrink-0">Sealing</span>
              <span>
                A Merkle checkpoint is sealed automatically every 512 inserts. Block root = SHA-256 pairwise tree
                over all leaf hashes. Odd leaves are doubled (standard Bitcoin-style padding).
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
