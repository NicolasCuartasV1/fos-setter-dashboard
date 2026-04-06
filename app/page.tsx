"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  Lead,
  Session,
  Booking,
  Blocker,
  AlbertoStats,
  ConversationWithLead,
} from "@/lib/supabase";

// ── Types from API ──────────────────────────────────────────────────────────

type TodayPulse = {
  messagesIn: number;
  messagesOut: number;
  newLeads: number;
  avgResponseTimeMs: number | null;
};

type PathBreakdown = {
  hot: number;
  warm: number;
  cold: number;
  unscored: number;
};

type ConversionFunnel = {
  engaged: number;
  qualifying: number;
  calendlySent: number;
  booked: number;
  totalDMs: number;
  engagedToQualifying: number | null;
  qualifyingToCalendly: number | null;
  calendlyToBooked: number | null;
  dmsToBooked: number | null;
};

type HourlyLatency = {
  hour: number;
  avgMs: number;
  count: number;
};

type RevenueData = {
  os_light: {
    total_all_time: number;
    revenue_all_time: number;
    total_this_week: number;
    revenue_this_week: number;
    total_this_month: number;
    revenue_this_month: number;
    recent: Array<{ name: string; date: string }>;
  };
  sales_pipeline: {
    closed_won_total: number;
    closed_won_revenue: number;
  };
};

type DashboardData = {
  leads: Lead[];
  hotLeads: Lead[];
  sessions: Session[];
  bookings: Booking[];
  blockers: Blocker[];
  albertoStats: AlbertoStats;
  recentConversations: ConversationWithLead[];
  todayPulse: TodayPulse;
  pathBreakdown: PathBreakdown;
  conversionFunnel: ConversionFunnel;
  hourlyLatency: HourlyLatency[];
  timestamp: string;
};

// ── Constants ───────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30_000;

const STAGE_LABELS: Record<number, string> = {
  1: "New",
  2: "Opener Sent",
  3: "Engaged",
  4: "Qualifying",
  5: "Calendly Sent",
  6: "Booked",
  7: "Pre-Call Sent",
  8: "No-Show",
  9: "Closed",
  10: "Not Qualified",
};

const STAGE_COLORS: Record<number, string> = {
  1: "#555",
  2: "#666",
  3: "#4A90D9",
  4: "#7B68EE",
  5: "#E8A838",
  6: "#D9FC67",
  7: "#D9FC67",
  8: "#E05252",
  9: "#52C87A",
  10: "#888",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function stageCounts(leads: Lead[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const lead of leads) {
    counts[lead.stage] = (counts[lead.stage] ?? 0) + 1;
  }
  return counts;
}

function weeklyStats(sessions: Session[]) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = sessions.filter((s) => new Date(s.session_date) >= weekAgo);
  return {
    sessions: thisWeek.length,
    dms: thisWeek.reduce(
      (a, s) => a + (s.replies_handled ?? 0) + (s.new_conversations ?? 0),
      0
    ),
    sets: thisWeek.reduce((a, s) => a + (s.calendly_links_sent ?? 0), 0),
    booked: thisWeek.reduce((a, s) => a + (s.bookings_confirmed ?? 0), 0),
  };
}

function monthlyStats(sessions: Session[]) {
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thisMonth = sessions.filter(
    (s) => new Date(s.session_date) >= monthAgo
  );
  return {
    sessions: thisMonth.length,
    dms: thisMonth.reduce(
      (a, s) => a + (s.replies_handled ?? 0) + (s.new_conversations ?? 0),
      0
    ),
    sets: thisMonth.reduce((a, s) => a + (s.calendly_links_sent ?? 0), 0),
    booked: thisMonth.reduce((a, s) => a + (s.bookings_confirmed ?? 0), 0),
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "--";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatRevenue(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function secondsAgo(isoTimestamp: string): number {
  return Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 1000);
}

function formatSecondsAgo(secs: number): string {
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: "#1A1A1A",
        border: highlight ? "1px solid #D9FC67" : "1px solid #2A2A2A",
        borderRadius: 12,
        padding: "1.5rem",
      }}
    >
      <p
        style={{
          color: "#888",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        {label}
      </p>
      <p
        style={{
          color: highlight ? "#D9FC67" : "#F5F5F5",
          fontSize: 32,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ color: "#666", fontSize: 12, marginTop: 6 }}>{sub}</p>
      )}
    </div>
  );
}

