import type { EChartsOption } from 'echarts'
import type { Session, Lead, ConversationWithLead } from '@/lib/supabase'
import { COLORS, TOOLTIP_BASE, AXIS_BASE, GRID_BASE, fmtK, fmtPct } from '@/lib/chart-theme'

/**
 * Horizontal bar chart: bookings per week for the last 8 weeks.
 * Lime gradient bars.
 */
export function buildWeeklyBookingsOption(sessions: Session[]): EChartsOption {
  const now = new Date()
  const weeks: { label: string; booked: number }[] = []

  for (let i = 7; i >= 0; i--) {
    const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
    const label = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    const booked = sessions
      .filter((s) => {
        const d = new Date(s.session_date).getTime()
        return d >= weekStart.getTime() && d < weekEnd.getTime()
      })
      .reduce((sum, s) => sum + (s.bookings_confirmed ?? 0), 0)
    weeks.push({ label, booked })
  }

  return {
    tooltip: {
      ...TOOLTIP_BASE,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter(params: unknown): string {
        const p = Array.isArray(params) ? params[0] : params
        const item = p as { name: string; value: number }
        return `<b>Week of ${item.name}</b><br/>Bookings: ${item.value}`
      },
    },
    grid: { ...GRID_BASE, left: 80 },
    xAxis: {
      type: 'value',
      ...AXIS_BASE,
      axisLabel: { ...AXIS_BASE.axisLabel, formatter: (v: number) => fmtK(v) },
    },
    yAxis: {
      type: 'category',
      data: weeks.map((w) => w.label),
      ...AXIS_BASE,
      splitLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: weeks.map((w) => w.booked),
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: COLORS.limeDim },
              { offset: 1, color: COLORS.lime },
            ],
          } as unknown as string,
        },
        barMaxWidth: 18,
      },
    ],
  }
}

/**
 * Grouped vertical bars: leads by platform x stage bucket.
 * Stage buckets: Early (1-2), Active (3-5), Booked+ (6-9), DQ (10).
 */
export function buildPlatformBreakdownOption(leads: Lead[]): EChartsOption {
  const platforms = ['instagram', 'linkedin', 'x']
  const buckets = [
    { name: 'Early (1-2)', filter: (s: number) => s >= 1 && s <= 2, color: COLORS.muted },
    { name: 'Active (3-5)', filter: (s: number) => s >= 3 && s <= 5, color: COLORS.blue },
    { name: 'Booked+ (6-9)', filter: (s: number) => s >= 6 && s <= 9, color: COLORS.lime },
    { name: 'DQ (10)', filter: (s: number) => s === 10, color: COLORS.red },
  ]

  const series = buckets.map((bucket) => ({
    name: bucket.name,
    type: 'bar' as const,
    data: platforms.map((platform) =>
      leads.filter(
        (l) => (l.platform ?? 'instagram').toLowerCase() === platform && bucket.filter(l.stage)
      ).length
    ),
    itemStyle: { color: bucket.color, borderRadius: [3, 3, 0, 0] },
    barMaxWidth: 24,
  }))

  return {
    tooltip: {
      ...TOOLTIP_BASE,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    legend: {
      data: buckets.map((b) => b.name),
      textStyle: { color: COLORS.muted, fontSize: 10, fontFamily: "'Poppins', sans-serif" },
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
    },
    grid: { ...GRID_BASE, bottom: 40 },
    xAxis: {
      type: 'category',
      data: platforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1)),
      ...AXIS_BASE,
    },
    yAxis: {
      type: 'value',
      ...AXIS_BASE,
      axisLabel: { ...AXIS_BASE.axisLabel, formatter: (v: number) => fmtK(v) },
    },
    series,
  }
}

/**
 * Vertical bar chart (funnel shape): Total -> Engaged -> Qualifying -> Calendly Sent -> Booked.
 * Each bar is shorter, with % labels on top.
 */
