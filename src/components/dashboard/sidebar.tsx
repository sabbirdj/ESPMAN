'use client'

import { Cpu, LayoutDashboard, MemoryStick, Radio, Settings, Wifi } from 'lucide-react'
import { useDashboardStore } from '@/lib/store'

interface SidebarProps {
  activeView: 'dashboard' | 'devices' | 'firmware' | 'logs'
  onViewChange: (view: 'dashboard' | 'devices' | 'firmware' | 'logs') => void
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const devices = useDashboardStore((s) => s.devices)
  const connected = useDashboardStore((s) => s.connected)

  const onlineCount = devices.filter((d) => d.status === 'online').length
  const totalCount = devices.length

  const navItems = [
    { id: 'dashboard' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'devices' as const, label: 'Devices', icon: Cpu, badge: `${onlineCount}/${totalCount}` },
    { id: 'firmware' as const, label: 'Firmware', icon: MemoryStick },
    { id: 'logs' as const, label: 'Activity Log', icon: Radio },
  ]

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
          <Cpu className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">ESP Manager</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Fleet Console</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-4">
        <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Workspace
        </div>
        {navItems.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  active
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Connection status footer */}
      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              {connected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            </div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {connected ? 'Live connection' : 'Reconnecting…'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Wifi className="h-3 w-3" />
            <span>device-service · port 3003</span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 px-1 text-xs text-slate-400 dark:text-slate-500">
          <Settings className="h-3 w-3" />
          <span>v0.1.0 · Z.ai sandbox</span>
        </div>
      </div>
    </aside>
  )
}
