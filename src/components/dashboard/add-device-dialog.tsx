'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Cpu, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { ESP_TYPES, ESP_TYPE_SPECS, type EspType } from '@/lib/types'
import { useDeviceSocketEmitter } from '@/hooks/use-device-socket'

interface AddDeviceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeviceAdded?: () => void
}

function generateMac() {
  const hex = '0123456789ABCDEF'
  const parts: string[] = []
  for (let i = 0; i < 6; i++) {
    let part = ''
    for (let j = 0; j < 2; j++) part += hex[Math.floor(Math.random() * 16)]
    parts.push(part)
  }
  return parts.join(':')
}

function generateIP() {
  return `192.168.1.${10 + Math.floor(Math.random() * 200)}`
}

export function AddDeviceDialog({ open, onOpenChange, onDeviceAdded }: AddDeviceDialogProps) {
  const router = useRouter()
  const emitter = useDeviceSocketEmitter()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: 'ESP32' as EspType,
    macAddress: '',
    ipAddress: '',
    location: '',
    description: '',
    firmwareVersion: '',
  })

  const spec = ESP_TYPE_SPECS[form.type]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.macAddress.trim()) {
      toast.error('Name and MAC address are required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          macAddress: form.macAddress.trim().toUpperCase(),
          ipAddress: form.ipAddress.trim() || undefined,
          location: form.location.trim() || undefined,
          description: form.description.trim() || undefined,
          firmwareVersion: form.firmwareVersion.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to add device')
      }
      const device = await res.json()

      // Notify device-service to start a live shadow for this device
      emitter.registerDevice({
        id: device.id,
        name: device.name,
        type: device.type,
        macAddress: device.macAddress,
        ipAddress: device.ipAddress ?? undefined,
        firmwareVersion: device.firmwareVersion ?? undefined,
      })

      toast.success(`${device.name} added and is now online`)
      onDeviceAdded?.()
      onOpenChange(false)
      // Reset form
      setForm({ name: '', type: 'ESP32', macAddress: '', ipAddress: '', location: '', description: '', firmwareVersion: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add device')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base">Add ESP Device</DialogTitle>
              <DialogDescription className="text-xs">
                Register a new device. It will appear on the dashboard immediately.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Device type selector */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Device Type</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ESP_TYPES.map((t) => {
                const s = ESP_TYPE_SPECS[t]
                const active = form.type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-2 transition-all ${
                      active
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                    }`}
                    style={active ? { borderColor: s.color } : undefined}
                  >
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-[10px] font-medium leading-tight text-slate-700 dark:text-slate-300">{t.replace('ESP32-', '').replace('ESP', '')}</span>
                  </button>
                )
              })}
            </div>
            {spec && (
              <div className="rounded-md bg-slate-50 p-2.5 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-200">{spec.label}: </span>
                {spec.cpu} · {spec.ram} RAM · {spec.flash} Flash · {spec.wifi} · {spec.bluetooth} · {spec.pins} GPIO pins
              </div>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs font-medium">Device Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Living Room Sensor"
              required
            />
          </div>

          {/* MAC + IP */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="mac" className="text-xs font-medium">MAC Address *</Label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, macAddress: generateMac() }))}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                >
                  <Sparkles className="h-3 w-3" />
                  Auto
                </button>
              </div>
              <Input
                id="mac"
                value={form.macAddress}
                onChange={(e) => setForm((f) => ({ ...f, macAddress: e.target.value }))}
                placeholder="A4:CF:12:9F:31:7B"
                className="font-mono text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="ip" className="text-xs font-medium">IP Address</Label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ipAddress: generateIP() }))}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                >
                  <Sparkles className="h-3 w-3" />
                  Auto
                </button>
              </div>
              <Input
                id="ip"
                value={form.ipAddress}
                onChange={(e) => setForm((f) => ({ ...f, ipAddress: e.target.value }))}
                placeholder="192.168.1.42"
                className="font-mono text-sm"
              />
            </div>
          </div>

          {/* Location + firmware */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location" className="text-xs font-medium">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Home / Living Room"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firmware" className="text-xs font-medium">Initial Firmware (optional)</Label>
              <Input
                id="firmware"
                value={form.firmwareVersion}
                onChange={(e) => setForm((f) => ({ ...f, firmwareVersion: e.target.value }))}
                placeholder="e.g. 1.4.2"
                className="font-mono text-sm"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-xs font-medium">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does this device do? Where is it deployed?"
              rows={2}
              className="text-sm"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting ? (
                <>
                  <Plus className="h-4 w-4 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Device
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
