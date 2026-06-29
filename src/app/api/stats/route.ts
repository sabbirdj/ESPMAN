import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/stats — dashboard summary stats
export async function GET() {
  const total = await db.device.count()
  const online = await db.device.count({ where: { status: 'online' } })
  const offline = await db.device.count({ where: { status: 'offline' } })
  const updating = await db.device.count({ where: { status: 'updating' } })
  const error = await db.device.count({ where: { status: 'error' } })

  const firmwareCount = await db.firmware.count()
  const installCount = await db.firmware.aggregate({ _sum: { installCount: true } })

  // Group devices by type
  const byType = await db.device.groupBy({
    by: ['type'],
    _count: { _all: true },
  })

  // Group firmware by target type
  const firmwareByType = await db.firmware.groupBy({
    by: ['type'],
    _count: { _all: true },
  })

  return NextResponse.json({
    devices: { total, online, offline, updating, error },
    firmware: {
      total: firmwareCount,
      totalInstalls: installCount._sum.installCount ?? 0,
    },
    devicesByType: byType.map((b) => ({ type: b.type, count: b._count._all })),
    firmwareByType: firmwareByType.map((b) => ({ type: b.type, count: b._count._all })),
  })
}
