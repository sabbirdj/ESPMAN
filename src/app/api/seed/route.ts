import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/seed — seed sample firmware images if database is empty.
// Does NOT create any fake devices. Devices appear on the dashboard only
// when a real ESP running the firmware connects.
export async function POST() {
  const existingFirmware = await db.firmware.count()
  const created = { firmware: 0 }

  if (existingFirmware === 0) {
    const firmwareSeed = [
      { name: 'sensor-hub',      version: '1.4.2', type: 'ESP32',    size: 412_000, description: 'Multi-sensor hub with MQTT support' },
      { name: 'sensor-hub',      version: '1.5.0', type: 'ESP32',    size: 438_500, description: 'Adds Home Assistant auto-discovery' },
      { name: 'relay-controller', version: '2.0.1', type: 'ESP8266',  size: 318_000, description: '4-channel relay controller with web UI' },
      { name: 'relay-controller', version: '2.1.0', type: 'ESP8266',  size: 322_400, description: 'Adds scheduled timers and OTA patching' },
      { name: 'greenhouse-os',   version: '0.9.5', type: 'ESP32-S3', size: 720_000, description: 'Greenhouse automation with capacitive touch' },
      { name: 'lab-node',        version: '1.0.0', type: 'ESP32-C3', size: 285_000, description: 'RISC-V low-power lab node' },
      { name: 'mesh-bridge',     version: '0.4.0', type: 'ESP32-C6', size: 510_000, description: 'Wi-Fi 6 + Zigbee mesh bridge' },
      { name: 'air-quality',     version: '3.2.0', type: 'ESP32-S2', size: 380_000, description: 'Air quality monitor with e-paper display' },
    ]
    for (const f of firmwareSeed) {
      const checksum = Array.from({ length: 8 }, () =>
        Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
      ).join('')
      await db.firmware.create({ data: { ...f, checksum } })
      created.firmware++
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    total: {
      devices: await db.device.count(),
      firmware: await db.firmware.count(),
    },
  })
}
