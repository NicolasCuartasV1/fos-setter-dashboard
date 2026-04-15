import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      subscriber_id: string;
      message_text: string;
      lead_id: number;
    };

    if (!body.subscriber_id || !body.message_text?.trim() || !body.lead_id) {
      return NextResponse.json(
        { ok: false, error: "subscriber_id, message_text, and lead_id are required" },
        { status: 400 }
      );
    }

    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/manychat-send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );

    const data = await resp.json() as { ok: boolean; error?: string; sent_at?: string };

    if (!resp.ok || !data.ok) {
      return NextResponse.json(
        { ok: false, error: data.error ?? "Send failed" },
        { status: resp.ok ? 502 : resp.status }
      );
    }

    return NextResponse.json({ ok: true, sent_at: data.sent_at });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
