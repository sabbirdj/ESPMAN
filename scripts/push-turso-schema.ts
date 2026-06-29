// Push the Prisma schema SQL to Turso using the libSQL client.
// Run with: bun run /home/z/my-project/scripts/push-turso-schema.ts

import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'

const url = 'libsql://esp-device-manger-xeroxviper.aws-ap-south-1.turso.io'
const authToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI3MTMyOTYsImlkIjoiMDE5ZjExZmUtMTEwMS03MDkzLThiZDktMmVkNTI5MTgxOGZlIiwicmlkIjoiYjg0NmRmMzMtNWNmNy00M2IwLThiMzMtNmE4ODM1M2RlMzBhIn0.VTJpXubj33sauQigzB67Q5Km1g1uV5s-5yQb6Jk7LyrknqyrjQNtZtwvqN-L7AUQdkM14oxq6nJzXJiJYEP0Bg'

const client = createClient({ url, authToken })

// Read the SQL file
const sqlPath = '/tmp/schema.sql'
const sql = readFileSync(sqlPath, 'utf-8')
console.log(`[push-turso] read ${sql.length} bytes from ${sqlPath}`)

// Split by semicolons — but only at the end of lines (to avoid splitting inside strings)
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

console.log(`[push-turso] found ${statements.length} SQL statements`)

async function main() {
  console.log(`[push-turso] connecting to ${url} ...`)

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    // Remove SQL comments
    const cleanStmt = stmt
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim()

    if (!cleanStmt) continue

    try {
      await client.execute(cleanStmt)
      const preview = cleanStmt.slice(0, 60).replace(/\n/g, ' ')
      console.log(`  ✓ [${i + 1}/${statements.length}] ${preview}...`)
    } catch (err: any) {
      if (err.message.includes('already exists')) {
        console.log(`  ⊙ [${i + 1}/${statements.length}] already exists, skipping`)
      } else {
        console.error(`  ✗ [${i + 1}/${statements.length}] failed:`, err.message)
        console.error(`    SQL: ${cleanStmt.slice(0, 150)}`)
      }
    }
  }

  // Verify tables exist
  console.log('\n[push-turso] verifying tables...')
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  )
  console.log('  Tables:', tables.rows.map((r: any) => r.name).join(', '))

  // Count rows in each table
  for (const row of tables.rows) {
    const tableName = (row as any).name
    if (tableName.startsWith('_') || tableName.startsWith('sqlite_')) continue
    const count = await client.execute(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
    console.log(`  ${tableName}: ${count.rows[0].cnt} rows`)
  }

  console.log('\n[push-turso] done!')
}

main().catch((err) => {
  console.error('[push-turso] fatal:', err)
  process.exit(1)
})
