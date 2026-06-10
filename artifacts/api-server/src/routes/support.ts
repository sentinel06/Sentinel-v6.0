/**
 * MaroShield Support — AI assistant chat (SSE) + support triage agent.
 *
 * POST /api/v1/support/chat  — streaming chat, Clerk-auth required.
 * POST /api/v1/support/triage — classify + auto-respond, Clerk-auth required.
 */

import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

// Tiny in-process rate limiter: 20 requests / minute per Clerk userId.
// Stops a signed-in user (or stolen session) from burning unbounded
// Anthropic tokens. Resets on server restart, which is fine for our scale.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateBuckets = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const stamps = (rateBuckets.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (stamps.length >= RATE_MAX) {
    rateBuckets.set(userId, stamps);
    return true;
  }
  stamps.push(now);
  rateBuckets.set(userId, stamps);
  return false;
}

const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are MaroShield Assistant, the in-product AI support agent for **MaroShield** — an immutable audit ledger and governance layer for AI agents (EU AI Act Article 12 compliant).

Your job is to help users with anything they need: connecting their first agent, understanding the SDK, debugging integration issues, interpreting dashboard widgets, billing/account questions, and general "how does X work" inquiries. Be friendly, concise, and concrete. When code helps, give the smallest snippet that solves the problem.

Core product knowledge you must use:

