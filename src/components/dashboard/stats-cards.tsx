'use client'

import { Activity, AlertTriangle, Cpu, HardDrive, Loader2, RefreshCw, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { useDashboardStore } from '@/lib/store'
import { wifiSignalStrength } from '@/lib/types'

interface Stats {
  firmware: { total: number; totalInstalls: number }
  devicesByType: { type: string; count: number }[]
}

export function StatsCards() {
  const devices = useDashboardStore((s) => s.devices)
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let mounted = true
    const load = () => fetch('/api/stats').then((r) => r.json()).then((s) => { if (mounted) setStats(s) })
    load()
    const interval = setInterval(load, 8000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const total = devices.length
  const online = devices.filter((d) => d.status === 'online').length
  const updating = devices.filter((d) => d.status === 'updating').length
  const error = devices.filter((d) => d.status === 'error').length
  const avgRssi = devices.filter((d) => d.wifiRssi != null).reduce((acc, d) => acc + (d.wifiRssi ?? 0), 0)
  const rssiCount = devices.filter((d) => d.wifiRssi != null).length
  const avgSignal = rssiCount > 0 ? wifiSignalStrength(avgRssi / rssiCount) : null

  const cards = [
    {
      label: 'Total Devices',
      value: total,
      sub: `${online} online · ${updating} updating`,
      icon: Cpu,
      color: 'slate',
      gradient: 'from-neutral-700 to-neutral-900 dark:from-neutral-200 dark:to-neutral-400',
    },
    {
      label: 'Online Now',
      value: online,
      sub: total > 0 ? `${Math.round((online / total) * 100)}% of fleet` : '—',
      icon: Activity,
      color: 'slate',
      gradient: 'from-neutral-600 to-neutral-800 dark:from-neutral-300 dark:to-neutral-500',
    },
    {
      label: 'Firmware Images',
      value: stats?.firmware.total ?? '—',
      sub: stats ? `${stats.firmware.totalInstalls} installs` : 'loading…',
      icon: HardDrive,
      color: 'slate',
      gradient: 'from-neutral-500 to-neutral-700 dark:from-neutral-400 dark:to-neutral-600',
    },
    {
      label: 'Avg Wi-Fi Signal',
      value: avgSignal ? `${avgSignal.pct}%` : '—',
      sub: avgSignal ? `${avgSignal.label} · ${Math.round(avgRssi / Math.max(1, rssiCount))} dBm` : 'no devices',
      icon: Wifi,
      color: 'slate',
      gradient: 'from-neutral-400 to-neutral-600 dark:from-neutral-500 dark:to-neutral-700',
    },
  ]

  return (
    <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card
            key={card.label}
            className="relative overflow-hidden border-neutral-200 bg-white p-5 transition-all duration-200 hover:-tranneutral-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {card.label}
                </span>
                <span className="mt-2 text-3xl font-bold text-neutral-900 dark:text-neutral-50">
                  {card.value}
                </span>
                <span className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{card.sub}</span>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${card.gradient} text-white shadow-md`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            {/* Decorative bottom accent */}
            <div className={`mt-4 h-1 w-full rounded-full bg-gradient-to-r ${card.gradient} opacity-60`} />
          </Card>
        )
      })}

      {error > 0 && (
        <Card className="col-span-full flex items-center gap-3 border-neutral-300 bg-neutral-100 p-4 dark:border-neutral-700 dark:bg-neutral-800/40">
          <AlertTriangle className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {error} device{error !== 1 ? 's' : ''} in error state
            </p>
            <p className="text-xs text-neutral-700 dark:text-neutral-300">
              Check the activity log for details or attempt to reboot the affected devices.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="flex h-32 items-center justify-center border-neutral-200 dark:border-neutral-800">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </Card>
      ))}
    </div>
  )
}

export function StatsCardsRefreshButton() {
  return (
    <RefreshCw className="h-3 w-3" />
  )
}
