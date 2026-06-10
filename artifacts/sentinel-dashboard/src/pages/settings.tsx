import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type KeyShape = {
  id: string;
  keyValue: string;
  keyPrefix: string;
  label: string;
  tier: string;
  createdAt: string | Date | null;
  lastUsedAt?: string | Date | null;
};

type KeyResponse = {
  hasKey: boolean;
  created?: boolean;
  regenerated?: boolean;
  key?: KeyShape;
  message?: string;
};

export default function SettingsPage() {
  const [data, setData] = useState<KeyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [fullKey, setFullKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/v1/me/key`, {
          method: "GET",
          credentials: "include",
        });
        if (res.status === 404) {
          if (!cancelled) { setData({ hasKey: false }); setLoading(false); }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as KeyResponse;
        if (!cancelled) { setData(json); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function revealKey() {
    if (fullKey) { setRevealed(r => !r); return; }
    try {
      const res = await fetch(`${BASE}/api/v1/me/key`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as KeyResponse;
      if (json.key?.keyValue) {
        setFullKey(json.key.keyValue);
        setRevealed(true);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setConfirmRegen(false);
    setRevealed(false);
    setFullKey(null);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/v1/me/key/regenerate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as KeyResponse;
      setData(json);
      if (json.key?.keyValue) {
        setFullKey(json.key.keyValue);
        setRevealed(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRegenerating(false);
    }
  }

  async function copy() {
    const val = fullKey ?? data?.key?.keyValue ?? "";
    if (!val) return;
    try { await navigator.clipboard.writeText(val); } catch { }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const displayKey = (() => {
    if (!data?.hasKey) return null;
    if (revealed && fullKey) return fullKey;
    const prefix = data.key?.keyPrefix ?? "sk_sent_core_";
    return `${prefix}${"•".repeat(28)}`;
  })();

  const createdAt = data?.key?.createdAt
    ? new Date(data.key.createdAt).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
      })
    : null;

  const lastUsedAt = data?.key?.lastUsedAt
    ? new Date(data.key.lastUsedAt as string | Date).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
      })
    : null;

  return (
    <div className="page-transition max-w-2xl mx-auto py-10 px-4 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <KeyRound size={18} style={{ color: "#00F5FF" }} />
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#F9FAFB",
              fontFamily: "Inter, system-ui, sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            API Key Settings
          </h1>
        </div>
        <p style={{ fontSize: 13, color: "#64748B", fontFamily: "Inter, system-ui, sans-serif" }}>
          Manage the key your agents use to send audit logs to MaroShield.
        </p>
      </div>

      {/* Key card */}
      <div className="glass-panel rounded-xl p-6 space-y-5">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} style={{ color: "#00F5FF" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: "#00F5FF",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              SENTINEL API KEY
            </span>
          </div>
          {data?.key?.tier && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: "#FFB800",
                background: "rgba(255,184,0,0.1)",
                border: "1px solid rgba(255,184,0,0.25)",
                padding: "2px 8px",
                borderRadius: 4,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              {data.key.tier.toUpperCase()}
            </span>
          )}
        </div>

        {loading && (
          <div style={{ fontSize: 12, color: "#64748B", fontFamily: "JetBrains Mono, monospace" }}>
            LOADING…
          </div>
        )}

        {!loading && !data?.hasKey && !error && (
          <div style={{ fontSize: 13, color: "#64748B", fontFamily: "Inter, system-ui, sans-serif" }}>
            No key provisioned yet.{" "}
            <a href={`${BASE}/onboarding`} style={{ color: "#00F5FF", textDecoration: "underline" }}>
              Go to Connect Agent
            </a>{" "}
            to get your key.
          </div>
        )}

        {!loading && data?.hasKey && displayKey && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(0,245,255,0.15)",
                borderRadius: 10,
                padding: "12px 16px",
              }}
            >
              <code
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: revealed ? "#00F5FF" : "#9AA4B1",
                  fontFamily: "JetBrains Mono, monospace",
                  letterSpacing: revealed ? "0.01em" : "0.06em",
                  wordBreak: "break-all",
                  minWidth: 0,
                }}
              >
                {displayKey}
              </code>

              <button
                onClick={revealKey}
                title={revealed ? "Hide key" : "Reveal key"}
                style={{
                  flexShrink: 0,
                  padding: 8,
                  borderRadius: 6,
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#9AA4B1",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>

              <button
                onClick={copy}
                disabled={!revealed && !fullKey}
                title="Copy key"
                style={{
                  flexShrink: 0,
                  padding: 8,
                  borderRadius: 6,
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: copied ? "#00F5FF" : "#9AA4B1",
                  cursor: revealed || fullKey ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>

            <div style={{ fontSize: 11, color: "#475569", fontFamily: "Inter, system-ui, sans-serif" }}>
              {createdAt ? `Provisioned ${createdAt}` : "Active"}
              {lastUsedAt ? ` · Last used ${lastUsedAt}` : " · Never used"}
              {" · "}Click the eye icon to reveal the full key before copying.
            </div>
          </>
        )}

        {error && (
          <div
            style={{
              fontSize: 12,
              color: "#FF003C",
              background: "rgba(255,0,60,0.08)",
              border: "1px solid rgba(255,0,60,0.2)",
              borderRadius: 8,
              padding: "10px 14px",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            ERROR: {error}
          </div>
        )}
      </div>

      {/* Regenerate section */}
      {data?.hasKey && (
        <div className="glass-panel rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldAlert size={16} style={{ color: "#FFB800", flexShrink: 0, marginTop: 2 }} />
            <div className="space-y-1">
              <div style={{ fontSize: 13, fontWeight: 600, color: "#F9FAFB", fontFamily: "Inter, system-ui, sans-serif" }}>
                Regenerate Key
              </div>
              <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, fontFamily: "Inter, system-ui, sans-serif" }}>
                This immediately revokes your current key. Any agents using the old key will stop sending logs
                until you update them with the new one.
              </div>
            </div>
          </div>

          {!confirmRegen ? (
            <button
              onClick={() => setConfirmRegen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 18px",
                borderRadius: 8,
                background: "rgba(255,184,0,0.07)",
                border: "1px solid rgba(255,184,0,0.3)",
                color: "#FFB800",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "Inter, system-ui, sans-serif",
                letterSpacing: "0.03em",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={13} />
              Regenerate key
            </button>
          ) : (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                padding: "12px 14px",
                borderRadius: 8,
                background: "rgba(255,0,60,0.06)",
                border: "1px solid rgba(255,0,60,0.25)",
              }}
            >
              <span style={{ width: "100%", fontSize: 12, color: "#FF003C", fontFamily: "Inter, system-ui, sans-serif", marginBottom: 4 }}>
                Are you sure? This cannot be undone.
              </span>
              <button
                onClick={regenerate}
                disabled={regenerating}
                style={{
                  padding: "8px 16px",
                  borderRadius: 7,
                  background: "#FF003C",
                  border: "none",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "Inter, system-ui, sans-serif",
                  cursor: regenerating ? "not-allowed" : "pointer",
                  opacity: regenerating ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {regenerating ? (
                  <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Regenerating…</>
                ) : (
                  "Yes, revoke & regenerate"
                )}
              </button>
              <button
                onClick={() => setConfirmRegen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 7,
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#9AA4B1",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "Inter, system-ui, sans-serif",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Usage hint */}
      <div className="glass-panel rounded-xl p-5">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "#64748B", marginBottom: 10, fontFamily: "JetBrains Mono, monospace" }}>
          USAGE
        </div>
        <pre
          style={{
            fontSize: 12,
            color: "#9AA4B1",
            fontFamily: "JetBrains Mono, monospace",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            margin: 0,
          }}
        >
          {`# Send a log event
curl -X POST https://your-domain/api/v1/log \\
  -H "X-Sentinel-Key: <your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"my-agent","actionType":"DECISION","rationale":"…"}'`}
        </pre>
      </div>
    </div>
  );
}
