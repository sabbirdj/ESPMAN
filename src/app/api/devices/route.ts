import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ESP_TYPES } from '@/lib/types'

// GET /api/devices — list all devices
export async function GET() {
  const devices = await db.device.findMany({
    include: { firmware: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(devices)
}

// POST /api/devices — create a new device
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, type, macAddress, ipAddress, location, description, firmwareVersion } = body ?? {}

  if (!name || !type || !macAddress) {
    return NextResponse.json(
      { error: 'name, type, and macAddress are required' },
      { status: 400 }
    )
  }
  if (!ESP_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${ESP_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Check MAC uniqueness
  const existing = await db.device.findUnique({ where: { macAddress } })
  if (existing) {
    return NextResponse.json(
      { error: 'A device with this MAC address already exists' },
      { status: 409 }
    )
  }

  // Resolve firmware if version provided
  let firmwareId: string | undefined
  if (firmwareVersion) {
    const fw = await db.firmware.findFirst({
      where: { version: firmwareVersion, type },
    })
    if (fw) firmwareId = fw.id
  }

  const device = await db.device.create({
    data: {
      name,
      type,
      macAddress: macAddress.toUpperCase(),
      ipAddress: ipAddress ?? null,
      location: location ?? null,
      description: description ?? null,
      firmwareId: firmwareId ?? null,
      firmwareVersion: firmwareVersion ?? null,
      status: 'offline',
    },
    include: { firmware: true },
  })

  // Log the registration event
  await db.telemetryLog.create({
    data: {
      deviceId: device.id,
      event: 'online',
      message: `Device ${name} (${type}) registered`,
      level: 'success',
    },
  })

  return NextResponse.json(device, { status: 201 })
}
