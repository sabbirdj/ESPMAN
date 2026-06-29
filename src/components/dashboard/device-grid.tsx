'use client'

import { useMemo, useState } from 'react'
import { useDashboardStore, type DashboardDevice } from '@/lib/store'
import { DeviceCard, DeviceCardEmpty } from './device-card'
import { ESP_TYPES, type EspType } from '@/lib/types'
import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface DeviceGridProps {
  searchQuery: string
  onSelectDevice: (device: DashboardDevice) => void
  onRebootDevice: (device: DashboardDevice) => void
}

export function DeviceGrid({ searchQuery, onSelectDevice, onRebootDevice }: DeviceGridProps) {
  const devices = useDashboardStore((s) => s.devices)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return devices.filter((d) => {
      if (typeFilter !== 'all' && d.type !== typeFilter) return false
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (!q) return true
      return (
        d.name.toLowerCase().includes(q) ||
        d.macAddress.toLowerCase().includes(q) ||
        (d.ipAddress ?? '').toLowerCase().includes(q) ||
        (d.location ?? '').toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        (d.firmwareVersion ?? '').toLowerCase().includes(q)
      )
    })
  }, [devices, searchQuery, typeFilter, statusFilter])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="h-9 bg-neutral-100 dark:bg-neutral-900">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="online" className="text-xs">Online</TabsTrigger>
            <TabsTrigger value="updating" className="text-xs">Updating</TabsTrigger>
            <TabsTrigger value="offline" className="text-xs">Offline</TabsTrigger>
            <TabsTrigger value="error" className="text-xs">Error</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ESP_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
          {filtered.length} of {devices.length} devices
        </span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <DeviceCardEmpty />
      ) : (
        <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onSelect={onSelectDevice}
              onReboot={onRebootDevice}
            />
          ))}
        </div>
      )}
    </div>
  )
}
