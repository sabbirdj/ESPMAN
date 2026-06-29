#!/bin/bash
mkdir -p ~/.local/bin
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=~/.local/bin sh
export PATH=$PATH:~/.local/bin
echo 'export PATH=$PATH:~/.local/bin' >> ~/.bashrc
arduino-cli config init
# Add esp8266 and esp32 board manager URLs
arduino-cli config add board_manager.additional_urls https://arduino.esp8266.com/stable/package_esp8266com_index.json
arduino-cli config add board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
arduino-cli core update-index
# Install esp32 and esp8266 cores
arduino-cli core install esp32:esp32
arduino-cli core install esp8266:esp8266
# Install dependencies
arduino-cli lib install ArduinoJson
arduino-cli lib install WebSockets
