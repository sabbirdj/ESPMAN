'use client'

import { create } from 'zustand'
import type { DeviceLiveState, DeviceStatus, LogEntry } from '@/lib/types'

// A device as it lives in the dashboard client state.
// Combines persisted metadata (from API) with live telemetry (from socket).
export interface DashboardDevice {
  // persisted metadata
  id: string
  name: string
  type: string
  macAddress: string
  ipAddress?: string | null
  location?: string | null
  description?: string | null
  firmwareId?: string | null
  firmwareVersion?: string | null
  createdAt: string
  // live state (from socket)
  status: DeviceStatus
  cpuTemp: number | null
  heapUsed: number | null
  heapTotal: number | null
  flashUsed: number | null
  flashTotal: number | null
  wifiRssi: number | null
  uptimeSeconds: number
  gpioState: Record<string, boolean> | null
  gpioMode: Record<string, string> | null
  lastSeenAt: string | null
  // true when a real ESP is connected over the /esp WebSocket bridge.
  // undefined/false when this device is only simulated by device-service.
  isReal?: boolean
  // install progress (transient)
  installProgress?: number
}

interface DashboardState {
  devices: DashboardDevice[]
  logs: LogEntry[]
  connected: boolean

  setDevices: (devices: DashboardDevice[]) => void
  upsertDevice: (device: DashboardDevice) => void
  removeDevice: (id: string) => void
  applyTelemetry: (id: string, telemetry: Partial<DeviceLiveState>) => void
  applyUpdate: (id: string, changes: Partial<DeviceLiveState>) => void
  setInstallProgress: (id: string, progress: number) => void
  clearInstallProgress: (id: string) => void
  setConnected: (connected: boolean) => void
  appendLog: (entry: LogEntry) => void
  prependLogs: (entries: LogEntry[]) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  devices: [],
  logs: [],
  connected: false,

  setDevices: (devices) =>
    set((state) => {
      // Merge: keep any devices that were added via socket events (e.g. real
      // ESPs that aren't in the DB yet) and update existing ones with DB metadata.
      const existingById = new Map(state.devices.map((d) => [d.id, d]))
      const merged = devices.map((d) => {
        const existing = existingById.get(d.id)
        if (existing) {
          // Preserve live state from socket, overlay DB metadata
          return { ...existing, ...d }
        }
        return d
      })
      // Add any devices that exist in store but not in the incoming list
      // (e.g. real ESPs registered via socket but not yet in DB)
      const incomingIds = new Set(devices.map((d) => d.id))
      const extra = state.devices.filter((d) => !incomingIds.has(d.id))
      return { devices: [...merged, ...extra] }
    }),

  upsertDevice: (device) =>
    set((state) => {
      const idx = state.devices.findIndex((d) => d.id === device.id)
      if (idx === -1) return { devices: [device, ...state.devices] }
      const updated = [...state.devices]
      updated[idx] = { ...updated[idx], ...device }
      return { devices: updated }
    }),

  removeDevice: (id) =>
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== id),
    })),

  applyTelemetry: (id, telemetry) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === id ? { ...d, ...telemetry, status: telemetry.status ?? d.status } : d
      ),
    })),

  applyUpdate: (id, changes) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === id ? { ...d, ...changes } : d
      ),
    })),

  setInstallProgress: (id, progress) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === id ? { ...d, installProgress: progress } : d
      ),
    })),

  clearInstallProgress: (id) =>
    set((state) => ({
      devices: state.devices.map((d) => {
        if (d.id !== id) return d
        const { installProgress, ...rest } = d
        return rest as DashboardDevice
      }),
    })),

  setConnected: (connected) => set({ connected }),

  appendLog: (entry) =>
    set((state) => ({
      logs: [entry, ...state.logs].slice(0, 200),
    })),

  prependLogs: (entries) =>
    set((state) => {
      const existingIds = new Set(state.logs.map((l) => l.id))
      const fresh = entries.filter((e) => !existingIds.has(e.id))
      return { logs: [...state.logs, ...fresh].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ).slice(0, 200) }
    }),
}))
