"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { supabase } from "@/lib/supabase";
import type { Lead, Conversation } from "@/lib/supabase";

// ── Stage mapping ─────────────────────────────────────────────────────────────

type ThreadStatus = "active" | "qualified" | "booked" | "closed";

function stageToStatus(stage: number): ThreadStatus {
  if (stage === 9 || stage === 10) return "closed";
  if (stage === 6 || stage === 7 || stage === 8) return "booked";
  if (stage === 5) return "qualified";
  return "active";
}

const STATUS_CONFIG: Record<
  ThreadStatus,
  { label: string; dot: string; badge: string; text: string; statusLine: string }
> = {
  active: {
    label: "Active",
    dot: "bg-lime",
    badge: "bg-lime/10 text-lime border-lime/25",
    text: "text-lime",
    statusLine: "Active — AI is handling this",
  },
  qualified: {
    label: "Qualified",
    dot: "bg-blue-400",
    badge: "bg-blue-500/10 text-blue-300 border-blue-500/25",
    text: "text-blue-300",
    statusLine: "Qualified — awaiting next step",
  },
  booked: {
    label: "Booked",
    dot: "bg-violet-400",
    badge: "bg-violet-500/10 text-violet-300 border-violet-500/25",
    text: "text-violet-300",
    statusLine: "Call Booked",
  },
  closed: {
    label: "Closed",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    text: "text-emerald-300",
    statusLine: "Deal Closed",
  },
};

const AVATAR_COLORS = [
  "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#0284c7",
];

