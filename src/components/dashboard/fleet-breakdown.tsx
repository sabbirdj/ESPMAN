'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { ESP_TYPE_SPECS, type EspType } from '@/lib/types'
import { useDashboardStore } from '@/lib/store'
import { Cpu } from 'lucide-react'

interface Stats {
  devices: { total: number; online: number; offline: number; updating: number; error: number }
  firmware: { total: number; totalInstalls: number }
  devicesByType: { type: string; count: number }[]
}

export function FleetBreakdown() {
  const [stats, setStats] = useState<Stats | null>(null)
  const devices = useDashboardStore((s) => s.devices)

  useEffect(() => {
    let mounted = true
    const load = () => fetch('/api/stats').then((r) => r.json()).then((s) => { if (mounted) setStats(s) })
    load()
    const interval = setInterval(load, 8000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  // Live computed distribution by type
  const liveByType = devices.reduce<Record<string, number>>((acc, d) => {
    acc[d.type] = (acc[d.type] ?? 0) + 1
    return acc
  }, {})
  const total = devices.length

  return (
    <Card className="border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          <Cpu className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
          Fleet by Chip Type
        </h3>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{total} total</span>
      </div>

      {/* Bar */}
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        {Object.entries(liveByType).map(([type, count]) => {
          const spec = ESP_TYPE_SPECS[type as EspType]
          const pct = (count / total) * 100
          return (
            <div
              key={type}
              style={{ width: `${pct}%`, backgroundColor: spec?.color ?? '#10b981' }}
              title={`${type}: ${count}`}
              className="h-full transition-all duration-500"
            />
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.entries(liveByType).map(([type, count]) => {
          const spec = ESP_TYPE_SPECS[type as EspType]
          return (
            <div key={type} className="flex items-center gap-2 rounded-md bg-neutral-50 px-2 py-1.5 dark:bg-neutral-900">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: spec?.color ?? '#10b981' }} />
              <span className="flex-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">{type}</span>
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{count}</span>
            </div>
          )
        })}
        {Object.keys(liveByType).length === 0 && (
          <p className="col-span-full text-xs text-neutral-400">No devices in fleet yet.</p>
        )}
      </div>

      {/* Status summary */}
      <div className="mt-5 grid grid-cols-4 gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <StatusPill label="Online" value={devices.filter((d) => d.status === 'online').length} color="text-neutral-900 dark:text-neutral-100" />
        <StatusPill label="Updating" value={devices.filter((d) => d.status === 'updating').length} color="text-neutral-700 dark:text-neutral-300" />
        <StatusPill label="Offline" value={devices.filter((d) => d.status === 'offline').length} color="text-neutral-500" />
        <StatusPill label="Error" value={devices.filter((d) => d.status === 'error').length} color="text-neutral-600 dark:text-neutral-400" />
      </div>

      {stats && (
        <p className="mt-3 text-[11px] text-neutral-400 dark:text-neutral-500">
          {stats.firmware.total} firmware images available · {stats.firmware.totalInstalls} total installs logged
        </p>
      )}
    </Card>
  )
}

function StatusPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center rounded-md bg-neutral-50 py-2 dark:bg-neutral-900">
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</span>
    </div>
  )
}