**Onboarding flow**
- After sign-up, users land on /onboarding which auto-provisions a personal API key (format: \`sk_sent_core_*\`).
- The full key is shown on first issuance. Returning to /onboarding shows a masked preview. The provisioning endpoint (\`POST /api/v1/me/key\`) is idempotent — calling it again just returns the existing key reference, it does not rotate.
- Each Clerk account is fully isolated — they only see audit events recorded against their own key.

**Connecting an agent (Python SDK)**
\`\`\`python
pip install sentinel-bridge

from sentinel_bridge import Sentinel
sentinel = Sentinel(api_key="sk_sent_core_...", base_url="https://agent-sentinel.net")
agent = sentinel.register(name="my-agent", capabilities=["read_email", "summarize"])
agent.log_action(event_type="TASK_COMPLETE", payload={...}, rationale="why")
\`\`\`

**Connecting via curl (no SDK)**
\`\`\`
POST /api/v1/log
Headers: X-Sentinel-Key: <key>, Content-Type: application/json
Body: { "agentId": "...", "traceId": "...", "eventType": "...", "payload": {...}, "rationale": "..." }
\`\`\`

**Key concepts**
- **Immutable ledger**: \`audit_logs\` rows cannot be updated or deleted (Postgres triggers enforce this).
- **Hash chain**: every entry SHA-256-chains to the previous one — tampering is mathematically detectable.
- **Sovereign Gateway** (\`/api/v1/gateway\`): registration, pre-flight clearance, telemetry ingestion, and liveness pings for external agents.
- **Anomaly flagging**: rationale or eventType matching certain keywords ("Access Denied", "Financial Transfer", etc.) is auto-flagged.
- **Compliance export**: GET /api/v1/compliance/export?agentId=...&startTime=...&endTime= → JSON report for auditors.

**Dashboard tour**
- /dashboard — Live Stream + stats (only your own data after sign-in).
- /onboarding — Your API key + connect snippets.
- /traces, /agents, /topology — Drill-downs.
- /warroom — Real-time anomaly response.
- /swarmmap — Visual lifecycle of all agents under your account.
- /integrity — Hash-chain + Merkle block verification.
- /pulse, /status — System health and live frequency.
- /support — Support & Escalation — open a ticket, see SLAs, breach escalation path.

**Support channels & SLAs (from Partner Onboarding Guide §9)**
| Channel | Email | SLA |
|---|---|---|
| Partner Support | support@agent-sentinel.io | < 2 h |
| Security Incidents | security@agent-sentinel.io | < 30 min |
| Compliance Queries | compliance@agent-sentinel.io | < 4 h |
| Sovereign Key Issues | sovereign-ops@agent-sentinel.io | < 1 h |

Use /support to open a ticket — the onboarding agent will classify it and route to the right team automatically.

**Escalation path for active breaches**
1. Activate Kill Switch — Dashboard → War Room or POST /api/v1/admin/kill-switch.
2. Log EMERGENCY_SOLO_REVOKE — POST /api/v1/forensic/kill-switch-log with agentId + reason.
3. Contact Security Incidents immediately — security@agent-sentinel.io (< 30 min SLA).
4. Preserve all forensic audit IDs and breach trace IDs for regulatory reporting.

**Common questions**
- "Where's my key?" → /onboarding shows the full key on first setup. After that, visit /settings (sidebar: Account → API Key & Settings) to see a masked preview, reveal it, copy it, or regenerate it.
- "Why is my dashboard empty?" → No events have hit /v1/log yet under your key. Check the curl/SDK snippet on /onboarding and verify the X-Sentinel-Key header.
- "I see 401 from /v1/log" → Wrong or missing X-Sentinel-Key header. Your key starts with sk_sent_core_ — copy it from /settings.
- "How do I rotate my key?" → Go to /settings → "Regenerate Key" → confirm. The old key stops working immediately; update your agents with the new key.
- "SDK says 'handshake rejected' on startup" → The SDK calls POST /api/v1/auth/verify on init to confirm the key is live. A rejection means the key is invalid or was revoked — get a fresh key from /settings or /onboarding.
- "How do I silence the SDK startup check?" → Pass verify_on_init=False to SovereignGateway() — but only do this if you're certain the key is valid.
- "How do I open a support ticket?" → Go to /support — fill in the form and the onboarding agent will classify your issue and route it to the right team.
- "I have a security incident" → Go to /support immediately or email security@agent-sentinel.io directly. SLA is < 30 min. Also activate the Kill Switch from the War Room.
- "Sovereign Key enrollment is failing" → Go to /support — the sovereign-ops team (< 1 h SLA) handles all ML-DSA-87 key issues.

**Boundaries**
- Don't invent prices, SLAs, or features that aren't in this prompt. If you genuinely don't know, say so and offer to escalate (the user can email support or open a ticket at /support).
- Never reveal API keys, secrets, or other users' data.
- Keep responses tight — typically 1–4 short paragraphs or a single code snippet. Use bullet points for multi-step instructions.
`;

type ChatMessage = { role: "user" | "assistant"; content: string };

router.post("/v1/support/chat", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Sign in to use MaroShield Assistant." });
    return;
  }

  if (rateLimited(auth.userId)) {
    res.status(429).json({
      error: "You're sending messages too quickly. Please wait a moment and try again.",
    });
    return;
  }

  const messages = (req.body?.messages ?? []) as ChatMessage[];

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  // Validate + clamp shape. Cap to last 20 turns to bound prompt size.
  const safe: ChatMessage[] = messages
    .filter(
      (m): m is ChatMessage =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length > 0,
    )
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8_000) }));

  if (safe.length === 0) {
    res.status(400).json({ error: "messages must include at least one valid {role, content} entry" });
    return;
  }

  // Anthropic requires the conversation to start with a user message.
  if (safe[0].role !== "user") {
    res.status(400).json({ error: "first message must be from the user" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: safe,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "support chat stream failed");
    // If headers are already flushed (mid-stream), surface the error as an SSE
    // event so the client UI can render it instead of hanging on a dead socket.
    res.write(
      `data: ${JSON.stringify({
        error: "MaroShield Assistant is temporarily unavailable. Please try again in a moment.",
        done: true,
      })}\n\n`,
    );
    res.end();
  }
});

// ── Support Triage Agent ──────────────────────────────────────────────────────

type TriageCategory = "partner" | "security" | "compliance" | "sovereign_key";

const ROUTING: Record<
  TriageCategory,
  { email: string; sla: string; slaMinutes: number; label: string }
