'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Cpu,
  Hash,
  Loader2,
  MapPin,
  Power,
  RotateCcw,
  RotateCw,
  Send,
  Signal,
  Thermometer,
  Trash2,
  Wifi,
  Clock,
  MemoryStick,
  HardDrive,
  Usb,
  TerminalSquare,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ESP_TYPE_SPECS, formatBytes, formatUptime, tempSeverity, wifiSignalStrength, type EspType } from '@/lib/types'
import { useDashboardStore, type DashboardDevice } from '@/lib/store'
import { useDeviceSocketEmitter } from '@/hooks/use-device-socket'

interface DeviceDetailDialogProps {
  device: DashboardDevice | null
  onOpenChange: (open: boolean) => void
  onDeviceRemoved?: () => void
}

export function DeviceDetailDialog({ device, onOpenChange, onDeviceRemoved }: DeviceDetailDialogProps) {
  const emitter = useDeviceSocketEmitter()
  const [command, setCommand] = useState('')
  const [rebooting, setRebooting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'telemetry' | 'gpio' | 'terminal'>('telemetry')
  
  const logs = useDashboardStore((s) => s.logs)
  const deviceLogs = device ? logs.filter((l) => l.deviceId === device.id) : []

  if (!device) return null

  const spec = ESP_TYPE_SPECS[device.type as EspType]
  const wifi = device.wifiRssi != null ? wifiSignalStrength(device.wifiRssi) : null
  const tempSev = device.cpuTemp != null ? tempSeverity(device.cpuTemp) : 'ok'
  const heapPct = device.heapUsed != null && device.heapTotal ? Math.round((device.heapUsed / device.heapTotal) * 100) : null
  const flashPct = device.flashUsed != null && device.flashTotal ? Math.round((device.flashUsed / device.flashTotal) * 100) : null

  const isUpdating = device.status === 'updating'
  const isOffline = device.status === 'offline'

  const handleReboot = async () => {
    if (!device) return
    setRebooting(true)
    try {
      // 1. Tell API to log the command + mark device offline
      await fetch(`/api/devices/${device.id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reboot' }),
      })
      // 2. Tell device-service to simulate the reboot
      emitter.reboot(device.id)
      toast.success(`Reboot sent to ${device.name}`)
    } catch {
      toast.error('Failed to send reboot')
    } finally {
      setRebooting(false)
    }
  }

  const handleFactoryReset = async () => {
    if (!device) return
    if (!confirm(`Factory reset ${device.name}? This will erase its firmware and GPIO state.`)) return
    setResetting(true)
    try {
      await fetch(`/api/devices/${device.id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'factory-reset' }),
      })
      emitter.factoryReset(device.id)
      toast.success(`Factory reset initiated on ${device.name}`)
    } catch {
      toast.error('Failed to factory reset')
    } finally {
      setResetting(false)
    }
  }

  const handleDelete = async () => {
    if (!device) return
    if (!confirm(`Delete ${device.name}? This permanently removes it from your fleet.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/devices/${device.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      emitter.removeDevice(device.id)
      toast.success(`${device.name} removed from fleet`)
      onDeviceRemoved?.()
      onOpenChange(false)
    } catch {
      toast.error('Failed to delete device')
    } finally {
      setDeleting(false)
    }
  }

  const handleToggleGpio = (pin: number, current: boolean) => {
    if (!device) return
    emitter.toggleGpio(device.id, pin, !current)
    // Log via API (best-effort)
    fetch(`/api/devices/${device.id}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gpio', payload: { pin, value: !current } }),
    }).catch(() => {})
  }

  const handleSetPinMode = (pin: number, currentMode: string) => {
    if (!device) return
    const modes = ['INPUT', 'OUTPUT', 'INPUT_PULLUP']
    const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length]
    emitter.setPinMode(device.id, pin, nextMode)
  }

  const handleSendCommand = () => {
    if (!device || !command.trim()) return
    emitter.sendCommand(device.id, command.trim())
    fetch(`/api/devices/${device.id}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'serial', payload: { command: command.trim() } }),
    }).catch(() => {})
    toast.success(`Command sent: ${command.trim()}`)
    setCommand('')
  }

  return (
    <Dialog open={!!device} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-[780px]">
        {/* Header banner */}
        <div
          className="h-2 w-full shrink-0"
          style={{ backgroundColor: spec?.color ?? '#64748b' }}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <DialogHeader className="px-6 pb-2 pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg text-white shadow-sm"
                  style={{ backgroundColor: spec?.color ?? '#10b981' }}
                >
                  <Cpu className="h-6 w-6" />
                </div>
                <div>
                  <DialogTitle className="text-lg">{device.name}</DialogTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]" style={{ color: spec?.color, borderColor: `${spec?.color}40` }}>
                      {device.type}
                    </Badge>
                    {device.isReal && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-neutral-300 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-300">
                        <Usb className="h-2.5 w-2.5" />
                        ESP connected
                      </Badge>
                    )}
                    <StatusBadge status={device.status} />
                    {device.firmwareVersion && (
                      <Badge variant="secondary" className="text-[10px] font-mono">v{device.firmwareVersion}</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReboot}
                  disabled={rebooting || isUpdating || isOffline}
                  className="h-8"
                >
                  {rebooting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                  Reboot
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFactoryReset}
                  disabled={resetting || isUpdating}
                  className="h-8 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Reset
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-8 w-8 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex border-b border-neutral-200 px-6 dark:border-neutral-800">
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'telemetry' ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300'}`}
            >
              <Signal className="h-4 w-4" /> Telemetry
            </button>
            <button
              onClick={() => setActiveTab('gpio')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'gpio' ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300'}`}
            >
              <Power className="h-4 w-4" /> GPIO Control
            </button>
            <button
              onClick={() => setActiveTab('terminal')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'terminal' ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300'}`}
            >
              <TerminalSquare className="h-4 w-4" /> Terminal
            </button>
          </div>

          <ScrollArea className="flex-1 px-6">
            <div className="space-y-5 py-5">
              {/* Telemetry Tab */}
              {activeTab === 'telemetry' && (
                <>
                  <section>
                    <SectionTitle icon={<Cpu className="h-3.5 w-3.5" />}>Identity</SectionTitle>
                    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                      <Meta label="MAC Address" value={device.macAddress} mono />
                      <Meta label="IP Address" value={device.ipAddress ?? '—'} mono />
                      <Meta label="Location" value={device.location ?? '—'} />
                      <Meta label="Chip" value={`${device.type} · ${spec?.cpu ?? ''}`} />
                      <Meta label="Flash" value={spec?.flash ?? '—'} />
                      <Meta label="RAM" value={spec?.ram ?? '—'} />
                      <Meta label="Wi-Fi" value={spec?.wifi ?? '—'} />
                      <Meta label="Bluetooth" value={spec?.bluetooth ?? '—'} />
                      <Meta label="GPIO Pins" value={`${spec?.pins ?? '—'} total`} />
                    </div>
                    {device.description && (
                      <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                        {device.description}
                      </div>
                    )}
                  </section>

                  {!isUpdating && !isOffline && (
                    <section>
                      <SectionTitle icon={<Thermometer className="h-3.5 w-3.5" />}>Live Telemetry</SectionTitle>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Metric
                          icon={<Thermometer className="h-3.5 w-3.5" />}
                          label="CPU Temp"
                          value={device.cpuTemp != null ? `${device.cpuTemp.toFixed(1)}°C` : '—'}
                          tone={tempSev === 'hot' ? 'danger' : tempSev === 'warm' ? 'warn' : 'ok'}
                        />
                        <Metric
                          icon={<Signal className="h-3.5 w-3.5" />}
                          label="Wi-Fi RSSI"
                          value={device.wifiRssi != null ? `${device.wifiRssi} dBm` : '—'}
                          sub={wifi?.label}
                          tone={wifi && wifi.pct > 60 ? 'ok' : wifi && wifi.pct > 30 ? 'warn' : 'danger'}
                        />
                        <Metric
                          icon={<MemoryStick className="h-3.5 w-3.5" />}
                          label="Heap Used"
                          value={heapPct != null ? `${heapPct}%` : '—'}
                          sub={device.heapUsed != null && device.heapTotal ? `${formatBytes(device.heapUsed)} / ${formatBytes(device.heapTotal)}` : undefined}
                        />
                        <Metric
                          icon={<Clock className="h-3.5 w-3.5" />}
                          label="Uptime"
                          value={device.uptimeSeconds ? formatUptime(device.uptimeSeconds) : '—'}
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <StorageBar
                          icon={<MemoryStick className="h-3.5 w-3.5" />}
                          label="Heap"
                          used={device.heapUsed}
                          total={device.heapTotal}
                        />
                        <StorageBar
                          icon={<HardDrive className="h-3.5 w-3.5" />}
                          label="Flash"
                          used={device.flashUsed}
                          total={device.flashTotal}
                        />
                      </div>

                      {device.lastSeenAt && (
                        <p className="mt-3 text-[11px] text-neutral-400 dark:text-neutral-500">
                          Last seen {new Date(device.lastSeenAt).toLocaleString()}
                        </p>
                      )}
                    </section>
                  )}
                </>
              )}

              {/* GPIO Tab */}
              {activeTab === 'gpio' && (
                <section>
                  <SectionTitle icon={<Power className="h-3.5 w-3.5" />}>Full GPIO Control</SectionTitle>
                  <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                    Set pins to INPUT to read sensors, or OUTPUT to control relays.
                  </p>
                  {device.gpioState && Object.keys(device.gpioState).length > 0 ? (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                      {Object.entries(device.gpioState).map(([pin, on]) => {
                        const mode = device.gpioMode?.[pin] ?? 'INPUT'
                        const isOutput = mode === 'OUTPUT'
                        return (
                          <div
                            key={pin}
                            className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 transition-all ${
                              on
                                ? 'border-neutral-900 bg-neutral-100 dark:border-neutral-200 dark:bg-neutral-800'
                                : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'
                            }`}
                          >
                            <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">GPIO {pin}</span>
                            
                            {/* Mode Toggle Button */}
                            <button
                              onClick={() => handleSetPinMode(Number(pin), mode)}
                              disabled={isUpdating || isOffline}
                              className="rounded bg-neutral-200 px-1.5 py-0.5 text-[9px] font-bold text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                            >
                              {mode}
                            </button>

                            {/* Value Toggle Button */}
                            <button
                              onClick={() => handleToggleGpio(Number(pin), on)}
                              disabled={isUpdating || isOffline || !isOutput}
                              className={`mt-1 flex w-full flex-col items-center gap-1 rounded-md py-1.5 ${!isOutput ? 'cursor-not-allowed opacity-70' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                            >
                              <span className={`text-lg font-black ${on ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'}`}>
                                {on ? '1' : '0'}
                              </span>
                              <div className={`h-1.5 w-full rounded-full ${on ? 'bg-neutral-900 dark:bg-neutral-100' : 'bg-neutral-200 dark:bg-neutral-700'}`} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400 dark:border-neutral-700">
                      Waiting for GPIO state from ESP...
                    </div>
                  )}
                </section>
              )}

              {/* Terminal Tab */}
              {activeTab === 'terminal' && (
                <section className="flex h-[55vh] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-neutral-950 shadow-inner dark:border-neutral-800">
                  <div className="flex items-center justify-between bg-neutral-900 px-3 py-2 border-b border-neutral-800">
                    <span className="flex items-center gap-2 text-xs font-medium text-neutral-400">
                      <TerminalSquare className="h-4 w-4" /> Serial Monitor
                    </span>
                    <span className="text-[10px] text-emerald-500">Connected to /dev/ttyUSB0</span>
                  </div>
                  <ScrollArea className="flex-1 p-3">
                    <div className="space-y-1.5 font-mono text-xs">
                      {deviceLogs.slice().reverse().map((log) => (
                        <div key={log.id} className="flex gap-3">
                          <span className="shrink-0 text-neutral-600">[{new Date(log.createdAt).toLocaleTimeString()}]</span>
                          <span className={
                            log.level === 'error' ? 'text-rose-400' :
                            log.level === 'warn' ? 'text-amber-400' :
                            log.level === 'success' ? 'text-emerald-400' :
                            'text-neutral-300'
                          }>
                            {log.event === 'command' ? '> ' : ''}{log.message}
                          </span>
                        </div>
                      ))}
                      {deviceLogs.length === 0 && (
                        <div className="text-neutral-600">Waiting for serial output...</div>
                      )}
                    </div>
                  </ScrollArea>
                  <div className="flex bg-neutral-900 p-2 border-t border-neutral-800">
                    <div className="flex w-full items-center gap-2 rounded bg-black px-2 ring-1 ring-neutral-800 focus-within:ring-emerald-500">
                      <span className="font-mono text-emerald-500">$</span>
                      <Input
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendCommand() }}
                        placeholder="Type a command (e.g. sys.info)..."
                        className="h-8 border-0 bg-transparent p-0 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus-visible:ring-0"
                        disabled={isUpdating || isOffline}
                        autoFocus
                      />
                      <Button
                        onClick={handleSendCommand}
                        disabled={!command.trim() || isUpdating || isOffline}
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-emerald-500 hover:bg-emerald-950 hover:text-emerald-400"
                      >
                        <Send className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </section>
              )}
              
              {/* Common Status messages */}
              {isUpdating && activeTab === 'telemetry' && (
                <section className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">Firmware update in progress…</span>
                  </div>
                  <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">
                    The device is downloading and applying the new firmware. It will come back online automatically when complete.
                  </p>
                </section>
              )}

              {isOffline && activeTab === 'telemetry' && (
                <section className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900">
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Device is offline</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {device.lastSeenAt
                      ? `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`
                      : 'Device has not yet reported to the dashboard.'}
                  </p>
                </section>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      <span className="text-neutral-400">{icon}</span>
      {children}
    </h3>
  )
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-neutral-50 p-2.5 dark:bg-neutral-900">
      <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={`mt-0.5 truncate text-xs text-neutral-700 dark:text-neutral-300 ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </div>
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: 'ok' | 'warn' | 'danger' | 'neutral'
}) {
  const toneClass = {
    ok: 'text-emerald-600',
    warn: 'text-amber-600',
    danger: 'text-rose-600',
    neutral: 'text-neutral-700 dark:text-neutral-300',
  }[tone]
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-neutral-400">{sub}</div>}
    </div>
  )
}

function StorageBar({
  icon, label, used, total,
}: { icon: React.ReactNode; label: string; used: number | null; total: number | null }) {
  const pct = used != null && total ? Math.min(100, Math.round((used / total) * 100)) : 0
  const tone = pct > 85 ? 'bg-rose-500' : pct > 65 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-neutral-600 dark:text-neutral-300">
          {icon}
          {label}
        </span>
        <span className="text-neutral-500 dark:text-neutral-400">
          {used != null ? formatBytes(used) : '—'} / {total ? formatBytes(total) : '—'}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    online:   { label: 'Online',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
    offline:  { label: 'Offline',  cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
    updating: { label: 'Updating', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
    error:    { label: 'Error',    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  }
  const c = config[status] ?? config.offline
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.cls}`}>
    <span className="relative flex h-1.5 w-1.5">
      {(status === 'online' || status === 'updating') && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
      )}
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
    </span>
    {c.label}
  </span>
}
