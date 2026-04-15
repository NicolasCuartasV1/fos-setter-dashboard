import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET() {
  try {
    // Ping Supabase with a lightweight query
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/dm_leads?select=id&limit=1`,
      {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
      }
    );

    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: "Supabase unreachable", code: resp.status },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