export function buildFunnelOption(leads: Lead[]): EChartsOption {
  const total = leads.length
  const engaged = leads.filter((l) => l.stage >= 3).length
  const qualifying = leads.filter((l) => l.stage >= 4).length
  const calendlySent = leads.filter((l) => l.stage >= 5).length
  const booked = leads.filter((l) => l.stage >= 6 && l.stage !== 10).length

  const steps = [
    { name: 'Total', value: total, color: COLORS.muted },
    { name: 'Engaged', value: engaged, color: COLORS.blue },
    { name: 'Qualifying', value: qualifying, color: COLORS.violet },
    { name: 'Calendly Sent', value: calendlySent, color: COLORS.amber },
    { name: 'Booked', value: booked, color: COLORS.lime },
  ]

  return {
    tooltip: {
      ...TOOLTIP_BASE,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter(params: unknown): string {
        const p = Array.isArray(params) ? params[0] : params
        const item = p as { name: string; value: number }
        const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
        return `<b>${item.name}</b><br/>${item.value} leads (${pct}%)`
      },
    },
    grid: GRID_BASE,
    xAxis: {
      type: 'category',
      data: steps.map((s) => s.name),
      ...AXIS_BASE,
      axisLabel: { ...AXIS_BASE.axisLabel, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      ...AXIS_BASE,
      axisLabel: { ...AXIS_BASE.axisLabel, formatter: (v: number) => fmtK(v) },
    },
    series: [
      {
        type: 'bar',
        data: steps.map((s) => ({
          value: s.value,
          itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0] },
        })),
        barMaxWidth: 48,
        label: {
          show: true,
          position: 'top',
          color: COLORS.white,
          fontSize: 11,
          fontFamily: "'Poppins', sans-serif",
          formatter(params: unknown): string {
            const p = params as { value: number | undefined }
            const val = p.value ?? 0
            if (total === 0) return '0%'
            return fmtPct((val / total) * 100)
          },
        },
      },
    ],
  }
}

/**
 * Stacked area chart: inbound vs outbound messages over last 30 days.
 */
export function buildDailyActivityOption(conversations: ConversationWithLead[]): EChartsOption {
  const now = new Date()
  const days: string[] = []
  const inboundMap = new Map<string, number>()
  const outboundMap = new Map<string, number>()

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    days.push(key)
    inboundMap.set(key, 0)
    outboundMap.set(key, 0)
  }

  for (const conv of conversations) {
    const key = new Date(conv.sent_at).toISOString().slice(0, 10)
    if (conv.direction === 'inbound' && inboundMap.has(key)) {
      inboundMap.set(key, (inboundMap.get(key) ?? 0) + 1)
    }
    if (conv.direction === 'outbound' && outboundMap.has(key)) {
      outboundMap.set(key, (outboundMap.get(key) ?? 0) + 1)
    }
  }

  const labels = days.map((d) => {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })

  return {
    tooltip: {
      ...TOOLTIP_BASE,
      trigger: 'axis',
    },
    legend: {
      data: ['Inbound', 'Outbound'],
      textStyle: { color: COLORS.muted, fontSize: 10, fontFamily: "'Poppins', sans-serif" },
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
    },
    grid: { ...GRID_BASE, bottom: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      ...AXIS_BASE,
      axisLabel: {
        ...AXIS_BASE.axisLabel,
        fontSize: 9,
        rotate: 45,
        interval: 4,
      },
    },
    yAxis: {
      type: 'value',
      ...AXIS_BASE,
      axisLabel: { ...AXIS_BASE.axisLabel, formatter: (v: number) => fmtK(v) },
    },
    series: [
      {
        name: 'Inbound',
        type: 'line',
        stack: 'activity',
        areaStyle: { color: `${COLORS.blue}33` },
        lineStyle: { color: COLORS.blue, width: 2 },
        itemStyle: { color: COLORS.blue },
        data: days.map((d) => inboundMap.get(d) ?? 0),
        smooth: true,
        symbol: 'none',
      },
      {
        name: 'Outbound',
        type: 'line',
        stack: 'activity',
        areaStyle: { color: `${COLORS.lime}33` },
        lineStyle: { color: COLORS.lime, width: 2 },
        itemStyle: { color: COLORS.lime },
        data: days.map((d) => outboundMap.get(d) ?? 0),
        smooth: true,
        symbol: 'none',
      },
    ],
  }
}
