'use client'

import { useState, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Card } from '@/components/ui/card'
import { Terminal, Code, Settings, Play, Server, Wifi, TerminalSquare, Loader2, Save, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useRouter } from 'navigation'

export function CloudCompiler() {
  const [code, setCode] = useState<string>('// Loading ESPMAN firmware template...')
  const [name, setName] = useState('MyCustomFirmware')
  const [version, setVersion] = useState('1.0.0')
  const [chipType, setChipType] = useState('ESP32')
  const [dependencies, setDependencies] = useState('')
  
  // Hardware Config
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [serverHost, setServerHost] = useState('13.62.213.148')

  type WifiProfile = { id: string; name: string; ssid: string; password: string; host: string }
  const [profiles, setProfiles] = useState<WifiProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileSsid, setNewProfileSsid] = useState('')
  const [newProfilePassword, setNewProfilePassword] = useState('')

  const [isCompiling, setIsCompiling] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const terminalRef = useRef<HTMLDivElement>(null)

  // Load base firmware on mount
  useEffect(() => {
    fetch('/api/compiler/template')
      .then(res => res.text())
      .then(text => setCode(text))
      .catch(() => setCode('// Failed to load template'))
      
    try {
      const saved = localStorage.getItem('espman_wifi_profiles')
      if (saved) setProfiles(JSON.parse(saved))
    } catch(e) {}
  }, [])

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const handleSaveProfile = () => {
    if (!newProfileName.trim() || !newProfileSsid.trim()) {
      toast.error('Profile name and Wi-Fi SSID are required')
      return
    }
    
    const newProfile: WifiProfile = {
      id: Date.now().toString(),
      name: newProfileName.trim(),
      ssid: newProfileSsid.trim(),
      password: newProfilePassword,
      host: serverHost
    }
    
    const updated = [...profiles, newProfile]
    setProfiles(updated)
    setSelectedProfileId(newProfile.id)
    localStorage.setItem('espman_wifi_profiles', JSON.stringify(updated))
    toast.success('Wi-Fi profile saved')
    setNewProfileName('')
    setNewProfileSsid('')
    setNewProfilePassword('')
  }

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter(p => p.id !== id)
    setProfiles(updated)
    if (selectedProfileId === id) setSelectedProfileId('')
    localStorage.setItem('espman_wifi_profiles', JSON.stringify(updated))
  }

  const handleProfileSelect = (id: string) => {
    setSelectedProfileId(id)
    if (id === '') return
    const p = profiles.find(x => x.id === id)
    if (p) {
      setWifiSsid(p.ssid)
      setWifiPassword(p.password)
      setServerHost(p.host)
    }
  }

  const handleCompile = async () => {
    if (!name || !version) {
      toast.error('Name and version are required')
      return
    }
    if (!wifiSsid || !wifiPassword) {
      toast.error('Wi-Fi SSID and Password are required')
      return
    }

    setIsCompiling(true)
    setLogs(['Starting remote compilation on VPS...'])

    try {
      const response = await fetch('/api/compiler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code, 
          name, 
          version, 
          chipType,
          wifiSsid,
          wifiPassword,
          serverHost,
          dependencies
        })
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
        <Card className="flex flex-col overflow-hidden border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              <Code className="h-4 w-4" />
              Arduino Editor
            </div>
            <div className="text-xs text-neutral-500">
              ESPMAN framework is automatically injected during compilation
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
        <Card className="flex flex-col overflow-hidden border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900/50">
            <TerminalSquare className="h-4 w-4 text-neutral-500" />
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Compiler Output</span>
          </div>
          <div 
            ref={terminalRef}
            className="h-[250px] overflow-y-auto bg-[#1e1e1e] p-4 text-xs font-mono text-neutral-300"
          >
            {logs.length === 0 ? (
              <span className="text-neutral-600">Waiting for compilation...</span>
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
        <Card className="p-5 border-neutral-200 dark:border-neutral-800">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <Settings className="h-4 w-4" />
              Settings
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-500">Firmware Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-500">Version</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-500">Target Chip</label>
                <select
                  value={chipType}
                  onChange={(e) => setChipType(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                >
                  <option value="ESP32">ESP32</option>
                  <option value="ESP8266">ESP8266</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-500">Library Dependencies</label>
                <input
                  type="text"
                  placeholder="e.g. DHT sensor library, Adafruit NeoPixel"
                  value={dependencies}
                  onChange={(e) => setDependencies(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-neutral-500">Comma-separated exact library names.</p>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between mb-3 border-b border-neutral-200 dark:border-neutral-800 pb-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    <Wifi className="h-4 w-4" />
                    Hardware Config
                  </div>
                  
                  <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
                    <DialogTrigger asChild>
                      <button className="text-[10px] text-neutral-600 hover:text-neutral-700 dark:text-neutral-400 font-medium bg-neutral-100 dark:bg-neutral-800/30 px-2 py-1 rounded">
                        Manage Profiles
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Wi-Fi Profiles</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        {/* Add new profile form */}
                        <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-3">
                          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Create New Profile</div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="text-xs font-medium text-neutral-500">Profile Name</label>
                              <input 
                                type="text" 
                                placeholder="e.g. Home"
                                value={newProfileName}
                                onChange={e => setNewProfileName(e.target.value)}
                                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-neutral-500">Wi-Fi SSID</label>
                              <input 
                                type="text" 
                                placeholder="Network name"
                                value={newProfileSsid}
                                onChange={e => setNewProfileSsid(e.target.value)}
                                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-neutral-500">Password</label>
                              <input 
                                type="text" 
                                placeholder="Optional"
                                value={newProfilePassword}
                                onChange={e => setNewProfilePassword(e.target.value)}
                                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                              />
                            </div>
                          </div>
                          <Button onClick={handleSaveProfile} size="sm" className="w-full bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 dark:text-neutral-900 mt-2">
                            <Plus className="h-4 w-4 mr-1" /> Save Profile
                          </Button>
                        </div>
                        
                        {/* List profiles */}
                        {profiles.length > 0 ? (
                          <div className="border border-neutral-200 dark:border-neutral-800 rounded-md divide-y divide-neutral-100 dark:divide-neutral-800/50 max-h-[200px] overflow-y-auto">
                            {profiles.map(p => (
                              <div key={p.id} className="flex items-center justify-between p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                                <div>
                                  <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{p.name}</div>
                                  <div className="text-xs text-neutral-500">{p.ssid}</div>
                                </div>
                                <div className="flex gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      handleProfileSelect(p.id)
                                      setIsManageDialogOpen(false)
                                    }}
                                  >
                                    Load
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                                    onClick={() => handleDeleteProfile(p.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-sm text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-md">
                            No saved profiles yet
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="space-y-3">
                  {profiles.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-neutral-500">Quick Select Profile</label>
                      <select
                        value={selectedProfileId}
                        onChange={(e) => handleProfileSelect(e.target.value)}
                        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                      >
                        <option value="">-- Custom Config --</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.ssid})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <div>
                    <label className="text-xs font-medium text-neutral-500">Wi-Fi SSID</label>
                    <input
                      type="text"
                      placeholder="MyNetwork"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-neutral-500">Wi-Fi Password</label>
                    <input
                      type="text"
                      placeholder="secret123"
                      value={wifiPassword}
                      onChange={(e) => setWifiPassword(e.target.value)}
                      className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-neutral-500">Server Host IP</label>
                    <input
                      type="text"
                      value={serverHost}
                      onChange={(e) => setServerHost(e.target.value)}
                      className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={handleCompile}
                disabled={isCompiling}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
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
            
            <div className="mt-4 rounded-md bg-neutral-100 p-3 text-xs text-neutral-800 dark:bg-neutral-800/30 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700">
              <p className="font-semibold mb-1">How it works:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Paste any standard Arduino sketch.</li>
                <li>Set your custom config (Wi-Fi, Server) in the Settings panel.</li>
                <li>ESPMAN framework is automatically injected without duplicate code errors.</li>
                <li>Deploy to any device instantly via OTA!</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
