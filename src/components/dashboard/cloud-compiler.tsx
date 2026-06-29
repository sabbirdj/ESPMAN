'use client'

import { useState, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Card } from '@/components/ui/card'
import { Server, Code, TerminalSquare, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'navigation'

export function CloudCompiler() {
  const [code, setCode] = useState<string>('// Loading ESPMAN firmware template...')
  const [name, setName] = useState('MyCustomFirmware')
  const [version, setVersion] = useState('1.0.0')
  const [chipType, setChipType] = useState('ESP32')
  const [isCompiling, setIsCompiling] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const terminalRef = useRef<HTMLDivElement>(null)

  // Load base firmware on mount
  useEffect(() => {
    fetch('/api/compiler/template')
      .then(res => res.text())
      .then(text => setCode(text))
      .catch(() => setCode('// Failed to load template'))
  }, [])

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const handleCompile = async () => {
    if (!name || !version) {
      toast.error('Name and version are required')
      return
    }

    setIsCompiling(true)
    setLogs(['Starting remote compilation on VPS...'])

    try {
      const response = await fetch('/api/compiler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, version, chipType })
      })

      if (!response.body) {
        throw new Error('No response body')
      }

      // Read SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              setLogs(prev => [...prev, '\n✨ Compilation finished successfully! Firmware is ready for OTA.'])
              toast.success('Firmware compiled successfully!')
              break
            } else if (data.startsWith('[ERROR]')) {
              setLogs(prev => [...prev, '\n❌ ' + data])
              toast.error('Compilation failed')
            } else {
              setLogs(prev => [...prev, data])
            }
          }
        }
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `\n❌ System Error: ${err.message}`])
      toast.error('Failed to communicate with compiler service')
    } finally {
      setIsCompiling(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Editor Section */}
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card className="flex flex-col overflow-hidden border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <Code className="h-4 w-4" />
              Arduino Editor
            </div>
            <div className="text-xs text-slate-500">
              ESPMAN C++ Library Included
            </div>
          </div>
          <div className="h-[500px] w-full">
            <Editor
              height="100%"
              defaultLanguage="cpp"
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </Card>

        {/* Terminal Logs */}
        <Card className="flex flex-col overflow-hidden border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/50">
            <TerminalSquare className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Compiler Output</span>
          </div>
          <div 
            ref={terminalRef}
            className="h-[250px] overflow-y-auto bg-[#1e1e1e] p-4 text-xs font-mono text-slate-300"
          >
            {logs.length === 0 ? (
              <span className="text-slate-600">Waiting for compilation...</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap leading-relaxed">{log}</div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Sidebar Controls */}
      <div className="flex flex-col gap-6">
        <Card className="p-5 border-slate-200 dark:border-slate-800">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Server className="h-4 w-4 text-emerald-500" />
            Build Configuration
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Target Chip</label>
              <select
                value={chipType}
                onChange={(e) => setChipType(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="ESP32">ESP32</option>
                <option value="ESP8266">ESP8266</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Firmware Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SmartSwitch"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Version</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. 1.0.0"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div className="pt-4">
              <button
                onClick={handleCompile}
                disabled={isCompiling}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCompiling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Compiling on VPS...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Compile & Save Firmware
                  </>
                )}
              </button>
            </div>
            
            <div className="mt-4 rounded-md bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-800">
              <p className="font-semibold mb-1">How it works:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Your custom code uses the ESPMAN library.</li>
                <li>Set your custom config (Wi-Fi, Server) in setup().</li>
                <li>The ESPMAN C++ files are compiled together automatically.</li>
                <li>Deploy to any device instantly via OTA!</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
