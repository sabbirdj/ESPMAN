'use client'

import { useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Cpu, Info, Radio, RotateCw, XCircle,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useDashboardStore } from '@/lib/store'
import type { LogEntry } from '@/lib/types'

const levelConfig: Record<string, { icon: React.ElementType; cls: string; iconCls: string }> = {
  success: { icon: CheckCircle2, cls: 'text-neutral-900 dark:text-neutral-100', iconCls: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300' },
  info:    { icon: Info,         cls: 'text-neutral-700 dark:text-neutral-300',     iconCls: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' },
  warn:    { icon: AlertTriangle,cls: 'text-neutral-600 dark:text-neutral-400',     iconCls: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' },
  error:   { icon: XCircle,      cls: 'text-neutral-500 dark:text-neutral-500',       iconCls: 'bg-neutral-300 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400' },
}

const eventIcon: Record<string, React.ElementType> = {
  online: Radio,
  offline: Radio,
  reboot: RotateCw,
  command: Cpu,
  firmware: CheckCircle2,
  error: AlertTriangle,
}

export function ActivityLog({ height = 'h-[420px]' }: { height?: string }) {
  const logs = useDashboardStore((s) => s.logs)
  const prependLogs = useDashboardStore((s) => s.prependLogs)
  const [loading, setLoading] = useState(true)

  // Load initial logs from API on mount
  useEffect(() => {
    let mounted = true
    fetch('/api/logs?limit=100')
      .then((r) => r.json())
      .then((entries: LogEntry[]) => {
        if (!mounted) return
        // API returns with device name; we just need the entry shape that matches socket events
        const normalized: LogEntry[] = entries.map((e) => ({
          id: e.id,
          deviceId: e.deviceId,
          event: e.event,
          message: e.message,
          level: e.level,
          createdAt: e.createdAt,
        }))
        prependLogs(normalized)
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [prependLogs])

  return (
    <Card className={`flex flex-col border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 ${height}`}>
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Activity Log</h3>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
          {logs.length} events
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-neutral-50 dark:divide-neutral-900">
          {loading && logs.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-400">Loading activity log…</div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-400">No activity yet</div>
          ) : (
            logs.map((log) => {
              const level = levelConfig[log.level] ?? levelConfig.info
              const EventIcon = eventIcon[log.event] ?? Cpu
              const LevelIcon = level.icon
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${level.iconCls}`}>
                    <LevelIcon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <EventIcon className="h-3 w-3 text-neutral-400" />
                      <span className={`text-xs font-medium ${level.cls}`}>
                        {log.message}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
                      <span className="font-mono">{log.deviceId.slice(0, 12)}…</span>
                      <span>·</span>
                      <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Card>
  )
}
