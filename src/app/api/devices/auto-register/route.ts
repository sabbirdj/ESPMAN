import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ESP_TYPES } from '@/lib/types'

// POST /api/devices/auto-register
// Called by the device-service when a real ESP connects via WebSocket.
// Upserts the device by MAC address — creates if new, updates if exists.
// This is the "auto-connect" endpoint: flash firmware → ESP boots → connects
// → device-service calls this → device appears on dashboard.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { macAddress, name, type, ipAddress, firmwareVersion } = body ?? {}

  if (!macAddress || !type) {
    return NextResponse.json(
      { error: 'macAddress and type are required' },
      { status: 400 }
    )
  }
  if (!ESP_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${ESP_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  const mac = macAddress.toUpperCase()

  // Try to find an existing device by MAC
  const existing = await db.device.findUnique({ where: { macAddress: mac } })

  if (existing) {
    // Update the existing device with fresh connection info
    const updated = await db.device.update({
      where: { id: existing.id },
      data: {
        status: 'online',
        ipAddress: ipAddress ?? existing.ipAddress,
        firmwareVersion: firmwareVersion ?? existing.firmwareVersion,
        lastSeenAt: new Date(),
      },
    })

    await db.telemetryLog.create({
      data: {
        deviceId: existing.id,
        event: 'online',
        message: `${existing.name} reconnected (${type})`,
        level: 'success',
      },
    })

    return NextResponse.json(updated)
  }

  // New device — create it
  const deviceName = name || `ESP ${type} ${mac.slice(-5)}`

  // Resolve firmware if version provided
  let firmwareId: string | undefined
  if (firmwareVersion) {
    const fw = await db.firmware.findFirst({ where: { version: firmwareVersion, type } })
    if (fw) firmwareId = fw.id
  }

  const device = await db.device.create({
    data: {
      name: deviceName,
      type,
      macAddress: mac,
      ipAddress: ipAddress ?? null,
      firmwareId: firmwareId ?? null,
      firmwareVersion: firmwareVersion ?? null,
      status: 'online',
      lastSeenAt: new Date(),
    },
  })

  await db.telemetryLog.create({
    data: {
      deviceId: device.id,
      event: 'online',
      message: `${deviceName} (${type}) auto-registered from firmware`,
      level: 'success',
    },
  })

  return NextResponse.json(device, { status: 201 })
}
