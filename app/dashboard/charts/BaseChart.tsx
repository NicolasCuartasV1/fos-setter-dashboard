'use client'

import { useRef } from 'react'
import dynamic from 'next/dynamic'
import type EChartsReact from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { LOADING_OPTION } from '@/lib/chart-theme'

const ReactECharts = dynamic<React.ComponentProps<typeof EChartsReact>>(
  () => import('echarts-for-react'),
  { ssr: false, loading: () => <Skeleton /> },
)

function Skeleton() {
  return <div className="w-full animate-pulse bg-[#1A1A1A] rounded-lg" style={{ minHeight: 260 }} />
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3" style={{ minHeight: 180 }}>
      <div className="w-10 h-10 rounded-full border border-[#2A2A2A] flex items-center justify-center opacity-40">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
        </svg>
      </div>
      <p className="text-xs text-muted text-center max-w-[200px] leading-relaxed">{message}</p>
    </div>
  )
}

export interface BaseChartProps {
  title:          string
  subtitle?:      string
  option:         EChartsOption
  height?:        number
  loading?:       boolean
  empty?:         boolean
  emptyMessage?:  string
  headerAction?:  React.ReactNode
  onEvents?:      Record<string, (params: unknown) => void>
  className?:     string
}

export function BaseChart({
  title, subtitle, option, height = 320, loading = false,
  empty = false, emptyMessage = 'No data matches the current filters.',
  headerAction, onEvents, className = '',
}: BaseChartProps) {
  const instanceRef = useRef<unknown>(null)

  function handleExport() {
    const inst = instanceRef.current as { getDataURL?: (o: object) => string } | null
    if (!inst?.getDataURL) return
    const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0A0A0A' })
    const a = document.createElement('a')
    a.href = url
    a.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png'
    a.click()
  }

  return (
    <div className={`bg-card border border-border rounded-xl p-5 flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white leading-snug">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted mt-0.5 leading-relaxed">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {headerAction}
          {!empty && (
            <button
              onClick={handleExport}
              title="Export PNG"
              className="text-muted hover:text-white transition-colors p-1 rounded"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1" style={{ minHeight: height }}>
        {empty ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <ReactECharts
            option={{
              backgroundColor: 'transparent',
              animation: true,
              animationDuration: 600,
              animationEasing: 'cubicOut',
              ...option,
            }}
            style={{ height, width: '100%' }}
            showLoading={loading}
            loadingOption={LOADING_OPTION}
            onEvents={onEvents ?? {}}
            opts={{ renderer: 'svg' }}
            notMerge
            onChartReady={(inst: unknown) => { instanceRef.current = inst }}
          />
        )}
      </div>
    </div>
  )
}
