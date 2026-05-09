/**
 * Support & Escalation page.
 *
 * Shows the four support channels with SLAs, a triage form that routes
 * the request to the right team via POST /api/v1/support/triage, and the
 * breach escalation quick-action path.
 */

import { useState } from "react";
import {
  ShieldAlert,
  Key,
  FileCheck,
  LifeBuoy,
  Send,
  Loader2,
  CheckCircle2,
  Copy,
  ArrowRight,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Channel definitions ────────────────────────────────────────────────────

const CHANNELS = [
  {
    key: "security",
    label: "Security Incidents",
    email: "security@agent-sentinel.io",
    sla: "< 30 min",
    urgency: "CRITICAL",
    icon: ShieldAlert,
    accent: "#FF003C",
    bg: "rgba(255,0,60,0.08)",
    border: "rgba(255,0,60,0.25)",
    description: "Active breaches, compromised keys, unauthorized agent access.",
  },
  {
    key: "sovereign_key",
    label: "Sovereign Key Issues",
    email: "sovereign-ops@agent-sentinel.io",
    sla: "< 1 h",
    urgency: "HIGH",
    icon: Key,
    accent: "#FFB800",
    bg: "rgba(255,184,0,0.08)",
    border: "rgba(255,184,0,0.25)",
    description: "Two-Man Rule failures, ML-DSA-87 enrollment, key rotation.",
  },
  {
    key: "compliance",
    label: "Compliance Queries",
    email: "compliance@agent-sentinel.io",
    sla: "< 4 h",
    urgency: "HIGH",
    icon: FileCheck,
    accent: "#A78BFA",
    bg: "rgba(167,139,250,0.08)",
    border: "rgba(167,139,250,0.25)",
    description: "EU AI Act Art. 12/14 compliance, audit reports, regulatory deadlines.",
  },
  {
    key: "partner",
    label: "Partner Support",
    email: "support@agent-sentinel.io",
    sla: "< 2 h",
    urgency: "NORMAL",
    icon: LifeBuoy,
    accent: "#00F5FF",
    bg: "rgba(0,245,255,0.08)",
    border: "rgba(0,245,255,0.2)",
    description: "SDK integration, API issues, onboarding, dashboard questions.",
  },
];

// ── Ticket result type ─────────────────────────────────────────────────────

type TriageResult = {
  ticketId: string;
  category: "partner" | "security" | "compliance" | "sovereign_key";
  routingEmail: string;
  sla: string;
  urgency: "critical" | "high" | "normal";
  escalationRequired: boolean;
  autoResponse: string;
  submittedAt: string;
};

// ── Main page ──────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${BASE}/api/v1/support/triage`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          contactEmail: contactEmail.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as TriageResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  const matchedChannel = result
    ? CHANNELS.find((c) => c.key === result.category) ?? CHANNELS[3]
    : null;

  return (
    <div className="page-transition" style={{ padding: "28px 24px", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#00F5FF",
            marginBottom: 6,
          }}
        >
          SENTINEL / SUPPORT
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Support & Escalation
        </h1>
        <p style={{ color: "#9AA4B1", fontSize: 13, marginTop: 6, marginBottom: 0 }}>
          Submit a support request — the onboarding agent will classify your issue, apply the
          correct SLA, and route it to the right team automatically.
        </p>
      </div>

      {/* SLA Channel Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {CHANNELS.map((ch) => {
          const Icon = ch.icon;
          return (
            <div
              key={ch.key}
              className="glass-panel"
              style={{
                background: ch.bg,
                border: `1px solid ${ch.border}`,
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Icon style={{ width: 16, height: 16, color: ch.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{ch.label}</span>
              </div>
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 10,
                  color: ch.accent,
                  marginBottom: 6,
                  letterSpacing: "0.06em",
                }}
              >
                {ch.email}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Clock style={{ width: 11, height: 11, color: ch.accent }} />
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 11,
                    color: ch.accent,
                    fontWeight: 700,
                  }}
                >
                  {ch.sla}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#9AA4B1", lineHeight: 1.5 }}>{ch.description}</div>
            </div>
          );
        })}
      </div>

      {/* Triage Form / Result */}
      {!result ? (
        <div className="glass-panel" style={{ borderRadius: 14, padding: 24, marginBottom: 28 }}>
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#00F5FF",
              marginBottom: 14,
            }}
          >
            OPEN A SUPPORT TICKET
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#9AA4B1",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                Describe your issue
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. My sovereign key enrollment is failing at Step 3, the QR challenge never resolves…"
                rows={5}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  color: "#fff",
                  padding: "12px 14px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(0,245,255,0.4)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#9AA4B1",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                Contact email{" "}
                <span style={{ textTransform: "none", fontWeight: 400, color: "#6b7280" }}>
                  (optional — we'll use your account email if blank)
                </span>
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@yourorg.com"
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  color: "#fff",
                  padding: "10px 14px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(0,245,255,0.4)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  background: "rgba(255,0,60,0.1)",
                  border: "1px solid rgba(255,0,60,0.3)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#FF003C",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!message.trim() || loading}
              style={{
                alignSelf: "flex-start",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 22px",
                borderRadius: 10,
                background:
                  message.trim() && !loading ? "#00F5FF" : "rgba(0,245,255,0.2)",
                color: "#050505",
                fontWeight: 700,
                fontSize: 13,
                border: "none",
                cursor: message.trim() && !loading ? "pointer" : "not-allowed",
                transition: "background 120ms ease",
                letterSpacing: "0.04em",
              }}
            >
              {loading ? (
                <>
                  <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} />
                  Routing…
                </>
              ) : (
                <>
                  <Send style={{ width: 15, height: 15 }} />
                  Submit Ticket
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* Ticket Confirmation */
        <div
          className="glass-panel page-transition"
          style={{
            borderRadius: 14,
            padding: 24,
            marginBottom: 28,
            border: `1px solid ${matchedChannel?.border ?? "rgba(0,245,255,0.2)"}`,
          }}
        >
          {/* Ticket header */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: matchedChannel?.bg,
                border: `1px solid ${matchedChannel?.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CheckCircle2 style={{ width: 18, height: 18, color: matchedChannel?.accent }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
                Ticket submitted
              </div>
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  color: "#9AA4B1",
                }}
              >
                {result.ticketId} · {new Date(result.submittedAt).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => {
                setResult(null);
                setMessage("");
                setContactEmail("");
              }}
              style={{
                marginLeft: "auto",
                padding: "6px 14px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#9AA4B1",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              New ticket
            </button>
          </div>

          {/* Routing card */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {[
              { label: "Category", value: matchedChannel?.label ?? result.category },
              { label: "Routed to", value: result.routingEmail },
              { label: "SLA", value: result.sla },
              { label: "Urgency", value: result.urgency.toUpperCase() },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: matchedChannel?.accent ?? "#00F5FF",
                    fontFamily: label === "Routed to" ? "ui-monospace, monospace" : "inherit",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {value}
                  {label === "Routed to" && (
                    <button
                      onClick={() => copy(result.routingEmail, "email")}
                      title="Copy email"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: copied === "email" ? "#00F5FF" : "#6b7280",
                        padding: 0,
                      }}
                    >
                      <Copy style={{ width: 11, height: 11 }} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Escalation required banner */}
          {result.escalationRequired && (
            <div
              style={{
                background: "rgba(255,0,60,0.1)",
                border: "1px solid rgba(255,0,60,0.3)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "#FF003C",
              }}
            >
              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
              Active incident detected — activate Kill Switch if agents are still running.
              <button
                onClick={() => setLocation("/warroom")}
                style={{
                  marginLeft: "auto",
                  background: "rgba(255,0,60,0.15)",
                  border: "1px solid rgba(255,0,60,0.4)",
                  borderRadius: 6,
                  color: "#FF003C",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                War Room <ArrowRight style={{ width: 11, height: 11 }} />
              </button>
            </div>
          )}

          {/* Auto-response */}
          <div
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#6b7280",
                marginBottom: 10,
              }}
            >
              AUTOMATED FIRST RESPONSE
            </div>
            <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {result.autoResponse}
            </div>
          </div>
        </div>
      )}

      {/* Breach Escalation Path */}
      <div className="glass-panel" style={{ borderRadius: 14, padding: 20 }}>
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#FF003C",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ShieldAlert style={{ width: 12, height: 12 }} />
          ACTIVE BREACH ESCALATION PATH
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            {
              step: "01",
              action: "Activate Kill Switch",
              detail: "Dashboard → War Room, or POST /api/v1/admin/kill-switch",
            },
            {
              step: "02",
              action: "Log EMERGENCY_SOLO_REVOKE",
              detail: "POST /api/v1/forensic/kill-switch-log with agentId + reason",
            },
            {
              step: "03",
              action: "Contact Security Incidents immediately",
              detail: "security@agent-sentinel.io — < 30 min SLA",
            },
            {
              step: "04",
              action: "Preserve forensic IDs",
              detail: "Save all forensic audit IDs and breach trace IDs for regulatory reporting",
            },
          ].map(({ step, action, detail }) => (
            <div
              key={step}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "10px 12px",
                background: "rgba(255,0,60,0.04)",
                borderRadius: 8,
                border: "1px solid rgba(255,0,60,0.1)",
              }}
            >
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#FF003C",
                  flexShrink: 0,
                  width: 22,
                }}
              >
                {step}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 2 }}>
                  {action}
                </div>
                <div style={{ fontSize: 11, color: "#9AA4B1" }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            onClick={() => setLocation("/warroom")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              background: "rgba(255,0,60,0.12)",
              border: "1px solid rgba(255,0,60,0.35)",
              color: "#FF003C",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            <ShieldAlert style={{ width: 13, height: 13 }} />
            Open War Room
          </button>
        </div>
      </div>
    </div>
  );
}
