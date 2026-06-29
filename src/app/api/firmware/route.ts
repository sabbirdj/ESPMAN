import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { db } from '@/lib/db'
import { ESP_TYPES } from '@/lib/types'

// GET /api/firmware — list all firmware
export async function GET() {
  const firmwares = await db.firmware.findMany({
    include: { _count: { select: { devices: true } } },
    orderBy: { createdAt: 'desc' },
  })
  // Check which ones have a .bin file uploaded
  const binsDir = join(process.cwd(), 'firmware-bins')
  const withBinFlag = firmwares.map((fw) => ({
    ...fw,
    hasBinary: existsSync(join(binsDir, `${fw.id}.bin`)),
  }))
  return NextResponse.json(withBinFlag)
}

// POST /api/firmware — upload a new firmware image with .bin file
// Accepts multipart/form-data with:
//   - name: string
//   - version: string
//   - type: string (ESP type)
//   - description: string (optional)
//   - file: the .bin file
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const name = formData.get('name') as string
    const version = formData.get('version') as string
    const type = formData.get('type') as string
    const description = formData.get('description') as string | null
    const file = formData.get('file') as File | null

    if (!name || !version || !type) {
      return NextResponse.json(
        { error: 'name, version, and type are required' },
        { status: 400 }
      )
    }
    if (!ESP_TYPES.includes(type as any)) {
      return NextResponse.json(
        { error: `type must be one of: ${ESP_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Check for duplicate name+version
    const existing = await db.firmware.findFirst({ where: { name, version } })
    if (existing) {
      return NextResponse.json(
        { error: 'A firmware with this name and version already exists' },
        { status: 409 }
      )
    }

    // Generate checksum
    const checksum = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('')

    // Get file size (0 if no file uploaded)
    const size = file ? file.size : 0

    // Create the firmware record
    const firmware = await db.firmware.create({
      data: {
        name,
        version,
        type,
        size,
        description: description || null,
        checksum,
      },
    })

    // If a .bin file was uploaded, save it to the filesystem
    if (file && file.size > 0) {
      const binsDir = join(process.cwd(), 'firmware-bins')
      if (!existsSync(binsDir)) {
        mkdirSync(binsDir, { recursive: true })
      }
      const filePath = join(binsDir, `${firmware.id}.bin`)
      const bytes = await file.arrayBuffer()
      writeFileSync(filePath, Buffer.from(bytes))
      console.log(`[firmware] saved .bin file: ${filePath} (${file.size} bytes)`)
    }

    return NextResponse.json(firmware, { status: 201 })
  } catch (err) {
    console.error('[firmware] upload error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
