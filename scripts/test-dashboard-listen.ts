// Test script: connect as a dashboard client and listen for events
// Run with: bun run /home/z/my-project/scripts/test-dashboard-listen.ts

import { io } from 'socket.io-client'

const URL = '/?XTransformPort=3003'
// But we need to connect directly to port 3003 since we're not in a browser
const socket = io('http://localhost:3003', {
  path: '/',
  transports: ['websocket', 'polling'],
  forceNew: true,
})

socket.on('connect', () => {
  console.log('[dashboard-test] connected, joining...')
  socket.emit('dashboard:join', {})
})

socket.on('devices:snapshot', (devices) => {
  console.log(`[dashboard-test] received snapshot with ${devices.length} devices:`)
  devices.forEach((d: any) => {
    console.log(`  - ${d.name} (${d.macAddress}) isReal=${d.isReal ?? false} status=${d.status}`)
  })
})

socket.on('device:registered', (device) => {
  console.log(`[dashboard-test] DEVICE REGISTERED: ${device.name} (${device.macAddress}) isReal=${device.isReal}`)
})

socket.on('device:update', (update) => {
  console.log(`[dashboard-test] DEVICE UPDATE: ${JSON.stringify(update).slice(0, 200)}`)
})

socket.on('device:telemetry', (telemetry) => {
  console.log(`[dashboard-test] TELEMETRY: device=${telemetry.id} rssi=${telemetry.wifiRssi}`)
})

socket.on('log:append', (entry) => {
  console.log(`[dashboard-test] LOG: [${entry.level}] ${entry.message}`)
})

socket.on('disconnect', () => {
  console.log('[dashboard-test] disconnected')
})

socket.on('error', (err) => {
  console.error('[dashboard-test] error:', err)
})

// Keep alive for 30 seconds
setTimeout(() => {
  console.log('[dashboard-test] closing after 30s')
  socket.close()
  process.exit(0)
}, 30000)
