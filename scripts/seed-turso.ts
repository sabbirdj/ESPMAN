// Seed the Turso database with sample firmware images.
// Run with: bun run /home/z/my-project/scripts/seed-turso.ts

import { createClient } from '@libsql/client'

const url = 'libsql://esp-device-manger-xeroxviper.aws-ap-south-1.turso.io'
const authToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI3MTMyOTYsImlkIjoiMDE5ZjExZmUtMTEwMS03MDkzLThiZDktMmVkNTI5MTgxOGZlIiwicmlkIjoiYjg0NmRmMzMtNWNmNy00M2IwLThiMzMtNmE4ODM1M2RlMzBhIn0.VTJpXubj33sauQigzB67Q5Km1g1uV5s-5yQb6Jk7LyrknqyrjQNtZtwvqN-L7AUQdkM14oxq6nJzXJiJYEP0Bg'

const client = createClient({ url, authToken })

const firmwareSeed = [
  { name: 'sensor-hub',       version: '1.4.2', type: 'ESP32',    size: 412_000, description: 'Multi-sensor hub with MQTT support' },
  { name: 'sensor-hub',       version: '1.5.0', type: 'ESP32',    size: 438_500, description: 'Adds Home Assistant auto-discovery' },
  { name: 'relay-controller', version: '2.0.1', type: 'ESP8266',  size: 318_000, description: '4-channel relay controller with web UI' },
  { name: 'relay-controller', version: '2.1.0', type: 'ESP8266',  size: 322_400, description: 'Adds scheduled timers and OTA patching' },
  { name: 'greenhouse-os',    version: '0.9.5', type: 'ESP32-S3', size: 720_000, description: 'Greenhouse automation with capacitive touch' },
  { name: 'lab-node',         version: '1.0.0', type: 'ESP32-C3', size: 285_000, description: 'RISC-V low-power lab node' },
  { name: 'mesh-bridge',      version: '0.4.0', type: 'ESP32-C6', size: 510_000, description: 'Wi-Fi 6 + Zigbee mesh bridge' },
  { name: 'air-quality',      version: '3.2.0', type: 'ESP32-S2', size: 380_000, description: 'Air quality monitor with e-paper display' },
]

async function main() {
  console.log('[seed-turso] seeding firmware library...')

  for (const fw of firmwareSeed) {
    // Check if already exists
    const existing = await client.execute({
      sql: 'SELECT id FROM Firmware WHERE name = ? AND version = ?',
      args: [fw.name, fw.version],
    })
    if (existing.rows.length > 0) {
      console.log(`  ⊙ ${fw.name} v${fw.version} already exists, skipping`)
      continue
    }

    // Generate a fake checksum
    const checksum = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('')

    // Generate a CUID-like ID
    const id = 'cm' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)

    await client.execute({
      sql: `INSERT INTO Firmware (id, name, version, type, size, checksum, description, "installCount", "createdAt", "updatedAt")
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
      args: [id, fw.name, fw.version, fw.type, fw.size, checksum, fw.description],
    })
    console.log(`  ✓ ${fw.name} v${fw.version} (${fw.type})`)
  }

  // Count
  const count = await client.execute('SELECT COUNT(*) as cnt FROM Firmware')
  console.log(`\n[seed-turso] done! ${count.rows[0].cnt} firmware images in database.`)

  // List all
  const all = await client.execute('SELECT name, version, type FROM Firmware ORDER BY name, version')
  console.log('\nFirmware list:')
  for (const row of all.rows) {
    console.log(`  ${row.name} v${row.version} (${row.type})`)
  }
}

main().catch((err) => {
  console.error('[seed-turso] fatal:', err)
  process.exit(1)
})
