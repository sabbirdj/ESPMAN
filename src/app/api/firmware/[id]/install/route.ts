import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/firmware/[id]/install
// Marks the firmware as installed on the given device. The actual OTA delivery
// is simulated by the WebSocket service. This endpoint updates DB state and
// records the install event in the telemetry log.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: firmwareId } = await params
  const body = await req.json()
  const { deviceId } = body ?? {}

  if (!deviceId) {
    return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
  }

  const firmware = await db.firmware.findUnique({ where: { id: firmwareId } })
  if (!firmware) return NextResponse.json({ error: 'Firmware not found' }, { status: 404 })

  const device = await db.device.findUnique({ where: { id: deviceId } })
  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

  if (firmware.type !== device.type) {
    return NextResponse.json(
      { error: `Firmware targets ${firmware.type} but device is ${device.type}` },
      { status: 400 }
    )
  }

  // Mark device as updating in DB
  await db.device.update({
    where: { id: deviceId },
    data: { status: 'updating' },
  })

  // Increment install count on firmware
  await db.firmware.update({
    where: { id: firmwareId },
    data: { installCount: { increment: 1 } },
  })

  // Log the install start
  const log = await db.telemetryLog.create({
    data: {
      deviceId,
      event: 'firmware',
      message: `Started installing ${firmware.name} v${firmware.version}`,
      level: 'info',
    },
  })

  return NextResponse.json({
    ok: true,
    log,
    firmware: {
      id: firmware.id,
      name: firmware.name,
      version: firmware.version,
      size: firmware.size,
    },
  })
}

// PATCH /api/firmware/[id]/install
// Called by the dashboard after the WebSocket service reports install complete.
// Updates the device's firmware reference and final state.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: firmwareId } = await params
  const body = await req.json()
  const { deviceId, success } = body ?? {}

  if (!deviceId) {
    return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
  }

  const firmware = await db.firmware.findUnique({ where: { id: firmwareId } })
  if (!firmware) return NextResponse.json({ error: 'Firmware not found' }, { status: 404 })

  if (success) {
    await db.device.update({
      where: { id: deviceId },
      data: {
        status: 'online',
        firmwareId,
        firmwareVersion: firmware.version,
        lastSeenAt: new Date(),
      },
    })
    await db.telemetryLog.create({
      data: {
        deviceId,
        event: 'firmware',
        message: `Successfully installed ${firmware.name} v${firmware.version}`,
        level: 'success',
      },
    })
  } else {
    await db.device.update({ where: { id: deviceId }, data: { status: 'error' } })
    await db.telemetryLog.create({
      data: {
        deviceId,
        event: 'firmware',
        message: `Failed to install ${firmware.name} v${firmware.version}`,
        level: 'error',
      },
    })
  }

  return NextResponse.json({ ok: true })
}
