import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type KeyShape = {
  id: string;
  keyValue: string;
  keyPrefix: string;
  label: string;
  tier: string;
  createdAt: string | Date | null;
};

type KeyResponse = {
  hasKey: boolean;
  created?: boolean;
  regenerated?: boolean;
  key?: KeyShape;
  message?: string;
};

type Tab = "sdk" | "curl";

function CodeBlock({
  text,
  onCopy,
  copied,
}: {
  text: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="relative">
      <pre className="glass-panel rounded-lg p-4 pr-12 overflow-x-auto text-[12px] font-mono leading-relaxed text-[#E5E7EB] whitespace-pre-wrap break-all">
        {text}
      </pre>
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 p-2 rounded-md hover:bg-white/10 text-[#9AA4B1] hover:text-[#00F5FF] transition-colors"
        aria-label="Copy"
      >
        {copied ? (
          <Check className="w-4 h-4 text-[#00F5FF]" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  const [data, setData] = useState<KeyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sdk");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/v1/me/key`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as KeyResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function regenerate() {
    setRegenerating(true);
    setConfirmRegen(false);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/v1/me/key/regenerate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as KeyResponse;
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRegenerating(false);
    }
  }

  const apiKey = data?.key?.keyValue ?? "";
  const isFreshKey = data?.created === true || data?.regenerated === true;

  const sdkSnippet = useMemo(
    () =>
      `pip install sentinel-bridge

# Python
from sentinel_bridge import Sentinel

sentinel = Sentinel(
    api_key="${apiKey || "<your-sentinel-key>"}",
    base_url="${typeof window !== "undefined" ? window.location.origin : "https://agent-sentinel.replit.app"}",
)

agent = sentinel.register(
    name="my-first-agent",
    capabilities=["read_email", "summarize"],
)

# Every action your agent takes is now sealed in the immutable ledger.
agent.log_action(
    event_type="TASK_COMPLETE",
    payload={"task": "summarized inbox"},
    rationale="User requested daily summary",
)`,
    [apiKey],
  );

  const curlSnippet = useMemo(
    () =>
      `curl -X POST ${typeof window !== "undefined" ? window.location.origin : "https://agent-sentinel.replit.app"}/api/v1/log \\
  -H "Content-Type: application/json" \\
  -H "X-Sentinel-Key: ${apiKey || "<your-sentinel-key>"}" \\
  -d '{
    "agentId": "my-first-agent",
    "traceId": "trace-001",
    "eventType": "TASK_COMPLETE",
    "payload": { "task": "hello world" },
    "rationale": "Smoke test from onboarding"
  }'`,
    [apiKey],
  );

  const activeSnippet = tab === "sdk" ? sdkSnippet : curlSnippet;

  function copy(text: string, target: "key" | "snippet") {
    navigator.clipboard.writeText(text).then(() => {
      if (target === "key") {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 1500);
      } else {
        setCopiedSnippet(true);
        setTimeout(() => setCopiedSnippet(false), 1500);
      }
    });
  }

  return (
    <div className="page-transition px-4 py-8 md:px-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-[#00F5FF]/10 border border-[#00F5FF]/30 flex items-center justify-center">
          <Rocket className="w-5 h-5 text-[#00F5FF]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Connect your first agent</h1>
          <p className="text-sm text-[#9AA4B1]">
            Provision a Sentinel key, drop it into your agent, and every action will be sealed in your immutable ledger.
          </p>
        </div>
      </div>

      {/* Step 1: API key card */}
      <section className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#00F5FF]">Step 1</span>
          <span className="text-sm font-semibold text-white">Your Sentinel API key</span>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#9AA4B1] mb-2">
            <KeyRound className="w-3.5 h-3.5" />
            {data?.regenerated ? "Newly regenerated" : isFreshKey ? "Newly provisioned" : "Default agent key"}
            <span className="ml-auto px-2 py-0.5 rounded border border-[#00F5FF]/30 text-[#00F5FF] text-[10px]">
              {data?.key?.tier ?? "Core"}
            </span>
          </div>

          {error && (
            <div className="text-[#FF003C] text-sm font-mono">
              Failed: {error}. Try refreshing.
            </div>
          )}

          {!data && !error && (
            <div className="text-[#9AA4B1] text-sm font-mono animate-pulse">
              Provisioning your key…
            </div>
          )}

          {regenerating && (
            <div className="text-[#9AA4B1] text-sm font-mono animate-pulse">
              Revoking old key and generating a new one…
            </div>
          )}

          {data && apiKey && !regenerating && (
            <>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 font-mono text-[13px] text-white bg-[#050505] border border-white/10 rounded-lg px-3 py-2.5 overflow-x-auto">
                  {apiKey}
                </code>
                <button
                  onClick={() => copy(apiKey, "key")}
                  className="px-3 py-2.5 rounded-lg border border-[#00F5FF]/40 bg-[#00F5FF]/10 hover:bg-[#00F5FF]/20 text-[#00F5FF] font-mono text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5"
                >
                  {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedKey ? "Copied" : "Copy"}
                </button>
              </div>

              {isFreshKey ? (
                <div className="mt-3 flex items-start gap-2 text-[12px] text-[#FFB800] font-mono">
                  <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Store this key somewhere safe — the plaintext value is shown only once. We keep a hashed copy.
                  </span>
                </div>
              ) : (
                <div className="mt-3 text-[12px] text-[#9AA4B1] font-mono">
                  This is your active key. Regenerating will immediately revoke it.
                </div>
              )}

              {/* Regenerate controls */}
              <div className="mt-4 pt-4 border-t border-white/8">
                {!confirmRegen ? (
                  <button
                    onClick={() => setConfirmRegen(true)}
                    className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#9AA4B1] hover:text-[#FFB800] transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate key
                  </button>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-[#FFB800]">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      Your old key will stop working immediately. Continue?
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={regenerate}
                        className="px-3 py-1.5 rounded-lg border border-[#FF003C]/40 bg-[#FF003C]/10 hover:bg-[#FF003C]/20 text-[#FF003C] font-mono text-[11px] uppercase tracking-wider transition-colors"
                      >
                        Yes, revoke & regenerate
                      </button>
                      <button
                        onClick={() => setConfirmRegen(false)}
                        className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[#9AA4B1] font-mono text-[11px] uppercase tracking-wider transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Step 2: Connect snippet */}
      <section className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#00F5FF]">Step 2</span>
          <span className="text-sm font-semibold text-white">Wire it into your agent</span>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <div className="flex gap-1 mb-3 border-b border-white/10">
            <TabButton active={tab === "sdk"} onClick={() => setTab("sdk")} icon={Rocket}>
              Python SDK
            </TabButton>
            <TabButton active={tab === "curl"} onClick={() => setTab("curl")} icon={Terminal}>
              curl
            </TabButton>
          </div>

          <CodeBlock
            text={activeSnippet}
            copied={copiedSnippet}
            onCopy={() => copy(activeSnippet, "snippet")}
          />
        </div>
      </section>

      {/* Step 3: Continue */}
      <section className="mt-8 mb-12">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#00F5FF]">Step 3</span>
          <span className="text-sm font-semibold text-white">Watch your ledger fill up</span>
        </div>

        <div className="glass-panel rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-sm text-[#9AA4B1]">
            Once your agent posts its first action, it will appear in real-time on the dashboard with a SHA-256 + ML-DSA-87 seal.
          </p>
          <Link href="/dashboard">
            <a className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00F5FF] hover:bg-[#00d4dc] text-[#050505] font-semibold uppercase tracking-wider text-xs transition-colors">
              Open dashboard
              <ArrowRight className="w-4 h-4" />
            </a>
          </Link>
        </div>
      </section>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-mono uppercase tracking-wider transition-colors border-b-2 -mb-px ${
        active
          ? "text-[#00F5FF] border-[#00F5FF]"
          : "text-[#9AA4B1] border-transparent hover:text-white"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}
