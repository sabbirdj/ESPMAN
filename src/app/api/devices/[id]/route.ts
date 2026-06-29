import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/devices/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const device = await db.device.findUnique({
    where: { id },
    include: { firmware: true, telemetryLogs: { orderBy: { createdAt: 'desc' }, take: 50 } },
  })
  if (!device) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(device)
}

// PATCH /api/devices/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { name, location, description, ipAddress, firmwareVersion } = body ?? {}

  const existing = await db.device.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let firmwareId: string | undefined = existing.firmwareId ?? undefined
  if (firmwareVersion !== undefined) {
    if (firmwareVersion === null || firmwareVersion === '') {
      firmwareId = undefined
    } else {
      const fw = await db.firmware.findFirst({
        where: { version: firmwareVersion, type: existing.type },
      })
      if (fw) firmwareId = fw.id
    }
  }

  const updated = await db.device.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(location !== undefined && { location }),
      ...(description !== undefined && { description }),
      ...(ipAddress !== undefined && { ipAddress }),
      ...(firmwareVersion !== undefined && { firmwareVersion }),
      ...(firmwareId !== undefined && { firmwareId }),
    },
    include: { firmware: true },
  })
  return NextResponse.json(updated)
}

// DELETE /api/devices/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.device.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
