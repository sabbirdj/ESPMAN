import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'
import { WebSocketServer, WebSocket } from 'ws'

// ============================================================================
//  ESP Device Manager — device-service
// ----------------------------------------------------------------------------
//  Real-devices-only service. NO simulation. NO fake devices.
//
//  Two servers:
//    Port 3003 — Socket.io for dashboards (browser clients)
//    Port 3004 — Raw WebSocket for real ESP devices (firmware clients)
//
//  Flow:
//    1. You flash firmware/esp-manager.ino onto a real ESP.
//    2. ESP boots, connects to Wi-Fi, opens WebSocket to port 3004.
//    3. ESP sends {type:"register", mac, chipType, name, ...}.
//    4. This service persists the device to the SQLite DB via the Next.js API
//       (POST /api/devices/auto-register) and adds a live shadow.
//    5. Dashboard receives "device:registered" event and shows the device.
//    6. ESP sends telemetry every 5s; dashboard updates in real time.
//    7. Dashboard sends commands (gpio, reboot, factory-reset, command, ota)
//       via Socket.io → this service forwards them to the ESP over WebSocket.
//    8. ESP disconnects → device marked offline in DB and on dashboard.
// ============================================================================

// ----- Types -----
interface DeviceShadow {
  id: string
  name: string
  type: string
  macAddress: string
  ipAddress: string
  firmwareVersion?: string
  status: 'online' | 'offline' | 'updating' | 'error'
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
  isReal: boolean
}

interface DashboardClient {
  socket: Socket
}

// ----- In-memory device registry -----
// Live shadows for currently-or-recently-connected real ESPs.
// Persisted metadata lives in SQLite (managed by the Next.js API).
const devices = new Map<string, DeviceShadow>()
const dashboardClients = new Set<DashboardClient>()

// ----- Real-ESP connection registry -----
// Maps uppercase MAC address → active WebSocket.
const realEsps = new Map<string, WebSocket>()

// ----- Chip family specs (used to populate heapTotal/flashTotal/pins) -----
const typeSpecs: Record<string, { heapTotal: number; flashTotal: number; pins: number[] }> = {
  'ESP8266':   { heapTotal: 50 * 1024,  flashTotal: 4 * 1024 * 1024,  pins: [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16] },
  'ESP32':     { heapTotal: 320 * 1024, flashTotal: 4 * 1024 * 1024,  pins: [0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33] },
  'ESP32-S2':  { heapTotal: 320 * 1024, flashTotal: 4 * 1024 * 1024,  pins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46] },
  'ESP32-S3':  { heapTotal: 512 * 1024, flashTotal: 8 * 1024 * 1024,  pins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46, 47, 48] },
  'ESP32-C3':  { heapTotal: 400 * 1024, flashTotal: 4 * 1024 * 1024,  pins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 18, 19, 20, 21] },
  'ESP32-C6':  { heapTotal: 512 * 1024, flashTotal: 4 * 1024 * 1024,  pins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] },
}

// Create a live shadow for a real ESP that just connected.
function createRealDeviceShadow(opts: {
  id: string
  name: string
  type: string
  macAddress: string
  ipAddress: string
  firmwareVersion?: string
}): DeviceShadow {
  const spec = typeSpecs[opts.type] ?? typeSpecs['ESP32']
  // Initialize GPIO state with all pins LOW — this ensures the GPIO control
  // section renders immediately on the dashboard, before the first telemetry
  const initialGpio: Record<string, boolean> = {}
  spec.pins.forEach((pin) => { initialGpio[String(pin)] = false })
  return {
    id: opts.id,
    name: opts.name,
    type: opts.type,
    macAddress: opts.macAddress,
    ipAddress: opts.ipAddress,
    firmwareVersion: opts.firmwareVersion,
    status: 'online',
    cpuTemp: null,
    heapUsed: null,
    heapTotal: spec.heapTotal,
    flashUsed: null,
    flashTotal: spec.flashTotal,
    wifiRssi: null,
    uptimeSeconds: 0,
    gpioState: initialGpio,
    lastSeenAt: new Date().toISOString(),
    isReal: true,
  }
}

// ============================================================================
//  HTTP server (port 3003) — health check + dashboard Socket.io
// ============================================================================
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const path = url.pathname

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      ok: true,
      devices: devices.size,
      realEspsConnected: realEsps.size,
      dashboardsConnected: dashboardClients.size,
    }))
    return
  }

  if (req.method === 'GET' && path === '/devices') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(Array.from(devices.values())))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' })
)
})

