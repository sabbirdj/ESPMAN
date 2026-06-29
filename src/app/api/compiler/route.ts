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
  const { code, name, version, chipType, wifiSsid, wifiPassword, serverHost, dependencies } = await req.json()

  if (!code || !name || !version || !chipType) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  let fqbn = 'esp32:esp32:esp32'
  if (chipType === 'ESP8266') fqbn = 'esp8266:esp8266:esp8266'
  else if (chipType === 'ESP32-S2') fqbn = 'esp32:esp32:esp32s2'
  else if (chipType === 'ESP32-S3') fqbn = 'esp32:esp32:esp32s3'
  else if (chipType === 'ESP32-C3') fqbn = 'esp32:esp32:esp32c3'
  else if (chipType === 'ESP32-C6') fqbn = 'esp32:esp32:esp32c6'
  
  async function* compileGenerator() {
    yield `Starting compilation for ${name} v${version} on ${chipType}...`
    
    // Create temp directory for compilation
    const tmpDir = path.join(process.cwd(), '.tmp_compile', `${name}_${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    
    try {
      yield 'Generating hardware configuration...'
      
      const configHeader = `
#ifndef ESPMAN_USER_CONFIG_H
#define ESPMAN_USER_CONFIG_H

#define ESPMAN_WIFI_SSID "${wifiSsid || ''}"
#define ESPMAN_WIFI_PASS "${wifiPassword || ''}"
#define ESPMAN_SERVER_HOST "${serverHost || '13.62.213.148'}"
#define ESPMAN_DEVICE_NAME "${name}"
#define ESPMAN_FIRMWARE_VER "${version}"

#endif
`
      await fs.writeFile(path.join(tmpDir, 'espman_config.h'), configHeader)

      // 1. Process user code directly
      yield 'Processing firmware code...'
      
      let finalCode = code
      
      // Smart Injection: If user didn't include the library manually, inject it
      if (!code.includes('ESPMAN.h')) {
        yield 'Auto-injecting ESPMAN framework...'
        
        // Rename user's setup and loop
        let userCode = code
        userCode = userCode.replace(/\bvoid\s+setup\s*\(\s*\)/g, 'void user_setup()')
        userCode = userCode.replace(/\bvoid\s+loop\s*\(\s*\)/g, 'void user_loop()')
        
        finalCode = `
#include "ESPMAN.h"
ESPManager espman_auto_manager;

// ==========================================
// USER CODE
// ==========================================
${userCode}

// ==========================================
// ESPMAN INJECTED WRAPPER
// ==========================================
void setup() {
  espman_auto_manager.begin();
  user_setup();
}

void loop() {
  espman_auto_manager.loop();
  user_loop();
}
`
      }

      // Write user code to temp dir
      const sketchFile = path.join(tmpDir, `${path.basename(tmpDir)}.ino`)
      await fs.writeFile(sketchFile, finalCode)
      
      // 2. Copy ESPMAN library into sketch folder
      yield 'Injecting ESPMAN Library...'
      const libPath = path.join(process.cwd(), 'firmware', 'espman-lib')
      await fs.copyFile(path.join(libPath, 'ESPMAN.h'), path.join(tmpDir, 'ESPMAN.h'))
      await fs.copyFile(path.join(libPath, 'ESPMAN.cpp'), path.join(tmpDir, 'ESPMAN.cpp'))

      const arduinoCliPath = process.env.NODE_ENV === 'production' 
        ? '/home/ubuntu/.local/bin/arduino-cli'
        : 'arduino-cli'

      // 3. Install dependencies if provided
      if (dependencies && typeof dependencies === 'string') {
        const libs = dependencies.split(',').map(l => l.trim()).filter(l => l.length > 0)
        for (const lib of libs) {
          yield `Installing library: ${lib}...`
          
          const installChild = spawn(arduinoCliPath, [
            'lib',
            'install',
            lib
          ])

          for await (const chunk of installChild.stdout) {
            yield chunk.toString().trim()
          }
          for await (const chunk of installChild.stderr) {
            yield `[WARN] ${chunk.toString().trim()}`
          }

          const installExitCode = await new Promise((resolve) => installChild.on('close', resolve))
          if (installExitCode !== 0) {
            yield `[ERROR] Failed to install library: ${lib}`
            throw new Error(`Failed to install library: ${lib}`)
          }
        }
      }

      yield 'Code saved. Invoking compiler...'
      // Note: arduino-cli must be in PATH. We use ~/.local/bin/arduino-cli for ubuntu VPS
      // or arduino-cli if it's globally installed.
      const buildPath = path.join(tmpDir, 'build')

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
