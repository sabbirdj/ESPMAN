# ESP Device Manager — Client Firmware

This is the firmware you flash onto **real ESP8266/ESP32 boards** so they show up on your ESP Device Manager dashboard, report live telemetry, and accept commands (GPIO toggle, reboot, factory reset, OTA updates).

**No manual device registration needed.** Flash this firmware → ESP boots → connects to Wi-Fi → connects to the dashboard automatically → appears on the dashboard ready to control.

---

## What it does

| Feature              | How it works                                                          |
| -------------------- | --------------------------------------------------------------------- |
| Wi-Fi connection     | Connects to your 2.4 GHz Wi-Fi network (5 GHz not supported on ESPs). |
| Live telemetry       | Sends heap, Wi-Fi RSSI, uptime, GPIO state every 5 seconds.           |
| GPIO control         | Dashboard sends `{type:"gpio", pin:2, value:true}` → ESP sets the pin HIGH/LOW. |
| Reboot               | Dashboard sends `{type:"reboot"}` → ESP calls `ESP.restart()`.        |
| Factory reset        | Resets all GPIO pins to LOW.                                          |
| Serial commands      | `sys.info`, `wifi.scan`, `gpio.read` — extendable in code.            |
| OTA firmware update  | Dashboard sends `{type:"ota", url:"..."}` → ESP pulls .bin via HTTP.  |

---

## Supported boards

Tested working on:

- **ESP8266**: NodeMCU v2/v3, Wemos D1 Mini, ESP-12E/F
- **ESP32**: DevKitC, NodeMCU-32S, Wroom-32
- **ESP32-S2**: Saola-1
- **ESP32-S3**: DevKitC-1
- **ESP32-C3**: DevKitM-1
- **ESP32-C6**: DevKitC-1

The same `.ino` file compiles for all of them — the right #defines are auto-selected by the Arduino IDE based on the selected board.

---

## Option A — Flash with Arduino IDE (easiest)

### 1. Install the Arduino IDE

Download from <https://www.arduino.cc/en/software> (v2.x recommended).

### 2. Add ESP board support

Open **File → Preferences** and add one of these URLs to "Additional Board Manager URLs":

- For ESP32 family (ESP32/S2/S3/C3/C6):
  `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
- For ESP8266:
  `https://arduino.esp8266.com/stable/package_esp8266com_index.json`

Then open **Tools → Board → Boards Manager**, search for `esp32` (or `esp8266`) and click Install.

### 3. Install the required libraries

Open **Sketch → Include Library → Manage Libraries** and install:

- **ArduinoJson** by Benoit Blanchon (v7+)
- **WebSockets** by Markus Sattler (a.k.a. `arduinoWebSockets`, v2.4+)

### 4. Configure the firmware

Open `esp-manager.ino` in the Arduino IDE. Edit the **CONFIG** section near the top:

```cpp
const char* WIFI_SSID      = "your-wifi-name";
const char* WIFI_PASSWORD  = "your-wifi-password";
const char* SERVER_HOST    = "192.168.1.100";  // IP of the machine running device-service
const uint16_t SERVER_PORT = 3004;
const char* DEVICE_NAME    = "My ESP Device";
const char* FIRMWARE_VERSION = "1.0.0";
```

> **How to find the SERVER_HOST**: On the machine running this dashboard, run `ifconfig` (Mac/Linux) or `ipconfig` (Windows). Use the LAN IP, e.g. `192.168.1.100`. The ESP and the machine must be on the same Wi-Fi network.

### 5. Plug in your ESP and select the board

