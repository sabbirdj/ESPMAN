import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/devices/[id]/command
// Records a command in the telemetry log. The actual command delivery to the
// device happens via the WebSocket service (the dashboard emits socket events
// directly). This endpoint is mainly for audit logging.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { action, payload } = body ?? {}

  const device = await db.device.findUnique({ where: { id } })
  if (!device) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let message = ''
  let level: 'info' | 'warn' | 'error' | 'success' = 'info'

  switch (action) {
    case 'reboot':
      message = `Reboot command sent to ${device.name}`
      await db.device.update({ where: { id }, data: { status: 'offline' } })
      break
    case 'factory-reset':
      message = `Factory reset initiated on ${device.name}`
      level = 'warn'
      await db.device.update({
        where: { id },
        data: { status: 'offline', firmwareId: null, firmwareVersion: null, gpioState: null },
      })
      break
    case 'gpio':
      message = `GPIO ${payload?.pin} set to ${payload?.value ? 'HIGH' : 'LOW'} on ${device.name}`
      break
    case 'serial':
      message = `Serial command to ${device.name}: ${payload?.command ?? ''}`
      break
    default:
      message = `Command "${action}" sent to ${device.name}`
  }

  const log = await db.telemetryLog.create({
    data: { deviceId: id, event: 'command', message, level },
  })

  return NextResponse.json({ ok: true, log })
}
