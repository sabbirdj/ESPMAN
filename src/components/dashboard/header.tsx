'use client'

import { Activity, Bell, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDashboardStore } from '@/lib/store'

interface HeaderProps {
  title: string
  subtitle?: string
  searchValue: string
  onSearchChange: (value: string) => void
  onAddDevice?: () => void
  showAddButton?: boolean
}

export function Header({
  title,
  subtitle,
  searchValue,
  onSearchChange,
  onAddDevice,
  showAddButton = true,
}: HeaderProps) {
  const devices = useDashboardStore((s) => s.devices)
  const onlineCount = devices.filter((d) => d.status === 'online').length
  const updatingCount = devices.filter((d) => d.status === 'updating').length

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md md:px-6 dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex flex-1 flex-col">
        <h1 className="text-base font-semibold text-slate-900 md:text-lg dark:text-slate-100">{title}</h1>
        {subtitle && (
          <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">{subtitle}</p>
        )}
      </div>

      {/* Search */}
      <div className="relative hidden sm:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search devices, MAC, IP…"
          className="h-9 w-56 pl-9 md:w-72"
        />
      </div>

      {/* Live pill */}
      <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <Activity className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {onlineCount} online{updatingCount > 0 ? ` · ${updatingCount} updating` : ''}
        </span>
      </div>

      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
        {updatingCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
        )}
      </Button>

      {showAddButton && onAddDevice && (
        <Button onClick={onAddDevice} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Device</span>
        </Button>
      )}
    </header>
  )
}