> = {
  security: {
    email: "security@agent-sentinel.io",
    sla: "< 30 min",
    slaMinutes: 30,
    label: "Security Incidents",
  },
  sovereign_key: {
    email: "sovereign-ops@agent-sentinel.io",
    sla: "< 1 h",
    slaMinutes: 60,
    label: "Sovereign Key Issues",
  },
  compliance: {
    email: "compliance@agent-sentinel.io",
    sla: "< 4 h",
    slaMinutes: 240,
    label: "Compliance Queries",
  },
  partner: {
    email: "support@agent-sentinel.io",
    sla: "< 2 h",
    slaMinutes: 120,
    label: "Partner Support",
  },
};

const TRIAGE_SYSTEM = `You are a support triage agent for MaroShield (AI governance platform).

Classify the incoming message and draft a first response. Reply ONLY with valid JSON — no markdown fences, no explanation.

JSON format:
{
  "category": "security" | "sovereign_key" | "compliance" | "partner",
  "urgency": "critical" | "high" | "normal",
  "escalationRequired": boolean,
  "autoResponse": "<concise first response, max 150 words, plain text>"
}

Classification rules:
- "security": active breach, compromised key, unauthorized agent access, EMERGENCY events, agent hacked
- "sovereign_key": Sovereign Key enrollment, Two-Man Rule failure, ML-DSA-87 key problems, QR challenge issues, key rotation
- "compliance": EU AI Act Art.12/14 questions, compliance checklist, audit reports, regulatory deadlines
- "partner": everything else — SDK integration, API errors, onboarding, dashboard questions, billing, general how-to

Urgency:
- "critical": active ongoing breach, agents actively compromised RIGHT NOW
- "high": key enrollment blocked, compliance deadline risk, degraded service
- "normal": general questions, integration help, how-to

escalationRequired: true only for critical urgency.

autoResponse: acknowledge the issue specifically, state the SLA commitment, give 1-2 immediate self-service steps if applicable. Do not invent features. Sign off as "MaroShield Support".`;

function makeTicketId(): string {
  const date = new Date();
  const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SCT-${yyyymmdd}-${rand}`;
}

router.post("/v1/support/triage", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Sign in to submit a support ticket." });
    return;
  }

  if (rateLimited(auth.userId)) {
    res.status(429).json({ error: "Too many requests — please wait a moment." });
    return;
  }

  const message: unknown = req.body?.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required." });
    return;
  }
  if (message.length > 4_000) {
    res.status(400).json({ error: "message must be under 4,000 characters." });
    return;
  }

  const contactEmail: unknown = req.body?.contactEmail;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: TRIAGE_SYSTEM,
      messages: [{ role: "user", content: message.trim() }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";

    let parsed: {
      category?: string;
      urgency?: string;
      escalationRequired?: boolean;
      autoResponse?: string;
    } = {};

    try {
      // Strip any accidental markdown fences.
      const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      req.log.warn({ raw }, "triage: failed to parse Claude JSON, using defaults");
    }

    const validCategories: TriageCategory[] = ["security", "sovereign_key", "compliance", "partner"];
    const category: TriageCategory = validCategories.includes(parsed.category as TriageCategory)
      ? (parsed.category as TriageCategory)
      : "partner";

    const validUrgencies = ["critical", "high", "normal"];
    const urgency = validUrgencies.includes(parsed.urgency ?? "")
      ? (parsed.urgency as "critical" | "high" | "normal")
      : "normal";

    const route = ROUTING[category];

    res.json({
      ticketId: makeTicketId(),
      category,
      routingEmail: route.email,
      sla: route.sla,
      slaMinutes: route.slaMinutes,
      urgency,
      escalationRequired: parsed.escalationRequired === true,
      autoResponse:
        typeof parsed.autoResponse === "string" && parsed.autoResponse.length > 0
          ? parsed.autoResponse
          : `Thank you for reaching out. Your request has been routed to our ${route.label} team at ${route.email}. Expected response time: ${route.sla}. — MaroShield Support`,
      submittedAt: new Date().toISOString(),
      contactEmail: typeof contactEmail === "string" && contactEmail.trim() ? contactEmail.trim() : null,
    });
  } catch (err) {
    req.log.error({ err }, "support triage failed");
    res.status(500).json({ error: "Triage service temporarily unavailable. Please try again." });
  }
});

export default router;
