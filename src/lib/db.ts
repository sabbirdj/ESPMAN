import { createClient, type Client } from '@libsql/client'

// ============================================================================
//  Turso (libSQL) database client — direct, no Prisma adapter needed.
// ----------------------------------------------------------------------------
//  Works in two modes:
//    1. LOCAL (development) — DATABASE_URL is a file path like "file:./db/custom.db"
//    2. TURSO (production) — DATABASE_URL is "libsql://<db-name>-<org>.turso.io"
//       + TURSO_AUTH_TOKEN for authentication
//
//  LAZY INITIALIZATION: The client is only created on the first query,
//  NOT at module load time. This prevents `next build` from failing when
//  environment variables aren't available during the build step.
// ============================================================================

let _client: Client | null = null

function getClient(): Client {
  if (_client) return _client

  const url = process.env.DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url) {
    // During `next build`, env vars may not be loaded yet. Use a placeholder
    // that won't actually be queried (the build doesn't make real queries).
    console.warn('[db] DATABASE_URL not set, using local file fallback')
    _client = createClient({ url: 'file:./db/custom.db' })
    return _client
  }

  _client = createClient({ url, authToken })
  return _client
}

// ============================================================================
//  Prisma-like query builder for the Device model
// ============================================================================
export const db = {
  device: {
    async count(opts?: { where?: { status?: string; type?: string } }) {
      let sql = 'SELECT COUNT(*) as cnt FROM Device'
      const args: any[] = []
      const conditions: string[] = []
      if (opts?.where?.status) {
        conditions.push('status = ?')
        args.push(opts.where.status)
      }
      if (opts?.where?.type) {
        conditions.push('type = ?')
        args.push(opts.where.type)
      }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
      const result = await getClient().execute({ sql, args })
      return Number((result.rows[0] as any).cnt)
    },

    async findMany(opts?: {
      where?: { id?: string; macAddress?: string; status?: string; type?: string }
      include?: { firmware?: boolean; telemetryLogs?: boolean }
      orderBy?: { createdAt?: 'desc' | 'asc' }
      take?: number
    }) {
      let sql = 'SELECT * FROM Device'
      const args: any[] = []
      const conditions: string[] = []
      if (opts?.where?.id) { conditions.push('id = ?'); args.push(opts.where.id) }
      if (opts?.where?.macAddress) { conditions.push('macAddress = ?'); args.push(opts.where.macAddress) }
      if (opts?.where?.status) { conditions.push('status = ?'); args.push(opts.where.status) }
      if (opts?.where?.type) { conditions.push('type = ?'); args.push(opts.where.type) }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
      sql += ' ORDER BY ' + (opts?.orderBy?.createdAt === 'asc' ? 'createdAt ASC' : 'createdAt DESC')
      if (opts?.take) sql += ` LIMIT ${opts.take}`

      const result = await getClient().execute({ sql, args })
      let devices = result.rows as any[]

      // Include firmware if requested
      if (opts?.include?.firmware && devices.length > 0) {
        const firmwareIds = devices.map((d) => d.firmwareId).filter(Boolean)
        if (firmwareIds.length > 0) {
          const placeholders = firmwareIds.map(() => '?').join(',')
          const fwResult = await getClient().execute({
            sql: `SELECT * FROM Firmware WHERE id IN (${placeholders})`,
            args: firmwareIds,
          })
          const firmwareMap = new Map(fwResult.rows.map((f: any) => [f.id, f]))
          devices = devices.map((d) => ({
            ...d,
            firmware: d.firmwareId ? firmwareMap.get(d.firmwareId) ?? null : null,
          }))
        }
      }

      // Include telemetry logs if requested
      if (opts?.include?.telemetryLogs && devices.length > 0) {
        const deviceIds = devices.map((d) => d.id)
        const placeholders = deviceIds.map(() => '?').join(',')
        const logsResult = await getClient().execute({
          sql: `SELECT * FROM TelemetryLog WHERE deviceId IN (${placeholders}) ORDER BY createdAt DESC LIMIT 50`,
          args: deviceIds,
        })
        const logsByDevice = new Map<string, any[]>()
        for (const log of logsResult.rows as any[]) {
          if (!logsByDevice.has(log.deviceId)) logsByDevice.set(log.deviceId, [])
          logsByDevice.get(log.deviceId)!.push(log)
        }
        devices = devices.map((d) => ({
          ...d,
          telemetryLogs: logsByDevice.get(d.id) ?? [],
        }))
      }

      return devices
    },

    async findUnique(opts: { where: { id?: string; macAddress?: string }, include?: any }) {
      let sql = 'SELECT * FROM Device'
      const args: any[] = []
      const conditions: string[] = []
      if (opts.where.id) { conditions.push('id = ?'); args.push(opts.where.id) }
      if (opts.where.macAddress) { conditions.push('macAddress = ?'); args.push(opts.where.macAddress) }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
      sql += ' LIMIT 1'
      const result = await getClient().execute({ sql, args })
      const device = (result.rows[0] as any) ?? null
      if (device && opts.include) {
        const withInclude = await this.findMany({ where: { id: device.id }, include: opts.include })
        return withInclude[0]
      }
      return device
    },

    async findFirst(opts: { where: { version?: string; type?: string }, include?: any }) {
      let sql = 'SELECT * FROM Device'
      const args: any[] = []
      const conditions: string[] = []
      if (opts.where.version) { conditions.push('firmwareVersion = ?'); args.push(opts.where.version) }
      if (opts.where.type) { conditions.push('type = ?'); args.push(opts.where.type) }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
      sql += ' LIMIT 1'
      const result = await getClient().execute({ sql, args })
      return (result.rows[0] as any) ?? null
    },

    async create(opts: { data: any, include?: any }) {
      const d = opts.data
      const id = d.id || 'cm' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
      await getClient().execute({
        sql: `INSERT INTO Device (id, name, type, macAddress, ipAddress, firmwareId, firmwareVersion, status, location, description, cpuTemp, heapUsed, heapTotal, flashUsed, flashTotal, wifiRssi, uptimeSeconds, gpioState, lastSeenAt, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [
          id, d.name, d.type, d.macAddress?.toUpperCase() ?? null,
          d.ipAddress ?? null, d.firmwareId ?? null, d.firmwareVersion ?? null,
          d.status ?? 'offline', d.location ?? null, d.description ?? null,
          d.cpuTemp ?? null, d.heapUsed ?? null, d.heapTotal ?? null,
          d.flashUsed ?? null, d.flashTotal ?? null, d.wifiRssi ?? null,
          d.uptimeSeconds ?? 0, d.gpioState ?? null, d.lastSeenAt ?? null,
        ],
      })
      return this.findUnique({ where: { id }, include: opts.include })
    },

    async update(opts: { where: { id: string }; data: any, include?: any }) {
      const d = opts.data
      const fields: string[] = []
      const args: any[] = []
      if (d.name !== undefined) { fields.push('name = ?'); args.push(d.name) }
      if (d.location !== undefined) { fields.push('location = ?'); args.push(d.location) }
      if (d.description !== undefined) { fields.push('description = ?'); args.push(d.description) }
      if (d.ipAddress !== undefined) { fields.push('ipAddress = ?'); args.push(d.ipAddress) }
      if (d.firmwareVersion !== undefined) { fields.push('firmwareVersion = ?'); args.push(d.firmwareVersion) }
      if (d.firmwareId !== undefined) { fields.push('firmwareId = ?'); args.push(d.firmwareId) }
      if (d.status !== undefined) { fields.push('status = ?'); args.push(d.status) }
      if (d.lastSeenAt !== undefined) { fields.push('lastSeenAt = ?'); args.push(d.lastSeenAt) }
      if (d.cpuTemp !== undefined) { fields.push('cpuTemp = ?'); args.push(d.cpuTemp) }
      if (d.heapUsed !== undefined) { fields.push('heapUsed = ?'); args.push(d.heapUsed) }
      if (d.wifiRssi !== undefined) { fields.push('wifiRssi = ?'); args.push(d.wifiRssi) }
      if (d.uptimeSeconds !== undefined) { fields.push('uptimeSeconds = ?'); args.push(d.uptimeSeconds) }
      if (d.gpioState !== undefined) {
        fields.push('gpioState = ?')
        args.push(typeof d.gpioState === 'string' ? d.gpioState : JSON.stringify(d.gpioState))
      }
      fields.push("updatedAt = datetime('now')")
      args.push(opts.where.id)
      await getClient().execute({
        sql: `UPDATE Device SET ${fields.join(', ')} WHERE id = ?`,
        args,
      })
      return this.findUnique({ where: { id: opts.where.id }, include: opts.include })
    },

    async updateMany(opts: { where: { firmwareId?: string }; data: any }) {
      const fields: string[] = []
      const args: any[] = []
      if (opts.data.firmwareId !== undefined) { fields.push('firmwareId = ?'); args.push(opts.data.firmwareId) }
      if (opts.data.firmwareVersion !== undefined) { fields.push('firmwareVersion = ?'); args.push(opts.data.firmwareVersion) }
      if (opts.data.status !== undefined) { fields.push('status = ?'); args.push(opts.data.status) }
      fields.push("updatedAt = datetime('now')")
      const conditions: string[] = []
      if (opts.where.firmwareId) { conditions.push('firmwareId = ?'); args.push(opts.where.firmwareId) }
      const sql = `UPDATE Device SET ${fields.join(', ')}${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''}`
      await getClient().execute({ sql, args })
      return { count: 1 }
    },

    async delete(opts: { where: { id: string } }) {
      await getClient().execute({ sql: 'DELETE FROM Device WHERE id = ?', args: [opts.where.id] })
    },

    async deleteMany(opts?: { where?: { status?: string; type?: string } }) {
      let sql = 'DELETE FROM Device'
      const args: any[] = []
      const conditions: string[] = []
      if (opts?.where?.status) { conditions.push('status = ?'); args.push(opts.where.status) }
      if (opts?.where?.type) { conditions.push('type = ?'); args.push(opts.where.type) }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
      const result = await getClient().execute({ sql, args })
      return { count: result.rowsAffected }
    },

    async groupBy(opts: { by: string[]; _count: any }) {
      const by = opts.by.join(', ')
      const result = await getClient().execute({ sql: `SELECT ${by}, COUNT(*) as _count FROM Device GROUP BY ${by}` })
      return result.rows.map((r: any) => ({
        type: r.type,
        _count: { _all: r._count },
      }))
    },
  },

  firmware: {
    async count() {
      const result = await getClient().execute('SELECT COUNT(*) as cnt FROM Firmware')
      return Number((result.rows[0] as any).cnt)
    },

    async findMany(opts?: { include?: any, orderBy?: any }) {
      let sql = 'SELECT * FROM Firmware ORDER BY createdAt DESC'
      const result = await getClient().execute(sql)
      let firmwares = result.rows as any[]
      if (opts?.include?._count) {
        for (const fw of firmwares) {
          const countResult = await getClient().execute({
            sql: 'SELECT COUNT(*) as cnt FROM Device WHERE firmwareId = ?',
            args: [fw.id],
          })
          fw._count = { devices: Number((countResult.rows[0] as any).cnt) }
        }
      }
      return firmwares
    },

    async findUnique(opts: { where: { id: string } }) {
      const result = await getClient().execute({ sql: 'SELECT * FROM Firmware WHERE id = ?', args: [opts.where.id] })
      return (result.rows[0] as any) ?? null
    },

    async findFirst(opts: { where: any }) {
      let sql = 'SELECT * FROM Firmware'
      const args: any[] = []
      const conditions: string[] = []
      if (opts.where.version) { conditions.push('version = ?'); args.push(opts.where.version) }
      if (opts.where.type) { conditions.push('type = ?'); args.push(opts.where.type) }
      if (opts.where.name) { conditions.push('name = ?'); args.push(opts.where.name) }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
      sql += ' LIMIT 1'
      const result = await getClient().execute({ sql, args })
      return (result.rows[0] as any) ?? null
    },

    async create(opts: { data: any }) {
      const d = opts.data
      const id = 'cm' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
      await getClient().execute({
        sql: `INSERT INTO Firmware (id, name, version, type, size, checksum, description, installCount, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
        args: [id, d.name, d.version, d.type, d.size, d.checksum, d.description ?? null],
      })
      return this.findUnique({ where: { id } })
    },

    async update(opts: { where: { id: string }; data: any }) {
      const fields: string[] = []
      const args: any[] = []
      if (opts.data.installCount !== undefined) {
        if (opts.data.installCount.increment !== undefined) {
          fields.push('installCount = installCount + ?')
          args.push(opts.data.installCount.increment)
        }
      }
      fields.push("updatedAt = datetime('now')")
      args.push(opts.where.id)
      await getClient().execute({ sql: `UPDATE Firmware SET ${fields.join(', ')} WHERE id = ?`, args })
      return this.findUnique({ where: { id: opts.where.id } })
    },

    async delete(opts: { where: { id: string } }) {
      await getClient().execute({ sql: 'DELETE FROM Firmware WHERE id = ?', args: [opts.where.id] })
    },

    async deleteMany(opts?: { where?: any }) {
      const result = await getClient().execute({ sql: 'DELETE FROM Firmware' })
      return { count: result.rowsAffected }
    },

    async aggregate(opts: { _sum: { installCount: boolean } }) {
      const result = await getClient().execute('SELECT SUM(installCount) as cnt FROM Firmware')
      return { _sum: { installCount: (result.rows[0] as any).cnt } }
    },

    async groupBy(opts: { by: string[]; _count: any }) {
      const by = opts.by.join(', ')
      const result = await getClient().execute({ sql: `SELECT ${by}, COUNT(*) as _count FROM Firmware GROUP BY ${by}` })
      return result.rows.map((r: any) => ({
        type: r.type,
        _count: { _all: r._count },
      }))
    },
  },

  telemetryLog: {
    async create(opts: { data: any }) {
      const d = opts.data
      const id = 'cm' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
      await getClient().execute({
        sql: `INSERT INTO TelemetryLog (id, deviceId, event, message, level, createdAt)
              VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        args: [id, d.deviceId, d.event, d.message, d.level ?? 'info'],
      })
      return { id, ...d }
    },

    async findMany(opts?: { where?: { deviceId?: string }; orderBy?: { createdAt?: 'desc' | 'asc' }; take?: number; include?: any }) {
      let sql = 'SELECT * FROM TelemetryLog'
      const args: any[] = []
      if (opts?.where?.deviceId) {
        sql += ' WHERE deviceId = ?'
        args.push(opts.where.deviceId)
      }
      sql += ' ORDER BY ' + (opts?.orderBy?.createdAt === 'asc' ? 'createdAt ASC' : 'createdAt DESC')
      if (opts?.take) sql += ` LIMIT ${opts.take}`
      const result = await getClient().execute({ sql, args })
      let logs = result.rows as any[]
      if (opts?.include?.device && logs.length > 0) {
        const deviceIds = [...new Set(logs.map((l) => l.deviceId))]
        const placeholders = deviceIds.map(() => '?').join(',')
        const devicesResult = await getClient().execute({
          sql: `SELECT id, name, type FROM Device WHERE id IN (${placeholders})`,
          args: deviceIds,
        })
        const deviceMap = new Map(devicesResult.rows.map((d: any) => [d.id, d]))
        logs = logs.map((l) => ({ ...l, device: deviceMap.get(l.deviceId) ?? null }))
      }
      return logs
    },

    async deleteMany(opts?: { where?: { deviceId?: string } }) {
      let sql = 'DELETE FROM TelemetryLog'
      const args: any[] = []
      if (opts?.where?.deviceId) {
        sql += ' WHERE deviceId = ?'
        args.push(opts.where.deviceId)
      }
      const result = await getClient().execute({ sql, args })
      return { count: result.rowsAffected }
    },
  },
}

export const $disconnect = async () => {
  if (_client) {
    _client.close()
    _client = null
  }
}

export { getClient as rawDbClient }
