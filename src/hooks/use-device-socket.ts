'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useDashboardStore, type DashboardDevice } from '@/lib/store'
import type { LogEntry } from '@/lib/types'

interface DeviceShadow {
  id: string
  name: string
  type: string
  macAddress: string
  ipAddress: string
  firmwareVersion?: string
  status: 'online' | 'offline' | 'updating' | 'error'
  cpuTemp: number
  heapUsed: number
  heapTotal: number
  flashUsed: number
  flashTotal: number
  wifiRssi: number
  uptimeSeconds: number
  gpioState: Record<string, boolean>
  gpioMode: Record<string, string>
  lastSeenAt: string
  isReal?: boolean
}

interface DeviceUpdateEvent {
  id: string
  changes: Partial<DeviceShadow>
}

interface DeviceTelemetryEvent {
  id: string
  cpuTemp: number | null
  heapUsed: number | null
  wifiRssi: number | null
  uptimeSeconds: number
  lastSeenAt: string
  gpioState?: Record<string, boolean> | null
  gpioMode?: Record<string, string> | null
}

interface InstallProgressEvent {
  deviceId: string
  progress: number
}

// Singleton socket — shared across all hook consumers in the dashboard.
// We open exactly one socket connection per browser tab.
let _socket: Socket | null = null
let _connectPromise: Promise<Socket> | null = null

function getSocket(): Socket {
  if (_socket) return _socket
  _socket = io('/?XTransformPort=3003', {
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    timeout: 10000,
    autoConnect: true,
  })
  return _socket
}

/**
 * Establishes the WebSocket connection to the device-service and wires all
 * incoming events into the dashboard store. Should be called once at the
 * dashboard root.
 */
export function useDeviceSocket() {
  const socketRef = useRef<Socket | null>(null)
  const {
    applyTelemetry,
    applyUpdate,
    upsertDevice,
    removeDevice,
    setConnected,
    appendLog,
    setInstallProgress,
    clearInstallProgress,
  } = useDashboardStore()

  useEffect(() => {
    const socket = getSocket()
    socketRef.current = socket

    const handleConnect = () => {
      setConnected(true)
      socket.emit('dashboard:join', {})
    }
    const handleDisconnect = () => setConnected(false)

    const handleSnapshot = (shadows: DeviceShadow[]) => {
      shadows.forEach((s) => {
        const liveDevice: DashboardDevice = {
          id: s.id,
          name: s.name,
          type: s.type,
          macAddress: s.macAddress,
          ipAddress: s.ipAddress,
          firmwareVersion: s.firmwareVersion,
          location: null,
          description: null,
          firmwareId: null,
          createdAt: new Date().toISOString(),
          status: s.status,
          cpuTemp: s.cpuTemp,
          heapUsed: s.heapUsed,
          heapTotal: s.heapTotal,
          flashUsed: s.flashUsed,
          flashTotal: s.flashTotal,
          wifiRssi: s.wifiRssi,
          uptimeSeconds: s.uptimeSeconds,
          gpioState: s.gpioState,
          gpioMode: s.gpioMode,
          lastSeenAt: s.lastSeenAt,
          isReal: s.isReal,
        }
        upsertDevice(liveDevice)
      })
    }

    const handleRegistered = (shadow: DeviceShadow) => {
      const liveDevice: DashboardDevice = {
        id: shadow.id,
        name: shadow.name,
        type: shadow.type,
        macAddress: shadow.macAddress,
        ipAddress: shadow.ipAddress,
        firmwareVersion: shadow.firmwareVersion,
        location: null,
        description: null,
        firmwareId: null,
        createdAt: new Date().toISOString(),
        status: shadow.status,
        cpuTemp: shadow.cpuTemp,
        heapUsed: shadow.heapUsed,
        heapTotal: shadow.heapTotal,
        flashUsed: shadow.flashUsed,
        flashTotal: shadow.flashTotal,
        wifiRssi: shadow.wifiRssi,
        uptimeSeconds: shadow.uptimeSeconds,
        gpioState: shadow.gpioState,
        lastSeenAt: shadow.lastSeenAt,
        isReal: shadow.isReal,
      }
      upsertDevice(liveDevice)
    }

    const handleRemoved = ({ id }: { id: string }) => removeDevice(id)

    const handleUpdate = ({ id, changes }: DeviceUpdateEvent) =>
      applyUpdate(id, changes)

    const handleTelemetry = (event: DeviceTelemetryEvent) =>
      applyTelemetry(event.id, {
        cpuTemp: event.cpuTemp ?? undefined,
        heapUsed: event.heapUsed ?? undefined,
        wifiRssi: event.wifiRssi ?? undefined,
        uptimeSeconds: event.uptimeSeconds,
        lastSeenAt: event.lastSeenAt,
        status: 'online',
        ...(event.gpioState ? { gpioState: event.gpioState } : {}),
        ...(event.gpioMode ? { gpioMode: event.gpioMode } : {}),
      })

    const handleInstallProgress = ({ deviceId, progress }: InstallProgressEvent) =>
      setInstallProgress(deviceId, progress)

    const handleLog = (entry: LogEntry) => {
      appendLog(entry)
      if (entry.event === 'firmware' && entry.level === 'success') {
        clearInstallProgress(entry.deviceId)
        applyUpdate(entry.deviceId, { status: 'online' })
      }
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('devices:snapshot', handleSnapshot)
    socket.on('device:registered', handleRegistered)
    socket.on('device:removed', handleRemoved)
    socket.on('device:update', handleUpdate)
    socket.on('device:telemetry', handleTelemetry)
    socket.on('device:install-progress', handleInstallProgress)
    socket.on('log:append', handleLog)

    // If socket is already connected (e.g. hot reload), trigger join manually.
    if (socket.connected) handleConnect()

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('devices:snapshot', handleSnapshot)
      socket.off('device:registered', handleRegistered)
      socket.off('device:removed', handleRemoved)
      socket.off('device:update', handleUpdate)
      socket.off('device:telemetry', handleTelemetry)
      socket.off('device:install-progress', handleInstallProgress)
      socket.off('log:append', handleLog)
    }
  }, [
    applyTelemetry,
    applyUpdate,
    upsertDevice,
    removeDevice,
    setConnected,
    appendLog,
    setInstallProgress,
    clearInstallProgress,
  ])

  return socketRef
}

