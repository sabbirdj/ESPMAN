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
      gradient: 'from-slate-700 to-slate-900 dark:from-slate-200 dark:to-slate-400',
    },
    {
      label: 'Online Now',
      value: online,
      sub: total > 0 ? `${Math.round((online / total) * 100)}% of fleet` : '—',
      icon: Activity,
      color: 'slate',
      gradient: 'from-slate-600 to-slate-800 dark:from-slate-300 dark:to-slate-500',
    },
    {
      label: 'Firmware Images',
      value: stats?.firmware.total ?? '—',
      sub: stats ? `${stats.firmware.totalInstalls} installs` : 'loading…',
      icon: HardDrive,
      color: 'slate',
      gradient: 'from-slate-500 to-slate-700 dark:from-slate-400 dark:to-slate-600',
    },
    {
      label: 'Avg Wi-Fi Signal',
      value: avgSignal ? `${avgSignal.pct}%` : '—',
      sub: avgSignal ? `${avgSignal.label} · ${Math.round(avgRssi / Math.max(1, rssiCount))} dBm` : 'no devices',
      icon: Wifi,
      color: 'slate',
      gradient: 'from-slate-400 to-slate-600 dark:from-slate-500 dark:to-slate-700',
    },
  ]

  return (
    <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card
            key={card.label}
            className="relative overflow-hidden border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <span className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-50">
                  {card.value}
                </span>
                <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">{card.sub}</span>
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
        <Card className="col-span-full flex items-center gap-3 border-slate-300 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <AlertTriangle className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {error} device{error !== 1 ? 's' : ''} in error state
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-300">
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
        <Card key={i} className="flex h-32 items-center justify-center border-slate-200 dark:border-slate-800">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
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
