/**
 * Sentinel Support — AI assistant chat (SSE).
 *
 * Powered by Anthropic Claude via Replit AI Integrations. Stateless: the
 * conversation history is sent on every call from the client, so no DB.
 *
 * POST /api/v1/support/chat
 *   body: { messages: [{ role: "user" | "assistant", content: string }, ...] }
 *   response: text/event-stream — `data: {"content": "..."}` deltas,
 *             terminated by `data: {"done": true}`.
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

const SYSTEM_PROMPT = `You are Sentinel Assistant, the in-product AI support agent for **Agent-Sentinel** — an immutable audit ledger and governance layer for AI agents (EU AI Act Article 12 compliant).

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
sentinel = Sentinel(api_key="sk_sent_core_...", base_url="https://agent-sentinel.replit.app")
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

**Common questions**
- "Where's my key?" → /onboarding (returning visitors see a masked preview; the full plaintext is only shown the first time).
- "Why is my dashboard empty?" → No events have hit /v1/log yet under your key. Check the curl/SDK snippet on /onboarding and verify the X-Sentinel-Key header.
- "I see 401 from /v1/log" → Wrong or missing X-Sentinel-Key header.

**Boundaries**
- Don't invent prices, SLAs, or features that aren't in this prompt. If you genuinely don't know, say so and offer to escalate (the user can email support).
- Never reveal API keys, secrets, or other users' data.
- Keep responses tight — typically 1–4 short paragraphs or a single code snippet. Use bullet points for multi-step instructions.
`;

type ChatMessage = { role: "user" | "assistant"; content: string };

router.post("/v1/support/chat", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Sign in to use Sentinel Assistant." });
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
        error: "Sentinel Assistant is temporarily unavailable. Please try again in a moment.",
        done: true,
      })}\n\n`,
    );
    res.end();
  }
});

export default router;
