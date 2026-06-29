'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, FileBox, HardDrive, Hash, Plus, Trash2, Upload, FileUp, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { ESP_TYPES, ESP_TYPE_SPECS, formatBytes, type EspType } from '@/lib/types'
import { useDashboardStore, type DashboardDevice } from '@/lib/store'
import { useDeviceSocketEmitter } from '@/hooks/use-device-socket'

interface FirmwareItem {
  id: string
  name: string
  version: string
  type: string
  size: number
  checksum: string
  description: string | null
  installCount: number
  createdAt: string
  _count?: { devices: number }
  hasBinary?: boolean
}

export function FirmwareManager() {
  const [firmwares, setFirmwares] = useState<FirmwareItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const devices = useDashboardStore((s) => s.devices)

  const loadFirmware = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/firmware')
      const data = await res.json()
      setFirmwares(data)
    } catch {
      toast.error('Failed to load firmware')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setTimeout(() => {
      loadFirmware()
    }, 0)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Firmware Library</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload firmware .bin files and install them onto your ESP devices over the air (OTA).
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <Upload className="h-4 w-4" />
          Upload Firmware
        </Button>
      </div>

      {loading ? (
        <Card className="flex h-32 items-center justify-center border-slate-200 dark:border-slate-800">
          <span className="text-sm text-slate-400">Loading firmware library…</span>
        </Card>
      ) : firmwares.length === 0 ? (
        <Card className="flex h-32 flex-col items-center justify-center border-dashed border-slate-300 dark:border-slate-700">
          <FileBox className="h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm text-slate-500">No firmware uploaded yet</p>
          <p className="text-xs text-slate-400">Click "Upload Firmware" to upload your first .bin file</p>
        </Card>
      ) : (
        <div className="stagger-children grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {firmwares.map((fw) => (
            <FirmwareCard key={fw.id} firmware={fw} devices={devices} onChanged={loadFirmware} />
          ))}
        </div>
      )}

      <UploadFirmwareDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          setUploadOpen(false)
          loadFirmware()
        }}
      />
    </div>
  )
}

