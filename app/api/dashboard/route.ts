import { NextResponse } from "next/server";
import {
  supabase,
  getActiveLeads,
  getHotLeads,
  getRecentSessions,
  getRecentBookings,
  getOpenBlockers,
  getAlbertoStats,
  getRecentConversationsWithLeads,
} from "@/lib/supabase";
import type {
  Lead,
  Session,
  Booking,
  Blocker,
  AlbertoStats,
  ConversationWithLead,
} from "@/lib/supabase";

// ── New query types ─────────────────────────────────────────────────────────

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

// ── New queries ─────────────────────────────────────────────────────────────

async function getTodayPulse(): Promise<TodayPulse> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const [inRes, outRes, leadsRes, latencyRes] = await Promise.all([
    supabase
      .from("dm_conversations")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound")
      .gte("sent_at", todayISO),
    supabase
      .from("dm_conversations")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .gte("sent_at", todayISO),
    supabase
      .from("dm_leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
    supabase
      .from("dm_ai_responses")
      .select("latency_ms")
      .gte("created_at", todayISO)
      .not("latency_ms", "is", null),
  ]);

  const latencies = (latencyRes.data ?? [])
    .map((r) => r.latency_ms as number)
    .filter((n) => n > 0);
  const avgResponseTimeMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

  return {
    messagesIn: inRes.count ?? 0,
    messagesOut: outRes.count ?? 0,
    newLeads: leadsRes.count ?? 0,
    avgResponseTimeMs,
  };
}

async function getPathBreakdown(): Promise<PathBreakdown> {
  const { data, error } = await supabase
    .from("dm_leads")
    .select("funnel_heat")
    .eq("archived", false);
  if (error) throw error;

  const leads = data ?? [];
  let hot = 0;
  let warm = 0;
  let cold = 0;
  let unscored = 0;
  for (const lead of leads) {
    if (lead.funnel_heat === "hot") hot++;
    else if (lead.funnel_heat === "warm") warm++;
    else if (lead.funnel_heat === "cold") cold++;
    else unscored++;
  }
  return { hot, warm, cold, unscored };
}

function computeConversionFunnel(leads: Lead[]): ConversionFunnel {
  // Count leads that have reached at least each stage (current or past)
  // Stage progression: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> ...
  // A lead at stage 6 has passed through 3, 4, 5
  const engaged = leads.filter((l) => l.stage >= 3).length;
  const qualifying = leads.filter((l) => l.stage >= 4).length;
  const calendlySent = leads.filter((l) => l.stage >= 5).length;
  const booked = leads.filter((l) => l.stage >= 6 && l.stage !== 10).length;
  const totalDMs = leads.length;

  const pct = (num: number, denom: number): number | null =>
    denom > 0 ? Math.round((num / denom) * 100) : null;

  return {
    engaged,
    qualifying,
    calendlySent,
    booked,
    totalDMs,
    engagedToQualifying: pct(qualifying, engaged),
    qualifyingToCalendly: pct(calendlySent, qualifying),
    calendlyToBooked: pct(booked, calendlySent),
    dmsToBooked: pct(booked, totalDMs),
  };
}

async function getHourlyLatency(): Promise<HourlyLatency[]> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("dm_ai_responses")
    .select("created_at, latency_ms")
    .gte("created_at", dayAgo.toISOString())
    .not("latency_ms", "is", null);
  if (error) throw error;

  // Group by hour
  const hourMap = new Map<number, number[]>();
  for (const row of data ?? []) {
    const hour = new Date(row.created_at).getHours();
    const existing = hourMap.get(hour) ?? [];
    existing.push(row.latency_ms as number);
    hourMap.set(hour, existing);
  }

  const result: HourlyLatency[] = [];
  // Build all 24 hours
  for (let h = 0; h < 24; h++) {
    const latencies = hourMap.get(h);
    if (latencies && latencies.length > 0) {
      const avg = Math.round(
        latencies.reduce((a, b) => a + b, 0) / latencies.length
      );
      result.push({ hour: h, avgMs: avg, count: latencies.length });
    } else {
      result.push({ hour: h, avgMs: 0, count: 0 });
    }
  }
  return result;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse<DashboardData | { error: string }>> {
  try {
    const [
      leads,
      hotLeads,
      sessions,
      bookings,
      blockers,
      albertoStats,
      recentConversations,
      todayPulse,
      pathBreakdown,
      hourlyLatency,
    ] = await Promise.all([
      getActiveLeads(),
      getHotLeads(),
      getRecentSessions(30),
      getRecentBookings(20),
      getOpenBlockers(),
      getAlbertoStats(),
      getRecentConversationsWithLeads(30),
      getTodayPulse(),
      getPathBreakdown(),
      getHourlyLatency(),
    ]);

    const conversionFunnel = computeConversionFunnel(leads);

    const data: DashboardData = {
      leads,
      hotLeads,
      sessions,
      bookings,
      blockers,
      albertoStats,
      recentConversations,
      todayPulse,
      pathBreakdown,
      conversionFunnel,
      hourlyLatency,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
