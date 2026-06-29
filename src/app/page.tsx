'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MobileNav } from '@/components/dashboard/mobile-nav'
import { Header } from '@/components/dashboard/header'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { DeviceGrid } from '@/components/dashboard/device-grid'
import { DeviceCard } from '@/components/dashboard/device-card'
import { AddDeviceDialog } from '@/components/dashboard/add-device-dialog'
import { DeviceDetailDialog } from '@/components/dashboard/device-detail-dialog'
import { FirmwareManager } from '@/components/dashboard/firmware-manager'
import { CloudCompiler } from '@/components/dashboard/cloud-compiler'
import { ActivityLog } from '@/components/dashboard/activity-log'
import { FleetBreakdown } from '@/components/dashboard/fleet-breakdown'
import { useDeviceSocket, useDeviceSocketEmitter } from '@/hooks/use-device-socket'
import { useDashboardStore, type DashboardDevice } from '@/lib/store'
import { toast } from 'sonner'
import { Radio } from 'lucide-react'
import { Card } from '@/components/ui/card'

type View = 'dashboard' | 'devices' | 'firmware' | 'compiler' | 'logs'

export default function Home() {
  useDeviceSocket()
  const emitter = useDeviceSocketEmitter()
  const setDevices = useDashboardStore((s) => s.setDevices)
  const devices = useDashboardStore((s) => s.devices)

  const [view, setView] = useState<View>('dashboard')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  // Derive the live device from the store so the detail dialog always shows
  // the latest telemetry without needing a sync effect.
  const selectedDevice = useMemo(
    () => (selectedDeviceId ? devices.find((d) => d.id === selectedDeviceId) ?? null : null),
    [selectedDeviceId, devices]
  )

  // Load devices from API on mount (persisted metadata). The socket will then
  // overlay live telemetry state on top of this. Real ESPs that connect while
  // the dashboard is open will be added via the device:registered socket event.
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/devices')
        const data = await res.json()
        if (!mounted) return
        const initial: DashboardDevice[] = data.map((d: any) => {
          // Parse gpioState from DB (stored as JSON string or null)
          let gpioState: Record<string, boolean> | null = null
          if (d.gpioState) {
            try {
              gpioState = typeof d.gpioState === 'string' ? JSON.parse(d.gpioState) : d.gpioState
            } catch { gpioState = null }
          }
          return {
            id: d.id,
            name: d.name,
            type: d.type,
            macAddress: d.macAddress,
            ipAddress: d.ipAddress,
            location: d.location,
            description: d.description,
            firmwareId: d.firmwareId,
            firmwareVersion: d.firmwareVersion,
            createdAt: d.createdAt,
            // DB devices start offline until the real ESP connects via WebSocket
            status: d.status ?? 'offline',
            cpuTemp: d.cpuTemp,
            heapUsed: d.heapUsed,
            heapTotal: d.heapTotal,
            flashUsed: d.flashUsed,
            flashTotal: d.flashTotal,
            wifiRssi: d.wifiRssi,
            uptimeSeconds: d.uptimeSeconds ?? 0,
            gpioState,
            lastSeenAt: d.lastSeenAt,
            isReal: false,
          }
        })
        setDevices(initial)
      } catch (err) {
        console.error('Failed to load devices', err)
      }
    }
    load()
    return () => { mounted = false }
  }, [setDevices])

  // Reboot handler — used by device card and detail dialog
  const handleReboot = useCallback(async (device: DashboardDevice) => {
    try {
      await fetch(`/api/devices/${device.id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reboot' }),
      })
      emitter.reboot(device.id)
      toast.success(`Reboot sent to ${device.name}`)
    } catch {
      toast.error('Failed to send reboot')
    }
  }, [emitter])

  // Keep selectedDevice in sync with store updates so the detail dialog
  // shows live telemetry as it streams in. (No-op now — selectedDevice is
  // derived directly from the store via useMemo above.)

  const headerTitles: Record<View, { title: string; subtitle: string; showAdd: boolean }> = {
    dashboard: { title: 'Dashboard', subtitle: 'Real-time overview of your ESP fleet', showAdd: true },
    devices:   { title: 'Devices',   subtitle: 'Manage and control all registered ESP devices', showAdd: true },
    firmware:  { title: 'Firmware',  subtitle: 'Upload and distribute firmware to your devices', showAdd: false },
    compiler:  { title: 'Cloud Compiler', subtitle: 'Write code and compile firmware remotely', showAdd: false },
    logs:      { title: 'Activity Log', subtitle: 'Audit trail of all device events and commands', showAdd: false },
  }

  // Recent devices for dashboard overview (max 8)
  const recentDevices = [...devices]
    .sort((a, b) => {
      const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0
      const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0
      return bTime - aTime
    })
    .slice(0, 8)

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar activeView={view} onViewChange={setView} />

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <Header
          title={headerTitles[view].title}
          subtitle={headerTitles[view].subtitle}
          searchValue={search}
          onSearchChange={setSearch}
          onAddDevice={() => setAddOpen(true)}
          showAddButton={headerTitles[view].showAdd}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {view === 'dashboard' && (
            <div className="space-y-6">
              <StatsCards />

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Devices</h2>
                    <button
                      onClick={() => setView('devices')}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      View all →
                    </button>
                  </div>
                  {recentDevices.length === 0 ? (
                    <Card className="flex h-32 items-center justify-center border-dashed border-slate-300 dark:border-slate-700">
                      <span className="text-sm text-slate-400">No devices registered yet</span>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {recentDevices.map((device) => (
                        <DeviceCard
                          key={device.id}
                          device={device}
                          onSelect={(d) => setSelectedDeviceId(d.id)}
                          onReboot={handleReboot}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-6">
                  <FleetBreakdown />
                  <ActivityLog height="h-[250px]" />
                </div>
              </div>
            </div>
          )}

          {view === 'devices' && (
            <div className="space-y-6">
              <StatsCards />
              <DeviceGrid
                searchQuery={search}
                onSelectDevice={(d) => setSelectedDeviceId(d.id)}
                onRebootDevice={handleReboot}
              />
            </div>
          )}

          {view === 'firmware' && (
            <FirmwareManager />
          )}

          {view === 'compiler' && (
            <CloudCompiler />
          )}

          {view === 'logs' && (
            <div className="space-y-4">
              <Card className="flex items-center gap-3 border-slate-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <Radio className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                    Live event stream active
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Events from the device-service arrive in real time. Older events are persisted in the database and loaded on first visit.
                  </p>
                </div>
              </Card>
              <ActivityLog height="h-[calc(100vh-220px)]" />
            </div>
          )}
        </main>
      </div>

      <MobileNav activeView={view} onViewChange={setView} />

      <AddDeviceDialog open={addOpen} onOpenChange={setAddOpen} />
      <DeviceDetailDialog
        device={selectedDevice}
        onOpenChange={(open) => { if (!open) setSelectedDeviceId(null) }}
      />
    </div>
  )
}
