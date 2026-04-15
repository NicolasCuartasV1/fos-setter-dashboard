"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Lead, Conversation } from "@/lib/supabase";

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const STAGE_LABELS: Record<number, string> = {
  1: "New", 2: "Opener Sent", 3: "Engaged", 4: "Qualifying",
  5: "Calendly Sent", 6: "Booked", 7: "Pre-Call Sent",
  8: "No-Show", 9: "Closed", 10: "Not Qualified",
};

const HEAT_DOT: Record<string, string> = {
  hot: "bg-lime",
  warm: "bg-amber-400",
  cold: "bg-blue-400",
};

const STAGE_DOT: Record<number, string> = {
  3: "bg-blue-400", 4: "bg-violet-400", 5: "bg-amber-400",
  6: "bg-lime", 7: "bg-lime",
};

function avatarColor(name: string): string {
  const colors = ["#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777"];
  return colors[name.charCodeAt(0) % colors.length];
}

// ── Thread List ──────────────────────────────────────────────────────────────

function ThreadRow({
  lead,
  lastMsg,
  selected,
  hasNew,
  onClick,
}: {
  lead: Lead;
  lastMsg: Conversation | null;
  selected: boolean;
  hasNew: boolean;
  onClick: () => void;
}) {
  const initials = lead.name.slice(0, 2).toUpperCase();
  const heatClass = HEAT_DOT[lead.funnel_heat ?? ""] ?? null;
  const stageDotClass = STAGE_DOT[lead.stage] ?? "bg-gray-600";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-xl transition-all flex gap-3 items-start group cursor-pointer ${
        selected
          ? "bg-lime/10 border border-lime/30"
          : "border border-transparent hover:border-border hover:bg-[#1a1a1a]"
      }`}
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold relative"
        style={{ backgroundColor: avatarColor(lead.name) }}
      >
        {initials}
        {hasNew && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-400 rounded-full border-2 border-background" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-white text-xs font-semibold truncate">
            {lead.name}
          </span>
          <span className="text-muted text-[10px] flex-shrink-0">
            {lastMsg ? timeAgo(lastMsg.sent_at) : "--"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${heatClass ?? stageDotClass}`}
          />
          <span className="text-muted text-[10px] truncate">
            {lead.handle ? `@${lead.handle}` : STAGE_LABELS[lead.stage]}
          </span>
        </div>
        {lastMsg && (
          <p className={`text-[11px] truncate ${
            lastMsg.direction === "inbound" ? "text-blue-300" : "text-muted"
          }`}>
            {lastMsg.direction === "outbound" ? "Alberto: " : ""}
            {lastMsg.message_text.slice(0, 60)}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Conversation }) {
  const isOut = msg.direction === "outbound";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${isOut ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {isOut && msg.ai_generated && (
          <span className="text-[9px] font-bold text-lime/70 uppercase tracking-wider px-1 self-end">
            Alberto
          </span>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
            isOut
              ? msg.ai_generated
                ? "bg-lime/15 border border-lime/25 text-white rounded-tr-sm"
                : "bg-[#2a2a2a] border border-border text-white rounded-tr-sm"
              : "bg-[#1a1a1a] border border-border text-[#ddd] rounded-tl-sm"
          }`}
        >
          {msg.message_text}
        </div>
        <span className="text-[10px] text-muted px-1">{formatTime(msg.sent_at)}</span>
      </div>
    </div>
  );
}

// ── Empty States ─────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-muted text-sm">{message}</p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function LiveDMsTab({ leads }: { leads: Lead[] }) {
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Conversation[]>([]);
  const [lastMsgByLead, setLastMsgByLead] = useState<Record<number, Conversation>>({});
  const [newInbound, setNewInbound] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [overrideText, setOverrideText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) ?? null;

  // Sort leads: active first, then by last_reply_at
  const sortedLeads = [...leads]
    .filter((l) => {
      if (!search) return true;
      return (
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        (l.handle ?? "").toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => {
      const aTime = a.last_reply_at ? new Date(a.last_reply_at).getTime() : 0;
      const bTime = b.last_reply_at ? new Date(b.last_reply_at).getTime() : 0;
      return bTime - aTime;
    });

  // Auto-select first lead
  useEffect(() => {
    if (selectedLeadId === null && sortedLeads.length > 0) {
      setSelectedLeadId(sortedLeads[0].id);
    }
  }, [sortedLeads, selectedLeadId]);

  // Fetch messages for selected lead
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
    if (selectedLeadId !== null) {
      fetchMessages(selectedLeadId);
      // Clear new indicator when thread is opened
      setNewInbound((prev) => {
        const next = new Set(prev);
        next.delete(selectedLeadId);
        return next;
      });
    }
  }, [selectedLeadId, fetchMessages]);

  // Scroll to bottom when messages load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load last message per lead for thread previews
  useEffect(() => {
    if (leads.length === 0) return;
    async function loadPreviews() {
      const ids = leads.map((l) => l.id);
      const { data } = await supabase
        .from("dm_conversations")
        .select("*")
        .in("lead_id", ids)
        .order("sent_at", { ascending: false });
      if (!data) return;
      const byLead: Record<number, Conversation> = {};
      for (const msg of data as Conversation[]) {
        if (!byLead[msg.lead_id]) byLead[msg.lead_id] = msg;
      }
      setLastMsgByLead(byLead);
    }
    loadPreviews();
  }, [leads]);

  // Realtime subscription on dm_conversations
  useEffect(() => {
    const channel = supabase
      .channel("live-dms-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_conversations" },
        (payload) => {
          const msg = payload.new as Conversation;
          // Update last message preview
          setLastMsgByLead((prev) => ({ ...prev, [msg.lead_id]: msg }));
          // If this is the selected thread, append to messages
          if (msg.lead_id === selectedLeadId) {
            setMessages((prev) => [...prev, msg]);
          }
          // Mark as new inbound if not selected
          if (msg.direction === "inbound" && msg.lead_id !== selectedLeadId) {
            setNewInbound((prev) => new Set([...prev, msg.lead_id]));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedLeadId]);

  const manychatUrl = selectedLead?.manychat_id
    ? `https://app.manychat.com/fb1072081/chat/${selectedLead.manychat_id}`
    : "https://app.manychat.com/fb1072081/chat";

  const canOverride = !!(selectedLead?.manychat_id);

  async function sendOverride() {
    if (!selectedLead || !overrideText.trim() || !canOverride || sending) return;
    setSending(true);
    setSendStatus("idle");
    setSendError("");

    // Optimistic append
    const optimistic: Conversation = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      lead_id: selectedLead.id,
      manychat_subscriber_id: selectedLead.manychat_id,
      direction: "outbound",
      message_text: overrideText.trim(),
      sent_at: new Date().toISOString(),
      ai_generated: false,
      stage_at_send: selectedLead.stage,
    };
    setMessages((prev) => [...prev, optimistic]);
    const sentText = overrideText.trim();
    setOverrideText("");

    try {
      const res = await fetch("/api/manychat-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber_id: selectedLead.manychat_id,
          message_text: sentText,
          lead_id: selectedLead.id,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setSendStatus("error");
        setSendError(data.error ?? "Send failed");
        // Roll back optimistic message
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      } else {
        setSendStatus("sent");
        setTimeout(() => setSendStatus("idle"), 2500);
      }
    } catch {
      setSendStatus("error");
      setSendError("Network error. Try again.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex gap-4 h-[680px]">
      {/* ── Left: Thread List ───────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 bg-lime rounded-full"
                style={{ boxShadow: "0 0 5px #D9FC67", animation: "pulse-glow 2s ease-in-out infinite" }}
              />
              <span className="text-white text-xs font-semibold">Live DMs</span>
            </div>
            <span className="text-muted text-[10px]">{leads.length} leads</span>
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-muted focus:outline-none focus:border-lime transition-colors"
          />
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#222 transparent" }}>
          {sortedLeads.length === 0 ? (
            <p className="text-muted text-xs text-center py-8">No leads found.</p>
          ) : (
            sortedLeads.map((lead) => (
              <ThreadRow
                key={lead.id}
                lead={lead}
                lastMsg={lastMsgByLead[lead.id] ?? null}
                selected={lead.id === selectedLeadId}
                hasNew={newInbound.has(lead.id)}
                onClick={() => setSelectedLeadId(lead.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: Conversation Chain ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden">
        {!selectedLead ? (
          <EmptyState message="Select a lead to view conversation." />
        ) : (
          <>
            {/* Thread header */}
            <div className="px-5 py-3.5 border-b border-border flex-shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                  style={{ backgroundColor: avatarColor(selectedLead.name) }}
                >
                  {selectedLead.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-semibold">{selectedLead.name}</span>
                    {selectedLead.handle && (
                      <span className="text-muted text-xs">@{selectedLead.handle}</span>
                    )}
                    {selectedLead.funnel_heat && (
                      <span className={`w-1.5 h-1.5 rounded-full ${HEAT_DOT[selectedLead.funnel_heat]}`} />
                    )}
                  </div>
                  <span className="text-muted text-[10px]">
                    {STAGE_LABELS[selectedLead.stage]} &bull; Score: {selectedLead.lead_score ?? "--"}
                    {selectedLead.bottleneck ? ` \u2022 ${selectedLead.bottleneck}` : ""}
                  </span>
                </div>
              </div>

              {/* Stage indicator */}
              <div className="flex items-center gap-1.5">
                {canOverride ? (
                  <span className="text-[10px] text-lime/70 font-medium">Override ready</span>
                ) : (
                  <span className="text-[10px] text-muted">No ManyChat ID</span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#222 transparent" }}
            >
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-muted text-sm">Loading...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted text-sm">No messages yet for this lead.</p>
                </div>
              ) : (
                messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
              )}
              <div ref={bottomRef} />
            </div>

            {/* Override Panel */}
            <div className="px-4 py-3 border-t border-border flex-shrink-0">
              {!canOverride ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-xl">
                  <span className="text-muted text-xs">No ManyChat ID linked for this lead.</span>
                  <a href={manychatUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-lime hover:underline ml-auto">Open ManyChat</a>
                </div>
              ) : (
                <div className={`flex items-end gap-2 bg-background border rounded-xl px-3 py-2 transition-colors focus-within:border-lime ${
                  sendStatus === "error" ? "border-red-500/50" : "border-border"
                }`}>
                  <textarea
                    ref={textareaRef}
                    value={overrideText}
                    onChange={(e) => setOverrideText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendOverride();
                      }
                    }}
                    onInput={(e) => {
                      const t = e.currentTarget;
                      t.style.height = "auto";
                      t.style.height = Math.min(t.scrollHeight, 80) + "px";
                    }}
                    placeholder={
                      sendStatus === "sent"
                        ? "Sent."
                        : "Manual override — type to send as Matt..."
                    }
                    rows={1}
                    disabled={sending}
                    className="flex-1 bg-transparent text-white text-xs placeholder-muted resize-none outline-none leading-relaxed"
                    style={{ minHeight: "20px", maxHeight: "80px" }}
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a href={manychatUrl} target="_blank" rel="noopener noreferrer"
                      className="text-muted hover:text-lime transition-colors" title="Open in ManyChat">
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                    <button
                      onClick={sendOverride}
                      disabled={sending || !overrideText.trim()}
                      className="w-7 h-7 bg-lime rounded-lg flex items-center justify-center hover:opacity-90 disabled:opacity-20 transition-opacity cursor-pointer flex-shrink-0"
                    >
                      {sending ? (
                        <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5">
                          <line x1="22" y1="2" x2="11" y2="13"/>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
              {sendStatus === "error" && (
                <p className="text-red-400 text-[10px] mt-1 px-1">{sendError}</p>
              )}
              <p className="text-[10px] text-muted mt-1 px-1">
                Enter to send &bull; Shift+Enter new line &bull; sends as Matt via ManyChat
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