const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ----- Broadcast helpers -----
function broadcast(event: string, payload: unknown) {
  dashboardClients.forEach((c) => c.socket.emit(event, payload))
}

function broadcastLog(deviceId: string, event: string, message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    deviceId,
    event,
    message,
    level,
    createdAt: new Date().toISOString(),
  }
  broadcast('log:append', entry)
}

// ----- Real-ESP helpers -----
function findDeviceByMac(mac: string): DeviceShadow | undefined {
  const upper = mac.toUpperCase()
  return Array.from(devices.values()).find((d) => d.macAddress.toUpperCase() === upper)
}

function sendToRealEsp(macAddress: string, message: Record<string, unknown>): boolean {
  const ws = realEsps.get(macAddress.toUpperCase())
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
    return true
  }
  return false
}

// ----- API call to persist device to SQLite -----
// Called when a real ESP registers. Upserts the device in the DB so it
// survives page reloads and service restarts.
async function persistDeviceToApi(data: {
  macAddress: string
  name: string
  type: string
  ipAddress: string
  firmwareVersion?: string
}): Promise<{ id: string } | null> {
  try {
    const res = await fetch('http://localhost:3000/api/devices/auto-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      console.error(`[device-service] auto-register API returned ${res.status}`)
      return null
    }
    const json = await res.json()
    return { id: json.id }
  } catch (err) {
    console.error('[device-service] failed to call auto-register API:', err)
    return null
  }
}

