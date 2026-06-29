'use client'

import { Cpu, LayoutDashboard, MemoryStick, Radio, Code } from 'lucide-react'

interface MobileNavProps {
  activeView: 'dashboard' | 'devices' | 'firmware' | 'compiler' | 'logs'
  onViewChange: (view: 'dashboard' | 'devices' | 'firmware' | 'compiler' | 'logs') => void
}

export function MobileNav({ activeView, onViewChange }: MobileNavProps) {
  const items = [
    { id: 'dashboard' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'devices' as const, label: 'Devices', icon: Cpu },
    { id: 'firmware' as const, label: 'Firmware', icon: MemoryStick },
    { id: 'compiler' as const, label: 'Compiler', icon: Code },
    { id: 'logs' as const, label: 'Logs', icon: Radio },
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/95">
      {items.map((item) => {
        const Icon = item.icon
        const active = activeView === item.id
        return (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
              active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
