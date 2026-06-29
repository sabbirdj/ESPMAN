import { NextResponse } from 'next/server'

export async function GET() {
  const boilerplate = `#include "ESPMAN.h"

ESPManager manager;

void setup() {
  // 1. Configure your device
  manager.setWiFi("YOUR_WIFI_SSID", "YOUR_WIFI_PASSWORD");
  manager.setServer("13.62.213.148", 3004, 3000, false);
  manager.setDevice("My Custom ESP", "1.0.0");
  
  // 2. Start ESPMAN core (connects to Wi-Fi and Server)
  manager.begin();

  // ==========================================
  // ADD YOUR CUSTOM SETUP LOGIC BELOW
  // ==========================================
  
}

void loop() {
  // 1. Process ESPMAN background tasks (OTA, WebSocket)
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
