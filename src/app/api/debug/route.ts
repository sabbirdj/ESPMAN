import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    DATABASE_URL: process.env.DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'SET (hidden)' : 'NOT SET',
    startsWithFile: process.env.DATABASE_URL?.startsWith('file:'),
    startsWithLibsql: process.env.DATABASE_URL?.startsWith('libsql:'),
  })
}
