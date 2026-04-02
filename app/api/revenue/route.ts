/**
 * Revenue API — pulls OS Light + Sales Pipeline data from HubSpot
 *
 * HubSpot data:
 *   - OS Light ($197): Low Ticket Products pipeline, stage checkout_completed, product "Founder OS Lite"
 *   - Sales Pipeline closes: pipeline 842048419, stage 1251504278 (Closed Won)
 *
 * Called by the dashboard at build time (revalidate: 3600 = hourly)
 */

import { NextResponse } from "next/server";

const HUBSPOT_BASE = "https://api.hubapi.com";
const SUPABASE_CRED_URL =
  "https://loynfcpucnnfkovdhinq.supabase.co/rest/v1/credentials?key=eq.hubspot_pat&select=value";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxveW5mY3B1Y25uZmtvdmRoaW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4Mjg0MjgsImV4cCI6MjA5MDQwNDQyOH0.8gkeWeYsubXIkZt_Rx6Sce5kAdVhfzh74iVwfXTFGJs";

// Pipeline IDs
const LOW_TICKET_PIPELINE = "75e28846-ad0d-4be2-a027-5e1da6590b98";
const SALES_PIPELINE_2026 = "842048419";

async function getHubSpotPAT(): Promise<string> {
  const resp = await fetch(SUPABASE_CRED_URL, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const data = await resp.json();
  return data[0]?.value ?? "";
}

async function searchDeals(
  pat: string,
  filterGroups: unknown[],
  properties: string[]
): Promise<{ total: number; results: Array<Record<string, unknown>> }> {
  const resp = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups,
      properties,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
    }),
  });
  return resp.json();
}

function thisMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function thisWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET() {
  try {
    const pat = await getHubSpotPAT();

    const [allOsLight, weekOsLight, monthOsLight, salesClosedWon] =
      await Promise.all([
        // All OS Light purchases ever
        searchDeals(
          pat,
          [
            {
              filters: [
                {
                  propertyName: "pipeline",
                  operator: "EQ",
                  value: LOW_TICKET_PIPELINE,
                },
                {
                  propertyName: "dealstage",
                  operator: "EQ",
                  value: "checkout_completed",
                },
              ],
            },
          ],
          ["dealname", "amount", "createdate", "product"]
        ),
        // OS Light this week
        searchDeals(
          pat,
          [
            {
              filters: [
                {
                  propertyName: "pipeline",
                  operator: "EQ",
                  value: LOW_TICKET_PIPELINE,
                },
                {
                  propertyName: "dealstage",
                  operator: "EQ",
                  value: "checkout_completed",
                },
                {
                  propertyName: "createdate",
                  operator: "GTE",
                  value: thisWeek(),
                },
              ],
            },
          ],
          ["dealname", "amount", "createdate"]
        ),
        // OS Light this month
        searchDeals(
          pat,
          [
            {
              filters: [
                {
                  propertyName: "pipeline",
                  operator: "EQ",
                  value: LOW_TICKET_PIPELINE,
                },
                {
                  propertyName: "dealstage",
                  operator: "EQ",
                  value: "checkout_completed",
                },
                {
                  propertyName: "createdate",
                  operator: "GTE",
                  value: thisMonth(),
                },
              ],
            },
          ],
          ["dealname", "amount", "createdate"]
        ),
        // Sales Pipeline 2026 — Closed Won
        searchDeals(
          pat,
          [
            {
              filters: [
                {
                  propertyName: "pipeline",
                  operator: "EQ",
                  value: SALES_PIPELINE_2026,
                },
                {
                  propertyName: "dealstage",
                  operator: "EQ",
                  value: "1251504278",
                },
              ],
            },
          ],
          ["dealname", "amount", "closedate", "createdate"]
        ),
      ]);

    const OS_LIGHT_PRICE = 197;

    return NextResponse.json({
      os_light: {
        total_all_time: allOsLight.total,
        revenue_all_time: allOsLight.total * OS_LIGHT_PRICE,
        total_this_week: weekOsLight.total,
        revenue_this_week: weekOsLight.total * OS_LIGHT_PRICE,
        total_this_month: monthOsLight.total,
        revenue_this_month: monthOsLight.total * OS_LIGHT_PRICE,
        recent: weekOsLight.results.slice(0, 5).map((d) => {
          const p = d.properties as Record<string, string>;
          return {
            name: p.dealname?.replace(" - OS Light $197 Offer", "") ?? "Unknown",
            date: p.createdate?.slice(0, 10) ?? "",
          };
        }),
      },
      sales_pipeline: {
        closed_won_total: salesClosedWon.total,
        closed_won_revenue: salesClosedWon.results
          .slice(0, 100)
          .reduce((sum, d) => {
            const p = d.properties as Record<string, string>;
            return sum + (parseFloat(p.amount ?? "0") || 0);
          }, 0),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
