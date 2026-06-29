#include "ESPMAN.h"

ESPManager* ESPManager::_instance = nullptr;

ESPManager::ESPManager() {
    _instance = this;
    lastTelemetry = 0;
    bootTime = millis();
    lastWifiCheck = 0;
    wsConnected = false;
    otaInProgress = false;
    _wifiSSID = "";
    _wifiPassword = "";
    _serverHost = "";
    _serverPort = 3004;
    _httpPort = 3000;
    _useSSL = false;
    _deviceName = "ESP Device";
    _firmwareVersion = "1.0.0";
    for(int i=0; i<64; i++) {
        pinState[i] = false;
        pinModes[i] = "INPUT";
    }
    initHardwareConfig();
}

void ESPManager::initHardwareConfig() {
#ifdef ESP8266
  _chipType = "ESP8266";
  const int pins[] = {0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16};
  _pinCount = 11;
#elif defined(CONFIG_IDF_TARGET_ESP32S2)
  _chipType = "ESP32-S2";
  const int pins[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46};
  _pinCount = 35;
#elif defined(CONFIG_IDF_TARGET_ESP32S3)
  _chipType = "ESP32-S3";
  const int pins[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46, 47, 48};
  _pinCount = 37;
#elif defined(CONFIG_IDF_TARGET_ESP32C3)
  _chipType = "ESP32-C3";
  const int pins[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 18, 19, 20, 21};
  _pinCount = 15;
#elif defined(CONFIG_IDF_TARGET_ESP32C6)
  _chipType = "ESP32-C6";
  const int pins[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23};
  _pinCount = 24;
#else
  _chipType = "ESP32";
  const int pins[] = {0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39};
  _pinCount = 24;
#endif
  for(int i=0; i<_pinCount; i++) _defaultPins[i] = pins[i];
}

void ESPManager::setWiFi(const char* ssid, const char* password) {
    _wifiSSID = ssid;
    _wifiPassword = password;
}

void ESPManager::setServer(const char* host, uint16_t wsPort, uint16_t httpPort, bool useSSL) {
    _serverHost = host;
    _serverPort = wsPort;
    _httpPort = httpPort;
    _useSSL = useSSL;
}

void ESPManager::setDevice(const char* name, const char* version) {
    _deviceName = name;
    _firmwareVersion = version;
}

void ESPManager::begin() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println(F("========================================"));
  Serial.println(F("  ESP Device Manager — Client Firmware v2"));
  Serial.println(F("========================================"));
  Serial.printf("Chip:      %s\n", _chipType);
  Serial.printf("MAC:       %s\n", WiFi.macAddress().c_str());
  Serial.printf("Firmware:  v%s\n", _firmwareVersion);
  Serial.printf("Pin count: %d\n", _pinCount);
  Serial.printf("Server:    %s:%u (ws) + %u (http)\n", _serverHost, _serverPort, _httpPort);

  // Initialize all GPIO pins as INPUT by default (safer)
  for (int i = 0; i < _pinCount; i++) {
    int pin = _defaultPins[i];
    if (pin < 64) {
      pinMode(pin, INPUT);
      pinModes[pin] = "INPUT";
      pinState[pin] = digitalRead(pin);
    }
  }

  connectWifi();
  connectWebSocket();

  Serial.println(F("Setup complete. Listening for commands..."));
  Serial.println(F("----------------------------------------"));
}

void ESPManager::connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("Connecting to Wi-Fi '%s'...\n", _wifiSSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(_wifiSSID, _wifiPassword);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(400);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.printf("Wi-Fi connected. IP: %s | RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(),
                  WiFi.RSSI());
  } else {
    Serial.println();
    Serial.println(F("Wi-Fi connection failed! Retrying in 5s..."));
    delay(5000);
    connectWifi();
  }
}

void ESPManager::staticWebSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    if (_instance) _instance->handleWebSocketMessage(type, payload, length);
}

