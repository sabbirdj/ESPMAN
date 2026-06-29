import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/logs — recent telemetry log entries (optionally filtered by deviceId)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId')
  const limit = Math.min(200, Number(searchParams.get('limit') ?? 100))

  const logs = await db.telemetryLog.findMany({
    where: deviceId ? { deviceId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { device: { select: { name: true, type: true } } },
  })

  return NextResponse.json(logs)
}