/**
 * Returns a stable emitter object that wraps the singleton socket.
 * Safe to use as a useEffect dependency — the returned object is stable
 * across renders.
 */
export function useDeviceSocketEmitter(): DeviceEmitter {
  const [emitter] = useState<DeviceEmitter>(() => ({
    reboot: (deviceId: string) => getSocket().emit('device:reboot', { deviceId }),
    factoryReset: (deviceId: string) => getSocket().emit('device:factory-reset', { deviceId }),
    toggleGpio: (deviceId: string, pin: number, value: boolean) =>
      getSocket().emit('device:gpio', { deviceId, pin, value }),
    setPinMode: (deviceId: string, pin: number, mode: string) =>
      getSocket().emit('device:pinMode', { deviceId, pin, mode }),
    sendCommand: (deviceId: string, command: string) =>
      getSocket().emit('device:command', { deviceId, command }),
    installFirmware: (deviceId: string, firmware: { name: string; version: string; size: number; firmwareId: string }) =>
      getSocket().emit('device:install-firmware', {
        deviceId,
        firmwareName: firmware.name,
        firmwareVersion: firmware.version,
        size: firmware.size,
        firmwareId: firmware.firmwareId,
      }),
    registerDevice: (data: { id: string; name: string; type: string; macAddress: string; ipAddress?: string; firmwareVersion?: string }) =>
      getSocket().emit('device:register', data),
    removeDevice: (deviceId: string) =>
      getSocket().emit('device:remove', { deviceId }),
  }))
  return emitter
}

export interface DeviceEmitter {
  reboot: (deviceId: string) => void
  factoryReset: (deviceId: string) => void
  toggleGpio: (deviceId: string, pin: number, value: boolean) => void
  setPinMode: (deviceId: string, pin: number, mode: string) => void
  sendCommand: (deviceId: string, command: string) => void
  installFirmware: (deviceId: string, firmware: { name: string; version: string; size: number; firmwareId: string }) => void
  registerDevice: (data: { id: string; name: string; type: string; macAddress: string; ipAddress?: string; firmwareVersion?: string }) => void
  removeDevice: (deviceId: string) => void
}