function PulseCard({
  label,
  value,
  icon,
  accentColor,
}: {
  label: string;
  value: string | number;
  icon: string;
  accentColor: string;
}) {
  return (
    <div
      style={{
        background: "#1A1A1A",
        border: `1px solid ${accentColor}33`,
        borderRadius: 12,
        padding: "1.25rem",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: `${accentColor}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <p
          style={{
            color: accentColor,
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {value}
        </p>
        <p
          style={{
            color: "#888",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginTop: 4,
          }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

function StageBadge({ stage }: { stage: number }) {
  return (
    <span
      style={{
        background: (STAGE_COLORS[stage] ?? "#555") + "22",
        color: STAGE_COLORS[stage] ?? "#888",
        border: `1px solid ${STAGE_COLORS[stage] ?? "#555"}44`,
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {STAGE_LABELS[stage] ?? `Stage ${stage}`}
    </span>
  );
}

function HeatBadge({ heat }: { heat: "hot" | "warm" | "cold" | null }) {
  if (!heat)
    return <span style={{ color: "#444", fontSize: 11 }}>--</span>;
  const cfg = {
    hot: {
      bg: "#E0525222",
      border: "#E0525244",
      color: "#E05252",
      label: "HOT",
    },
    warm: {
      bg: "#E8A83822",
      border: "#E8A83844",
      color: "#E8A838",
      label: "WARM",
    },
    cold: {
      bg: "#4A90D922",
      border: "#4A90D944",
      color: "#4A90D9",
      label: "COLD",
    },
  }[heat];
  return (
    <span
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.05em",
      }}
    >
      {cfg.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null)
    return <span style={{ color: "#444", fontSize: 11 }}>--</span>;
  const color =
    score >= 70 ? "#E05252" : score >= 45 ? "#E8A838" : "#4A90D9";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 48,
          height: 4,
          background: "#2A2A2A",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${score}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
          }}
        />
      </div>
      <span style={{ color, fontSize: 11, fontWeight: 600 }}>{score}</span>
    </div>
  );
}

function PipelineFunnel({ counts }: { counts: Record<number, number> }) {
  const stages = [3, 4, 5, 6, 8];
  const maxCount = Math.max(...stages.map((s) => counts[s] ?? 0), 1);
  return (
    <div
      style={{
        background: "#1A1A1A",
        border: "1px solid #2A2A2A",
        borderRadius: 12,
        padding: "1.5rem",
      }}
    >
      <h3
        style={{
          color: "#F5F5F5",
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        Active Pipeline
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stages.map((stage) => {
          const count = counts[stage] ?? 0;
          const pct = Math.round((count / maxCount) * 100);
          return (
            <div key={stage}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ color: "#888", fontSize: 12 }}>
                  {STAGE_LABELS[stage]}
                </span>
                <span
                  style={{
                    color: STAGE_COLORS[stage] ?? "#888",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              </div>
              <div
                style={{
                  background: "#0A0A0A",
                  borderRadius: 4,
                  height: 6,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    background: STAGE_COLORS[stage] ?? "#555",
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BlockerCard({ blocker }: { blocker: Blocker }) {
  const typeColors: Record<string, string> = {
    missing_link: "#E8A838",
    escalation: "#E05252",
    arber_handoff: "#7B68EE",
    other: "#888",
  };
  const color = typeColors[blocker.blocker_type ?? "other"] ?? "#888";
  return (
    <div
      style={{
        background: "#0A0A0A",
        border: `1px solid ${color}33`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            color,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {blocker.blocker_type?.replace("_", " ") ?? "other"}
        </span>
        <span style={{ color: "#555", fontSize: 11 }}>
          {formatDate(blocker.created_at)}
        </span>
      </div>
      <p
        style={{
          color: "#F5F5F5",
          fontSize: 13,
          marginBottom: blocker.lead_name ? 6 : 0,
        }}
      >
        {blocker.description}
      </p>
      {blocker.lead_name && (
        <p style={{ color: "#666", fontSize: 12 }}>
          Lead: {blocker.lead_name}
          {blocker.lead_handle ? ` (@${blocker.lead_handle})` : ""}
        </p>
      )}
    </div>
  );
}

function ActivityFeed({
  conversations,
}: {
  conversations: ConversationWithLead[];
}) {
  if (conversations.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 0" }}>
        <p style={{ color: "#555", fontSize: 13 }}>
          No conversations yet. Waiting for first DM.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {conversations.map((msg) => {
        const isOut = msg.direction === "outbound";
        const lead = msg.dm_leads;
        const preview =
          msg.message_text.length > 120
            ? msg.message_text.slice(0, 120) + "..."
            : msg.message_text;
        return (
          <div
            key={msg.id}
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 12px",
              background: "#0A0A0A",
              borderRadius: 8,
              borderLeft: `3px solid ${isOut ? "#D9FC6766" : "#4A90D966"}`,
            }}
          >
            <div style={{ width: 20, flexShrink: 0, paddingTop: 1 }}>
              <span style={{ fontSize: 12 }}>{isOut ? ">" : "<"}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    color: "#F5F5F5",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {lead?.name ?? "Unknown"}
                </span>
                {lead?.handle && (
                  <span style={{ color: "#555", fontSize: 11 }}>
                    @{lead.handle}
                  </span>
                )}
                {isOut && msg.ai_generated && (
                  <span
                    style={{
                      background: "#D9FC6711",
                      border: "1px solid #D9FC6733",
                      color: "#D9FC67",
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}
                  >
                    Alberto
                  </span>
                )}
                {lead?.stage && <StageBadge stage={lead.stage} />}
              </div>
              <p
                style={{
                  color: isOut ? "#AAA" : "#888",
                  fontSize: 12,
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {preview}
              </p>
            </div>
            <div
              style={{
                flexShrink: 0,
                color: "#444",
                fontSize: 11,
                paddingTop: 1,
                whiteSpace: "nowrap",
              }}
            >
              {formatDateTime(msg.sent_at)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── NEW: Today's Activity Pulse ─────────────────────────────────────────────

function TodayPulseSection({ pulse }: { pulse: TodayPulse }) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            background: "#D9FC67",
            borderRadius: "50%",
            display: "inline-block",
            boxShadow: "0 0 8px #D9FC6766",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
        <span
          style={{
            color: "#D9FC67",
            fontSize: 13,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Today
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        <PulseCard
          label="Messages in"
          value={pulse.messagesIn}
          icon="<"
          accentColor="#4A90D9"
        />
        <PulseCard
          label="Messages out"
          value={pulse.messagesOut}
          icon=">"
          accentColor="#D9FC67"
        />
        <PulseCard
          label="New leads"
          value={pulse.newLeads}
          icon="+"
          accentColor="#7B68EE"
        />
        <PulseCard
          label="Avg AI latency"
          value={formatLatency(pulse.avgResponseTimeMs)}
          icon="~"
          accentColor="#E8A838"
        />
      </div>
    </div>
  );
}

// ── NEW: Path Breakdown ─────────────────────────────────────────────────────

function PathBreakdownSection({ breakdown }: { breakdown: PathBreakdown }) {
  const total = breakdown.hot + breakdown.warm + breakdown.cold + breakdown.unscored;
  if (total === 0) return null;

  const paths = [
    {
      label: "High Ticket",
      heat: "HOT",
      count: breakdown.hot,
      color: "#E05252",
    },
    {
      label: "Low Ticket",
      heat: "WARM",
      count: breakdown.warm,
      color: "#E8A838",
    },
    {
      label: "Free",
      heat: "COLD",
      count: breakdown.cold,
      color: "#4A90D9",
    },
    {
      label: "Unscored",
      heat: "--",
      count: breakdown.unscored,
      color: "#555",
    },
  ];

  return (
    <div
      style={{
        background: "#1A1A1A",
        border: "1px solid #2A2A2A",
        borderRadius: 12,
        padding: "1.5rem",
      }}
    >
      <h3
        style={{
          color: "#F5F5F5",
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        Path Breakdown
      </h3>
      {/* Stacked bar */}
      <div
        style={{
          display: "flex",
          height: 8,
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 20,
          background: "#0A0A0A",
        }}
      >
        {paths.map((p) => {
          const pct = total > 0 ? (p.count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={p.heat}
              style={{
                width: `${pct}%`,
                height: "100%",
                background: p.color,
              }}
            />
          );
        })}
      </div>
      {/* Legend rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {paths.map((p) => {
          const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
          return (
            <div
              key={p.heat}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: p.color,
                    display: "inline-block",
                  }}
                />
                <span style={{ color: "#CCC", fontSize: 13 }}>
                  {p.label}
                </span>
                <span
                  style={{
                    color: p.color,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                  }}
                >
                  {p.heat}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{ color: p.color, fontSize: 14, fontWeight: 600 }}
                >
                  {p.count}
                </span>
                <span style={{ color: "#666", fontSize: 11, width: 32, textAlign: "right" }}>
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── NEW: Conversion Funnel Metrics ──────────────────────────────────────────

function ConversionFunnelSection({ funnel }: { funnel: ConversionFunnel }) {
  const steps = [
    {
      from: "Engaged",
      to: "Qualifying",
      rate: funnel.engagedToQualifying,
      fromCount: funnel.engaged,
      toCount: funnel.qualifying,
    },
    {
      from: "Qualifying",
      to: "Calendly Sent",
      rate: funnel.qualifyingToCalendly,
      fromCount: funnel.qualifying,
      toCount: funnel.calendlySent,
    },
    {
      from: "Calendly Sent",
      to: "Booked",
      rate: funnel.calendlyToBooked,
      fromCount: funnel.calendlySent,
      toCount: funnel.booked,
    },
  ];

  return (
    <div
      style={{
        background: "#1A1A1A",
        border: "1px solid #2A2A2A",
        borderRadius: 12,
        padding: "1.5rem",
      }}
    >
      <h3
        style={{
          color: "#F5F5F5",
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        Conversion Rates
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {steps.map((step) => {
          const rate = step.rate ?? 0;
          const barColor =
            rate >= 50 ? "#D9FC67" : rate >= 25 ? "#E8A838" : "#E05252";
          return (
            <div key={step.from + step.to}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ color: "#888", fontSize: 12 }}>
                  {step.from} &rarr; {step.to}
                </span>
                <span
                  style={{
                    color: barColor,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {step.rate !== null ? `${step.rate}%` : "--"}
                </span>
              </div>
              <div
                style={{
                  background: "#0A0A0A",
                  borderRadius: 4,
                  height: 6,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    background: barColor,
                    width: `${rate}%`,
                    height: "100%",
                    borderRadius: 4,
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 2,
                }}
              >
                <span style={{ color: "#555", fontSize: 10 }}>
                  {step.fromCount} leads
                </span>
                <span style={{ color: "#555", fontSize: 10 }}>
                  {step.toCount} converted
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {/* Overall */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: "1px solid #2A2A2A",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            color: "#CCC",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Overall: DMs to Booked
        </span>
        <span
          style={{
            color: "#D9FC67",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {funnel.dmsToBooked !== null ? `${funnel.dmsToBooked}%` : "--"}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 2,
        }}
      >
        <span style={{ color: "#555", fontSize: 10 }}>
          {funnel.totalDMs} total leads
        </span>
        <span style={{ color: "#555", fontSize: 10 }}>
          {funnel.booked} booked
        </span>
      </div>
    </div>
  );
}

// ── NEW: Response Time Chart ────────────────────────────────────────────────

function ResponseTimeChart({ data }: { data: HourlyLatency[] }) {
  const currentHour = new Date().getHours();
  // Reorder so chart starts 24h ago
  const ordered: HourlyLatency[] = [];
  for (let i = 1; i <= 24; i++) {
    const h = (currentHour + i) % 24;
    const entry = data.find((d) => d.hour === h);
    ordered.push(entry ?? { hour: h, avgMs: 0, count: 0 });
  }

  const maxMs = Math.max(...ordered.map((d) => d.avgMs), 1);
  const chartHeight = 120;

  return (
    <div
      style={{
        background: "#1A1A1A",
        border: "1px solid #2A2A2A",
        borderRadius: 12,
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            color: "#F5F5F5",
            fontWeight: 600,
            fontSize: 14,
            margin: 0,
          }}
        >
          AI Response Time (24h)
        </h3>
        <span style={{ color: "#555", fontSize: 11 }}>
          avg latency per hour
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          height: chartHeight,
          paddingBottom: 20,
          position: "relative",
        }}
      >
        {ordered.map((entry, i) => {
          const barH =
            entry.avgMs > 0
              ? Math.max((entry.avgMs / maxMs) * (chartHeight - 20), 4)
              : 0;
          const isNow = entry.hour === currentHour;
          const barColor = isNow
            ? "#D9FC67"
            : entry.avgMs > 3000
              ? "#E05252"
              : entry.avgMs > 1500
                ? "#E8A838"
                : "#4A90D9";
          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                position: "relative",
              }}
              title={`${formatHour(entry.hour)}: ${entry.avgMs > 0 ? formatLatency(entry.avgMs) : "no data"} (${entry.count} calls)`}
            >
              {barH > 0 && (
                <div
                  style={{
                    width: "100%",
                    maxWidth: 14,
                    height: barH,
                    background: barColor,
                    borderRadius: "2px 2px 0 0",
                    opacity: isNow ? 1 : 0.7,
                    transition: "height 0.5s ease",
                  }}
                />
              )}
              {i % 4 === 0 && (
                <span
                  style={{
                    position: "absolute",
                    bottom: -18,
                    fontSize: 9,
                    color: isNow ? "#D9FC67" : "#555",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatHour(entry.hour)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Scale labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid #1E1E1E",
        }}
      >
        <span style={{ color: "#444", fontSize: 10 }}>0ms</span>
        <span style={{ color: "#444", fontSize: 10 }}>
          {formatLatency(maxMs)}
        </span>
      </div>
    </div>
  );
}

// ── Refresh Indicator ───────────────────────────────────────────────────────

function RefreshIndicator({
  timestamp,
  loading,
}: {
  timestamp: string | null;
  loading: boolean;
}) {
  const [secsAgo, setSecsAgo] = useState(0);

  useEffect(() => {
    if (!timestamp) return;
    const tick = () => setSecsAgo(secondsAgo(timestamp));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {loading && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#D9FC67",
            animation: "pulse 1s ease-in-out infinite",
          }}
        />
      )}
      <span style={{ color: "#555", fontSize: 11 }}>
        {timestamp
          ? `Last refreshed: ${formatSecondsAgo(secsAgo)}`
          : "Loading..."}
      </span>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [dbError, setDbError] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch("/api/dashboard", { cache: "no-store" });
      if (!resp.ok) {
        setDbError(true);
        return;
      }
      const json: DashboardData = await resp.json();
      setData(json);
      setDbError(false);
    } catch {
      setDbError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRevenue = useCallback(async () => {
    try {
      const resp = await fetch("/api/revenue");
      if (resp.ok) {
        const json: RevenueData = await resp.json();
        setRevenue(json);
      }
    } catch {
      // Revenue is optional, don't error the whole dashboard
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchRevenue();
    const dataInterval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    // Revenue refreshes every 10 minutes (it hits HubSpot API)
    const revenueInterval = setInterval(fetchRevenue, 600_000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(revenueInterval);
    };
  }, [fetchData, fetchRevenue]);

  // Derived values
  const leads = data?.leads ?? [];
  const hotLeads = data?.hotLeads ?? [];
  const sessions = data?.sessions ?? [];
  const bookings = data?.bookings ?? [];
  const blockers = data?.blockers ?? [];
  const albertoStats = data?.albertoStats ?? {
    repliesToday: 0,
    repliesThisWeek: 0,
    avgLatencyMs: null,
    escalationsOpen: 0,
  };
  const recentConversations = data?.recentConversations ?? [];
  const todayPulse = data?.todayPulse ?? {
    messagesIn: 0,
    messagesOut: 0,
    newLeads: 0,
    avgResponseTimeMs: null,
  };
  const pathBreakdown = data?.pathBreakdown ?? {
    hot: 0,
    warm: 0,
    cold: 0,
    unscored: 0,
  };
  const conversionFunnel = data?.conversionFunnel ?? {
    engaged: 0,
    qualifying: 0,
    calendlySent: 0,
    booked: 0,
    totalDMs: 0,
    engagedToQualifying: null,
    qualifyingToCalendly: null,
    calendlyToBooked: null,
    dmsToBooked: null,
  };
  const hourlyLatency = data?.hourlyLatency ?? [];

  const counts = stageCounts(leads);
  const weekly = weeklyStats(sessions);
  const monthly = monthlyStats(sessions);
  const confirmedBookings = bookings.filter(
    (b) => b.status === "booked" || b.status === "completed"
  );
  const latencyLabel = albertoStats.avgLatencyMs
    ? albertoStats.avgLatencyMs >= 1000
      ? `${(albertoStats.avgLatencyMs / 1000).toFixed(1)}s`
      : `${albertoStats.avgLatencyMs}ms`
    : "--";

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @media (max-width: 768px) {
          .grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
          .grid-2 { grid-template-columns: 1fr !important; }
          .grid-3 { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .grid-4 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "2rem",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: "#D9FC67",
                  borderRadius: "50%",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  color: "#888",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Founder OS / Instagram DMs
              </span>
            </div>
            <h1
              style={{
                color: "#F5F5F5",
                fontSize: 28,
                fontWeight: 700,
                margin: 0,
              }}
            >
              War Room
            </h1>
            <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              Matt Gray / Instagram DMs
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <RefreshIndicator
              timestamp={data?.timestamp ?? null}
              loading={loading}
            />
            <p
              style={{
                color: "#555",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginTop: 8,
              }}
            >
              Operator
            </p>
            <p style={{ color: "#F5F5F5", fontSize: 14, fontWeight: 600 }}>
              Nicolas
            </p>
          </div>
        </div>

        {dbError && (
          <div
            style={{
              background: "#E0525222",
              border: "1px solid #E0525244",
              borderRadius: 8,
              padding: "1rem",
              marginBottom: "2rem",
            }}
          >
            <p style={{ color: "#E05252", fontSize: 13 }}>
              Database not connected. Run{" "}
              <code>migrations/001_create_dm_tables.sql</code> in the Supabase
              SQL editor at{" "}
              <a
                href="https://supabase.com/dashboard/project/xzmntpwwccmpkgeprodj/sql"
                style={{ color: "#D9FC67" }}
              >
                supabase.com/dashboard/project/xzmntpwwccmpkgeprodj/sql
              </a>
            </p>
          </div>
        )}

        {/* ═══ NEW: Today's Activity Pulse ═══ */}
        <TodayPulseSection pulse={todayPulse} />

        {/* Alberto Live Stats */}
        <p
          style={{
            color: "#555",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          Alberto -- 24/7 AI Setter
        </p>
        <div
          className="grid-4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: "2.5rem",
          }}
        >
          <KPICard
            label="AI replies today"
            value={albertoStats.repliesToday}
            highlight={albertoStats.repliesToday > 0}
          />
          <KPICard
            label="AI replies this week"
            value={albertoStats.repliesThisWeek}
          />
          <KPICard
            label="Avg response time"
            value={latencyLabel}
            sub="Claude API latency"
          />
          <KPICard
            label="Open escalations"
            value={albertoStats.escalationsOpen}
            highlight={albertoStats.escalationsOpen > 0}
            sub={
              albertoStats.escalationsOpen > 0
                ? "Needs your review"
                : undefined
            }
          />
        </div>

        {/* Weekly KPIs */}
        <p
          style={{
            color: "#555",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          This Week
        </p>
        <div
          className="grid-4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: "1.5rem",
          }}
        >
          <KPICard label="Sessions run" value={weekly.sessions} />
          <KPICard label="DMs sent / replied" value={weekly.dms} />
          <KPICard label="Links sent" value={weekly.sets} sub="Calendly links" />
          <KPICard
            label="Calls booked"
            value={weekly.booked}
            highlight={weekly.booked > 0}
          />
        </div>

        {/* Monthly KPIs */}
        <p
          style={{
            color: "#555",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          This Month
        </p>
        <div
          className="grid-4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: "2.5rem",
          }}
        >
          <KPICard label="Sessions run" value={monthly.sessions} />
          <KPICard label="DMs sent / replied" value={monthly.dms} />
          <KPICard label="Links sent" value={monthly.sets} />
          <KPICard
            label="Calls booked"
            value={monthly.booked}
            highlight={monthly.booked > 0}
          />
        </div>

        {/* ═══ NEW: Pipeline + Path Breakdown + Conversion Funnel ═══ */}
        <div
          className="grid-3"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 20,
            marginBottom: "2.5rem",
          }}
        >
          <PipelineFunnel counts={counts} />
          <PathBreakdownSection breakdown={pathBreakdown} />
          <ConversionFunnelSection funnel={conversionFunnel} />
        </div>

        {/* ═══ NEW: Response Time Chart ═══ */}
        <div style={{ marginBottom: "2.5rem" }}>
          <ResponseTimeChart data={hourlyLatency} />
        </div>

        {/* Blockers */}
        <div
          style={{
            background: "#1A1A1A",
            border: "1px solid #2A2A2A",
            borderRadius: 12,
            padding: "1.5rem",
            marginBottom: "2.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h3
              style={{
                color: "#F5F5F5",
                fontWeight: 600,
                fontSize: 14,
                margin: 0,
              }}
            >
              What Alberto Needs from Nicolas
            </h3>
            {blockers.length > 0 && (
              <span
                style={{
                  background: "#E8A83822",
                  color: "#E8A838",
                  border: "1px solid #E8A83844",
                  borderRadius: 20,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {blockers.length} open
              </span>
            )}
          </div>
          {blockers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  background: "#D9FC67",
                  borderRadius: "50%",
                  marginBottom: 8,
                }}
              />
              <p style={{ color: "#555", fontSize: 13 }}>
                All clear. No open blockers.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {blockers.map((b) => (
                <BlockerCard key={b.id} blocker={b} />
              ))}
            </div>
          )}
        </div>

        {/* Hot Leads */}
        {hotLeads.length > 0 && (
          <div
            style={{
              background: "#1A1A1A",
              border: "1px solid #E0525233",
              borderRadius: 12,
              padding: "1.5rem",
              marginBottom: "2.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: "#E05252",
                    borderRadius: "50%",
                    display: "inline-block",
                    boxShadow: "0 0 6px #E05252",
                  }}
                />
                <h3
                  style={{
                    color: "#E05252",
                    fontWeight: 700,
                    fontSize: 14,
                    margin: 0,
                  }}
                >
                  Hot Leads -- Act Now
                </h3>
              </div>
              <span
                style={{ color: "#E05252", fontSize: 12, fontWeight: 600 }}
              >
                {hotLeads.length} hot
              </span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {hotLeads.map((lead) => (
                <div
                  key={lead.id}
                  style={{
                    background: "#0A0A0A",
                    border: "1px solid #E0525222",
                    borderRadius: 8,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <span
                      style={{
                        color: "#F5F5F5",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {lead.name}
                    </span>
                    {lead.handle && (
                      <span
                        style={{
                          color: "#666",
                          fontSize: 12,
                          marginLeft: 8,
                        }}
                      >
                        @{lead.handle}
                      </span>
                    )}
                    {lead.bottleneck && (
                      <span
                        style={{
                          color: "#888",
                          fontSize: 12,
                          marginLeft: 12,
                        }}
                      >
                        {lead.bottleneck}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <StageBadge stage={lead.stage} />
                    <ScoreBar score={lead.lead_score ?? null} />
                    <span style={{ color: "#555", fontSize: 11 }}>
                      {lead.last_reply_at
                        ? formatDate(lead.last_reply_at)
                        : lead.last_contact
                          ? formatDate(lead.last_contact)
                          : "--"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alberto Activity Feed */}
        <div
          style={{
            background: "#1A1A1A",
            border: "1px solid #2A2A2A",
            borderRadius: 12,
            padding: "1.5rem",
            marginBottom: "2.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: "#D9FC67",
                  borderRadius: "50%",
                  display: "inline-block",
                  boxShadow: "0 0 6px #D9FC67",
                }}
              />
              <h3
                style={{
                  color: "#F5F5F5",
                  fontWeight: 600,
                  fontSize: 14,
                  margin: 0,
                }}
              >
                Alberto Activity
              </h3>
            </div>
            <span style={{ color: "#555", fontSize: 12 }}>
              last 30 messages
            </span>
          </div>
          <ActivityFeed conversations={recentConversations} />
        </div>

        {/* Active Leads */}
        <div
          style={{
            background: "#1A1A1A",
            border: "1px solid #2A2A2A",
            borderRadius: 12,
            padding: "1.5rem",
            marginBottom: "2.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h3
              style={{
                color: "#F5F5F5",
                fontWeight: 600,
                fontSize: 14,
                margin: 0,
              }}
            >
              Active Leads
            </h3>
            <span style={{ color: "#888", fontSize: 12 }}>
              {leads.length} total
            </span>
          </div>
          {leads.length === 0 ? (
            <p
              style={{
                color: "#555",
                fontSize: 13,
                textAlign: "center",
                padding: "2rem 0",
              }}
            >
              No active leads yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2A2A2A" }}>
                    {[
                      "Name",
                      "Handle",
                      "Heat",
                      "Score",
                      "Stage",
                      "Bottleneck",
                      "Last Reply",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 12px",
                          color: "#555",
                          fontSize: 11,
                          textAlign: "left",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          fontWeight: 500,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      style={{ borderBottom: "1px solid #1E1E1E" }}
                    >
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#F5F5F5",
                          fontSize: 13,
                        }}
                      >
                        {lead.name}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#888",
                          fontSize: 12,
                        }}
                      >
                        @{lead.handle ?? "--"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <HeatBadge heat={lead.funnel_heat ?? null} />
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <ScoreBar score={lead.lead_score ?? null} />
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <StageBadge stage={lead.stage} />
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#666",
                          fontSize: 12,
                          maxWidth: 200,
                        }}
                      >
                        {lead.bottleneck ?? lead.what_they_said ?? "--"}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#666",
                          fontSize: 12,
                        }}
                      >
                        {lead.last_reply_at
                          ? formatDate(lead.last_reply_at)
                          : lead.last_contact
                            ? formatDate(lead.last_contact)
                            : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bookings */}
        <div
          style={{
            background: "#1A1A1A",
            border: "1px solid #2A2A2A",
            borderRadius: 12,
            padding: "1.5rem",
            marginBottom: "2.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h3
              style={{
                color: "#F5F5F5",
                fontWeight: 600,
                fontSize: 14,
                margin: 0,
              }}
            >
              Bookings Set by Alberto
            </h3>
            <span
              style={{ color: "#D9FC67", fontSize: 12, fontWeight: 600 }}
            >
              {confirmedBookings.length} confirmed
            </span>
          </div>
          {bookings.length === 0 ? (
            <p
              style={{
                color: "#555",
                fontSize: 13,
                textAlign: "center",
                padding: "2rem 0",
              }}
            >
              No bookings yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2A2A2A" }}>
                    {["Lead", "Handle", "Call Time", "Status", "Outcome"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            color: "#555",
                            fontSize: 11,
                            textAlign: "left",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            fontWeight: 500,
                          }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const statusColor =
                      b.status === "booked"
                        ? "#D9FC67"
                        : b.status === "completed"
                          ? "#52C87A"
                          : b.status === "no_show"
                            ? "#E05252"
                            : "#888";
                    return (
                      <tr
                        key={b.id}
                        style={{ borderBottom: "1px solid #1E1E1E" }}
                      >
                        <td
                          style={{
                            padding: "10px 12px",
                            color: "#F5F5F5",
                            fontSize: 13,
                          }}
                        >
                          {b.lead_name ?? "--"}
                        </td>
                        <td
                          style={{
                            padding: "10px 12px",
                            color: "#888",
                            fontSize: 12,
                          }}
                        >
                          @{b.lead_handle ?? "--"}
                        </td>
                        <td
                          style={{
                            padding: "10px 12px",
                            color: "#888",
                            fontSize: 12,
                          }}
                        >
                          {b.event_start
                            ? formatDateTime(b.event_start)
                            : "--"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              color: statusColor,
                              fontSize: 12,
                              fontWeight: 500,
                              textTransform: "capitalize",
                            }}
                          >
                            {b.status.replace("_", " ")}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "10px 12px",
                            color: "#666",
                            fontSize: 12,
                          }}
                        >
                          {b.outcome ?? "--"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Session Log */}
        <div
          style={{
            background: "#1A1A1A",
            border: "1px solid #2A2A2A",
            borderRadius: 12,
            padding: "1.5rem",
            marginBottom: "2.5rem",
          }}
        >
          <h3
            style={{
              color: "#F5F5F5",
              fontWeight: 600,
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            Session History
          </h3>
          {sessions.length === 0 ? (
            <p
              style={{
                color: "#555",
                fontSize: 13,
                textAlign: "center",
                padding: "2rem 0",
              }}
            >
              No sessions logged yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2A2A2A" }}>
                    {[
                      "Date",
                      "Leads",
                      "DMs",
                      "Links Sent",
                      "Booked",
                      "Summary",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 12px",
                          color: "#555",
                          fontSize: 11,
                          textAlign: ["Date", "Summary"].includes(h)
                            ? "left"
                            : "center",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          fontWeight: 500,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      style={{ borderBottom: "1px solid #1E1E1E" }}
                    >
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#F5F5F5",
                          fontSize: 13,
                        }}
                      >
                        {formatDate(s.session_date)}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#888",
                          fontSize: 13,
                          textAlign: "center",
                        }}
                      >
                        {s.total_leads_worked}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#888",
                          fontSize: 13,
                          textAlign: "center",
                        }}
                      >
                        {(s.replies_handled ?? 0) + (s.new_conversations ?? 0)}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#E8A838",
                          fontSize: 13,
                          textAlign: "center",
                        }}
                      >
                        {s.calendly_links_sent}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#D9FC67",
                          fontSize: 13,
                          textAlign: "center",
                          fontWeight: s.bookings_confirmed > 0 ? 600 : 400,
                        }}
                      >
                        {s.bookings_confirmed}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#666",
                          fontSize: 12,
                          maxWidth: 240,
                        }}
                      >
                        {s.summary ?? "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Revenue Section */}
        {revenue && (
          <div
            style={{
              background: "#1A1A1A",
              border: "1px solid #2A2A2A",
              borderRadius: 12,
              padding: "1.5rem",
              marginBottom: "2.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 20,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: "#D9FC67",
                  borderRadius: "50%",
                  display: "inline-block",
                }}
              />
              <h3
                style={{
                  color: "#F5F5F5",
                  fontWeight: 600,
                  fontSize: 14,
                  margin: 0,
                }}
              >
                Revenue Tracker
              </h3>
            </div>

            {/* OS Light */}
            <p
              style={{
                color: "#555",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 12,
              }}
            >
              Founder OS Light ($197)
            </p>
            <div
              className="grid-4"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
                marginBottom: 24,
              }}
            >
              <KPICard
                label="All time purchases"
                value={revenue.os_light.total_all_time.toLocaleString()}
              />
              <KPICard
                label="All time revenue"
                value={formatRevenue(revenue.os_light.revenue_all_time)}
                highlight
              />
              <KPICard
                label="This month"
                value={`${revenue.os_light.total_this_month} purchases`}
                sub={formatRevenue(revenue.os_light.revenue_this_month)}
              />
              <KPICard
                label="This week"
                value={`${revenue.os_light.total_this_week} purchases`}
                sub={formatRevenue(revenue.os_light.revenue_this_week)}
              />
            </div>

            {/* Recent OS Light buyers */}
            {revenue.os_light.recent.length > 0 && (
              <div>
                <p
                  style={{
                    color: "#555",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 10,
                  }}
                >
                  Recent buyers this week
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {revenue.os_light.recent.map((r, i) => (
                    <span
                      key={i}
                      style={{
                        background: "#D9FC6711",
                        border: "1px solid #D9FC6733",
                        borderRadius: 6,
                        padding: "3px 10px",
                        fontSize: 12,
                        color: "#D9FC67",
                      }}
                    >
                      {r.name}{" "}
                      <span style={{ color: "#555" }}>{r.date}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sales Pipeline */}
            {revenue.sales_pipeline.closed_won_total > 0 && (
              <div
                style={{
                  marginTop: 24,
                  paddingTop: 20,
                  borderTop: "1px solid #2A2A2A",
                }}
              >
                <p
                  style={{
                    color: "#555",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 12,
                  }}
                >
                  Sales Pipeline 2026 -- Closed Won
                </p>
                <div
                  className="grid-2"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 16,
                  }}
                >
                  <KPICard
                    label="Deals closed"
                    value={revenue.sales_pipeline.closed_won_total}
                  />
                  <KPICard
                    label="Revenue"
                    value={formatRevenue(
                      revenue.sales_pipeline.closed_won_revenue
                    )}
                    highlight
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <p
          style={{
            color: "#333",
            fontSize: 11,
            textAlign: "center",
            marginTop: "3rem",
          }}
        >
          Alberto v1 / FOS DM Setter / Matt Gray Instagram
        </p>
      </div>
    </>
  );
}
