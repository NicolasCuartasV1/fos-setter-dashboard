/**
 * Calendly webhook receiver
 * Handles invitee.created and invitee.canceled events
 *
 * Set this URL in Calendly webhooks:
 *   https://fos-setter-dashboard.vercel.app/api/webhooks/calendly
 *
 * Attribution: any booking coming through a link we generated via gen_booking_link.py
 * will have its scheduling_link_uri in dm_scheduling_links — that's how we know
 * it was set by Alberto, not Arber.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WEBHOOK_SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY!;

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SIGNING_KEY) return true; // skip in dev if key not set
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SIGNING_KEY)
    .update(payload)
    .digest("hex");
  return signature === expected;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("calendly-webhook-signature") ?? "";

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.event as string;
  const payload = event.payload as Record<string, unknown>;

  if (eventType === "invitee.created") {
    await handleInviteeCreated(payload);
  } else if (eventType === "invitee.canceled") {
    await handleInviteeCanceled(payload);
  }

  return NextResponse.json({ received: true });
}

async function handleInviteeCreated(payload: Record<string, unknown>) {
  const inviteeUri = payload.uri as string;
  const scheduledEvent = payload.scheduled_event as Record<string, unknown>;
  const eventUri = scheduledEvent?.uri as string;
  const eventStart = scheduledEvent?.start_time as string;
  const eventName = scheduledEvent?.name as string;
  const tracking = payload.tracking as Record<string, unknown> | null;
  const schedulingLinkUri = (tracking?.salesforce_uuid as string) ?? null;

  // Look up the lead from our scheduling links table
  let leadId: number | null = null;
  let leadName: string | null = null;
  let leadHandle: string | null = null;

  if (schedulingLinkUri) {
    const { data: linkRow } = await supabase
      .from("dm_scheduling_links")
      .select("*")
      .eq("calendly_uri", schedulingLinkUri)
      .single();

    if (linkRow) {
      leadId = linkRow.lead_id;
      leadName = linkRow.lead_name;
      leadHandle = linkRow.lead_handle;

      // Mark the scheduling link as used
      await supabase
        .from("dm_scheduling_links")
        .update({ used: true })
        .eq("id", linkRow.id);
    }
  }

  // Fall back to invitee name if we don't have lead info
  if (!leadName) {
    leadName = payload.name as string ?? "Unknown";
  }

  // Insert booking record
  await supabase.from("dm_bookings").upsert(
    {
      calendly_event_uri: eventUri,
      calendly_invitee_uri: inviteeUri,
      scheduling_link_uri: schedulingLinkUri,
      lead_id: leadId,
      lead_name: leadName,
      lead_handle: leadHandle,
      event_start: eventStart,
      event_name: eventName,
      set_by: "alberto",
      source: "instagram_dm",
      status: "booked",
    },
    { onConflict: "calendly_event_uri" }
  );

  // Update lead stage to 6 (Booked) if we know the lead
  if (leadId) {
    await supabase
      .from("dm_leads")
      .update({ stage: 6, stage_label: "Booked", last_contact: new Date().toISOString() })
      .eq("id", leadId);
  }

  console.log(`[Calendly] Booking confirmed: ${leadName} — ${eventStart}`);
}

async function handleInviteeCanceled(payload: Record<string, unknown>) {
  const eventUri = (payload.scheduled_event as Record<string, unknown>)?.uri as string;

  if (eventUri) {
    await supabase
      .from("dm_bookings")
      .update({ status: "cancelled" })
      .eq("calendly_event_uri", eventUri);
  }
}
