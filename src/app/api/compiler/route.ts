import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'

// SSE Helper
function streamResponse(iterator: AsyncGenerator<string>) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of iterator) {
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: [ERROR] ${err.message}\n\n`))
      } finally {
        controller.close()
      }
    }
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}

export async function POST(req: Request) {
  const { code, name, version, chipType } = await req.json()

  if (!code || !name || !version || !chipType) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const fqbn = chipType === 'ESP32' ? 'esp32:esp32:esp32' : 'esp8266:esp8266:esp8266'
  
  async function* compileGenerator() {
    yield `Starting compilation for ${name} v${version} on ${chipType}...`
    
    // Create temp directory for compilation
    const tmpDir = path.join(process.cwd(), '.tmp_compile', `${name}_${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    
    try {
      // 1. Read the ESPMAN core boilerplate
      yield 'Reading ESPMAN core...'
      const corePath = path.join(process.cwd(), 'firmware', 'esp-manager', 'esp-manager.ino')
      let coreCode = await fs.readFile(corePath, 'utf8')
      
      // Rename core setup/loop
      coreCode = coreCode.replace(/\bvoid\s+setup\s*\(\s*\)/g, 'void espman_setup()')
      coreCode = coreCode.replace(/\bvoid\s+loop\s*\(\s*\)/g, 'void espman_loop()')
      
      // 2. Process user code
      yield 'Injecting user code...'
      let userCode = code
      userCode = userCode.replace(/\bvoid\s+setup\s*\(\s*\)/g, 'void user_setup()')
      userCode = userCode.replace(/\bvoid\s+loop\s*\(\s*\)/g, 'void user_loop()')
      
      // 3. Merge them with master setup/loop
      const mergedCode = `
${coreCode}

// ==========================================
// USER CODE INJECTED BELOW
// ==========================================
${userCode}

// ==========================================
// MASTER WRAPPER
// ==========================================
void setup() {
  espman_setup();
  user_setup();
}

void loop() {
  espman_loop();
  user_loop();
}
`
      // Write merged code to temp dir
      const sketchFile = path.join(tmpDir, `${path.basename(tmpDir)}.ino`)
      await fs.writeFile(sketchFile, mergedCode)
      yield 'Code merged and saved. Invoking compiler...'

      // 4. Compile with arduino-cli
      // Note: arduino-cli must be in PATH. We use ~/.local/bin/arduino-cli for ubuntu VPS
      // or arduino-cli if it's globally installed.
      const buildPath = path.join(tmpDir, 'build')
      const arduinoCliPath = process.env.NODE_ENV === 'production' 
        ? '/home/ubuntu/.local/bin/arduino-cli'
        : 'arduino-cli'

      const child = spawn(arduinoCliPath, [
        'compile',
        '--fqbn', fqbn,
        '--build-path', buildPath,
        sketchFile
      ])

      for await (const chunk of child.stdout) {
        yield chunk.toString().trim()
      }
      for await (const chunk of child.stderr) {
        yield `[WARN] ${chunk.toString().trim()}`
      }

      const exitCode = await new Promise((resolve) => child.on('close', resolve))
      
      if (exitCode !== 0) {
        throw new Error(`arduino-cli exited with code ${exitCode}`)
      }

      // 5. Save generated bin and register firmware
      const binFile = path.join(buildPath, `${path.basename(tmpDir)}.ino.bin`)
      const stat = await fs.stat(binFile)

      // Register in DB first to get the ID
      yield 'Registering firmware in database...'
      const firmware = await db.firmware.create({
        data: {
          name,
          version,
          type: chipType,
          size: stat.size,
          checksum: 'auto-generated',
        }
      })

      // Save generated bin with the ID as filename (so OTA works)
      yield 'Compilation successful! Saving firmware...'
      const destDir = path.join(process.cwd(), 'firmware-bins')
      await fs.mkdir(destDir, { recursive: true })
      
      const destPath = path.join(destDir, `${firmware.id}.bin`)
      await fs.copyFile(binFile, destPath)

    } finally {
      // Cleanup temp directory
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error)
    }
  }

  return streamResponse(compileGenerator())
}
