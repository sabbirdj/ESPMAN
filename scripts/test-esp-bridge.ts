// Test script: simulates a real ESP connecting, sending telemetry with GPIO state,
// then tests the delete + reconnect flow.
import WebSocket from 'ws'

const URL = 'ws://localhost:3004/'
console.log(`[test-esp] connecting to ${URL} ...`)

const ws = new WebSocket(URL)

ws.on('open', () => {
  console.log('[test-esp] connected')
  // Send register
  ws.send(JSON.stringify({
    type: 'register',
    mac: 'AA:BB:CC:DD:EE:FF',
    chipType: 'ESP32',
    name: 'Test Real ESP32',
    ipAddress: '192.168.1.99',
    firmwareVersion: '1.0.0',
  }))
  console.log('[test-esp] sent register')

  // Send telemetry every 2 seconds with GPIO state
  let counter = 0
  setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({
      type: 'telemetry',
      mac: 'AA:BB:CC:DD:EE:FF',
      freeHeap: 200000 + Math.floor(Math.random() * 50000),
      wifiRssi: -50 - Math.floor(Math.random() * 15),
      uptimeSeconds: counter * 2,
      gpioState: {
        '0': false,
        '2': counter % 4 === 0,  // toggles every 4 ticks
        '4': false,
        '5': false,
        '12': false,
        '13': false,
        '14': false,
        '15': false,
      },
    }))
    counter++
    if (counter % 5 === 0) {
      console.log(`[test-esp] sent ${counter} telemetry updates`)
    }
  }, 2000)
})

ws.on('message', (data) => {
  const msg = data.toString()
  // Only log non-welcome messages
  if (!msg.includes('welcome')) {
    console.log('[test-esp] <- server:', msg)
  }
})

ws.on('error', (err) => console.error('[test-esp] error:', err.message))
ws.on('close', () => {
  console.log('[test-esp] disconnected')
  process.exit(0)
})

process.on('SIGINT', () => { ws.close(); process.exit(0) })
process.on('SIGTERM', () => { ws.close(); process.exit(0) })
