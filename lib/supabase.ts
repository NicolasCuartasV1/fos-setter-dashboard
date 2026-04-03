import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Types ────────────────────────────────────────────────────────────────────

export type Lead = {
  id: number;
  created_at: string;
  updated_at: string;
  name: string;
  handle: string | null;
  platform: string;
  manychat_id: string | null;
  stage: number;
  stage_label: string | null;
  bottleneck: string | null;
  what_they_said: string | null;
  notes: string | null;
  last_contact: string | null;
  last_reply_at: string | null;
  assigned_to: string;
  archived: boolean;
  archive_reason: string | null;
  // scoring + personalization (migration 002)
  lead_score: number | null;
  funnel_heat: "hot" | "warm" | "cold" | null;
  ig_bio: string | null;
  ig_followers: number | null;
  niche: string | null;
  revenue_signal: string | null;
  objection_type: string | null;
  conversation_summary: string | null;
  source_trigger: string | null;
  ai_opener: string | null;
};

export type Conversation = {
  id: number;
  created_at: string;
  lead_id: number;
  manychat_subscriber_id: string | null;
  direction: "inbound" | "outbound";
  message_text: string;
  sent_at: string;
  ai_generated: boolean;
  stage_at_send: number | null;
};

export type Session = {
  id: number;
  session_date: string;
  created_at: string;
  total_leads_worked: number;
  new_conversations: number;
  replies_handled: number;
  calendly_links_sent: number;
  bookings_confirmed: number;
  no_shows_reactivated: number;
  summary: string | null;
  session_log: string | null;
};

export type Booking = {
  id: number;
  created_at: string;
  lead_id: number | null;
  lead_name: string | null;
  lead_handle: string | null;
  event_start: string | null;
  event_name: string | null;
  set_by: string;
  source: string;
  status: string;
  pre_call_sent: boolean;
  call_happened: boolean;
  outcome: string | null;
};

export type Blocker = {
  id: number;
  created_at: string;
  resolved_at: string | null;
  lead_name: string | null;
  lead_handle: string | null;
  blocker_type: string | null;
  description: string;
  resolution: string | null;
  resolved: boolean;
};

export type Resource = {
  id: number;
  name: string;
  category: string | null;
  opt_in_url: string | null;
  direct_url: string | null;
  price_usd: number | null;
  description: string | null;
  active: boolean;
};

export type AIResponse = {
  id: number;
  created_at: string;
  lead_id: number;
  conversation_id: number | null;
  model: string;
  response_text: string | null;
  approved: boolean | null;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
};

export type ConversationWithLead = Conversation & {
  dm_leads: { name: string; handle: string | null; stage: number } | null;
};

export type AlbertoStats = {
  repliesToday: number;
  repliesThisWeek: number;
  avgLatencyMs: number | null;
  escalationsOpen: number;
};

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getActiveLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("dm_leads")
    .select("*")
    .eq("archived", false)
    .order("lead_score", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function getHotLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("dm_leads")
    .select("*")
    .eq("archived", false)
    .eq("funnel_heat", "hot")
    .order("lead_score", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getRecentConversations(limit = 20): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("dm_conversations")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getRecentSessions(limit = 14): Promise<Session[]> {
  const { data, error } = await supabase
    .from("dm_sessions")
    .select("*")
    .order("session_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getRecentBookings(limit = 20): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("dm_bookings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getOpenBlockers(): Promise<Blocker[]> {
  const { data, error } = await supabase
    .from("dm_blockers")
    .select("*")
    .eq("resolved", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getResources(): Promise<Resource[]> {
  const { data, error } = await supabase
    .from("dm_resources")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getAlbertoStats(): Promise<AlbertoStats> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [todayRes, weekRes, latencyRes, escalationsRes] = await Promise.all([
    supabase
      .from("dm_conversations")
      .select("id", { count: "exact", head: true })
      .eq("ai_generated", true)
      .gte("sent_at", todayStart.toISOString()),
    supabase
      .from("dm_conversations")
      .select("id", { count: "exact", head: true })
      .eq("ai_generated", true)
      .gte("sent_at", weekAgo.toISOString()),
    supabase
      .from("dm_ai_responses")
      .select("latency_ms")
      .gte("created_at", weekAgo.toISOString())
      .not("latency_ms", "is", null),
    supabase
      .from("dm_blockers")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false)
      .eq("blocker_type", "escalation"),
  ]);

  const latencies = (latencyRes.data ?? [])
    .map((r) => r.latency_ms as number)
    .filter((n) => n > 0);
  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

  return {
    repliesToday: todayRes.count ?? 0,
    repliesThisWeek: weekRes.count ?? 0,
    avgLatencyMs,
    escalationsOpen: escalationsRes.count ?? 0,
  };
}

export async function getRecentConversationsWithLeads(
  limit = 30
): Promise<ConversationWithLead[]> {
  const { data, error } = await supabase
    .from("dm_conversations")
    .select("*, dm_leads(name, handle, stage)")
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ConversationWithLead[];
}