// ----- API call to update device status (online/offline) -----
async function updateDeviceStatusInApi(deviceId: string, status: 'online' | 'offline') {
  try {
    await fetch(`http://localhost:3000/api/devices/${deviceId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  } catch (err) {
    console.error(`[device-service] failed to update status for ${deviceId}:`, err)
  }
}

// ============================================================================
//  Socket.io — dashboard client handler
// ============================================================================
io.on('connection', (socket: Socket) => {
  socket.on('dashboard:join', () => {
    dashboardClients.add({ socket })
    // Send current device shadows (only real devices that have connected)
    socket.emit('devices:snapshot', Array.from(devices.values()))
    console.log(`[dashboard] client joined: ${socket.id}, total: ${dashboardClients.size}`)
  })

  socket.on('dashboard:leave', () => {
    dashboardClients.forEach((c) => { if (c.socket === socket) dashboardClients.delete(c) })
  })

  // --- Commands from dashboard → forward to real ESP ---

  socket.on('device:reboot', ({ deviceId }: { deviceId: string }) => {
    const dev = devices.get(deviceId)
    if (!dev) return
    if (sendToRealEsp(dev.macAddress, { type: 'reboot' })) {
      dev.status = 'offline'
      broadcast('device:update', { id: deviceId, changes: { status: 'offline' } })
      broadcastLog(deviceId, 'reboot', `Reboot command sent to ${dev.name}`, 'info')
      updateDeviceStatusInApi(deviceId, 'offline')
    } else {
      broadcastLog(deviceId, 'error', `Cannot reboot ${dev.name}: device not connected`, 'error')
    }
  })

  socket.on('device:factory-reset', ({ deviceId }: { deviceId: string }) => {
    const dev = devices.get(deviceId)
    if (!dev) return
    if (sendToRealEsp(dev.macAddress, { type: 'factory-reset' })) {
      broadcastLog(deviceId, 'command', `Factory reset sent to ${dev.name}`, 'warn')
    } else {
      broadcastLog(deviceId, 'error', `Cannot reset ${dev.name}: device not connected`, 'error')
    }
  })

  socket.on('device:gpio', ({ deviceId, pin, value }: { deviceId: string; pin: number; value: boolean }) => {
    const dev = devices.get(deviceId)
    if (!dev) return
    if (sendToRealEsp(dev.macAddress, { type: 'gpio', pin, value })) {
      broadcastLog(deviceId, 'command', `GPIO ${pin} → ${value ? 'HIGH' : 'LOW'} sent to ${dev.name}`, 'info')
    } else {
      broadcastLog(deviceId, 'error', `Cannot set GPIO on ${dev.name}: device not connected`, 'error')
    }
  })

  socket.on('device:pinMode', ({ deviceId, pin, mode }: { deviceId: string; pin: number; mode: string }) => {
    const dev = devices.get(deviceId)
    if (!dev) return
    if (sendToRealEsp(dev.macAddress, { type: 'pinMode', pin, mode })) {
      broadcastLog(deviceId, 'command', `GPIO ${pin} mode → ${mode} sent to ${dev.name}`, 'info')
    } else {
      broadcastLog(deviceId, 'error', `Cannot set pinMode on ${dev.name}: device not connected`, 'error')
    }
  })

  socket.on('device:command', ({ deviceId, command }: { deviceId: string; command: string }) => {
    const dev = devices.get(deviceId)
    if (!dev) return
    if (sendToRealEsp(dev.macAddress, { type: 'command', command })) {
      broadcastLog(deviceId, 'command', `Sent to ${dev.name}: ${command}`, 'info')
    } else {
      broadcastLog(deviceId, 'error', `Cannot send command to ${dev.name}: device not connected`, 'error')
    }
  })

  socket.on('device:install-firmware', ({ deviceId, firmwareName, firmwareVersion, size, firmwareId }: {
    deviceId: string; firmwareName: string; firmwareVersion: string; size: number; firmwareId: string
  }) => {
    const dev = devices.get(deviceId)
    if (!dev) {
      broadcastLog(deviceId, 'error', `Device not found in registry`, 'error')
      return
    }
    // Construct the OTA download path — the ESP will prepend http://SERVER_HOST:3000
    const otaPath = `/api/firmware/${firmwareId}/bin`
    if (sendToRealEsp(dev.macAddress, { type: 'ota', path: otaPath, version: firmwareVersion })) {
      dev.status = 'updating'
      broadcast('device:update', { id: deviceId, changes: { status: 'updating' } })
      broadcastLog(deviceId, 'firmware', `OTA started: ${firmwareName} v${firmwareVersion} (${(size / 1024).toFixed(0)} KB)`, 'info')
      updateDeviceStatusInApi(deviceId, 'offline')
    } else {
      broadcastLog(deviceId, 'error', `Cannot start OTA on ${dev.name}: device not connected`, 'error')
    }
  })

  // Dashboard asking to remove a device (after user clicks delete)
  socket.on('device:remove', ({ deviceId }: { deviceId: string }) => {
    const dev = devices.get(deviceId)
    if (dev) {
      // Remove from the real ESP registry but DON'T close the WebSocket.
      // The ESP firmware will auto-reconnect and re-register, creating a
      // fresh device entry. This way, deleted devices can reappear after reboot.
      realEsps.delete(dev.macAddress.toUpperCase())
      devices.delete(deviceId)
      broadcast('device:removed', { id: deviceId })
      console.log(`[device-service] removed: ${deviceId} (${dev.name}) — ESP will re-register on next reconnect`)
    }
  })

  // Dashboard manually registering a device (Add Device form) — creates a
  // placeholder that will go online when the real ESP with that MAC connects.
  socket.on('device:register', (data: {
    id: string; name: string; type: string;
    firmwareVersion?: string; macAddress: string; ipAddress?: string
  }) => {
    if (devices.has(data.id)) {
      socket.emit('device:registered', devices.get(data.id))
      return
    }
    const shadow = createRealDeviceShadow({
      id: data.id,
      name: data.name,
      type: data.type,
      firmwareVersion: data.firmwareVersion,
      macAddress: data.macAddress,
      ipAddress: data.ipAddress ?? '',
    })
    // Manually-added devices start offline until the real ESP connects
    shadow.status = 'offline'
    shadow.isReal = false
    devices.set(data.id, shadow)
    broadcast('device:registered', shadow)
    console.log(`[device-service] manual register: ${data.id} (${data.name}) — waiting for ESP to connect`)
  })

  socket.on('disconnect', () => {
    dashboardClients.forEach((c) => { if (c.socket === socket) dashboardClients.delete(c) })
    console.log(`[dashboard] client left: ${socket.id}, total: ${dashboardClients.size}`)
  })
})

// ============================================================================
//  ESP Bridge — raw WebSocket server on port 3004 for REAL ESP devices
// ============================================================================
const espHttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      ok: true,
      bridge: 'esp',
      realEspsConnected: realEsps.size,
      dashboardsConnected: dashboardClients.size,
    }))
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found. ESPs connect via WebSocket.' })
)
})

const espWss = new WebSocketServer({ server: espHttpServer, path: '/' })

espWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const remoteIp = req.socket.remoteAddress ?? 'unknown'
  console.log(`[esp-bridge] new connection from ${remoteIp}`)

  ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to ESP Device Manager bridge' }))

  ws.on('message', (data: Buffer | string, isBinary: boolean) => {
    if (isBinary) return
    let text: string
    if (typeof data === 'string') text = data
    else text = data.toString('utf8')

    let msg: any
    try {
      msg = JSON.parse(text)
    } catch (e) {
      console.error('[esp-bridge] invalid JSON:', text.slice(0, 200))
      return
    }

    const type = msg.type as string
    if (type === 'register') {
      handleEspRegister(ws, msg).catch((err) => {
        console.error('[esp-bridge] register error:', err)
      })
    } else if (type === 'telemetry') {
      handleEspTelemetry(msg)
    } else if (type === 'ack') {
      handleEspAck(msg)
    } else {
      console.log(`[esp-bridge] unknown message type: ${type}`)
    }
  })

  ws.on('close', () => {
    let disconnectedMac: string | null = null
    for (const [mac, socket] of realEsps.entries()) {
      if (socket === ws) {
        realEsps.delete(mac)
        disconnectedMac = mac
        break
      }
    }
    if (disconnectedMac) {
      const dev = findDeviceByMac(disconnectedMac)
      if (dev) {
        dev.status = 'offline'
        dev.isReal = false
        broadcast('device:update', { id: dev.id, changes: { status: 'offline', isReal: false } })
        broadcastLog(dev.id, 'offline', `${dev.name} disconnected`, 'warn')
        updateDeviceStatusInApi(dev.id, 'offline')
        console.log(`[esp-bridge] ESP disconnected: ${disconnectedMac} (${dev.name})`)
      }
    } else {
      console.log(`[esp-bridge] unknown connection closed from ${remoteIp}`)
    }
  })

  ws.on('error', (err: Error) => {
    console.error(`[esp-bridge] socket error from ${remoteIp}:`, err.message)
  })
})

// Handle register from a real ESP
async function handleEspRegister(ws: WebSocket, msg: any) {
  const mac = String(msg.mac ?? '').toUpperCase()
  if (!mac) {
    console.error('[esp-bridge] register message missing MAC')
    return
  }
  const chipType = String(msg.chipType ?? 'ESP32')
  const name = String(msg.name ?? `ESP ${chipType} ${mac.slice(-5)}`)
  const ipAddress = String(msg.ipAddress ?? '')
  const firmwareVersion = msg.firmwareVersion ? String(msg.firmwareVersion) : undefined

  // Register this WebSocket as the active ESP for this MAC
  realEsps.set(mac, ws)

  // Check if we already have a shadow for this MAC in memory
  let device = findDeviceByMac(mac)
  if (!device) {
    // New device (or was previously deleted) — persist to DB via the auto-register API
    // This creates a new DB record if the MAC doesn't exist, or reactivates an existing one
    const result = await persistDeviceToApi({
      macAddress: mac,
      name,
      type: chipType,
      ipAddress,
      firmwareVersion,
    })

    // Use the ID from the API, or generate a fallback ID if the API failed
    const id = result?.id ?? `esp-${mac.replace(/:/g, '').toLowerCase()}`
    device = createRealDeviceShadow({
      id,
      name,
      type: chipType,
      macAddress: mac,
      ipAddress,
      firmwareVersion,
    })
    devices.set(id, device)

    // ALWAYS broadcast — even if the API failed, the device should appear on the dashboard
    broadcast('device:registered', device)
    console.log(`[esp-bridge] ESP registered: ${mac} → ${id} (${name})${result ? '' : ' [API failed, using local ID]'}`)
  } else {
    // Existing device reconnecting (was in memory but maybe marked offline)
    device.status = 'online'
    device.isReal = true
    device.ipAddress = ipAddress
    if (firmwareVersion) device.firmwareVersion = firmwareVersion
    device.lastSeenAt = new Date().toISOString()
    broadcast('device:update', {
      id: device.id,
      changes: {
        status: 'online',
        isReal: true,
        ipAddress,
        firmwareVersion,
        lastSeenAt: device.lastSeenAt,
        gpioState: device.gpioState,
      },
    })
    // Update DB status
    updateDeviceStatusInApi(device.id, 'online')
    console.log(`[esp-bridge] ESP reconnected: ${mac} → ${device.id} (${device.name})`)
  }
  broadcastLog(device.id, 'online', `${device.name} connected (${chipType})`, 'success')
}

// Handle telemetry from a real ESP
function handleEspTelemetry(msg: any) {
  const mac = String(msg.mac ?? '').toUpperCase()
  if (!mac) return
  const device = findDeviceByMac(mac)
  if (!device) {
    console.warn(`[esp-bridge] telemetry from unregistered ESP: ${mac}`)
    return
  }
  device.status = 'online'
  device.isReal = true
  if (typeof msg.freeHeap === 'number' && device.heapTotal) {
    device.heapUsed = Math.max(0, device.heapTotal - msg.freeHeap)
  }
  if (typeof msg.wifiRssi === 'number') device.wifiRssi = msg.wifiRssi
  if (typeof msg.uptimeSeconds === 'number') device.uptimeSeconds = msg.uptimeSeconds
  if (msg.gpioState && typeof msg.gpioState === 'object') {
    device.gpioState = msg.gpioState as Record<string, boolean>
  }
  if (msg.gpioMode && typeof msg.gpioMode === 'object') {
    device.gpioMode = msg.gpioMode as Record<string, string>
  }
  device.lastSeenAt = new Date().toISOString()

  // Push to dashboards — send a single comprehensive update that includes
  // telemetry data AND gpioState, so the dashboard gets everything in one shot
  broadcast('device:telemetry', {
    id: device.id,
    cpuTemp: device.cpuTemp,
    heapUsed: device.heapUsed != null ? Math.floor(device.heapUsed) : null,
    wifiRssi: device.wifiRssi,
    uptimeSeconds: device.uptimeSeconds,
    lastSeenAt: device.lastSeenAt,
    gpioState: device.gpioState,
    gpioMode: device.gpioMode,
  })
}

// Handle acknowledgment from a real ESP (confirms command was received)
function handleEspAck(msg: any) {
  const mac = String(msg.mac ?? '').toUpperCase()
  if (!mac) return
  const device = findDeviceByMac(mac)
  if (!device) return

  const command = String(msg.command ?? 'unknown')
  const status = String(msg.status ?? 'ok')
  const message = String(msg.message ?? '')

  if (status === 'ok') {
    broadcastLog(device.id, 'command', `${device.name}: ${message}`, 'success')
  } else {
    broadcastLog(device.id, 'error', `${device.name} command failed: ${message}`, 'error')
  }
  console.log(`[esp-bridge] ACK from ${mac}: ${command} → ${status} (${message})`)
}

// ============================================================================
//  Start servers
// ============================================================================
const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[device-service] Dashboard Socket.io on port ${PORT}`)
  console.log(`[device-service] Real-devices-only mode — no simulation`)
})

