'use client'

import { Activity, Bell, Moon, Plus, Search, Sun, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDashboardStore } from '@/lib/store'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

interface HeaderProps {
  title: string
  subtitle?: string
  searchValue: string
  onSearchChange: (value: string) => void
  onAddDevice?: () => void
  showAddButton?: boolean
  onReload?: () => void
}

export function Header({
  title,
  subtitle,
  searchValue,
  onSearchChange,
  onAddDevice,
  showAddButton = true,
  onReload,
}: HeaderProps) {
  const devices = useDashboardStore((s) => s.devices)
  const onlineCount = devices.filter((d) => d.status === 'online').length
  const updatingCount = devices.filter((d) => d.status === 'updating').length
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-neutral-200 bg-white/80 px-4 backdrop-blur-md md:px-6 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="flex flex-1 flex-col">
        <h1 className="text-base font-semibold text-neutral-900 md:text-lg dark:text-neutral-100">{title}</h1>
        {subtitle && (
          <p className="hidden text-xs text-neutral-500 sm:block dark:text-neutral-400">{subtitle}</p>
        )}
      </div>

      {/* Search */}
      <div className="relative hidden sm:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search devices, MAC, IP…"
          className="h-9 w-56 pl-9 md:w-72"
        />
      </div>

      {/* Live pill */}
      <div className="hidden items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 lg:flex dark:border-neutral-800 dark:bg-neutral-900">
        <Activity className="h-3.5 w-3.5 text-neutral-600 dark:text-neutral-400" />
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          {onlineCount} online{updatingCount > 0 ? ` · ${updatingCount} updating` : ''}
        </span>
      </div>

      {/* Theme toggle */}
      {mounted && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="transition-all duration-200"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-neutral-400" />
          ) : (
            <Moon className="h-4 w-4 text-neutral-600" />
          )}
        </Button>
      )}

      {/* Reload button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          if (onReload) onReload()
          else window.location.reload()
        }}
        className="transition-all duration-200"
        title="Reload data"
      >
        <RefreshCw className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
      </Button>

      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
        {updatingCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
        )}
      </Button>

      {showAddButton && onAddDevice && (
        <Button onClick={onAddDevice} size="sm" className="bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 dark:text-neutral-900">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Device</span>
        </Button>
      )}
    </header>
  )
}
