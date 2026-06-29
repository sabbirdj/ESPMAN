'use client'

import { Cpu, LayoutDashboard, MemoryStick, Radio, Settings, Wifi, Code } from 'lucide-react'
import { useDashboardStore } from '@/lib/store'

interface SidebarProps {
  activeView: 'dashboard' | 'devices' | 'firmware' | 'compiler' | 'logs'
  onViewChange: (view: 'dashboard' | 'devices' | 'firmware' | 'compiler' | 'logs') => void
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
    { id: 'compiler' as const, label: 'Cloud Compiler', icon: Code },
    { id: 'logs' as const, label: 'Activity Log', icon: Radio },
  ]

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-neutral-200 px-6 dark:border-neutral-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-neutral-700 to-neutral-900 text-white shadow-sm dark:from-neutral-200 dark:to-neutral-400 dark:text-neutral-900">
          <Cpu className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">ESP Manager</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Fleet Console</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-4">
        <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Workspace
        </div>
        {navItems.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300'}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  active
                    ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100'
                    : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Connection status footer */}
      <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
        <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              {connected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-500 opacity-75" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-neutral-900 dark:bg-neutral-100' : 'bg-neutral-400'}`} />
            </div>
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {connected ? 'Live connection' : 'Reconnecting…'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <Wifi className="h-3 w-3" />
            <span>device-service · port 3003</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