void ESPManager::connectWebSocket() {
  Serial.printf("Connecting to ws://%s:%u/ ...\n", _serverHost, _serverPort);
  if (_useSSL) {
    webSocket.beginSSL(_serverHost, _serverPort, "/");
  } else {
    webSocket.begin(_serverHost, _serverPort, "/");
  }
  webSocket.onEvent(staticWebSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void ESPManager::loop() {
  if (!otaInProgress) {
    webSocket.loop();
  }

  if (millis() - lastWifiCheck >= 10000UL) {
    lastWifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[wifi] disconnected, reconnecting..."));
      connectWifi();
    }
  }

  if (wsConnected && (millis() - lastTelemetry >= 5000UL)) {
    sendTelemetry();
    lastTelemetry = millis();
  }
}

void ESPManager::sendRegistration() {
  JsonDocument doc;
  doc["type"]            = "register";
  doc["mac"]             = WiFi.macAddress();
  doc["chipType"]        = _chipType;
  doc["name"]            = _deviceName;
  doc["ipAddress"]       = WiFi.localIP().toString();
  doc["firmwareVersion"] = _firmwareVersion;

  String json;
  serializeJson(doc, json);
  webSocket.sendTXT(json);
  Serial.println(F("[->] register"));
}

void ESPManager::sendTelemetry() {
  JsonDocument doc;
  doc["type"]            = "telemetry";
  doc["mac"]             = WiFi.macAddress();
  doc["chipType"]        = _chipType;
  doc["ipAddress"]       = WiFi.localIP().toString();
#ifdef ESP8266
  doc["freeHeap"]        = (uint32_t)ESP.getFreeHeap();
#else
  doc["freeHeap"]        = (uint32_t)ESP.getFreeHeap();
#endif
  doc["wifiRssi"]        = WiFi.RSSI();
  doc["uptimeSeconds"]   = (uint32_t)((millis() - bootTime) / 1000UL);
  doc["firmwareVersion"] = _firmwareVersion;

  JsonObject gpio = doc["gpioState"].to<JsonObject>();
  JsonObject mode = doc["gpioMode"].to<JsonObject>();
  for (int i = 0; i < _pinCount; i++) {
    int pin = _defaultPins[i];
    if (pin < 64) {
      if (pinModes[pin] == "INPUT" || pinModes[pin] == "INPUT_PULLUP") {
        pinState[pin] = digitalRead(pin);
      }
      gpio[String(pin)] = pinState[pin];
      mode[String(pin)] = pinModes[pin];
    }
  }

  String json;
  serializeJson(doc, json);
  webSocket.sendTXT(json);
}

void ESPManager::sendAck(const char* command, const char* status, const char* message) {
  JsonDocument doc;
  doc["type"]    = "ack";
  doc["mac"]     = WiFi.macAddress();
  doc["command"] = command;
  doc["status"]  = status;
  doc["message"] = message;

  String json;
  serializeJson(doc, json);
  webSocket.sendTXT(json);
}

void ESPManager::handleWebSocketMessage(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println(F("[ws] disconnected — will retry"));
      break;

    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println(F("[ws] connected"));
      sendRegistration();
      sendTelemetry();
      break;

    case WStype_TEXT: {
      Serial.printf("[<-] %s\n", payload);
      
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, (const char*)payload);
      if (err) {
        Serial.println(F("[!] JSON parse error"));
        return;
      }

      const char* cmdType = doc["type"] | "";

      if (strcmp(cmdType, "gpio") == 0) {
        int pin = doc["pin"] | -1;
        bool value = doc["value"] | false;
        if (pin >= 0 && pin < 64) {
          if (pinModes[pin] != "OUTPUT") {
            pinMode(pin, OUTPUT);
            pinModes[pin] = "OUTPUT";
          }
          digitalWrite(pin, value ? HIGH : LOW);
          pinState[pin] = value;
          Serial.printf("[cmd] GPIO %d -> %s\n", pin, value ? "HIGH" : "LOW");
          sendAck("gpio", "ok", String("GPIO " + String(pin) + " set to " + (value ? "HIGH" : "LOW")).c_str());
          sendTelemetry();
        } else {
          sendAck("gpio", "error", "Invalid pin number");
        }
      }
      else if (strcmp(cmdType, "pinMode") == 0) {
        int pin = doc["pin"] | -1;
        const char* mode = doc["mode"] | "INPUT";
        if (pin >= 0 && pin < 64) {
          if (strcmp(mode, "OUTPUT") == 0) {
            pinMode(pin, OUTPUT);
            pinModes[pin] = "OUTPUT";
          } else if (strcmp(mode, "INPUT_PULLUP") == 0) {
            pinMode(pin, INPUT_PULLUP);
            pinModes[pin] = "INPUT_PULLUP";
          } else {
            pinMode(pin, INPUT);
            pinModes[pin] = "INPUT";
          }
          Serial.printf("[cmd] GPIO %d mode -> %s\n", pin, mode);
          sendAck("pinMode", "ok", String("GPIO " + String(pin) + " mode set to " + String(mode)).c_str());
          sendTelemetry();
        } else {
          sendAck("pinMode", "error", "Invalid pin number");
        }
      }
      else if (strcmp(cmdType, "reboot") == 0) {
        Serial.println(F("[cmd] reboot"));
        sendAck("reboot", "ok", "Rebooting now");
        sendTelemetry();
        delay(200);
#ifdef ESP8266
        ESP.restart();
#else
        ESP.restart();
#endif
      }
      else if (strcmp(cmdType, "factory-reset") == 0) {
        Serial.println(F("[cmd] factory-reset"));
        for (int i = 0; i < _pinCount; i++) {
          int pin = _defaultPins[i];
          if (pin < 64) {
            digitalWrite(pin, LOW);
            pinState[pin] = false;
          }
        }
        sendAck("factory-reset", "ok", "All GPIO pins reset to LOW");
        sendTelemetry();
      }
      else if (strcmp(cmdType, "ota") == 0) {
        const char* path = doc["path"] | "";
        const char* version = doc["version"] | "";
        if (strlen(path) > 0) {
          Serial.printf("[cmd] OTA path=%s version=%s\n", path, version);
          sendAck("ota", "ok", "Starting OTA update");
          performOTA(String(path), String(version));
        } else {
          sendAck("ota", "error", "No OTA path provided");
        }
      }
      else if (strcmp(cmdType, "command") == 0) {
        const char* command = doc["command"] | "";
        Serial.printf("[cmd] serial: %s\n", command);
        handleSerialCommand(String(command));
      }
      else {
        Serial.printf("[cmd] unknown type: %s\n", cmdType);
      }
      break;
    }

    case WStype_ERROR:
      Serial.println(F("[ws] error"));
      break;

    default:
      break;
  }
}