function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function avatarInitial(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DailyStats = {
  handled: number;
  qualified: number;
  booked: number;
  closed: number;
  repliesReceived: number;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBanner() {
  const [ok, setOk] = useState(true);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => setOk(d.ok !== false))
      .catch(() => {});
  }, []);

  if (ok) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/8 border-b border-amber-500/25 text-xs flex-shrink-0">
      <span className="text-amber-400 text-sm">⚠</span>
      <span className="text-white/70">
        Service issue detected. Check Supabase and ManyChat configuration.
      </span>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-0.5">
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          className="w-1 h-1 rounded-full bg-lime"
          style={{
            animation: `typing-bounce 1.4s ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

function StatusBadge({ status }: { status: ThreadStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`${cfg.badge} text-[9px] font-bold tracking-wide px-2 py-0.5 rounded-full border flex-shrink-0`}>
      {cfg.label}
    </span>
  );
}

// ── Thread Panel (left) ───────────────────────────────────────────────────────

function ThreadPanel({
  leads,
  lastMsg,
  selectedId,
  newInbound,
  filter,
  setFilter,
  search,
  setSearch,
  onSelect,
  loading,
}: {
  leads: Lead[];
  lastMsg: Record<number, Conversation>;
  selectedId: number | null;
  newInbound: Set<number>;
  filter: ThreadStatus | "all";
  setFilter: (f: ThreadStatus | "all") => void;
  search: string;
  setSearch: (s: string) => void;
  onSelect: (id: number) => void;
  loading: boolean;
}) {
  const activeCount = leads.filter((l) => stageToStatus(l.stage) === "active").length;

  const filtered = leads
    .filter((l) => {
      if (filter !== "all" && stageToStatus(l.stage) !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          l.name.toLowerCase().includes(q) ||
          (l.handle ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const aT = lastMsg[a.id]?.sent_at ?? a.last_reply_at ?? a.created_at;
      const bT = lastMsg[b.id]?.sent_at ?? b.last_reply_at ?? b.created_at;
      return new Date(bT).getTime() - new Date(aT).getTime();
    });

  const filters: { key: ThreadStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "qualified", label: "Qualified" },
    { key: "booked", label: "Booked" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-semibold">Conversations</span>
            <span className="relative w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-lime/30 animate-ping" />
              <span className="w-2 h-2 rounded-full bg-lime block" style={{ boxShadow: "0 0 6px #D9FC67" }} />
            </span>
          </div>
          <span className="text-muted text-[10px] font-mono">{activeCount} active</span>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-muted focus:outline-none focus:border-lime transition-colors mb-2.5"
        />

        {/* Filter tabs */}
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                filter === f.key
                  ? "bg-lime text-black"
                  : "text-muted hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#222 transparent" }}>
        {loading && (
          <p className="text-muted text-xs text-center py-8 font-mono">Loading...</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-muted text-xs text-center py-8 leading-relaxed px-4">
            {leads.length === 0
              ? "No DMs yet. Messages will appear here in real-time once your workflow is live."
              : "No threads match your filter."}
          </p>
        )}
        {filtered.map((lead) => {
          const status = stageToStatus(lead.stage);
          const cfg = STATUS_CONFIG[status];
          const msg = lastMsg[lead.id];
          const isSelected = lead.id === selectedId;
          const hasNew = newInbound.has(lead.id);
          const color = avatarColor(lead.name);

          return (
            <button
              key={lead.id}
              onClick={() => onSelect(lead.id)}
              className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2.5 rounded-xl transition-all cursor-pointer ${
                isSelected
                  ? "bg-[#141414] border-l-2 border-l-lime border border-border"
                  : "border border-transparent hover:bg-[#161616] hover:border-border"
              }`}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold border"
                  style={{
                    backgroundColor: color + "22",
                    borderColor: color + "44",
                    color,
                  }}
                >
                  {avatarInitial(lead.name)}
                </div>
                {hasNew && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-400 rounded-full border-2 border-background" />
                )}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-white text-[12px] font-semibold truncate">
                    {lead.handle ? `@${lead.handle}` : lead.name}
                  </span>
                  <span className="text-muted text-[10px] font-mono flex-shrink-0">
                    {msg ? timeAgo(msg.sent_at) : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted text-[11px] truncate flex-1">
                    {msg ? (
                      <>
                        {msg.direction === "outbound" && (
                          <span className={`${cfg.text} text-[10px]`}>
                            {msg.ai_generated ? "Alberto: " : "Manual: "}
                          </span>
                        )}
                        {msg.message_text.slice(0, 50)}
                      </>
                    ) : (
                      "No messages yet"
                    )}
                  </span>
                  <StatusBadge status={status} />
                </div>
                {status === "active" && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-lime text-[10px] font-mono opacity-70">AI composing</span>
                    <TypingDots />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Conversation Panel (center) ───────────────────────────────────────────────

function ConversationPanel({
  lead,
  messages,
  loading,
}: {
  lead: Lead;
  messages: Conversation[];
  loading: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const status = stageToStatus(lead.stage);
  const cfg = STATUS_CONFIG[status];
  const color = avatarColor(lead.name);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[#0d0d0d] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold border flex-shrink-0"
            style={{ backgroundColor: color + "22", borderColor: color + "44", color }}
          >
            {avatarInitial(lead.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-semibold">
                {lead.handle ? `@${lead.handle}` : lead.name}
              </span>
              {lead.handle && (
                <span className="text-muted text-xs">{lead.name}</span>
              )}
            </div>
            <span className={`${cfg.text} text-[11px] font-mono`}>{cfg.statusLine}</span>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          {status === "active" && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-lime/6 border border-lime/20">
              <span className="w-1.5 h-1.5 rounded-full bg-lime" style={{ animation: "pulse-glow 1.5s ease-in-out infinite" }} />
              <span className="text-lime text-[11px] font-bold font-mono">AI Running</span>
            </div>
          )}
          {status === "booked" && (
            <div className="px-3 py-1.5 rounded-full bg-violet-500/8 border border-violet-500/20 text-violet-300 text-[11px] font-bold font-mono">
              Call Booked
            </div>
          )}
          {status === "closed" && (
            <div className="px-3 py-1.5 rounded-full bg-emerald-500/8 border border-emerald-500/20 text-emerald-300 text-[11px] font-bold font-mono">
              Deal Closed
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#222 transparent" }}
      >
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <span className="text-muted text-sm font-mono">Loading...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center flex-1">
            <span className="text-muted text-sm text-center leading-relaxed">
              No messages yet for this lead.
            </span>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOut = msg.direction === "outbound";
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${isOut ? "items-end" : "items-start"}`}
                style={{ animation: `fade-up 0.3s ease ${i * 30}ms forwards`, opacity: 0 }}
              >
                {isOut && (
                  <span className={`text-[9px] font-bold tracking-widest font-mono px-1 ${
                    msg.ai_generated ? "text-lime/60" : "text-amber-400/70"
                  }`}>
                    {msg.ai_generated ? "ALBERTO" : "MANUAL"}
                  </span>
                )}
                <div
                  className={`max-w-[72%] px-3.5 py-2.5 text-[13px] leading-relaxed rounded-2xl ${
                    isOut
                      ? msg.ai_generated
                        ? "bg-[#0f2018] border border-lime/15 text-[#d4f5e9] rounded-br-sm"
                        : "bg-[#1a140a] border border-amber-400/15 text-[#f5e9d4] rounded-br-sm"
                      : "bg-[#1a1a1a] border border-border text-white rounded-bl-sm"
                  }`}
                >
                  {msg.message_text}
                </div>
                <span className="text-[10px] text-muted font-mono px-1">
                  {formatMsgTime(msg.sent_at)}
                </span>
              </div>
            );
          })
        )}

        {/* AI composing indicator (for active threads) */}
        {stageToStatus(lead.stage) === "active" && messages.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[9px] font-bold tracking-widest font-mono text-lime/60 px-1">
              ALBERTO
            </span>
            <div className="bg-[#0a1a12] border border-dashed border-lime/20 rounded-2xl rounded-br-sm px-3.5 py-2.5 flex flex-col gap-2">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Side Panel (right) ────────────────────────────────────────────────────────

function OverrideSection({
  lead,
  onSent,
}: {
  lead: Lead;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const status = stageToStatus(lead.stage);
  const canSend = !!lead.manychat_id;

  async function handleSend() {
    if (!text.trim() || !canSend || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/manychat-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber_id: lead.manychat_id,
          message_text: text.trim(),
          lead_id: lead.id,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Send failed");
      setText("");
      setSent(true);
      onSent();
      setTimeout(() => setSent(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error sending message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-4 border-b border-border flex flex-col gap-3">
      <div>
        <p className="text-white text-sm font-semibold">Jump In</p>
        <p className="text-muted text-xs mt-0.5">Send your own message as Matt</p>
      </div>

      {/* Status context */}
      {status === "booked" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg">
          <span>📅</span>
          <span className="text-muted text-xs">Call booked</span>
        </div>
      )}
      {status === "closed" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg">
          <span className="text-emerald-400">✓</span>
          <span className="text-muted text-xs">Deal closed</span>
        </div>
      )}
      {status === "qualified" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg">
          <span className="text-blue-400">→</span>
          <span className="text-muted text-xs">Monitoring replies</span>
        </div>
      )}

      {!canSend ? (
        <div className="px-3 py-2 bg-background border border-border rounded-lg text-xs text-muted">
          No ManyChat ID linked. Link one to enable override.
        </div>
      ) : (
        <>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Type a message..."
            disabled={sending}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[13px] text-white placeholder-muted resize-none outline-none leading-relaxed focus:border-lime transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              sent
                ? "bg-emerald-500 text-white"
                : "bg-lime text-black hover:opacity-90 disabled:opacity-30"
            }`}
          >
            {sent ? "Sent ✓" : sending ? "Sending..." : "Send Override"}
          </button>
          {error && <p className="text-red-400 text-[11px]">{error}</p>}
        </>
      )}
    </div>
  );
}

function DailySummarySection({ stats }: { stats: DailyStats }) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  const health = stats.handled > 0
    ? Math.round(((stats.booked + stats.closed) / stats.handled) * 100)
    : 0;

  const cards = [
    { label: "Handled", value: stats.handled, color: "text-white" },
    { label: "Qualified", value: stats.qualified, color: "text-blue-300" },
    { label: "Booked", value: stats.booked, color: "text-violet-300" },
    { label: "Closed", value: stats.closed, color: "text-emerald-300" },
  ];

  return (
    <div className="p-4 flex flex-col gap-4 flex-1">
      <div className="flex items-center justify-between">
        <span className="text-white text-sm font-semibold">Today&apos;s Results</span>
        <span className="text-muted text-[10px] font-mono">{today}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="bg-background border border-border rounded-xl p-3">
            <p className={`${c.color} text-2xl font-bold font-mono leading-none`}>{c.value}</p>
            <p className="text-muted text-[11px] mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-muted text-xs">Pipeline health</span>
          <span className="text-lime text-xs font-bold font-mono">{health}%</span>
        </div>
        <div className="h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-lime rounded-full transition-all duration-500"
            style={{ width: `${health}%`, boxShadow: "0 0 8px rgba(217,252,103,0.5)" }}
          />
        </div>
        <p className="text-muted text-[10px] font-mono">
          {stats.repliesReceived} replies received
        </p>
      </div>
    </div>
  );
}

// ── Main: InboxTab ────────────────────────────────────────────────────────────

export default function InboxTab({ leads }: { leads: Lead[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Conversation[]>([]);
  const [lastMsg, setLastMsg] = useState<Record<number, Conversation>>({});
  const [newInbound, setNewInbound] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<ThreadStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [stats, setStats] = useState<DailyStats>({
    handled: 0, qualified: 0, booked: 0, closed: 0, repliesReceived: 0,
  });

  const selectedLead = leads.find((l) => l.id === selectedId) ?? null;

  // Auto-select first lead
  useEffect(() => {
    if (selectedId === null && leads.length > 0) {
      setSelectedId(leads[0].id);
    }
  }, [leads, selectedId]);

  // Load messages for selected lead
  const fetchMessages = useCallback(async (leadId: number) => {
    setLoadingMsgs(true);
    const { data } = await supabase
      .from("dm_conversations")
      .select("*")
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: true })
      .limit(100);
    setMessages((data ?? []) as Conversation[]);
    setLoadingMsgs(false);
  }, []);

  useEffect(() => {
    if (selectedId !== null) {
      fetchMessages(selectedId);
      setNewInbound((prev) => { const s = new Set(prev); s.delete(selectedId); return s; });
    }
  }, [selectedId, fetchMessages]);

  // Load last message previews for all leads
  useEffect(() => {
    if (leads.length === 0) return;
    supabase
      .from("dm_conversations")
      .select("*")
      .in("lead_id", leads.map((l) => l.id))
      .order("sent_at", { ascending: false })
      .then(({ data }) => {
        const map: Record<number, Conversation> = {};
        for (const m of (data ?? []) as Conversation[]) {
          if (!map[m.lead_id]) map[m.lead_id] = m;
        }
        setLastMsg(map);
      });
  }, [leads]);

  // Load today's stats
  useEffect(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    supabase
      .from("dm_conversations")
      .select("direction, lead_id")
      .gte("sent_at", todayStart.toISOString())
      .then(({ data }) => {
        const msgs = (data ?? []) as { direction: string; lead_id: number }[];
        const handled = msgs.length;
        const repliesReceived = msgs.filter((m) => m.direction === "inbound").length;
        const qualifiedIds = new Set(
          leads.filter((l) => l.stage === 5).map((l) => l.id)
        );
        const bookedIds = new Set(
          leads.filter((l) => l.stage === 6 || l.stage === 7).map((l) => l.id)
        );
        const closedIds = new Set(
          leads.filter((l) => l.stage === 9).map((l) => l.id)
        );
        setStats({
          handled,
          qualified: qualifiedIds.size,
          booked: bookedIds.size,
          closed: closedIds.size,
          repliesReceived,
        });
      });
  }, [leads]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_conversations" },
        (payload) => {
          const msg = payload.new as Conversation;
          setLastMsg((prev) => ({ ...prev, [msg.lead_id]: msg }));
          if (msg.lead_id === selectedId) {
            setMessages((prev) => [...prev, msg]);
          }
          if (msg.direction === "inbound" && msg.lead_id !== selectedId) {
            setNewInbound((prev) => new Set([...prev, msg.lead_id]));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  return (
    <div className="flex flex-col h-[720px] bg-background border border-border rounded-xl overflow-hidden">
      <StatusBanner />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: Thread list */}
        <div className="w-[300px] flex-shrink-0">
          <ThreadPanel
            leads={leads}
            lastMsg={lastMsg}
            selectedId={selectedId}
            newInbound={newInbound}
            filter={filter}
            setFilter={setFilter}
            search={search}
            setSearch={setSearch}
            onSelect={setSelectedId}
            loading={false}
          />
        </div>

        {/* Center: Conversation */}
        <div className="flex-1 min-w-0 border-x border-border">
          {selectedLead ? (
            <ConversationPanel
              lead={selectedLead}
              messages={messages}
              loading={loadingMsgs}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted text-sm font-mono text-center leading-relaxed px-8">
                No conversations yet. DMs will appear here in real-time once your workflow is live.
              </p>
            </div>
          )}
        </div>

        {/* Right: Override + Stats */}
        <div className="w-[280px] flex-shrink-0 flex flex-col overflow-y-auto"
          style={{ scrollbarWidth: "none" }}>
          {selectedLead ? (
            <OverrideSection
              lead={selectedLead}
              onSent={() => selectedId && fetchMessages(selectedId)}
            />
          ) : (
            <div className="p-4 border-b border-border">
              <p className="text-muted text-xs text-center">Select a conversation to jump in.</p>
            </div>
          )}
          <DailySummarySection stats={stats} />
        </div>
      </div>
    </div>
  );
}
