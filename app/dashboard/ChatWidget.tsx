"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import MessageBubble from "./MessageBubble";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DashboardContext {
  view?: string;
  dateFrom?: string;
  dateTo?: string;
}

const PROMPTS = [
  "What's our funnel conversion this week?",
  "Which platform generates the most bookings?",
  "Show me leads that need follow-up",
  "Where are we losing in the pipeline?",
  "What's our reply rate trend?",
  "Which leads are closest to booking?",
];

export default function ChatWidget({
  dashboardContext,
}: {
  dashboardContext?: DashboardContext;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [size, setSize] = useState({ w: 440, h: 580 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Auto-open on first visit
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem("dm-chat-seen");
    if (!seen) {
      const timer = setTimeout(() => {
        setOpen(true);
        localStorage.setItem("dm-chat-seen", "1");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const sx = e.clientX,
        sy = e.clientY,
        sw = size.w,
        sh = size.h;
      const onMove = (mv: MouseEvent) =>
        setSize({
          w: Math.max(340, Math.min(820, sw + (sx - mv.clientX))),
          h: Math.max(
            420,
            Math.min(window.innerHeight * 0.85, sh + (sy - mv.clientY))
          ),
        });
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [size]
  );

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, dashboardContext }),
      });
      if (!res.ok || !res.body) throw new Error("failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const u = [...prev];
          u[u.length - 1] = { role: "assistant", content: buf };
          return u;
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        {!open && (
          <div className="absolute inset-0 rounded-full bg-lime/30 animate-ping" />
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="relative w-14 h-14 bg-lime rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform cursor-pointer"
          title="Alberto Intelligence"
        >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0A0A0A"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0A0A0A"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
        </button>
      </div>

      {open && (
        <div
          className="fixed bottom-[88px] right-6 z-50 flex flex-col rounded-2xl overflow-hidden"
          style={{
            width: size.w,
            height: size.h,
            maxWidth: "calc(100vw - 3rem)",
            maxHeight: "calc(100vh - 7rem)",
            background: "rgba(13,13,13,0.97)",
            border: "1px solid #222",
            boxShadow:
              "0 32px 80px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04) inset",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Resize handle top-left */}
          <div
            onMouseDown={startResize}
            className="absolute top-0 left-0 w-5 h-5 cursor-nw-resize z-20 group"
          >
            <svg
              className="absolute top-1.5 left-1.5 text-[#333] group-hover:text-[#555] transition-colors"
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
            >
              <path
                d="M1 7L7 1M1 4L4 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Header */}
          <div
            className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid #1E1E1E" }}
          >
            <div className="relative w-2 h-2">
              <div
                className="absolute inset-0 bg-lime rounded-full opacity-30"
                style={{ animation: "ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite" }}
              />
              <div className="w-2 h-2 bg-lime rounded-full relative" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white tracking-tight leading-none">
                Alberto Intelligence
              </p>
              <p className="text-[11px] text-[#555] mt-1 leading-none">
                Live pipeline data
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-[11px] text-[#444] hover:text-[#888] transition-colors mr-2 cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="text-[#444] hover:text-white transition-colors cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#222 transparent" }}
          >
            {messages.length === 0 && (
              <div className="space-y-4 pt-1">
                <p className="text-[12px] text-[#444] leading-relaxed px-0.5">
                  Ask anything about the pipeline, leads, or Alberto&apos;s
                  performance.
                </p>
                <div className="space-y-1.5">
                  {PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => sendMessage(p)}
                      className="w-full text-left text-[12px] text-[#666] rounded-xl px-3 py-2.5 transition-all leading-snug border border-[#1E1E1E] bg-transparent hover:border-lime hover:text-white cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="px-3 pb-3 pt-2.5 flex-shrink-0"
            style={{ borderTop: "1px solid #1A1A1A" }}
          >
            <div
              className="flex items-end gap-2 rounded-xl px-3 py-2 transition-colors bg-background border border-[#252525] focus-within:border-lime"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="Ask about leads, pipeline, conversions..."
                rows={1}
                disabled={loading}
                className="flex-1 bg-transparent text-white text-[13px] placeholder-[#444] resize-none outline-none leading-relaxed"
                style={{ minHeight: "22px", maxHeight: "96px" }}
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 96) + "px";
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="flex-shrink-0 w-7 h-7 bg-lime rounded-lg flex items-center justify-center transition-opacity hover:opacity-90 disabled:opacity-20 cursor-pointer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0A0A0A"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-[#333] mt-1.5 text-center">
              Enter to send / Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  );
}
