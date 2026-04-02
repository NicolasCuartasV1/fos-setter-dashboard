import {
  getActiveLeads,
  getRecentSessions,
  getRecentBookings,
  getOpenBlockers,
} from "@/lib/supabase";
import type { Lead, Session, Booking, Blocker } from "@/lib/supabase";

export const revalidate = 300; // refresh every 5 minutes

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
    dms: thisWeek.reduce((a, s) => a + (s.replies_handled ?? 0) + (s.new_conversations ?? 0), 0),
    sets: thisWeek.reduce((a, s) => a + (s.calendly_links_sent ?? 0), 0),
    booked: thisWeek.reduce((a, s) => a + (s.bookings_confirmed ?? 0), 0),
  };
}

function monthlyStats(sessions: Session[]) {
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thisMonth = sessions.filter((s) => new Date(s.session_date) >= monthAgo);
  return {
    sessions: thisMonth.length,
    dms: thisMonth.reduce((a, s) => a + (s.replies_handled ?? 0) + (s.new_conversations ?? 0), 0),
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
    <div style={{ background: "#1A1A1A", border: highlight ? "1px solid #D9FC67" : "1px solid #2A2A2A", borderRadius: 12, padding: "1.5rem" }}>
      <p style={{ color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</p>
      <p style={{ color: highlight ? "#D9FC67" : "#F5F5F5", fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: "#666", fontSize: 12, marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function StageBadge({ stage }: { stage: number }) {
  return (
    <span style={{ background: (STAGE_COLORS[stage] ?? "#555") + "22", color: STAGE_COLORS[stage] ?? "#888", border: `1px solid ${STAGE_COLORS[stage] ?? "#555"}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
      {STAGE_LABELS[stage] ?? `Stage ${stage}`}
    </span>
  );
}

function PipelineFunnel({ counts }: { counts: Record<number, number> }) {
  const stages = [3, 4, 5, 6, 8];
  const maxCount = Math.max(...stages.map((s) => counts[s] ?? 0), 1);
  return (
    <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 12, padding: "1.5rem" }}>
      <h3 style={{ color: "#F5F5F5", fontWeight: 600, fontSize: 14, marginBottom: 20 }}>Active Pipeline</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stages.map((stage) => {
          const count = counts[stage] ?? 0;
          const pct = Math.round((count / maxCount) * 100);
          return (
            <div key={stage}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#888", fontSize: 12 }}>{STAGE_LABELS[stage]}</span>
                <span style={{ color: STAGE_COLORS[stage] ?? "#888", fontSize: 12, fontWeight: 600 }}>{count}</span>
              </div>
              <div style={{ background: "#0A0A0A", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{ background: STAGE_COLORS[stage] ?? "#555", width: `${pct}%`, height: "100%", borderRadius: 4 }} />
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
    <div style={{ background: "#0A0A0A", border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {blocker.blocker_type?.replace("_", " ") ?? "other"}
        </span>
        <span style={{ color: "#555", fontSize: 11 }}>{formatDate(blocker.created_at)}</span>
      </div>
      <p style={{ color: "#F5F5F5", fontSize: 13, marginBottom: blocker.lead_name ? 6 : 0 }}>{blocker.description}</p>
      {blocker.lead_name && (
        <p style={{ color: "#666", fontSize: 12 }}>Lead: {blocker.lead_name}{blocker.lead_handle ? ` (@${blocker.lead_handle})` : ""}</p>
      )}
    </div>
  );
}

async function getRevenue(): Promise<RevenueData | null> {
  try {
    const resp = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/revenue`,
      { next: { revalidate: 3600 } }
    );
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

function formatRevenue(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default async function Dashboard() {
  let leads: Lead[] = [];
  let sessions: Session[] = [];
  let bookings: Booking[] = [];
  let blockers: Blocker[] = [];
  let dbError = false;
  let revenue: RevenueData | null = null;

  try {
    [[leads, sessions, bookings, blockers], revenue] = await Promise.all([
      Promise.all([
        getActiveLeads(),
        getRecentSessions(30),
        getRecentBookings(20),
        getOpenBlockers(),
      ]),
      getRevenue(),
    ]);
  } catch {
    dbError = true;
  }

  const counts = stageCounts(leads);
  const weekly = weeklyStats(sessions);
  const monthly = monthlyStats(sessions);
  const confirmedBookings = bookings.filter((b) => b.status === "booked" || b.status === "completed");

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, background: "#D9FC67", borderRadius: "50%", display: "inline-block" }} />
            <span style={{ color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Founder OS / Instagram DMs</span>
          </div>
          <h1 style={{ color: "#F5F5F5", fontSize: 28, fontWeight: 700, margin: 0 }}>Alberto</h1>
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>DM Setter Dashboard / Matt Gray account</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Operator</p>
          <p style={{ color: "#F5F5F5", fontSize: 14, fontWeight: 600 }}>Nicolas</p>
        </div>
      </div>

      {dbError && (
        <div style={{ background: "#E0525222", border: "1px solid #E0525244", borderRadius: 8, padding: "1rem", marginBottom: "2rem" }}>
          <p style={{ color: "#E05252", fontSize: 13 }}>
            Database not connected. Run <code>migrations/001_create_dm_tables.sql</code> in the Supabase SQL editor at{" "}
            <a href="https://supabase.com/dashboard/project/yhvssclmrddiowlccvjc/sql" style={{ color: "#D9FC67" }}>
              supabase.com/dashboard/project/yhvssclmrddiowlccvjc/sql
            </a>
          </p>
        </div>
      )}

      {/* Weekly KPIs */}
      <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>This Week</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: "1.5rem" }}>
        <KPICard label="Sessions run" value={weekly.sessions} />
        <KPICard label="DMs sent / replied" value={weekly.dms} />
        <KPICard label="Links sent" value={weekly.sets} sub="Calendly links" />
        <KPICard label="Calls booked" value={weekly.booked} highlight={weekly.booked > 0} />
      </div>

      {/* Monthly KPIs */}
      <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>This Month</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: "2.5rem" }}>
        <KPICard label="Sessions run" value={monthly.sessions} />
        <KPICard label="DMs sent / replied" value={monthly.dms} />
        <KPICard label="Links sent" value={monthly.sets} />
        <KPICard label="Calls booked" value={monthly.booked} highlight={monthly.booked > 0} />
      </div>

      {/* Pipeline + Blockers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: "2.5rem" }}>
        <PipelineFunnel counts={counts} />
        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 12, padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ color: "#F5F5F5", fontWeight: 600, fontSize: 14, margin: 0 }}>What Alberto Needs from Nicolas</h3>
            {blockers.length > 0 && (
              <span style={{ background: "#E8A83822", color: "#E8A838", border: "1px solid #E8A83844", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                {blockers.length} open
              </span>
            )}
          </div>
          {blockers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <span style={{ display: "inline-block", width: 8, height: 8, background: "#D9FC67", borderRadius: "50%", marginBottom: 8 }} />
              <p style={{ color: "#555", fontSize: 13 }}>All clear. No open blockers.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {blockers.map((b) => <BlockerCard key={b.id} blocker={b} />)}
            </div>
          )}
        </div>
      </div>

      {/* Active Leads */}
      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 12, padding: "1.5rem", marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: "#F5F5F5", fontWeight: 600, fontSize: 14, margin: 0 }}>Active Leads</h3>
          <span style={{ color: "#888", fontSize: 12 }}>{leads.length} total</span>
        </div>
        {leads.length === 0 ? (
          <p style={{ color: "#555", fontSize: 13, textAlign: "center", padding: "2rem 0" }}>No active leads yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2A2A2A" }}>
                  {["Name", "Handle", "Stage", "Bottleneck", "Last Contact"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", color: "#555", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} style={{ borderBottom: "1px solid #1E1E1E" }}>
                    <td style={{ padding: "10px 12px", color: "#F5F5F5", fontSize: 13 }}>{lead.name}</td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>@{lead.handle ?? "—"}</td>
                    <td style={{ padding: "10px 12px" }}><StageBadge stage={lead.stage} /></td>
                    <td style={{ padding: "10px 12px", color: "#666", fontSize: 12, maxWidth: 200 }}>{lead.bottleneck ?? lead.what_they_said ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#666", fontSize: 12 }}>{lead.last_contact ? formatDate(lead.last_contact) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bookings */}
      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 12, padding: "1.5rem", marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: "#F5F5F5", fontWeight: 600, fontSize: 14, margin: 0 }}>Bookings Set by Alberto</h3>
          <span style={{ color: "#D9FC67", fontSize: 12, fontWeight: 600 }}>{confirmedBookings.length} confirmed</span>
        </div>
        {bookings.length === 0 ? (
          <p style={{ color: "#555", fontSize: 13, textAlign: "center", padding: "2rem 0" }}>No bookings yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2A2A2A" }}>
                  {["Lead", "Handle", "Call Time", "Status", "Outcome"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", color: "#555", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const statusColor = b.status === "booked" ? "#D9FC67" : b.status === "completed" ? "#52C87A" : b.status === "no_show" ? "#E05252" : "#888";
                  return (
                    <tr key={b.id} style={{ borderBottom: "1px solid #1E1E1E" }}>
                      <td style={{ padding: "10px 12px", color: "#F5F5F5", fontSize: 13 }}>{b.lead_name ?? "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>@{b.lead_handle ?? "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{b.event_start ? formatDateTime(b.event_start) : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ color: statusColor, fontSize: 12, fontWeight: 500, textTransform: "capitalize" }}>{b.status.replace("_", " ")}</span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#666", fontSize: 12 }}>{b.outcome ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Session Log */}
      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 12, padding: "1.5rem" }}>
        <h3 style={{ color: "#F5F5F5", fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Session History</h3>
        {sessions.length === 0 ? (
          <p style={{ color: "#555", fontSize: 13, textAlign: "center", padding: "2rem 0" }}>No sessions logged yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2A2A2A" }}>
                  {["Date", "Leads", "DMs", "Links Sent", "Booked", "Summary"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", color: "#555", fontSize: 11, textAlign: ["Date", "Summary"].includes(h) ? "left" : "center", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #1E1E1E" }}>
                    <td style={{ padding: "10px 12px", color: "#F5F5F5", fontSize: 13 }}>{formatDate(s.session_date)}</td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: 13, textAlign: "center" }}>{s.total_leads_worked}</td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: 13, textAlign: "center" }}>{(s.replies_handled ?? 0) + (s.new_conversations ?? 0)}</td>
                    <td style={{ padding: "10px 12px", color: "#E8A838", fontSize: 13, textAlign: "center" }}>{s.calendly_links_sent}</td>
                    <td style={{ padding: "10px 12px", color: "#D9FC67", fontSize: 13, textAlign: "center", fontWeight: s.bookings_confirmed > 0 ? 600 : 400 }}>{s.bookings_confirmed}</td>
                    <td style={{ padding: "10px 12px", color: "#666", fontSize: 12, maxWidth: 240 }}>{s.summary ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revenue Section */}
      {revenue && (
        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 12, padding: "1.5rem", marginBottom: "2.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, background: "#D9FC67", borderRadius: "50%", display: "inline-block" }} />
            <h3 style={{ color: "#F5F5F5", fontWeight: 600, fontSize: 14, margin: 0 }}>Revenue Tracker</h3>
          </div>

          {/* OS Light */}
          <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Founder OS Light ($197)</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            <KPICard label="All time purchases" value={revenue.os_light.total_all_time.toLocaleString()} />
            <KPICard label="All time revenue" value={formatRevenue(revenue.os_light.revenue_all_time)} highlight />
            <KPICard label="This month" value={`${revenue.os_light.total_this_month} purchases`} sub={formatRevenue(revenue.os_light.revenue_this_month)} />
            <KPICard label="This week" value={`${revenue.os_light.total_this_week} purchases`} sub={formatRevenue(revenue.os_light.revenue_this_week)} />
          </div>

          {/* Recent OS Light buyers */}
          {revenue.os_light.recent.length > 0 && (
            <div>
              <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Recent buyers this week</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {revenue.os_light.recent.map((r, i) => (
                  <span key={i} style={{ background: "#D9FC6711", border: "1px solid #D9FC6733", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "#D9FC67" }}>
                    {r.name} <span style={{ color: "#555" }}>{r.date}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sales Pipeline */}
          {revenue.sales_pipeline.closed_won_total > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #2A2A2A" }}>
              <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Sales Pipeline 2026 — Closed Won</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                <KPICard label="Deals closed" value={revenue.sales_pipeline.closed_won_total} />
                <KPICard label="Revenue" value={formatRevenue(revenue.sales_pipeline.closed_won_revenue)} highlight />
              </div>
            </div>
          )}
        </div>
      )}

      <p style={{ color: "#333", fontSize: 11, textAlign: "center", marginTop: "3rem" }}>
        Alberto v1 / FOS DM Setter / Matt Gray Instagram
      </p>
    </div>
  );
}
