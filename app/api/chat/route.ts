import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import type { Lead, ConversationWithLead } from "@/lib/supabase";

const SUPABASE_CRED_URL =
  "https://loynfcpucnnfkovdhinq.supabase.co/rest/v1/credentials?key=eq.anthropic_api_key&select=value";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxveW5mY3B1Y25uZmtvdmRoaW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4Mjg0MjgsImV4cCI6MjA5MDQwNDQyOH0.8gkeWeYsubXIkZt_Rx6Sce5kAdVhfzh74iVwfXTFGJs";

async function getAnthropicKey(): Promise<string> {
  // Try environment variable first
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  // Fall back to Supabase credentials store
  try {
    const resp = await fetch(SUPABASE_CRED_URL, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    const data = await resp.json();
    return data[0]?.value ?? "";
  } catch {
    return "";
  }
}

async function fetchDashboardContext(): Promise<string> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [leadsRes, convsRes, statsRes, bookingsRes, blockersRes] =
    await Promise.all([
      supabase
        .from("dm_leads")
        .select("*")
        .eq("archived", false)
        .order("lead_score", { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from("dm_conversations")
        .select("*, dm_leads(name, handle, stage)")
        .order("sent_at", { ascending: false })
        .limit(20),
      supabase
        .from("dm_conversations")
        .select("id", { count: "exact", head: true })
        .eq("ai_generated", true)
        .gte("sent_at", todayStart.toISOString()),
      supabase
        .from("dm_bookings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("dm_blockers")
        .select("*")
        .eq("resolved", false),
    ]);

  const leads = (leadsRes.data ?? []) as Lead[];
  const conversations = (convsRes.data ?? []) as ConversationWithLead[];
  const aiRepliesToday = statsRes.count ?? 0;
  const bookings = bookingsRes.data ?? [];
  const blockers = blockersRes.data ?? [];

  const hotLeads = leads.filter((l) => l.funnel_heat === "hot");
  const warmLeads = leads.filter((l) => l.funnel_heat === "warm");
  const coldLeads = leads.filter((l) => l.funnel_heat === "cold");

  const stageCounts: Record<number, number> = {};
  for (const lead of leads) {
    stageCounts[lead.stage] = (stageCounts[lead.stage] ?? 0) + 1;
  }

  const stageLabels: Record<number, string> = {
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

  let context = `## Current Pipeline State (${new Date().toISOString()})\n\n`;
  context += `Total active leads: ${leads.length}\n`;
  context += `Hot leads: ${hotLeads.length}\n`;
  context += `Warm leads: ${warmLeads.length}\n`;
  context += `Cold leads: ${coldLeads.length}\n`;
  context += `AI replies today: ${aiRepliesToday}\n`;
  context += `Open blockers: ${blockers.length}\n\n`;

  context += `### Stage Breakdown\n`;
  for (const [stage, count] of Object.entries(stageCounts)) {
    context += `- ${stageLabels[Number(stage)] ?? `Stage ${stage}`}: ${count}\n`;
  }

  if (hotLeads.length > 0) {
    context += `\n### Hot Leads (act now)\n`;
    for (const lead of hotLeads.slice(0, 10)) {
      context += `- ${lead.name} (@${lead.handle ?? "unknown"}) - Stage ${stageLabels[lead.stage] ?? lead.stage} - Score: ${lead.lead_score ?? "unscored"} - Bottleneck: ${lead.bottleneck ?? "unknown"}\n`;
    }
  }

  if (conversations.length > 0) {
    context += `\n### Recent Conversations\n`;
    for (const conv of conversations.slice(0, 10)) {
      const lead = conv.dm_leads;
      const preview =
        conv.message_text.length > 100
          ? conv.message_text.slice(0, 100) + "..."
          : conv.message_text;
      context += `- [${conv.direction}] ${lead?.name ?? "Unknown"}: ${preview}\n`;
    }
  }

  if (bookings.length > 0) {
    context += `\n### Recent Bookings\n`;
    for (const b of bookings.slice(0, 5)) {
      context += `- ${b.lead_name ?? "Unknown"} - Status: ${b.status} - ${b.event_start ?? "no time"}\n`;
    }
  }

  if (blockers.length > 0) {
    context += `\n### Open Blockers\n`;
    for (const b of blockers) {
      context += `- [${b.blocker_type}] ${b.description} - Lead: ${b.lead_name ?? "unknown"}\n`;
    }
  }

  // Conversion funnel
  const engaged = leads.filter((l) => l.stage >= 3).length;
  const qualifying = leads.filter((l) => l.stage >= 4).length;
  const calendlySent = leads.filter((l) => l.stage >= 5).length;
  const booked = leads.filter(
    (l) => l.stage >= 6 && l.stage !== 10
  ).length;

  context += `\n### Conversion Funnel\n`;
  context += `- Engaged: ${engaged}\n`;
  context += `- Qualifying: ${qualifying}\n`;
  context += `- Calendly Sent: ${calendlySent}\n`;
  context += `- Booked: ${booked}\n`;
  if (engaged > 0) {
    context += `- Overall DMs to Booked: ${leads.length > 0 ? Math.round((booked / leads.length) * 100) : 0}%\n`;
  }

  return context;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  dashboardContext?: {
    view?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as ChatRequest;
    const { messages } = body;

    const apiKey = await getAnthropicKey();
    if (!apiKey) {
      return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });
    }

    const dashboardData = await fetchDashboardContext();

    const client = new Anthropic({ apiKey });

    const systemPrompt = `You are Alberto Intelligence, the analytical brain behind the Founder OS Brand DM command center. You have access to live pipeline data across Instagram, LinkedIn, and X. You provide executive intelligence to the Founder OS leadership team.

Think like a VP of Sales reporting to the CEO. Lead with numbers. Flag risks. Recommend actions.

Here is the current live data from the dashboard:

${dashboardData}

Rules:
- Always reference specific leads by name when relevant
- Give actionable recommendations
- Keep responses concise (2-4 paragraphs max)
- Use bold for key metrics
- No em dashes
- Frame insights around business outcomes: bookings, revenue, conversion rates
- Proactively surface pipeline risks and stalled leads`;

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
