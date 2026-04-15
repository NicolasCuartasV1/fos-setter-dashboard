"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ChatWidget from "./dashboard/ChatWidget";
import { BaseChart } from "./dashboard/charts/BaseChart";
import {
  buildWeeklyBookingsOption,
  buildPlatformBreakdownOption,
  buildFunnelOption,
  buildDailyActivityOption,
} from "@/lib/dm-chart-utils";
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

type TabId = "pipeline" | "conversations" | "analytics" | "settings";
type SortKey =
  | "name"
  | "handle"
  | "platform"
  | "funnel_heat"
  | "lead_score"
  | "stage"
  | "last_reply_at";
type SortDir = "asc" | "desc";

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
  1: "bg-gray-500/20 text-gray-400 border-gray-500/40",
  2: "bg-gray-500/20 text-gray-400 border-gray-500/40",
  3: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  4: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  5: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  6: "bg-lime/20 text-lime border-lime/40",
  7: "bg-lime/20 text-lime border-lime/40",
  8: "bg-red-500/20 text-red-300 border-red-500/40",
  9: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  10: "bg-gray-500/20 text-gray-400 border-gray-500/40",
};

const HEAT_COLORS = {
  hot: "bg-lime/20 text-lime border-lime/40",
  warm: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  cold: "bg-blue-500/20 text-blue-300 border-blue-500/40",
} as const;

const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  instagram: { bg: "bg-pink-500/20", text: "text-pink-300", border: "border-pink-500/40" },
  linkedin: { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/40" },
  x: { bg: "bg-white/10", text: "text-white", border: "border-white/20" },
};

const COLUMN_DEFS = [
  { id: "name", label: "Name", sortKey: "name" as SortKey },
  { id: "handle", label: "Handle", sortKey: "handle" as SortKey },
  { id: "platform", label: "Platform", sortKey: "platform" as SortKey },
  { id: "funnel_heat", label: "Heat", sortKey: "funnel_heat" as SortKey },
  { id: "lead_score", label: "Score", sortKey: "lead_score" as SortKey },
  { id: "stage", label: "Stage", sortKey: "stage" as SortKey },
  { id: "bottleneck", label: "Bottleneck", sortKey: null },
  {
    id: "last_reply_at",
    label: "Last Reply",
    sortKey: "last_reply_at" as SortKey,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
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

// ── Subcomponents ───────────────────────────────────────────────────────────

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
    <div className="flex items-center gap-2">
      {loading && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-lime"
          style={{ animation: "pulse-glow 1s ease-in-out infinite" }}
        />
      )}
      <span className="text-muted text-[11px]">
        {timestamp ? formatSecondsAgo(secsAgo) : "Loading..."}
      </span>
    </div>
  );
}

