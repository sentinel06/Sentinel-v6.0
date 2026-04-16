import React, { useState } from "react";
import { useGetIntegrityStatus } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, ShieldAlert, RefreshCw, Database,
  Link as LinkIcon, GitBranch, Layers, CheckCircle2, XCircle, Wrench,
} from "lucide-react";
import { formatTime, formatDate } from "@/lib/audit-utils";

const BASE  = import.meta.env.BASE_URL.replace(/\/$/, "");
const SAGE  = "#40B595";
const TERRA = "#D96161";
const AMBER = "#EBC06D";
const SKY   = "#38BDF8";

export default function IntegrityPage() {
  const { data: rawStatus, isLoading, refetch } = useGetIntegrityStatus({
    query: { queryKey: ["integrity"] },
  });
  const status = rawStatus as any;
  const [isVerifying,      setIsVerifying]      = useState(false);
  const [isReconstructing, setIsReconstructing] = useState(false);
  const [reconstructResult, setReconstructResult] = useState<{
    status: string; entriesPatched: number; blocksResealed: number; durationMs: number;
  } | null>(null);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      await fetch(`${BASE}/api/v1/integrity/verify`, { method: "POST" });
      await refetch();
    } catch (error) {
      console.error("Failed to verify integrity:", error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleReconstruct = async () => {
    if (!confirm(
      "Sovereign Ledger Reconstruction Protocol\n\n" +
      "This will recalculate all SHA-256 hashes in-place and reseal the Merkle blocks.\n\n" +
      "The immutability trigger will be suspended for the duration of the operation and " +
      "immediately re-enabled. The math will be restored without deleting any entries.\n\n" +
      "Proceed?"
    )) return;

    setIsReconstructing(true);
    setReconstructResult(null);
    try {
      const r = await fetch(`${BASE}/api/v1/admin/chain-reconstruct`, {
        method: "POST",
        headers: { "X-Sovereign-Reconstruct": "true", "Content-Type": "application/json" },
        body: JSON.stringify({ forceSeal: true }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Reconstruction failed");
      setReconstructResult(data);
      // Auto-verify after reconstruction
      await fetch(`${BASE}/api/v1/integrity/verify`, { method: "POST" });
      await refetch();
    } catch (err: any) {
      console.error("Reconstruction failed:", err);
      alert("Reconstruction failed: " + err.message);
    } finally {
      setIsReconstructing(false);
    }
  };

  // ── Computed state (SHA-256 walk logic unchanged) ──
  const isOk          = status?.ok === true;
  const isCompromised = status?.tamperDetected === true;
  const merkleChecked: number = status?.merkleBlocksChecked ?? 0;
  const merkleFailed:  number = status?.merkleBlocksFailed  ?? 0;
  const merkleOk      = merkleChecked > 0 && merkleFailed === 0;

  return (
    <div
      className="animate-in fade-in duration-500 max-w-5xl mx-auto"
      style={{ display: "flex", flexDirection: "column", gap: 24 }}
    >

      {/* ── Page header ────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em",
            color: "var(--sv-text-primary)", marginBottom: 4,
          }}>
            Hash Chain Integrity
          </h1>
          <p style={{
            fontSize: 12, fontFamily: "JetBrains Mono, monospace",
            color: "var(--sv-text-dim)", lineHeight: 1.5,
          }}>
            Two-phase cryptographic verification: SHA-256 sequential chain + Merkle tree
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Reconstruct button — shown when compromised */}
          {isCompromised && (
            <Button
              onClick={handleReconstruct}
              disabled={isReconstructing || isVerifying}
              variant="outline"
              className="font-mono border-[#D96161]/40 text-[#D96161] hover:bg-[#D96161]/10"
            >
              <Wrench className={`w-4 h-4 mr-2 ${isReconstructing ? "animate-spin" : ""}`} />
              {isReconstructing ? "Reconstructing…" : "Reconstruct Chain"}
            </Button>
          )}
          <Button
            onClick={handleVerify}
            disabled={isVerifying || isLoading || isReconstructing}
            className="font-mono shadow-[0_0_15px_rgba(64,181,149,0.25)]"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isVerifying ? "animate-spin" : ""}`} />
            {isVerifying ? "Verifying Chain…" : "Trigger Manual Verification"}
          </Button>
        </div>
      </div>

      {/* ── Reconstruction result banner ────────────────────────────── */}
      {reconstructResult && (
        <div style={{
          borderRadius: 10, padding: "12px 16px",
          background: `${SAGE}12`, border: `1px solid ${SAGE}30`,
          display: "flex", alignItems: "center", gap: 12,
          fontSize: 11, fontFamily: "JetBrains Mono, monospace",
        }}>
          <CheckCircle2 style={{ width: 16, height: 16, color: SAGE, flexShrink: 0 }} />
          <div>
            <span style={{ color: SAGE, fontWeight: 700 }}>SOVEREIGN VERIFIED</span>
            <span style={{ color: "var(--sv-text-dim)", marginLeft: 12 }}>
              {reconstructResult.entriesPatched.toLocaleString()} entries rehashedّ·
              {" "}{reconstructResult.blocksResealed} Merkle block(s) resealed ·
              {" "}{reconstructResult.durationMs}ms
            </span>
          </div>
          <button
            onClick={() => setReconstructResult(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--sv-text-dim)", fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ROW 1 — Mathematical Sovereignty (Hash Fn + Design + Stats)
          ════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 260px", gap: 16 }}>

        {/* Hash Function */}
        <SovereignCard>
          <CardLabel icon={<LinkIcon style={{ width: 13, height: 13 }} />}>
            Hash Function
            {/* Green pulse — appears when chain is verified OK */}
            {!isLoading && isOk && (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                <span className="chain-valid-pulse" style={{
                  display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                  background: SAGE, boxShadow: `0 0 6px ${SAGE}`,
                }} />
                <span style={{ fontSize: 8, color: SAGE, fontWeight: 700, letterSpacing: "0.1em" }}>
                  CHAIN INTACT
                </span>
              </span>
            )}
            {!isLoading && isCompromised && (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                  background: TERRA, boxShadow: `0 0 6px ${TERRA}`,
                }} className="animate-pulse" />
                <span style={{ fontSize: 8, color: TERRA, fontWeight: 700, letterSpacing: "0.1em" }}>
                  BROKEN
                </span>
              </span>
            )}
          </CardLabel>

          <div style={{ marginBottom: 14 }}>
            <span style={{
              display: "inline-block", fontSize: 8, fontFamily: "JetBrains Mono, monospace",
              fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              padding: "2px 8px", borderRadius: 4,
              background: `${SAGE}18`, border: `1px solid ${SAGE}30`, color: SAGE,
              marginBottom: 10,
            }}>
              SHA-256 · NIST FIPS 180-4
            </span>

            <p style={{
              fontSize: 11, fontFamily: "JetBrains Mono, monospace",
              color: "var(--sv-text-dim)", lineHeight: 1.8,
            }}>
              H<sub style={{ fontSize: 9 }}>n</sub> = SHA-256(
              <span style={{ color: SKY }}>timestamp</span> |{" "}
              <span style={{ color: AMBER }}>agentId</span> |{" "}
              <span style={{ color: SAGE }}>payload</span> |{" "}
              <span style={{ color: "var(--sv-text-primary)" }}>H<sub style={{ fontSize: 9 }}>n-1</sub></span>
              )
            </p>
          </div>

          <div style={{
            fontSize: 10, fontFamily: "JetBrains Mono, monospace",
            color: "var(--sv-text-dim)", lineHeight: 1.6,
            padding: "8px 10px", borderRadius: 6,
            background: "var(--sv-btn-bg)",
            border: "1px solid var(--sv-panel-border)",
          }}>
            Genesis anchor: H<sub style={{ fontSize: 8 }}>0</sub> ={" "}
            <span style={{ color: "var(--sv-text-primary)", fontWeight: 700 }}>GENESIS</span>
            <br />
            Every subsequent entry binds to its predecessor.<br />
            Any mutation breaks all downstream links.
          </div>
        </SovereignCard>

        {/* Verification Design */}
        <SovereignCard>
          <CardLabel icon={<Layers style={{ width: 13, height: 13 }} />}>
            Verification Design
          </CardLabel>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              {
                phase: "Phase 1",
                color: SKY,
                text: "Merkle sweep — recomputes each block's root from its 512 leaf hashes and compares against the stored checkpoint. O(b · log n). Flags tampered blocks instantly.",
              },
              {
                phase: "Phase 2",
                color: AMBER,
                text: "Sequential chain walk — only runs inside blocks that failed Phase 1. Walks entry-by-entry to pinpoint the exact tampered row(s). Partial tail always scanned.",
              },
              {
                phase: "Sealing",
                color: SAGE,
                text: "A Merkle checkpoint seals every 512 inserts. Block root = SHA-256 pairwise tree over all leaf hashes. Odd leaves doubled (Bitcoin-style padding).",
              },
            ].map(({ phase, color, text }) => (
              <div key={phase} style={{ display: "flex", gap: 8 }}>
                <span style={{
                  fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
                  color, flexShrink: 0, paddingTop: 1, minWidth: 44,
                }}>
                  {phase}
                </span>
                <span style={{
                  fontSize: 10, fontFamily: "JetBrains Mono, monospace",
                  color: "var(--sv-text-dim)", lineHeight: 1.6,
                }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </SovereignCard>

        {/* Ledger Stats — persistent top-right reference */}
        <SovereignCard accent={isCompromised ? TERRA : SAGE}>
          <CardLabel icon={<Database style={{ width: 13, height: 13 }} />}>
            Ledger Stats
          </CardLabel>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <StatBlock
              label="Total Entries Checked"
              value={status?.totalChecked?.toLocaleString() ?? "0"}
              color="var(--sv-text-primary)"
              large
            />
            <StatBlock
              label="Merkle Blocks"
              value={isLoading ? "—" : `${merkleChecked - merkleFailed} / ${merkleChecked}`}
              color={merkleFailed > 0 ? TERRA : SAGE}
              large
            />
            <div>
              <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--sv-section-label)", marginBottom: 3 }}>
                Last Verification
              </div>
              <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--sv-text-primary)" }}>
                {status?.lastVerifiedAt ? (
                  <>
                    {formatDate(status.lastVerifiedAt)}{" "}
                    <span style={{ color: "var(--sv-text-dim)", fontSize: 10 }}>
                      {formatTime(status.lastVerifiedAt)}
                    </span>
                  </>
                ) : "Never"}
              </div>
            </div>
          </div>
        </SovereignCard>
      </div>

      {/* ════════════════════════════════════════════════════════════
          ROW 2 — Merkle Tree Layer (the work being done)
          ════════════════════════════════════════════════════════════ */}
      <SovereignCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <CardLabel icon={<GitBranch style={{ width: 13, height: 13 }} />}>
            Merkle Tree Layer
          </CardLabel>
          <span style={{
            fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "2px 8px", borderRadius: 4,
            color: merkleOk ? SAGE : merkleFailed > 0 ? TERRA : "var(--sv-text-dim)",
            background: merkleOk ? `${SAGE}15` : merkleFailed > 0 ? `${TERRA}15` : "var(--sv-btn-bg)",
            border: `1px solid ${merkleOk ? SAGE + "30" : merkleFailed > 0 ? TERRA + "30" : "var(--sv-panel-border)"}`,
          }}>
            {isLoading ? "SCANNING…" : merkleOk ? "ALL BLOCKS CLEAN" : merkleFailed > 0 ? `${merkleFailed} BLOCK(S) FAILED` : "AWAITING SEAL"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Block grid visualization */}
          <div>
            <div style={{
              fontSize: 9, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--sv-section-label)", marginBottom: 8,
            }}>
              Block Map (512 entries / block)
            </div>
            <MerkleBlockGrid
              total={merkleChecked}
              failed={merkleFailed}
              isLoading={isLoading}
            />
          </div>

          {/* Phase status summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <PhaseStatus
              phase="Phase 1"
              label="Merkle Sweep"
              color={SKY}
              status={isLoading ? "running" : merkleChecked === 0 ? "idle" : merkleFailed === 0 ? "ok" : "fail"}
              detail={
                isLoading ? "Running Merkle sweep…"
                : merkleChecked === 0 ? "No sealed blocks yet — chain < 512 entries"
                : merkleFailed === 0 ? `All ${merkleChecked} sealed block(s) passed`
                : `${merkleFailed} of ${merkleChecked} block(s) failed root check`
              }
            />
            <PhaseStatus
              phase="Phase 2"
              label="Sequential Chain Walk"
              color={AMBER}
              status={isLoading ? "running" : isCompromised ? "fail" : merkleFailed === 0 ? "ok" : "ok"}
              detail={
                isLoading ? "Walking chain entries…"
                : isCompromised && status?.tamperedEntries?.length > 0
                  ? `${status.tamperedEntries.length} tampered entry(s) pinpointed`
                  : isCompromised ? "Chain link broken"
                  : "No entry-level breaks found"
              }
            />
          </div>
        </div>
      </SovereignCard>

      {/* ════════════════════════════════════════════════════════════
          ROW 3 — Forensic Verdict (main status card)
          ════════════════════════════════════════════════════════════ */}
      <div style={{
        borderRadius: 14, padding: "28px 32px",
        display: "flex", alignItems: "center", gap: 24,
        background: isLoading
          ? "var(--sv-btn-bg)"
          : isCompromised
          ? `${TERRA}08`
          : `${SAGE}08`,
        border: `1px solid ${isLoading ? "var(--sv-panel-border)" : isCompromised ? TERRA + "30" : SAGE + "30"}`,
        backdropFilter: "blur(12px)",
        transition: "background 0.4s ease, border-color 0.4s ease",
      }}>
        {isLoading ? (
          <RefreshCw style={{ width: 52, height: 52, color: "var(--sv-text-dim)", opacity: 0.25, flexShrink: 0 }} className="animate-spin" />
        ) : isCompromised ? (
          <ShieldAlert style={{ width: 52, height: 52, color: TERRA, flexShrink: 0, filter: `drop-shadow(0 0 14px ${TERRA}66)` }} />
        ) : (
          <ShieldCheck style={{ width: 52, height: 52, color: SAGE, flexShrink: 0, filter: `drop-shadow(0 0 14px ${SAGE}66)` }} />
        )}

        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 18, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
            letterSpacing: "0.04em",
            color: isLoading ? "var(--sv-text-dim)" : isCompromised ? TERRA : SAGE,
            marginBottom: 6,
          }}>
            {isLoading ? "VERIFYING LEDGER…" : isCompromised ? "INTEGRITY BROKEN" : "CHAIN VERIFIED"}
          </div>
          <p style={{
            fontSize: 12, fontFamily: "JetBrains Mono, monospace",
            color: "var(--sv-text-dim)", lineHeight: 1.6, maxWidth: 520,
          }}>
            {isLoading
              ? "Running two-phase verification: Merkle sweep then sequential chain walk…"
              : isCompromised
              ? "The mathematical link between sequential log entries is invalid. Forensic sweep pinpointed the break point."
              : "All audit entries mathematically link to their predecessors. No tampering detected across the full ledger."}
          </p>
          {!isLoading && status?.message && (
            <div style={{
              marginTop: 10, display: "inline-block",
              fontSize: 10, fontFamily: "JetBrains Mono, monospace",
              color: "var(--sv-text-dim)",
              padding: "4px 12px", borderRadius: 20,
              background: "var(--sv-btn-bg)", border: "1px solid var(--sv-panel-border)",
            }}>
              {status.message}
            </div>
          )}
        </div>

        <div style={{
          flexShrink: 0, textAlign: "center", padding: "10px 16px", borderRadius: 10,
          background: isCompromised ? `${TERRA}14` : `${SAGE}14`,
          border: `1px solid ${isCompromised ? TERRA + "25" : SAGE + "25"}`,
        }}>
          <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--sv-section-label)", marginBottom: 4 }}>
            Verdict
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: isCompromised ? TERRA : SAGE, fontFamily: "JetBrains Mono, monospace" }}>
            {isLoading ? "—" : isCompromised ? "FAIL" : "PASS"}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          ROW 4 — Tamper Alert (crimson pulse — only when compromised)
          ════════════════════════════════════════════════════════════ */}
      {isCompromised && (
        <div className="integrity-tamper-alert animate-in slide-in-from-bottom-2">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <ShieldAlert style={{ width: 22, height: 22, color: TERRA, position: "relative", zIndex: 1 }} />
              <div className="crimson-pulse-ring" />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase", color: TERRA, marginBottom: 4,
              }}>
                ⚠ Tamper Alert: Ledger Compromised
              </div>
              <p style={{
                fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                color: "var(--sv-text-primary)", lineHeight: 1.6, marginBottom: status?.tamperedEntries?.length > 0 ? 10 : 0,
              }}>
                {status?.message || "Cryptographic verification failed. The audit trail has been modified outside of the sanctioned write path."}
              </p>

              {status?.tamperedEntries?.length > 0 && (
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: `${TERRA}12`, border: `1px solid ${TERRA}25`,
                }}>
                  <div style={{
                    fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
                    letterSpacing: "0.1em", textTransform: "uppercase", color: TERRA,
                    opacity: 0.85, marginBottom: 6,
                  }}>
                    Affected Entry IDs
                  </div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    {status.tamperedEntries.map((id: string) => (
                      <li key={id} style={{
                        fontSize: 10, fontFamily: "JetBrains Mono, monospace",
                        color: TERRA, display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: TERRA, flexShrink: 0, display: "inline-block" }} />
                        {id}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SovereignCard({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      borderRadius: 14, padding: 20,
      background: "var(--sv-inspector-bg)",
      border: `1px solid ${accent ? accent + "28" : "var(--sv-panel-border)"}`,
      backdropFilter: "blur(12px)",
      transition: "background 0.3s ease, border-color 0.3s ease",
    }}>
      {children}
    </div>
  );
}

function CardLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
      fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
      letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sv-section-label)",
    }}>
      <span style={{ color: SAGE }}>{icon}</span>
      {children}
    </div>
  );
}

function StatBlock({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase",
        letterSpacing: "0.1em", color: "var(--sv-section-label)", marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: large ? 22 : 14, fontFamily: "JetBrains Mono, monospace",
        fontWeight: 700, color,
      }}>
        {value}
      </div>
    </div>
  );
}

function MerkleBlockGrid({ total, failed, isLoading }: { total: number; failed: number; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse" style={{
            width: 28, height: 28, borderRadius: 5,
            background: "var(--sv-btn-bg)", border: "1px solid var(--sv-panel-border)",
          }} />
        ))}
      </div>
    );
  }

  if (total === 0) {
    return (
      <div style={{
        padding: "10px 14px", borderRadius: 8, fontSize: 10,
        fontFamily: "JetBrains Mono, monospace", color: "var(--sv-text-dim)",
        background: "var(--sv-btn-bg)", border: "1px solid var(--sv-panel-border)",
      }}>
        No sealed blocks yet<br />
        <span style={{ fontSize: 9, opacity: 0.6 }}>Chain has &lt; 512 entries — first block seals automatically</span>
      </div>
    );
  }

  const failedSet = new Set<number>();
  for (let i = total - failed; i < total; i++) failedSet.add(i);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
        {Array.from({ length: total }).map((_, i) => {
          const isFail = failedSet.has(i);
          return (
            <div
              key={i}
              title={`Block ${i + 1}: ${isFail ? "FAILED" : "CLEAN"}`}
              style={{
                width: 28, height: 28, borderRadius: 5, display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 8, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
                background: isFail ? `${TERRA}18` : `${SAGE}14`,
                border: `1px solid ${isFail ? TERRA + "40" : SAGE + "35"}`,
                color: isFail ? TERRA : SAGE,
                transition: "background 0.3s ease, border-color 0.3s ease",
              }}
            >
              {i + 1}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>
        <span style={{ color: SAGE }}>■ {total - failed} clean</span>
        {failed > 0 && <span style={{ color: TERRA }}>■ {failed} failed</span>}
      </div>
    </div>
  );
}

function PhaseStatus({
  phase, label, color, status: phaseStatus, detail,
}: {
  phase: string;
  label: string;
  color: string;
  status: "ok" | "fail" | "idle" | "running";
  detail: string;
}) {
  const icon =
    phaseStatus === "running" ? <RefreshCw style={{ width: 11, height: 11 }} className="animate-spin" /> :
    phaseStatus === "ok"      ? <CheckCircle2 style={{ width: 11, height: 11 }} /> :
    phaseStatus === "fail"    ? <XCircle style={{ width: 11, height: 11 }} /> :
                                <Layers style={{ width: 11, height: 11 }} />;

  const bg =
    phaseStatus === "ok"   ? `${SAGE}12` :
    phaseStatus === "fail" ? `${TERRA}12` :
    "var(--sv-btn-bg)";

  const bc =
    phaseStatus === "ok"   ? `${SAGE}28` :
    phaseStatus === "fail" ? `${TERRA}28` :
    "var(--sv-panel-border)";

  const tc =
    phaseStatus === "ok"   ? SAGE :
    phaseStatus === "fail" ? TERRA :
    "var(--sv-text-dim)";

  return (
    <div style={{
      borderRadius: 8, padding: "10px 12px",
      background: bg, border: `1px solid ${bc}`,
      transition: "background 0.3s ease, border-color 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ color: tc }}>{icon}</span>
        <span style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.1em" }}>{phase}</span>
        <span style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", color: "var(--sv-section-label)" }}>— {label}</span>
      </div>
      <p style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--sv-text-dim)", lineHeight: 1.5, margin: 0 }}>
        {detail}
      </p>
    </div>
  );
}
