import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/devices/[id]/status
// Called by the device-service when a real ESP connects or disconnects.
// Updates only the status field (and lastSeenAt when coming online).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { status } = body ?? {}

  if (!['online', 'offline', 'updating', 'error'].includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const existing = await db.device.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await db.device.update({
    where: { id },
    data: {
      status,
      lastSeenAt: status === 'online' ? new Date() : existing.lastSeenAt,
    },
  })

  return NextResponse.json(updated)
}
