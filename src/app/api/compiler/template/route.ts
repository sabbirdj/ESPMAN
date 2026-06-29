import { NextResponse } from 'next/server'

export async function GET() {
  const boilerplate = `#include "ESPMAN.h"

ESPManager manager;

void setup() {
  // Start ESPMAN core (automatically connects using settings from UI)
  manager.begin();

  // ==========================================
  // ADD YOUR CUSTOM SETUP LOGIC BELOW
  // ==========================================
  
}

void loop() {
  // Process ESPMAN background tasks (OTA, WebSocket)
  manager.loop();

  // ==========================================
  // ADD YOUR CUSTOM LOOP LOGIC BELOW
  // ==========================================
  
}
`

  return new NextResponse(boilerplate, {
    headers: { 'Content-Type': 'text/plain' }
  })
}
