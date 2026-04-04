@AGENTS.md

# FOS Setter Dashboard

## Status
Live at fos-setter-dashboard.vercel.app. Auto-deploys from main via Vercel + GitHub (Matt-Gray-Founder-OS org).

## Purpose
War room for Alberto's 24/7 AI DM setting operation. Shows live pipeline, KPIs, Alberto activity feed, blockers, bookings, and revenue.

## Next
- Add Matt's war room suggestions (pending input from Nick)
- Add path breakdown (high/low/free ticket distribution)
- Add real-time 30s polling for Alberto activity feed
- Add conversion rate column (links sent % booked)

## Stack
Next.js 16 App Router, TypeScript, Supabase (xzmntpwwccmpkgeprodj), Vercel

## Key Files
- app/page.tsx — main dashboard (all sections)
- lib/supabase.ts — all types, queries, and helper functions
- app/api/revenue/route.ts — HubSpot revenue data (OS Light + Sales Pipeline)
- app/api/webhooks/calendly/route.ts — Calendly booking webhooks

## Supabase Project
xzmntpwwccmpkgeprodj (fos-setter project)
Tables: dm_leads, dm_conversations, dm_ai_responses, dm_sessions, dm_bookings, dm_blockers, dm_resources

## Environment Variables (Vercel)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
HUBSPOT_API_KEY (revenue API route)
NEXT_PUBLIC_SITE_URL
