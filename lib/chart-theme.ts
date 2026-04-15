/**
 * Shared ECharts design tokens and option helpers.
 * All charts import from here -- one place to change the look.
 */

export const COLORS = {
  lime:    '#D9FC67',
  limeDim: '#B8D94A',
  blue:    '#60A5FA',
  violet:  '#A78BFA',
  emerald: '#34D399',
  amber:   '#F59E0B',
  pink:    '#F472B6',
  cyan:    '#38BDF8',
  orange:  '#FB923C',
  red:     '#F87171',
  muted:   '#6B7280',
  border:  '#2A2A2A',
  card:    '#141414',
  grid:    '#1F1F1F',
  white:   '#FFFFFF',
} as const

/** Default series color cycle */
export const CHART_PALETTE = [
  COLORS.lime,
  COLORS.blue,
  COLORS.violet,
  COLORS.emerald,
  COLORS.amber,
  COLORS.pink,
  COLORS.cyan,
  COLORS.orange,
]

/** Merge into any chart's tooltip block */
export const TOOLTIP_BASE = {
  backgroundColor: COLORS.card,
  borderColor:     COLORS.border,
  borderWidth:     1,
  textStyle: {
    color:      COLORS.white,
    fontSize:   12,
    fontFamily: "'Poppins', sans-serif",
  },
  extraCssText:
    'border-radius:10px;padding:10px 14px;box-shadow:0 8px 32px rgba(0,0,0,0.6);',
} as const

/** Merge into any x/y axis config */
export const AXIS_BASE = {
  axisLine:  { lineStyle: { color: COLORS.border } },
  axisTick:  { show: false },
  axisLabel: {
    color:      COLORS.muted,
    fontSize:   11,
    fontFamily: "'Poppins', sans-serif",
  },
  splitLine: {
    lineStyle: { color: COLORS.grid, type: 'dashed' as const },
  },
} as const

/** Standard grid padding -- use containLabel to handle long axis labels */
export const GRID_BASE = {
  left:         16,
  right:        24,
  top:          16,
  bottom:       16,
  containLabel: true,
} as const

/** Shared loading overlay config for ReactECharts showLoading */
export const LOADING_OPTION = {
  color:     COLORS.lime,
  textColor: COLORS.muted,
  maskColor: 'rgba(10,10,10,0.7)',
  text:      '',
  zlevel:    0,
} as const

/** Number formatters reused across charts */
export function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

export function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}
