import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET() {
  try {
    const corePath = path.join(process.cwd(), 'firmware', 'esp-manager', 'esp-manager.ino')
    const coreCode = await fs.readFile(corePath, 'utf8')
    return new NextResponse(coreCode, {
      headers: { 'Content-Type': 'text/plain' }
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load template' }, { status: 500 })
  }
}