void ESPManager::handleSerialCommand(String command) {
  command.trim();
  String output = "";
  
  if (command == "sys.info") {
    output = "Chip=" + String(_chipType) + 
             " MAC=" + WiFi.macAddress() + 
             " IP=" + WiFi.localIP().toString() + 
#ifdef ESP8266
             " Heap=" + String((unsigned)ESP.getFreeHeap()) + 
#else
             " Heap=" + String((unsigned)ESP.getFreeHeap()) + 
#endif
             " Uptime=" + String((unsigned long)((millis() - bootTime) / 1000)) + "s";
  } else if (command == "wifi.scan") {
    int n = WiFi.scanNetworks();
    output = "Scanned Wi-Fi networks:\n";
    for (int i = 0; i < n; i++) {
      output += "  " + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + " dBm) " + 
                (WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "[open]" : "[encrypted]") + "\n";
    }
  } else if (command == "gpio.read") {
    output = "GPIO states:\n";
    for (int i = 0; i < _pinCount; i++) {
      int pin = _defaultPins[i];
      output += "  GPIO " + String(pin) + " (" + pinModes[pin] + "): " + (digitalRead(pin) ? "HIGH" : "LOW") + "\n";
    }
  } else if (command == "wifi.reconnect") {
    output = "Reconnecting Wi-Fi...";
    WiFi.disconnect();
    delay(1000);
    connectWifi();
  } else {
    output = "Unknown command: " + command;
    Serial.printf("[serial] %s\n", output.c_str());
    sendAck("command", "error", output.c_str());
    return;
  }
  
  Serial.printf("[serial] %s\n", output.c_str());
  sendAck("command", "ok", output.c_str());
}

void ESPManager::performOTA(String path, String version) {
  String url = "http://" + String(_serverHost) + ":" + String(_httpPort) + path;
  Serial.printf("Starting OTA update from: %s\n", url.c_str());
  
  otaInProgress = true;
  webSocket.disconnect();
  delay(100);

  #ifdef ESP8266
    WiFiClient client;
    ESPhttpUpdate.rebootOnUpdate(true);
    t_httpUpdate_return ret = ESPhttpUpdate.update(client, url);
  #else
    WiFiClient client;
    httpUpdate.rebootOnUpdate(true);
    t_httpUpdate_return ret = httpUpdate.update(client, url);
  #endif

  switch (ret) {
    case HTTP_UPDATE_FAILED: {
      String errStr;
      #ifdef ESP8266
        errStr = ESPhttpUpdate.getLastErrorString();
      #else
        errStr = httpUpdate.getLastErrorString();
      #endif
      Serial.printf("OTA FAILED: %s\n", errStr.c_str());
      
      otaInProgress = false;
      webSocket.begin(_serverHost, _serverPort, "/");
      delay(1000);
      sendAck("ota", "error", ("OTA update failed: " + errStr).c_str());
      break;
    }
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("OTA: No updates");
      otaInProgress = false;
      webSocket.begin(_serverHost, _serverPort, "/");
      delay(1000);
      sendAck("ota", "error", "No updates found");
      break;
    case HTTP_UPDATE_OK:
      Serial.println(F("OTA: success — rebooting with new firmware"));
      delay(100);
#ifdef ESP8266
      ESP.restart();
#else
      ESP.restart();
#endif
      break;
  }
}
