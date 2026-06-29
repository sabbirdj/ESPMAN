// Shared types for ESP Device Manager

export type EspType =
  | 'ESP8266'
  | 'ESP32'
  | 'ESP32-S2'
  | 'ESP32-S3'
  | 'ESP32-C3'
  | 'ESP32-C6'

export const ESP_TYPES: EspType[] = [
  'ESP8266',
  'ESP32',
  'ESP32-S2',
  'ESP32-S3',
  'ESP32-C3',
  'ESP32-C6',
]

export const ESP_TYPE_SPECS: Record<EspType, {
  label: string
  cpu: string
  flash: string
  ram: string
  wifi: string
  bluetooth: string
  pins: number
  color: string
}> = {
  'ESP8266':  { label: 'ESP8266',   cpu: 'Tensica L106 80MHz',  flash: '4 MB',   ram: '50 KB',  wifi: '2.4 GHz b/g/n', bluetooth: 'No',            pins: 11, color: '#94a3b8' },
  'ESP32':    { label: 'ESP32',     cpu: 'Xtensa LX6 240MHz',   flash: '4 MB',   ram: '520 KB', wifi: '2.4 GHz b/g/n', bluetooth: 'BLE 4.2',       pins: 34, color: '#64748b' },
  'ESP32-S2': { label: 'ESP32-S2',  cpu: 'Xtensa LX7 240MHz',   flash: '4 MB',   ram: '320 KB', wifi: '2.4 GHz b/g/n', bluetooth: 'No',            pins: 43, color: '#475569' },
  'ESP32-S3': { label: 'ESP32-S3',  cpu: 'Xtensa LX7 240MHz',   flash: '8 MB',   ram: '512 KB', wifi: '2.4 GHz b/g/n', bluetooth: 'BLE 5.0',       pins: 45, color: '#334155' },
  'ESP32-C3': { label: 'ESP32-C3',  cpu: 'RISC-V 160MHz',       flash: '4 MB',   ram: '400 KB', wifi: '2.4 GHz b/g/n', bluetooth: 'BLE 5.0',       pins: 22, color: '#1e293b' },
  'ESP32-C6': { label: 'ESP32-C6',  cpu: 'RISC-V 160MHz',       flash: '4 MB',   ram: '512 KB', wifi: 'Wi-Fi 6 (ax)',  bluetooth: 'BLE 5.3 + Zigbee', pins: 30, color: '#0f172a' },
}

export type DeviceStatus = 'online' | 'offline' | 'updating' | 'error'

export interface DeviceTelemetry {
  id: string
  cpuTemp: number
  heapUsed: number
  wifiRssi: number
  uptimeSeconds: number
  lastSeenAt: string
}

export interface DeviceUpdate {
  id: string
  changes: Partial<DeviceLiveState>
}

export interface DeviceLiveState {
  status: DeviceStatus
  cpuTemp: number
  heapUsed: number
  heapTotal: number
  flashUsed: number
  flashTotal: number
  wifiRssi: number
  uptimeSeconds: number
  gpioState: Record<string, boolean>
  firmwareVersion?: string
  ipAddress?: string
  macAddress: string
  lastSeenAt: string
  installProgress?: number
}

export interface LogEntry {
  id: string
  deviceId: string
  event: string // online | offline | reboot | command | firmware | error
  message: string
  level: 'info' | 'warn' | 'error' | 'success'
  createdAt: string
}

// Helper formatters
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function wifiSignalStrength(rssi: number): { label: string; pct: number } {
  // rssi: -30 (excellent) to -80 (very weak)
  const pct = Math.max(0, Math.min(100, Math.round((rssi + 90) * (100 / 60))))
  let label = 'Excellent'
  if (rssi < -70) label = 'Weak'
  else if (rssi < -60) label = 'Fair'
  else if (rssi < -50) label = 'Good'
  return { label, pct }
}

export function tempSeverity(celsius: number): 'ok' | 'warm' | 'hot' {
  if (celsius >= 65) return 'hot'
  if (celsius >= 50) return 'warm'
  return 'ok'
}
