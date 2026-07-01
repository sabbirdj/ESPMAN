# ESPMAN - ESP Device Fleet Manager

ESPMAN is a comprehensive, self-hosted fleet management dashboard and Cloud Compiler for ESP32 and ESP8266 microcontrollers. It allows you to monitor telemetry, control GPIOs in real-time, push Over-The-Air (OTA) updates, and compile custom firmware directly from your browser.

## ✨ Features

- **📊 Real-time Dashboard**: Monitor CPU temperature, heap usage, Wi-Fi signal, and uptime across your entire fleet.
- **⚡ Live GPIO Control**: Toggle and monitor digital pins in real-time via WebSockets.
- **☁️ Cloud Compiler**: Compile firmware for ESP8266, ESP32, ESP32-S2, ESP32-S3, ESP32-C3, and ESP32-C6 devices directly from the web interface.
- **🔄 OTA Updates**: Deploy compiled `.bin` files to devices remotely.
- **💻 Remote Terminal**: View serial output from your devices remotely.
- **🎨 Modern UI**: Fully responsive, monochrome design system with native mobile support.

---

## 🚀 One-Click Install (VPS / Ubuntu)

Copy and paste this massive one-liner into a fresh Ubuntu VPS (22.04+) to install all dependencies (Node, Bun, PM2, Arduino CLI + ESP cores), clone the repository, build the project, and start the background services automatically.

```bash
sudo apt update && sudo apt install -y curl git && git clone https://github.com/sabbirdj/ESPMAN.git && cd ESPMAN && curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs && sudo npm install -g pm2 && curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc && mkdir -p ~/.local/bin && curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=~/.local/bin sh && export PATH="$HOME/.local/bin:$PATH" && echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && arduino-cli config init && arduino-cli config add board_manager.additional_urls https://arduino.esp8266.com/stable/package_esp8266com_index.json && arduino-cli config add board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json && arduino-cli core update-index && arduino-cli core install esp32:esp32 esp8266:esp8266 && arduino-cli lib install ArduinoJson WebSockets && cp .env.example .env && mkdir -p db && bun install && bun run db:push && bun run build && cd mini-services/device-service && bun install && cd ../.. && pm2 start "$HOME/.bun/bin/bun .next/standalone/server.js" --name esp-dashboard --env NODE_ENV=production && pm2 start "$HOME/.bun/bin/bun run index.ts" --name esp-device-service --cwd mini-services/device-service && pm2 save && pm2 startup
```

> **Important Setup Note for Cloud Deployments:** By default, the app uses a local SQLite database (`db/custom.db`). If you want to use a serverless cloud database like **Turso**, edit your `.env` file to add your `DATABASE_URL` (libsql://...) and `TURSO_AUTH_TOKEN`. Once edited, run `bun run db:push:turso` to sync the database schema to the cloud, and then restart the PM2 services with `pm2 restart all`.

---

## 🛠️ Architecture

ESPMAN consists of two main services running on the server:
1. **Frontend Dashboard (Next.js)**: Runs on port `3000`. Handles the UI, REST API, and cloud compiler integration.
2. **Device Service (Socket.io/WebSocket)**: Runs on port `3004`. Acts as the high-speed bridge between the ESP hardware and the frontend dashboard.

Database: **Turso** (Serverless libSQL/SQLite)

## 📡 Connecting a Device

1. Open the `firmware/esp-manager/esp-manager.ino` file in your local Arduino IDE.
2. Update the `WIFI_SSID`, `WIFI_PASS`, and `SERVER_HOST` variables. 
   *(Note: Set `SERVER_HOST` to the public IP or domain of your VPS)*.
3. Flash the firmware to your ESP32 or ESP8266.
4. The device will automatically connect to your VPS over WebSockets, register itself in the database, and appear on your dashboard!

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.
