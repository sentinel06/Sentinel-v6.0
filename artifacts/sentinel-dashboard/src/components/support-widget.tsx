/**
 * Floating MaroShield Assistant chat widget.
 *
 * Mounted globally inside <Layout/>. Streams responses from
 * POST /api/v1/support/chat (SSE). Stateless on the server — full history
 * is sent on every turn; persistence (just transient session) lives in this
 * component.
 */

import { useEffect, useRef, useState } from "react";
import { LifeBuoy, Send, X, Sparkles, Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How do I connect my first agent?",
  "Where do I find my API key?",
  "I have a security incident",
  "Sovereign Key enrollment is failing",
];

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi — I'm MaroShield Assistant. I can help you connect an agent, debug integrations, understand your dashboard, or route urgent issues to the right support team. What's on your mind?",
};

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, streaming, open]);

  useEffect(() => {
    if (open) {
      // Slight delay so the panel is mounted before we focus.
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setStreaming(true);

    // Add an empty assistant placeholder we'll fill via stream deltas.
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${BASE}/api/v1/support/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // Don't include the local greeting in what we send to the server;
        // it's purely UX.
        body: JSON.stringify({ messages: next.filter((_, i) => i !== 0) }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleFrame = (frame: string) => {
        // Tolerate CRLF + multi-line `data:` fields per the SSE spec.
        const dataLines = frame
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""));
        if (dataLines.length === 0) return;
        const json = dataLines.join("\n").trim();
        if (!json) return;
        try {
          const evt = JSON.parse(json) as {
            content?: string;
            error?: string;
            done?: boolean;
          };
          if (evt.error) {
            setMessages((prev) => {
              const copy = prev.slice();
              copy[copy.length - 1] = { role: "assistant", content: evt.error! };
              return copy;
            });
          } else if (evt.content) {
            setMessages((prev) => {
              const copy = prev.slice();
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = {
                role: "assistant",
                content: (last?.content ?? "") + evt.content,
              };
              return copy;
            });
          }
        } catch {
          /* ignore malformed frame */
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line — tolerate \n\n or \r\n\r\n.
        const splitter = /\r?\n\r?\n/;
        let m: RegExpExecArray | null;
        while ((m = splitter.exec(buffer))) {
          handleFrame(buffer.slice(0, m.index));
          buffer = buffer.slice(m.index + m[0].length);
        }
      }
      // Flush any trailing frame that wasn't terminated by a blank line
      // (can happen if the connection drops mid-stream).
      if (buffer.trim()) handleFrame(buffer);
    } catch (e) {
      setMessages((prev) => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        const fallback =
          "I couldn't reach the support service. Please check your connection and try again.";
        if (last && last.role === "assistant" && !last.content) {
          copy[copy.length - 1] = { role: "assistant", content: fallback };
        } else {
          copy.push({ role: "assistant", content: fallback });
        }
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open MaroShield Assistant"
          className="fixed bottom-5 right-5 z-50 group"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "rgba(0,245,255,0.12)",
            border: "1px solid rgba(0,245,255,0.45)",
            color: "#00F5FF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 28px rgba(0,245,255,0.18), 0 0 0 1px rgba(0,245,255,0.05) inset",
            backdropFilter: "blur(10px)",
            cursor: "pointer",
            transition: "transform 160ms ease, box-shadow 160ms ease, background 160ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0,245,255,0.2)";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 12px 36px rgba(0,245,255,0.32)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0,245,255,0.12)";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 8px 28px rgba(0,245,255,0.18), 0 0 0 1px rgba(0,245,255,0.05) inset";
          }}
        >
          <LifeBuoy style={{ width: 22, height: 22 }} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed z-50 flex flex-col page-transition"
          style={{
            bottom: 20,
            right: 20,
            width: "min(400px, calc(100vw - 32px))",
            height: "min(600px, calc(100vh - 100px))",
            background: "rgba(8,8,10,0.92)",
            border: "1px solid rgba(0,245,255,0.22)",
            borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,245,255,0.06) inset",
            backdropFilter: "blur(18px)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "linear-gradient(180deg, rgba(0,245,255,0.06) 0%, transparent 100%)",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "rgba(0,245,255,0.12)",
                border: "1px solid rgba(0,245,255,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#00F5FF",
              }}
            >
              <Sparkles style={{ width: 14, height: 14 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  letterSpacing: 0.2,
                }}
              >
                MaroShield Assistant
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  color: "#00F5FF",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Online · AI support
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#9AA4B1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#fff";
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#9AA4B1";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollerRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            {streaming &&
              messages[messages.length - 1]?.role === "assistant" &&
              !messages[messages.length - 1]?.content && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#9AA4B1",
                    fontSize: 12,
                    fontFamily: "ui-monospace, monospace",
                    paddingLeft: 4,
                  }}
                >
                  <Loader2
                    style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }}
                  />
                  thinking…
                </div>
              )}

            {/* Suggested prompts (only shown on first turn) */}
            {messages.length === 1 && !streaming && (
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#E5E7EB",
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "all 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(0,245,255,0.4)";
                      e.currentTarget.style.background = "rgba(0,245,255,0.06)";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                      e.currentTarget.style.color = "#E5E7EB";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={onSubmit}
            style={{
              padding: 10,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything about MaroShield…"
              rows={1}
              disabled={streaming}
              style={{
                flex: 1,
                resize: "none",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                color: "#fff",
                padding: "10px 12px",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                maxHeight: 120,
              }}
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="Send"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: input.trim() && !streaming ? "#00F5FF" : "rgba(0,245,255,0.2)",
                color: "#050505",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !streaming ? "pointer" : "not-allowed",
                flexShrink: 0,
                transition: "background 120ms ease",
              }}
            >
              {streaming ? (
                <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
              ) : (
                <Send style={{ width: 16, height: 16 }} />
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          padding: "9px 12px",
          borderRadius: 12,
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: isUser ? "rgba(0,245,255,0.14)" : "rgba(255,255,255,0.04)",
          border: isUser ? "1px solid rgba(0,245,255,0.3)" : "1px solid rgba(255,255,255,0.06)",
          color: isUser ? "#fff" : "#E5E7EB",
        }}
      >
        {content || "\u00A0"}
      </div>
    </div>
  );
}