function FirmwareCard({
  firmware,
  devices,
  onChanged,
}: {
  firmware: FirmwareItem
  devices: DashboardDevice[]
  onChanged: () => void
}) {
  const spec = ESP_TYPE_SPECS[firmware.type as EspType]
  const emitter = useDeviceSocketEmitter()
  const [installing, setInstalling] = useState(false)
  const [targetDeviceId, setTargetDeviceId] = useState<string>('')

  const compatible = devices.filter((d) => d.type === firmware.type)

  const handleDelete = async () => {
    if (!confirm(`Delete firmware ${firmware.name} v${firmware.version}?`)) return
    const res = await fetch(`/api/firmware/${firmware.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Firmware deleted')
      onChanged()
    } else {
      toast.error('Failed to delete firmware')
    }
  }

  const handleInstall = async () => {
    if (!targetDeviceId) {
      toast.error('Select a target device first')
      return
    }
    const device = devices.find((d) => d.id === targetDeviceId)
    if (!device) return
    if (!firmware.hasBinary) {
      toast.error('This firmware has no .bin file uploaded. Re-upload with the .bin file to enable OTA.')
      return
    }
    if (device.firmwareVersion === firmware.version) {
      toast.message(`Already on v${firmware.version}`)
      return
    }
    setInstalling(true)
    try {
      // 1. Tell API to record the install
      const res = await fetch(`/api/firmware/${firmware.id}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: targetDeviceId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Install failed')
      }
      // 2. Tell device-service to send OTA command to the ESP
      //    The ESP will download the .bin from http://SERVER_HOST:3000/api/firmware/[id]/bin
      emitter.installFirmware(targetDeviceId, {
        name: firmware.name,
        version: firmware.version,
        size: firmware.size,
        firmwareId: firmware.id,
      } as any)
      toast.success(`OTA install started: ${firmware.name} v${firmware.version} → ${device.name}`)
      setTargetDeviceId('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Install failed')
      await fetch(`/api/firmware/${firmware.id}/install`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: targetDeviceId, success: false }),
      })
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Card className="flex flex-col border-slate-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: spec?.color ?? '#10b981' }}
        >
          <HardDrive className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{firmware.name}</h3>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]" style={{ color: spec?.color, borderColor: `${spec?.color}40` }}>
              {firmware.type}
            </Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">v{firmware.version}</span>
            <span>·</span>
            <span>{firmware.size > 0 ? formatBytes(firmware.size) : '—'}</span>
            {firmware._count && (
              <>
                <span>·</span>
                <span>{firmware._count.devices} device{firmware._count.devices !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {firmware.hasBinary && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-emerald-500"
              onClick={() => window.open(`/api/firmware/${firmware.id}/bin`, '_blank')}
              title="Download .bin file"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-500" onClick={handleDelete} title="Delete firmware">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {firmware.description && (
        <p className="mt-3 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{firmware.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Hash className="h-3 w-3" />
          <span className="font-mono">{firmware.checksum}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {firmware.installCount} install{firmware.installCount !== 1 ? 's' : ''}
        </span>
        {firmware.hasBinary ? (
          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            .bin ready
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            No .bin file
          </Badge>
        )}
      </div>

      {/* Install target */}
      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
          Install on {firmware.type} device
        </Label>
        <div className="mt-2 flex gap-2">
          <Select value={targetDeviceId} onValueChange={setTargetDeviceId}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder={compatible.length === 0 ? `No ${firmware.type} devices` : 'Select device…'} />
            </SelectTrigger>
            <SelectContent>
              {compatible.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} {d.firmwareVersion ? `(v${d.firmwareVersion})` : '(no firmware)'} {d.isReal ? '✓' : '⚠'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleInstall}
            disabled={installing || !targetDeviceId || compatible.length === 0 || !firmware.hasBinary}
            className="h-8 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Install OTA
          </Button>
        </div>
        {!firmware.hasBinary && (
          <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400">
            ⚠️ No .bin file uploaded. Re-upload this firmware with a .bin file to enable OTA.
          </p>
        )}
      </div>
    </Card>
  )
}

function UploadFirmwareDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    version: '',
    type: 'ESP32' as EspType,
    description: '',
  })
  const [file, setFile] = useState<File | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.version) {
      toast.error('Name and version are required')
      return
    }
    if (!file) {
      toast.error('Please select a .bin file to upload')
      return
    }
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('name', form.name.trim())
      formData.append('version', form.version.trim())
      formData.append('type', form.type)
      formData.append('description', form.description.trim())
      formData.append('file', file)

      const res = await fetch('/api/firmware', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Upload failed')
      }
      toast.success(`Firmware ${form.name} v${form.version} uploaded (${formatBytes(file.size)})`)
      setForm({ name: '', version: '', type: 'ESP32', description: '' })
      setFile(null)
      onUploaded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base">Upload Firmware Image</DialogTitle>
          <DialogDescription className="text-xs">
            Upload a compiled <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] dark:bg-slate-800">.bin</code> file.
            The ESP will download this file over HTTP when you click "Install OTA".
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fw-name" className="text-xs">Firmware Name *</Label>
              <Input id="fw-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="sensor-hub" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fw-version" className="text-xs">Version *</Label>
              <Input id="fw-version" value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} placeholder="1.5.0" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fw-type" className="text-xs">Target Chip</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as EspType }))}>
                <SelectTrigger id="fw-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fw-file" className="text-xs">.bin File *</Label>
              <Input
                id="fw-file"
                type="file"
                accept=".bin"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                className="text-xs"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fw-desc" className="text-xs">Description</Label>
            <Textarea id="fw-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What does this firmware do? What's new in this version?" rows={2} />
          </div>
          {file && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-xs dark:bg-emerald-950/30">
              <FileUp className="h-4 w-4 text-emerald-600" />
              <span className="text-emerald-700 dark:text-emerald-300">
                {file.name} ({formatBytes(file.size)})
              </span>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              <Upload className="h-4 w-4" />
              {submitting ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