function KPICard({
  label,
  value,
  sub,
  highlight,
  tooltip,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
  tooltip?: string;
}) {
  return (
    <div
      className={`bg-card rounded-xl p-5 transition-colors group relative ${
        highlight ? "border border-lime/30" : "border border-border"
      }`}
    >
      <p className="text-muted text-[11px] uppercase tracking-wider mb-2">
        {label}
        {tooltip && <span className="ml-1 text-muted/50 cursor-help" title={tooltip}>?</span>}
      </p>
      <p
        className={`text-2xl font-bold leading-none ${
          highlight ? "text-lime" : "text-white"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-muted text-[11px] mt-1.5">{sub}</p>}
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#111] border border-border rounded-lg text-[10px] text-muted leading-relaxed max-w-[220px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal">
          {tooltip}
        </div>
      )}
    </div>
  );
}

function StageBadge({ stage }: { stage: number }) {
  const classes = STAGE_COLORS[stage] ?? STAGE_COLORS[1];
  return (
    <span
      className={`${classes} text-[10px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap`}
    >
      {STAGE_LABELS[stage] ?? `Stage ${stage}`}
    </span>
  );
}

function HeatBadge({ heat }: { heat: "hot" | "warm" | "cold" | null }) {
  if (!heat) return <span className="text-muted text-[11px]">--</span>;
  const classes = HEAT_COLORS[heat];
  const label = heat.toUpperCase();
  return (
    <span
      className={`${classes} text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full border`}
    >
      {label}
    </span>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted text-[11px]">--</span>;
  const color =
    score >= 70
      ? "bg-red-400"
      : score >= 45
        ? "bg-amber-400"
        : "bg-blue-400";
  const textColor =
    score >= 70
      ? "text-red-400"
      : score >= 45
        ? "text-amber-400"
        : "text-blue-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`${textColor} text-[11px] font-semibold`}>{score}</span>
    </div>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const p = (platform ?? "instagram").toLowerCase();
  const colors = PLATFORM_COLORS[p] ?? PLATFORM_COLORS.instagram;
  const label = p === "x" ? "X" : p.charAt(0).toUpperCase() + p.slice(1);
  return (
    <span
      className={`${colors.bg} ${colors.text} ${colors.border} text-[10px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap`}
    >
      {label}
    </span>
  );
}

// ── Column Toggle (matching VideoTable pattern) ─────────────────────────────

function ColumnToggle({
  hiddenCols,
  onToggle,
}: {
  hiddenCols: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="border border-border text-muted hover:text-white hover:border-lime text-xs font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
        </svg>
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-xl p-3 w-44 shadow-xl">
          <p className="text-[10px] text-muted font-semibold uppercase tracking-wider mb-2">
            Toggle Columns
          </p>
          <div className="space-y-1">
            {COLUMN_DEFS.map((col) => (
              <label
                key={col.id}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={!hiddenCols.has(col.id)}
                  onChange={() => onToggle(col.id)}
                  className="accent-lime"
                />
                <span className="text-xs text-white group-hover:text-lime transition-colors">
                  {col.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pipeline Tab ────────────────────────────────────────────────────────────

function PipelineTab({
  leads,
  pathBreakdown,
  conversionFunnel,
}: {
  leads: Lead[];
  pathBreakdown: PathBreakdown;
  conversionFunnel: ConversionFunnel;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lead_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());

  function toggleCol(id: string) {
    setHiddenCols((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const filtered = leads.filter(
      (l) =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        (l.handle ?? "").toLowerCase().includes(search.toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;
      switch (sortKey) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "handle":
          aVal = (a.handle ?? "").toLowerCase();
          bVal = (b.handle ?? "").toLowerCase();
          break;
        case "platform":
          aVal = (a.platform ?? "instagram").toLowerCase();
          bVal = (b.platform ?? "instagram").toLowerCase();
          break;
        case "funnel_heat": {
          const order = { hot: 3, warm: 2, cold: 1 };
          aVal = order[a.funnel_heat as keyof typeof order] ?? 0;
          bVal = order[b.funnel_heat as keyof typeof order] ?? 0;
          break;
        }
        case "lead_score":
          aVal = a.lead_score ?? 0;
          bVal = b.lead_score ?? 0;
          break;
        case "stage":
          aVal = a.stage;
          bVal = b.stage;
          break;
        case "last_reply_at":
          aVal = a.last_reply_at
            ? new Date(a.last_reply_at).getTime()
            : 0;
          bVal = b.last_reply_at
            ? new Date(b.last_reply_at).getTime()
            : 0;
          break;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [leads, search, sortKey, sortDir]);

  const visibleCols = COLUMN_DEFS.filter((c) => !hiddenCols.has(c.id));

  // Path breakdown data
  const total =
    pathBreakdown.hot +
    pathBreakdown.warm +
    pathBreakdown.cold +
    pathBreakdown.unscored;
  const paths = [
    { label: "High Ticket", heat: "HOT", count: pathBreakdown.hot, classes: "bg-lime/20 text-lime", dotColor: "bg-lime" },
    { label: "Low Ticket", heat: "WARM", count: pathBreakdown.warm, classes: "bg-amber-500/20 text-amber-300", dotColor: "bg-amber-400" },
    { label: "Free", heat: "COLD", count: pathBreakdown.cold, classes: "bg-blue-500/20 text-blue-300", dotColor: "bg-blue-400" },
    { label: "Unscored", heat: "--", count: pathBreakdown.unscored, classes: "bg-gray-500/20 text-gray-400", dotColor: "bg-gray-500" },
  ];

  // Conversion funnel steps
  const funnelSteps = [
    { from: "Engaged", to: "Qualifying", rate: conversionFunnel.engagedToQualifying, fromCount: conversionFunnel.engaged, toCount: conversionFunnel.qualifying },
    { from: "Qualifying", to: "Calendly Sent", rate: conversionFunnel.qualifyingToCalendly, fromCount: conversionFunnel.qualifying, toCount: conversionFunnel.calendlySent },
    { from: "Calendly Sent", to: "Booked", rate: conversionFunnel.calendlyToBooked, fromCount: conversionFunnel.calendlySent, toCount: conversionFunnel.booked },
  ];

  return (
    <div className="space-y-6">
      {/* Search + Column Toggle */}
      <div className="flex items-center justify-end gap-2">
        <input
          type="text"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-lime w-56 transition-colors"
        />
        <ColumnToggle hiddenCols={hiddenCols} onToggle={toggleCol} />
      </div>

      {/* Lead Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-muted uppercase tracking-wider w-8 select-none">
                  #
                </th>
                {visibleCols.map((col) => (
                  <th
                    key={col.id}
                    onClick={() => col.sortKey && toggleSort(col.sortKey)}
                    className={`px-4 py-3 text-left text-[10px] font-semibold text-muted uppercase tracking-wider select-none whitespace-nowrap transition-colors ${
                      col.sortKey
                        ? "cursor-pointer hover:text-white"
                        : ""
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.sortKey &&
                        (sortKey === col.sortKey ? (
                          <span className="text-lime">
                            {sortDir === "asc" ? "\u2191" : "\u2193"}
                          </span>
                        ) : (
                          <span className="text-muted">\u2195</span>
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleCols.length + 1}
                    className="px-4 py-12 text-center text-muted text-sm"
                  >
                    {leads.length === 0
                      ? "No active leads yet."
                      : "No leads match your search."}
                  </td>
                </tr>
              )}
              {sorted.map((lead, i) => (
                <tr
                  key={lead.id}
                  className="hover:bg-[#222] transition-colors"
                >
                  <td className="px-4 py-3 text-muted text-xs">{i + 1}</td>
                  {visibleCols.map((col) => {
                    switch (col.id) {
                      case "name":
                        return (
                          <td
                            key={col.id}
                            className="px-4 py-3 text-white font-medium text-sm"
                          >
                            {lead.name}
                          </td>
                        );
                      case "handle":
                        return (
                          <td
                            key={col.id}
                            className="px-4 py-3 text-muted text-sm"
                          >
                            @{lead.handle ?? "--"}
                          </td>
                        );
                      case "platform":
                        return (
                          <td key={col.id} className="px-4 py-3">
                            <PlatformBadge platform={lead.platform} />
                          </td>
                        );
                      case "funnel_heat":
                        return (
                          <td key={col.id} className="px-4 py-3">
                            <HeatBadge heat={lead.funnel_heat ?? null} />
                          </td>
                        );
                      case "lead_score":
                        return (
                          <td key={col.id} className="px-4 py-3">
                            <ScoreBar score={lead.lead_score ?? null} />
                          </td>
                        );
                      case "stage":
                        return (
                          <td key={col.id} className="px-4 py-3">
                            <StageBadge stage={lead.stage} />
                          </td>
                        );
                      case "bottleneck":
                        return (
                          <td
                            key={col.id}
                            className="px-4 py-3 text-muted text-xs max-w-[200px] truncate"
                          >
                            {lead.bottleneck ??
                              lead.what_they_said ??
                              "--"}
                          </td>
                        );
                      case "last_reply_at":
                        return (
                          <td
                            key={col.id}
                            className="px-4 py-3 text-muted text-xs whitespace-nowrap"
                          >
                            {lead.last_reply_at
                              ? formatDate(lead.last_reply_at)
                              : lead.last_contact
                                ? formatDate(lead.last_contact)
                                : "--"}
                          </td>
                        );
                      default:
                        return <td key={col.id} />;
                    }
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conversion Funnel + Path Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Conversion Funnel */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-5">
            Conversion Rates
          </h3>
          <div className="space-y-4">
            {funnelSteps.map((step) => {
              const rate = step.rate ?? 0;
              const barColor =
                rate >= 50
                  ? "bg-lime"
                  : rate >= 25
                    ? "bg-amber-400"
                    : "bg-red-400";
              const textColor =
                rate >= 50
                  ? "text-lime"
                  : rate >= 25
                    ? "text-amber-400"
                    : "text-red-400";
              return (
                <div key={step.from + step.to}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-muted text-xs">
                      {step.from} &rarr; {step.to}
                    </span>
                    <span className={`${textColor} text-xs font-bold`}>
                      {step.rate !== null ? `${step.rate}%` : "--"}
                    </span>
                  </div>
                  <div className="bg-background rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-500`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-muted">
                      {step.fromCount} leads
                    </span>
                    <span className="text-[10px] text-muted">
                      {step.toCount} converted
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
            <span className="text-white text-xs font-semibold">
              Overall: DMs to Booked
            </span>
            <span className="text-lime text-xl font-bold">
              {conversionFunnel.dmsToBooked !== null
                ? `${conversionFunnel.dmsToBooked}%`
                : "--"}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted">
              {conversionFunnel.totalDMs} total leads
            </span>
            <span className="text-[10px] text-muted">
              {conversionFunnel.booked} booked
            </span>
          </div>
        </div>

        {/* Path Breakdown */}
        {total > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-5">
              Path Breakdown
            </h3>
            {/* Stacked bar */}
            <div className="flex h-2 rounded-full overflow-hidden mb-5 bg-background">
              {paths.map((p) => {
                const pct = total > 0 ? (p.count / total) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={p.heat}
                    className={p.dotColor}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
            </div>
            <div className="space-y-3">
              {paths.map((p) => {
                const pct =
                  total > 0 ? Math.round((p.count / total) * 100) : 0;
                return (
                  <div
                    key={p.heat}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2 h-2 rounded-sm ${p.dotColor}`}
                      />
                      <span className="text-[#CCC] text-sm">{p.label}</span>
                      <span
                        className={`${p.classes} text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border`}
                      >
                        {p.heat}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white text-sm font-semibold">
                        {p.count}
                      </span>
                      <span className="text-muted text-[11px] w-8 text-right">
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Conversations Tab ───────────────────────────────────────────────────────

function ConversationsTab({
  conversations,
  blockers,
}: {
  conversations: ConversationWithLead[];
  blockers: Blocker[];
}) {
  return (
    <div className="space-y-6">
      {/* Blockers section */}
      {blockers.length > 0 && (
        <div className="bg-card border border-amber-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              Escalations Requiring Attention
            </h3>
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full px-3 py-0.5 text-xs font-semibold">
              {blockers.length} open
            </span>
          </div>
          <div className="space-y-2.5">
            {blockers.map((b) => {
              const typeColors: Record<string, string> = {
                missing_link: "border-l-amber-400",
                escalation: "border-l-red-400",
                arber_handoff: "border-l-violet-400",
                other: "border-l-gray-500",
              };
              const borderClass =
                typeColors[b.blocker_type ?? "other"] ??
                "border-l-gray-500";
              return (
                <div
                  key={b.id}
                  className={`bg-background border border-border ${borderClass} border-l-[3px] rounded-lg p-3.5`}
                >
                  <div className="flex justify-between mb-1.5">
                    <span className="text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                      {b.blocker_type?.replace("_", " ") ?? "other"}
                    </span>
                    <span className="text-muted text-[10px]">
                      {formatDate(b.created_at)}
                    </span>
                  </div>
                  <p className="text-white text-xs leading-relaxed">
                    {b.description}
                  </p>
                  {b.lead_name && (
                    <p className="text-muted text-[11px] mt-1">
                      Lead: {b.lead_name}
                      {b.lead_handle ? ` (@${b.lead_handle})` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 bg-lime rounded-full"
              style={{
                boxShadow: "0 0 6px #D9FC67",
              }}
            />
            <h3 className="text-sm font-semibold text-white">
              Alberto Activity
            </h3>
          </div>
          <span className="text-muted text-xs">last 30 messages</span>
        </div>
        {conversations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted text-sm">
              No conversations yet. Waiting for first DM.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
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
                  className={`flex gap-3 p-2.5 bg-background rounded-lg ${
                    isOut
                      ? "border-l-[3px] border-l-lime/40"
                      : "border-l-[3px] border-l-blue-400/40"
                  } border border-border`}
                >
                  <div className="w-5 flex-shrink-0 pt-0.5 text-center">
                    <span
                      className={`text-[11px] font-bold ${
                        isOut ? "text-lime" : "text-blue-400"
                      }`}
                    >
                      {isOut ? "\u2192" : "\u2190"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-white text-xs font-semibold">
                        {lead?.name ?? "Unknown"}
                      </span>
                      {lead?.handle && (
                        <span className="text-muted text-[11px]">
                          @{lead.handle}
                        </span>
                      )}
                      {isOut && msg.ai_generated && (
                        <span className="bg-lime/10 border border-lime/30 text-lime text-[9px] font-bold px-1.5 py-0.5 rounded">
                          Alberto
                        </span>
                      )}
                      {lead?.stage && <StageBadge stage={lead.stage} />}
                    </div>
                    <p className="text-muted text-xs leading-relaxed">
                      {preview}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-muted text-[10px] whitespace-nowrap pt-0.5">
                    {formatDateTime(msg.sent_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analytics Tab ───────────────────────────────────────────────────────────

function AnalyticsTab({
  todayPulse,
  sessions,
  bookings,
  leads,
  conversations,
  revenue,
}: {
  todayPulse: TodayPulse;
  sessions: Session[];
  bookings: Booking[];
  leads: Lead[];
  conversations: ConversationWithLead[];
  revenue: RevenueData | null;
}) {
  const confirmedBookings = bookings.filter(
    (b) => b.status === "booked" || b.status === "completed"
  );

  const weeklyBookingsOption = useMemo(() => buildWeeklyBookingsOption(sessions), [sessions]);
  const platformBreakdownOption = useMemo(() => buildPlatformBreakdownOption(leads), [leads]);
  const funnelOption = useMemo(() => buildFunnelOption(leads), [leads]);
  const dailyActivityOption = useMemo(() => buildDailyActivityOption(conversations), [conversations]);

  return (
    <div className="space-y-6">
      {/* Today's Pulse */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span
            className="w-2.5 h-2.5 bg-lime rounded-full"
            style={{
              boxShadow: "0 0 8px #D9FC6766",
              animation: "pulse-glow 2s ease-in-out infinite",
            }}
          />
          <span className="text-lime text-xs font-bold uppercase tracking-widest">
            Today&apos;s Pulse
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-blue-500/20 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-lg flex-shrink-0">
              &larr;
            </div>
            <div>
              <p className="text-blue-400 text-2xl font-bold leading-none">
                {todayPulse.messagesIn}
              </p>
              <p className="text-muted text-[10px] uppercase tracking-wider mt-1">
                Messages in
              </p>
            </div>
          </div>
          <div className="bg-card border border-lime/20 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-lime/10 flex items-center justify-center text-lime text-lg flex-shrink-0">
              &rarr;
            </div>
            <div>
              <p className="text-lime text-2xl font-bold leading-none">
                {todayPulse.messagesOut}
              </p>
              <p className="text-muted text-[10px] uppercase tracking-wider mt-1">
                Messages out
              </p>
            </div>
          </div>
          <div className="bg-card border border-violet-500/20 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 text-lg flex-shrink-0">
              +
            </div>
            <div>
              <p className="text-violet-400 text-2xl font-bold leading-none">
                {todayPulse.newLeads}
              </p>
              <p className="text-muted text-[10px] uppercase tracking-wider mt-1">
                New leads
              </p>
            </div>
          </div>
          <div className="bg-card border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 text-lg flex-shrink-0">
              ~
            </div>
            <div>
              <p className="text-amber-400 text-2xl font-bold leading-none">
                {formatLatency(todayPulse.avgResponseTimeMs)}
              </p>
              <p className="text-muted text-[10px] uppercase tracking-wider mt-1">
                Avg AI latency
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ECharts: 2x2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BaseChart
          title="Weekly Bookings"
          subtitle="Last 8 weeks"
          option={weeklyBookingsOption}
          height={280}
          empty={sessions.length === 0}
          emptyMessage="No session data yet."
        />
        <BaseChart
          title="Platform Breakdown"
          subtitle="Leads by platform and stage"
          option={platformBreakdownOption}
          height={280}
          empty={leads.length === 0}
          emptyMessage="No leads yet."
        />
        <BaseChart
          title="Conversion Funnel"
          subtitle="Pipeline progression"
          option={funnelOption}
          height={280}
          empty={leads.length === 0}
          emptyMessage="No leads yet."
        />
        <BaseChart
          title="Daily Activity"
          subtitle="Inbound / Outbound over 30 days"
          option={dailyActivityOption}
          height={280}
          empty={conversations.length === 0}
          emptyMessage="No conversation data yet."
        />
      </div>

      {/* Bookings Table */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-white">
            Bookings Set by Alberto
          </h3>
          <span className="text-lime text-xs font-semibold">
            {confirmedBookings.length} confirmed
          </span>
        </div>
        {bookings.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">
            No bookings yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Lead", "Handle", "Call Time", "Status", "Outcome"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-[10px] font-semibold text-muted uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bookings.map((b) => {
                  const statusClasses =
                    b.status === "booked"
                      ? "text-lime"
                      : b.status === "completed"
                        ? "text-emerald-400"
                        : b.status === "no_show"
                          ? "text-red-400"
                          : "text-muted";
                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-[#222] transition-colors"
                    >
                      <td className="px-4 py-2.5 text-white text-sm">
                        {b.lead_name ?? "--"}
                      </td>
                      <td className="px-4 py-2.5 text-muted text-sm">
                        @{b.lead_handle ?? "--"}
                      </td>
                      <td className="px-4 py-2.5 text-muted text-sm">
                        {b.event_start
                          ? formatDateTime(b.event_start)
                          : "--"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`${statusClasses} text-xs font-medium capitalize`}
                        >
                          {b.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted text-sm">
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

      {/* Session History */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">
          Session History
        </h3>
        {sessions.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">
            No sessions logged yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
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
                      className={`px-4 py-2 text-[10px] font-semibold text-muted uppercase tracking-wider ${
                        h === "Date" || h === "Summary"
                          ? "text-left"
                          : "text-center"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-[#222] transition-colors"
                  >
                    <td className="px-4 py-2.5 text-white text-sm">
                      {formatDate(s.session_date)}
                    </td>
                    <td className="px-4 py-2.5 text-muted text-sm text-center">
                      {s.total_leads_worked}
                    </td>
                    <td className="px-4 py-2.5 text-muted text-sm text-center">
                      {(s.replies_handled ?? 0) +
                        (s.new_conversations ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-amber-400 text-sm text-center">
                      {s.calendly_links_sent}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-sm text-center ${
                        s.bookings_confirmed > 0
                          ? "text-lime font-semibold"
                          : "text-muted"
                      }`}
                    >
                      {s.bookings_confirmed}
                    </td>
                    <td className="px-4 py-2.5 text-muted text-xs max-w-[240px] truncate">
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
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-1.5 h-1.5 bg-lime rounded-full" />
            <h3 className="text-sm font-semibold text-white">
              Revenue Tracker
            </h3>
          </div>

          {/* OS Light */}
          <p className="text-muted text-[10px] uppercase tracking-widest mb-3">
            Founder OS Light ($197)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
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

          {/* Recent buyers */}
          {revenue.os_light.recent.length > 0 && (
            <div className="mb-5">
              <p className="text-muted text-[10px] uppercase tracking-widest mb-2">
                Recent buyers this week
              </p>
              <div className="flex flex-wrap gap-2">
                {revenue.os_light.recent.map((r, i) => (
                  <span
                    key={i}
                    className="bg-lime/10 border border-lime/30 rounded-md px-2.5 py-1 text-xs text-lime"
                  >
                    {r.name}{" "}
                    <span className="text-muted">{r.date}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sales Pipeline */}
          {revenue.sales_pipeline.closed_won_total > 0 && (
            <div className="pt-5 border-t border-border">
              <p className="text-muted text-[10px] uppercase tracking-widest mb-3">
                Sales Pipeline 2026 -- Closed Won
              </p>
              <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
}

// ── Settings Tab ────────────────────────────────────────────────────────────

function SettingsTab() {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">
          Dashboard Configuration
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-1">
              Refresh Interval
            </p>
            <p className="text-white text-sm">
              30 seconds (auto-refresh enabled)
            </p>
          </div>
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-1">
              Data Source
            </p>
            <p className="text-white text-sm">
              Supabase (xzmntpwwccmpkgeprodj)
            </p>
          </div>
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-1">
              Bot Identity
            </p>
            <p className="text-white text-sm">
              Alberto (24/7 AI DM Setter)
            </p>
          </div>
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-1">
              Platform
            </p>
            <p className="text-white text-sm">
              Instagram, LinkedIn, X
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">
          Key Links
        </h3>
        <div className="space-y-3">
          {[
            {
              label: "ManyChat Live Chat",
              url: "https://app.manychat.com/fb1072081/chat",
            },
            {
              label: "Calendly Rebook (Daniel)",
              url: "https://calendly.com/danielm-founderos/brand-strategist-check-in",
            },
            {
              label: "Pre-call Page",
              url: "https://new.founderos.com/pre-call",
            },
            {
              label: "Supabase Dashboard",
              url: "https://supabase.com/dashboard/project/xzmntpwwccmpkgeprodj",
            },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-background border border-border rounded-lg hover:border-lime transition-colors group"
            >
              <span className="text-white text-sm group-hover:text-lime transition-colors">
                {link.label}
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted group-hover:text-lime transition-colors"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [dbError, setDbError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("pipeline");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
      // Revenue is optional
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchRevenue();
    const dataInterval = setInterval(fetchData, REFRESH_INTERVAL_MS);
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
  const weekly = weeklyStats(sessions);

  // Date filtering for leads
  const filteredLeads = useMemo(() => {
    if (!dateFrom && !dateTo) return leads;
    return leads.filter((l) => {
      const d = new Date(l.created_at).getTime();
      const from = dateFrom ? new Date(dateFrom).getTime() : 0;
      const to = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity;
      return d >= from && d <= to;
    });
  }, [leads, dateFrom, dateTo]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "pipeline", label: "Pipeline" },
    { id: "conversations", label: "Conversations" },
    { id: "analytics", label: "Analytics" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="relative w-2.5 h-2.5">
                <div className="absolute inset-0 rounded-full bg-lime/30 animate-ping" />
                <div
                  className="w-2.5 h-2.5 rounded-full bg-lime relative"
                  style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
                />
              </div>
              <span className="text-muted text-[11px] uppercase tracking-widest">
                Founder OS / Brand DMs
              </span>
              <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[9px] font-bold px-1.5 py-0.5 rounded">
                IG
              </span>
              <span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[9px] font-bold px-1.5 py-0.5 rounded">
                LinkedIn
              </span>
              <span className="bg-white/10 text-white border border-white/20 text-[9px] font-bold px-1.5 py-0.5 rounded">
                X
              </span>
            </div>
            <h1 className="text-xl font-semibold text-white">
              Alberto War Room
            </h1>
            <RefreshIndicator
              timestamp={data?.timestamp ?? null}
              loading={loading}
            />
          </div>

          {/* Tabs */}
          <div className="flex items-center bg-card border border-border rounded-lg p-1 gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-lime text-black"
                    : "text-muted hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-lime transition-colors"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-lime transition-colors"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-xs text-muted hover:text-white transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Error banner */}
        {dbError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
            Database not connected. Check Supabase configuration.
          </div>
        )}

        {/* 5 KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard
            label="Conversations Today"
            value={todayPulse.messagesIn + todayPulse.messagesOut}
            sub={`${todayPulse.messagesIn} in / ${todayPulse.messagesOut} out`}
            tooltip="Total DMs sent and received today across all platforms. Inbound = leads messaging us. Outbound = Alberto's replies."
          />
          <KPICard
            label="Reply Rate"
            value={(() => {
              const leadsWithReplies = filteredLeads.filter((l) => l.last_reply_at !== null).length;
              const leadsContacted = filteredLeads.filter((l) => l.stage >= 2).length;
              return leadsContacted > 0 ? `${((leadsWithReplies / leadsContacted) * 100).toFixed(1)}%` : "0%";
            })()}
            sub={`${filteredLeads.filter((l) => l.last_reply_at !== null).length} replied of ${filteredLeads.filter((l) => l.stage >= 2).length} contacted`}
            tooltip="Percentage of leads who replied after Alberto contacted them. Only counts leads at stage 2+ (opener sent or beyond)."
          />
          <KPICard
            label="Calls Booked (Week)"
            value={weekly.booked}
            highlight={weekly.booked > 0}
            sub={`${weekly.sets} links sent`}
            tooltip="Brand Strategy Calls booked this week through Alberto's DM conversations. Links sent = Calendly links delivered."
          />
          <KPICard
            label="Show Rate"
            value={(() => {
              const completed = bookings.filter((b) => b.status === "completed").length;
              const eligible = bookings.filter(
                (b) => b.status === "completed" || b.status === "booked" || b.status === "no_show"
              ).length;
              return eligible > 0 ? `${((completed / eligible) * 100).toFixed(1)}%` : "0%";
            })()}
            sub={`${bookings.filter((b) => b.status === "completed").length} completed`}
            tooltip="Percentage of booked calls that actually happened. Excludes cancelled. Low show rate = qualification issue."
          />
          <KPICard
            label="Alberto Revenue"
            value={(() => {
              const albertoBookings = bookings.filter((b) => b.set_by === "alberto" && b.outcome);
              const cashCollected = albertoBookings.reduce((sum, b) => {
                const val = typeof b.outcome === "string" && b.outcome.includes("$")
                  ? parseFloat(b.outcome.replace(/[^0-9.]/g, "")) || 0
                  : 0;
                return sum + val;
              }, 0);
              return cashCollected > 0 ? formatRevenue(cashCollected) : "$0";
            })()}
            highlight={bookings.some((b) => b.set_by === "alberto" && b.status === "completed")}
            sub={`${bookings.filter((b) => b.set_by === "alberto" && b.status === "completed").length} closed by Alberto`}
            tooltip="Cash collected from deals where Alberto set the call. Only counts revenue directly attributed to Alberto's DM conversations, not total pipeline."
          />
          {/* Revenue API still fetched for analytics tab but KPI shows Alberto-attributed only */}
        </div>

        {/* Platform Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { key: "instagram", label: "Instagram", color: "#E4405F", bgClass: "border-pink-500/30" },
            { key: "linkedin", label: "LinkedIn", color: "#0A66C2", bgClass: "border-blue-500/30" },
            { key: "x", label: "X", color: "#FFFFFF", bgClass: "border-white/20" },
          ].map((platform) => {
            const platformLeads = filteredLeads.filter(
              (l) => (l.platform ?? "instagram").toLowerCase() === platform.key
            );
            const hotCount = platformLeads.filter((l) => l.funnel_heat === "hot").length;
            const bookedCount = platformLeads.filter(
              (l) => l.stage >= 6 && l.stage !== 10
            ).length;
            return (
              <div
                key={platform.key}
                className={`bg-card border ${platform.bgClass} rounded-xl p-5`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: platform.color }}
                  />
                  <span className="text-white text-sm font-semibold">
                    {platform.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-white text-xl font-bold leading-none">
                      {platformLeads.length}
                    </p>
                    <p className="text-muted text-[10px] uppercase tracking-wider mt-1">
                      Active
                    </p>
                  </div>
                  <div>
                    <p className="text-amber-400 text-xl font-bold leading-none">
                      {hotCount}
                    </p>
                    <p className="text-muted text-[10px] uppercase tracking-wider mt-1">
                      Hot
                    </p>
                  </div>
                  <div>
                    <p className="text-lime text-xl font-bold leading-none">
                      {bookedCount}
                    </p>
                    <p className="text-muted text-[10px] uppercase tracking-wider mt-1">
                      Booked
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Tab */}
        {activeTab === "pipeline" && (
          <PipelineTab
            leads={filteredLeads}
            pathBreakdown={pathBreakdown}
            conversionFunnel={conversionFunnel}
          />
        )}
        {activeTab === "conversations" && (
          <ConversationsTab
            conversations={recentConversations}
            blockers={blockers}
          />
        )}
        {activeTab === "analytics" && (
          <AnalyticsTab
            todayPulse={todayPulse}
            sessions={sessions}
            bookings={bookings}
            leads={filteredLeads}
            conversations={recentConversations}
            revenue={revenue}
          />
        )}
        {activeTab === "settings" && <SettingsTab />}

        {/* Footer */}
        <p className="text-[#333] text-[11px] text-center pt-8">
          Alberto v1 / FOS Brand DM Command Center
        </p>
      </div>

      {/* Floating Chat Widget */}
      <ChatWidget
        dashboardContext={{
          view: activeTab,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }}
      />
    </div>
  );
}
