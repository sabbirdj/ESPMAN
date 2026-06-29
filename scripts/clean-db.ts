// Clean the database: delete the 4 fake seeded devices and their logs.
// Run with: bun run /home/z/my-project/scripts/clean-db.ts

import { db, $disconnect } from '../src/lib/db'

async function main() {
  // Delete all telemetry logs first (foreign key constraint)
  const deletedLogs = await db.telemetryLog.deleteMany({})
  console.log(`Deleted ${deletedLogs.count} telemetry logs`)

  // Delete all devices
  const deletedDevices = await db.device.deleteMany({})
  console.log(`Deleted ${deletedDevices.count} devices`)

  // Keep firmware (it's the firmware library, not fake devices)
  const firmwareCount = await db.firmware.count()
  console.log(`Kept ${firmwareCount} firmware images`)

  // Verify
  const remaining = await db.device.count()
  console.log(`\nDone. ${remaining} devices remaining in DB.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await $disconnect()
  })