- Plug your ESP via USB
- **Tools → Board →** pick your model (e.g. `ESP32 Dev Module`, `NodeMCU 1.0 (ESP-12E Module)`)
- **Tools → Port →** select the COM port (Windows) or `/dev/ttyUSBx` (Linux/Mac)
- If no port appears, install the CP210x or CH340 USB driver (depends on your board's USB-UART chip)

### 6. Upload

Click the **Upload** button (→ arrow). After ~30 seconds, the firmware is flashed and your ESP reboots.

### 7. Watch the serial monitor

Open **Tools → Serial Monitor** and set baud rate to **115200**. You should see:

```
========================================
  ESP Device Manager — Client Firmware
========================================
Chip:      ESP32
MAC:       A4:CF:12:9F:31:7B
Firmware:  v1.0.0
Pin count: 20
Connecting to Wi-Fi 'your-wifi-name'....
Wi-Fi connected. IP: 192.168.1.50 | RSSI: -52 dBm
Connecting to ws://192.168.1.100:3004/ ...
[ws] connected
[->] register
[->] telemetry
```

### 8. Open the dashboard

Your ESP should now appear on the dashboard with a green **Real** badge. Click **Manage** to control its GPIO pins, send serial commands, or reboot it.

---

## Option B — Flash with PlatformIO

If you prefer PlatformIO over Arduino IDE:

```bash
# Install PlatformIO (one-time)
pip install platformio

# Clone or copy the firmware/ folder, then:
cd firmware

# Edit esp-manager.ino to set your Wi-Fi + server IP first!

# Pick your board environment from platformio.ini:
#   esp8266, esp32dev, esp32-s2-saola-1, esp32-s3-devkitc-1,
#   esp32-c3-devkitm-1, esp32-c6-devkitc-1

# Build and upload (defaults to esp32dev):
pio run -t upload

# Watch the serial monitor:
pio device monitor
```

---

## Wiring

### Minimal setup (no external components)

The onboard LED (usually on GPIO 2) is enough to verify the dashboard controls your ESP. Click "GPIO 2" on the dashboard → the LED turns on/off.

### Controlling external loads

For relays, lamps, motors, etc., wire through an appropriate driver:

```
ESP GPIO ──[1kΩ resistor]──┐
                            ├──[NPN transistor base, or relay module IN pin]
                           ─┘
```

Common circuits:

| Load                | Driver needed                       | Example pin      |
| ------------------- | ----------------------------------- | ----------------- |
| LED (indicator)     | 220Ω resistor in series             | Any GPIO          |
| 5V relay module     | Direct (most modules have a transistor) | GPIO 4, 5, 12-16, 26, 27 |
| 12V LED strip       | MOSFET (IRLZ44N) + 10k pulldown     | Any GPIO          |
| Small DC motor      | L298N or BTS7960 motor driver       | Any 2 GPIOs       |

### Pin reference (which GPIOs are exposed)

The firmware exposes a safe subset of each board's GPIO pins. See `DEFAULT_PINS` in `esp-manager.ino`:

- **ESP8266**: GPIO 0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16
- **ESP32**: GPIO 0, 2, 4, 5, 12-19, 21-23, 25-27, 32, 33
- **ESP32-S2**: GPIO 0-21, 26, 33-46
- **ESP32-S3**: GPIO 0-21, 26, 33-48
- **ESP32-C3**: GPIO 0-10, 18-21
- **ESP32-C6**: GPIO 0-23

> ⚠️ **Avoid** strapping pins (GPIO 0, 2, 12, 15 on ESP32) for input devices — they affect boot behavior. The firmware uses them as OUTPUT only, which is safe.

---

## How the connection works

```
   ESP (running esp-manager.ino)
        │
        │  Raw WebSocket on port 3004
        │  (JSON over text frames)
        ▼
   device-service (Node)
   ├─ Port 3003: Socket.io for dashboards
   └─ Port 3004: Raw WebSocket for real ESPs  ◄── your ESP connects here
        │
        │  Forwards telemetry & commands
        ▼
   Dashboard (browser)
   └─ Socket.io on port 3003 (via Caddy gateway)
```

**Protocol** (JSON over WebSocket text frames):

```js
// ESP → Server
{ "type": "register",      "mac": "A4:CF:...", "chipType": "ESP32", "name": "My ESP", ... }
{ "type": "telemetry",     "mac": "...", "freeHeap": 234567, "wifiRssi": -55, ... }

// Server → ESP
{ "type": "gpio",          "pin": 2, "value": true }
{ "type": "reboot" }
{ "type": "factory-reset" }
{ "type": "command",       "command": "sys.info" }
{ "type": "ota",           "url": "http://server/fw.bin", "version": "1.5.0" }
```

---

## Production deployment (HTTPS / WSS)

For a real-world deployment with TLS:

1. Put the dashboard behind a reverse proxy (Nginx, Caddy) with HTTPS
2. In the firmware, set `USE_SSL = true` and change `SERVER_PORT` to 443
3. The firmware will call `webSocket.beginSSL(SERVER_HOST, 443, "/")` automatically
4. Make sure your reverse proxy routes `/esp` (or `/`) to the device-service port 3004

---

## Troubleshooting

| Symptom                                          | Fix                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| ESP won't compile — `WebSocketsClient.h` missing | Install the **WebSockets** library by Markus Sattler via Library Manager.                    |
| ESP won't compile — `ArduinoJson.h` missing      | Install **ArduinoJson** by Benoit Blanchon via Library Manager.                              |
| ESP connects to Wi-Fi but not to server          | Check `SERVER_HOST` IP, firewall rules, and that device-service is running (`curl http://SERVER_HOST:3004/health`). |
| ESP appears as "Sim" not "Real" on dashboard     | The MAC address in the firmware must match a registered device, OR the ESP will auto-register as a new device on first connect. |
| GPIO commands don't change anything              | Some pins (GPIO 6-11 on ESP32) are wired to flash and can't be used. Use GPIO 2, 4, 12-19, 21-27, 32-33. |
| ESP keeps rebooting after firmware update        | Bad OTA binary. Re-flash via USB to recover.                                                 |
| `WiFi.connection failed` in serial monitor       | Wrong SSID/password, or 5 GHz Wi-Fi (ESP only supports 2.4 GHz).                             |

---

## Extending the firmware

The `handleSerialCommand()` function is the place to add your own commands. For example, to add a `gpio.blink` command:

```cpp
} else if (command == "gpio.blink") {
  for (int i = 0; i < 5; i++) {
    digitalWrite(2, HIGH); delay(200);
    digitalWrite(2, LOW);  delay(200);
  }
}
```

Type `gpio.blink` in the dashboard's **Serial Command** field and hit Send — your ESP will blink GPIO 2 five times.

---

## License

MIT — use this firmware freely in your own projects.
