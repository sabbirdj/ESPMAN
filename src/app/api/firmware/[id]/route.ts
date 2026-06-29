import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE /api/firmware/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const existing = await db.firmware.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Detach firmware from any devices using it
  await db.device.updateMany({
    where: { firmwareId: id },
    data: { firmwareId: null, firmwareVersion: null },
  })

  await db.firmware.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