const ESP_PORT = 3004
espHttpServer.listen(ESP_PORT, () => {
  console.log(`[esp-bridge] ESP WebSocket bridge on port ${ESP_PORT}`)
  console.log(`[esp-bridge] Flash firmware → ESP connects here → appears on dashboard`)
})

// On startup, load existing devices from the DB so the dashboard snapshot
// includes them (they'll show as offline until the real ESP reconnects).
async function loadExistingDevicesFromDb() {
  try {
    const res = await fetch('http://localhost:3000/api/devices')
    if (!res.ok) return
    const dbDevices = await res.json() as Array<{
      id: string; name: string; type: string; macAddress: string;
      ipAddress?: string | null; firmwareVersion?: string | null;
      status?: string
    }>
    dbDevices.forEach((d) => {
      if (!devices.has(d.id)) {
        const spec = typeSpecs[d.type] ?? typeSpecs['ESP32']
        const shadow: DeviceShadow = {
          id: d.id,
          name: d.name,
          type: d.type,
          macAddress: d.macAddress,
          ipAddress: d.ipAddress ?? '',
          firmwareVersion: d.firmwareVersion ?? undefined,
          status: 'offline', // offline until the real ESP connects
          cpuTemp: null,
          heapUsed: null,
          heapTotal: spec.heapTotal,
          flashUsed: null,
          flashTotal: spec.flashTotal,
          wifiRssi: null,
          uptimeSeconds: 0,
          gpioState: null,
          gpioMode: null,
          lastSeenAt: null,
          isReal: false,
        }
        devices.set(d.id, shadow)
      }
    })
    console.log(`[device-service] loaded ${dbDevices.length} devices from DB (all offline until ESPs connect)`)
  } catch (err) {
    console.error('[device-service] failed to load devices from DB:', err)
  }
}

// Give the Next.js API a moment to be ready, then load existing devices.
setTimeout(loadExistingDevicesFromDb, 2000)

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
  espHttpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
  espHttpServer.close(() => process.exit(0))
})
