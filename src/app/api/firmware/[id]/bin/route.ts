import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// GET /api/firmware/[id]/bin
// Downloads the actual firmware .bin file for OTA updates.
// The ESP calls this URL when it receives an "ota" command from the device-service.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // The .bin file is stored at firmware-bins/[id].bin
  const filePath = join(process.cwd(), 'firmware-bins', `${id}.bin`)

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: 'Firmware binary not found. Upload a .bin file first.' },
      { status: 404 }
    )
  }

  try {
    const data = readFileSync(filePath)
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="firmware-${id}.bin"`,
        'Content-Length': data.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read firmware binary' },
      { status: 500 }
    )
  }
}
