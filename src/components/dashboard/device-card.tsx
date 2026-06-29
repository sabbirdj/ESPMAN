'use client'

import { useMemo } from 'react'
import {
  AlertTriangle,
  Cpu,
  Loader2,
  MapPin,
  Power,
  RotateCw,
  Signal,
  Thermometer,
  Clock,
  ChevronRight,
  Usb,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ESP_TYPE_SPECS, formatBytes, formatUptime, tempSeverity, wifiSignalStrength, type EspType } from '@/lib/types'
import type { DashboardDevice } from '@/lib/store'

interface DeviceCardProps {
  device: DashboardDevice
  onSelect: (device: DashboardDevice) => void
  onReboot: (device: DashboardDevice) => void
}

const statusConfig: Record<string, { label: string; dot: string; text: string; bg: string; ring: string }> = {
  online:   { label: 'Online',    dot: 'bg-emerald-500', text: 'text-emerald-700',   bg: 'bg-emerald-50',   ring: 'ring-emerald-200' },
  offline:  { label: 'Offline',   dot: 'bg-slate-400',   text: 'text-slate-600',     bg: 'bg-slate-100',    ring: 'ring-slate-200' },
  updating: { label: 'Updating',  dot: 'bg-amber-500',   text: 'text-amber-700',     bg: 'bg-amber-50',     ring: 'ring-amber-200' },
  error:    { label: 'Error',     dot: 'bg-rose-500',    text: 'text-rose-700',      bg: 'bg-rose-50',      ring: 'ring-rose-200' },
}

export function DeviceCard({ device, onSelect, onReboot }: DeviceCardProps) {
  const spec = ESP_TYPE_SPECS[device.type as EspType]
  const status = statusConfig[device.status] ?? statusConfig.offline
  const wifi = device.wifiRssi != null ? wifiSignalStrength(device.wifiRssi) : null
  const tempSev = device.cpuTemp != null ? tempSeverity(device.cpuTemp) : 'ok'
  const heapPct = device.heapUsed != null && device.heapTotal ? Math.round((device.heapUsed / device.heapTotal) * 100) : null
  const flashPct = device.flashUsed != null && device.flashTotal ? Math.round((device.flashUsed / device.flashTotal) * 100) : null

  const tempColor = tempSev === 'hot' ? 'text-rose-600' : tempSev === 'warm' ? 'text-amber-600' : 'text-emerald-600'

  const isUpdating = device.status === 'updating'
  const isOffline = device.status === 'offline'

  return (
    <Card
      className={`group relative overflow-hidden border-slate-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-950 dark:hover:shadow-black/40 ${
        isUpdating ? 'ring-2 ring-amber-300' : ''
      }`}
    >
      {/* Top accent strip — colored by device type */}
      <div
        className="h-1 w-full"
        style={{ backgroundColor: spec?.color ?? '#10b981' }}
      />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
              style={{ backgroundColor: spec?.color ?? '#10b981' }}
            >
              <Cpu className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <button
                onClick={() => onSelect(device)}
                className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:text-emerald-700 dark:text-slate-100 dark:hover:text-emerald-400"
                title={device.name}
              >
                {device.name}
              </button>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium" style={{ color: spec?.color, borderColor: `${spec?.color}40` }}>
                  {device.type}
                </Badge>
                {device.isReal && (
                  <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-medium border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" title="A real ESP is connected over WebSocket">
                    <Usb className="h-2.5 w-2.5" />
                    Connected
                  </Badge>
                )}
                {device.firmwareVersion && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    v{device.firmwareVersion}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${status.bg} ${status.text} ${status.ring}`}>
            <span className="relative flex h-1.5 w-1.5">
              {(device.status === 'online' || device.status === 'updating') && (
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${status.dot}`} />
              )}
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${status.dot}`} />
            </span>
            {status.label}
          </div>
        </div>

        {/* Location / MAC */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          {device.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {device.location}
            </span>
          )}
          <span className="font-mono">{device.macAddress}</span>
          {device.ipAddress && (
            <span className="font-mono">{device.ipAddress}</span>
          )}
        </div>

        {/* Install progress bar */}
        {isUpdating && typeof device.installProgress === 'number' && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
            <div className="flex items-center justify-between text-xs font-medium text-amber-700 dark:text-amber-300">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Installing firmware…
              </span>
              <span>{device.installProgress}%</span>
            </div>
            <Progress value={device.installProgress} className="mt-2 h-1.5 bg-amber-200" />
          </div>
        )}

        {/* Telemetry grid */}
        {!isUpdating && !isOffline && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <TelemetryTile
              icon={<Thermometer className="h-3.5 w-3.5" />}
              label="CPU Temp"
              value={device.cpuTemp != null ? `${device.cpuTemp.toFixed(1)}°C` : '—'}
              valueClass={tempColor}
            />
            <TelemetryTile
              icon={<Signal className="h-3.5 w-3.5" />}
              label="Wi-Fi"
              value={wifi ? `${wifi.pct}%` : '—'}
              sub={wifi ? wifi.label : undefined}
              valueClass={wifi && wifi.pct > 60 ? 'text-emerald-600' : wifi && wifi.pct > 30 ? 'text-amber-600' : 'text-rose-600'}
            />
            <TelemetryTile
              icon={<Cpu className="h-3.5 w-3.5" />}
              label="Heap"
              value={heapPct != null ? `${heapPct}%` : '—'}
              sub={device.heapUsed != null && device.heapTotal ? `${formatBytes(device.heapUsed)} / ${formatBytes(device.heapTotal)}` : undefined}
            />
            <TelemetryTile
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Uptime"
              value={device.uptimeSeconds ? formatUptime(device.uptimeSeconds) : '—'}
            />
          </div>
        )}

        {/* Offline state */}
        {isOffline && !isUpdating && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Device is offline. Last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleTimeString() : 'never'}.</span>
          </div>
        )}

        {/* GPIO quick view */}
        {device.gpioState && !isUpdating && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">GPIO</span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(device.gpioState).slice(0, 8).map(([pin, on]) => (
                <span
                  key={pin}
                  title={`GPIO ${pin}: ${on ? 'HIGH' : 'LOW'}`}
                  className={`inline-flex h-4 w-7 items-center justify-center rounded text-[9px] font-mono font-semibold ${
                    on
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                  }`}
                >
                  {pin}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReboot(device)}
            disabled={isUpdating || isOffline}
            className="h-8 text-xs"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Reboot
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(device)}
            className="ml-auto h-8 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            Manage
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

function TelemetryTile({
  icon,
  label,
  value,
  sub,
  valueClass = 'text-slate-900 dark:text-slate-100',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 dark:text-slate-500">{sub}</div>}
    </div>
  )
}

// Convenience export for empty state
export function DeviceCardEmpty() {
  return (
    <Card className="col-span-full flex flex-col items-center justify-center border-dashed border-slate-300 bg-slate-50/50 p-12 dark:border-slate-700 dark:bg-slate-900/30">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Power className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300">No devices connected</h3>
      <p className="mt-1 max-w-md text-center text-xs text-slate-500 dark:text-slate-400">
        Flash the firmware onto a real ESP8266/ESP32 board and it will appear here automatically
        when it boots. See <code className="rounded bg-slate-200 px-1 py-0.5 text-[10px] dark:bg-slate-800">firmware/README.md</code> for instructions.
      </p>
    </Card>
  )
}
