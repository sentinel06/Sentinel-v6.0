import React, { useState } from "react";
import { useGetIntegrityStatus } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle, Fingerprint, Database, Link as LinkIcon } from "lucide-react";
import { formatTime, formatDate } from "@/lib/audit-utils";

export default function IntegrityPage() {
  const { data: status, isLoading, refetch } = useGetIntegrityStatus({ query: { queryKey: ['integrity'] }});
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hash Chain Integrity</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">Cryptographic verification of audit log immutability</p>
        </div>
        
        <Button 
          onClick={handleVerify} 
          disabled={isVerifying || isLoading}
          className="font-mono shadow-[0_0_15px_rgba(14,165,233,0.3)]"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isVerifying ? 'animate-spin' : ''}`} />
          {isVerifying ? 'Verifying Chain...' : 'Trigger Manual Verification'}
        </Button>
      </div>

      {isCompromised && (
        <div className="bg-destructive/20 border border-destructive/50 rounded-lg p-4 flex items-start gap-4 animate-in slide-in-from-top-2">
          <ShieldAlert className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
          <div>
            <h3 className="font-mono font-bold text-destructive uppercase tracking-wide">Tamper Alert: Ledger Compromised</h3>
            <p className="text-sm text-foreground/90 mt-1 font-mono">
              {status?.message || "Cryptographic verification failed. The audit trail has been modified after creation."}
            </p>
            {status?.tamperedEntries && status.tamperedEntries.length > 0 && (
              <div className="mt-3 text-xs font-mono bg-destructive/10 p-3 rounded border border-destructive/20">
                <span className="text-destructive/80 mb-2 block font-bold">AFFECTED ENTRY IDs:</span>
                <ul className="list-disc pl-4 space-y-1 text-destructive/90">
                  {status.tamperedEntries.map(id => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className={`md:col-span-2 p-8 border-border/60 backdrop-blur-sm flex flex-col items-center justify-center text-center ${
          isLoading ? 'bg-card/50' :
          isCompromised ? 'bg-destructive/5 border-destructive/30' : 
          'bg-emerald-500/5 border-emerald-500/30'
        }`}>
          {isLoading ? (
            <RefreshCw className="w-20 h-20 text-muted-foreground/30 animate-spin mb-6" />
          ) : isCompromised ? (
            <ShieldAlert className="w-20 h-20 text-destructive mb-6 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
          ) : (
            <ShieldCheck className="w-20 h-20 text-emerald-500 mb-6 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
          )}
          
          <h2 className="font-mono text-2xl font-bold mb-2">
            {isLoading ? "Checking Ledger..." : 
             isCompromised ? "INTEGRITY BROKEN" : 
             "CHAIN VERIFIED"}
          </h2>
          <p className="text-muted-foreground font-mono max-w-md mx-auto">
            {isLoading ? "Recalculating SHA-256 hashes across all entries..." :
             isCompromised ? "The mathematical link between sequential log entries is invalid." :
             "All audit entries mathematically link to their predecessors. No tampering detected."}
          </p>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-sm">
            <h3 className="font-mono text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <Database className="w-4 h-4" /> Ledger Stats
            </h3>
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Total Entries Checked</div>
                <div className="font-mono text-2xl font-semibold">{status?.totalChecked?.toLocaleString() || "0"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Last Verification</div>
                <div className="font-mono text-sm">
                  {status?.lastVerifiedAt ? (
                    <>
                      {formatDate(status.lastVerifiedAt)} <span className="text-muted-foreground">{formatTime(status.lastVerifiedAt)}</span>
                    </>
                  ) : "Never"}
                </div>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-sm">
            <h3 className="font-mono text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <LinkIcon className="w-4 h-4" /> Mechanism
            </h3>
            <p className="text-xs text-muted-foreground font-mono leading-relaxed">
              Every audit log entry contains a cryptographic hash of its own contents combined with the hash of the preceding entry. Modifying any historical log breaks the chain for all subsequent entries, making stealth modifications mathematically impossible.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}