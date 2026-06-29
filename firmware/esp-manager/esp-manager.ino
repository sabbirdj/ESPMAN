/*
 * ============================================================================
 *  ESP Device Manager — Client Firmware (v2)
 * ============================================================================
 *
 *  CHANGES IN v2:
 *    - Fixed ArduinoJson v7 compatibility (StaticJsonDocument → JsonDocument,
 *      createNestedObject → to<JsonObject>())
 *    - Fixed OTA: now downloads from http://SERVER_HOST:3000/api/firmware/[id]/bin
 *    - Added command acknowledgment (ESP confirms it received commands)
 *    - Added Wi-Fi reconnection logic
 *    - Better error handling throughout
 *
 *  Flash onto a real ESP8266 / ESP32 / ESP32-S2 / S3 / C3 / C6 board.
 *
 *  REQUIRED LIBRARIES (Arduino IDE → Tools → Manage Libraries):
 *    • arduinoWebSockets  by Markus Sattler  (search "WebSockets")
 *    • ArduinoJson        by Benoit Blanchon (v7+ — search "ArduinoJson")
 *
 *  HOW TO FLASH:
 *    1. Open this file in Arduino IDE
 *    2. Select your board: Tools → Board → "ESP32 Arduino" → pick your model
 *    3. Edit the CONFIG section below (Wi-Fi + server IP)
 *    4. Plug in your ESP via USB
 *    5. Select the right port: Tools → Port
 *    6. Click Upload (→ arrow)
 *    7. Open Tools → Serial Monitor at 115200 baud
 *
 * ============================================================================
 */

// ---- Required libraries ----
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

// ---- Platform-specific includes ----
#ifdef ESP8266
  #include <ESP8266WiFi.h>
  #include <ESP8266httpUpdate.h>
  #define CHIP_TYPE       "ESP8266"
  #define ESP_RESTART     ESP.restart()
  #define ESP_FREE_HEAP   ESP.getFreeHeap()
  static const int DEFAULT_PINS[] = {0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16};
#elif defined(ESP32) || defined(CONFIG_IDF_TARGET_ESP32) || defined(CONFIG_IDF_TARGET_ESP32S2) || defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32C6)
  #include <WiFi.h>
  #include <HTTPUpdate.h>
  #if defined(CONFIG_IDF_TARGET_ESP32S2)
    #define CHIP_TYPE "ESP32-S2"
    static const int DEFAULT_PINS[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46};
  #elif defined(CONFIG_IDF_TARGET_ESP32S3)
    #define CHIP_TYPE "ESP32-S3"
    static const int DEFAULT_PINS[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46, 47, 48};
  #elif defined(CONFIG_IDF_TARGET_ESP32C3)
    #define CHIP_TYPE "ESP32-C3"
    static const int DEFAULT_PINS[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 18, 19, 20, 21};
  #elif defined(CONFIG_IDF_TARGET_ESP32C6)
    #define CHIP_TYPE "ESP32-C6"
    static const int DEFAULT_PINS[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23};
  #else
    #define CHIP_TYPE "ESP32"
    // Expanded for full control (including input-only pins 34, 35, 36, 39)
    static const int DEFAULT_PINS[] = {0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39};
  #endif
  #define ESP_RESTART     ESP.restart()
  #define ESP_FREE_HEAP   ESP.getFreeHeap()
#else
  #error "Unsupported platform. This sketch supports only ESP8266 and ESP32 families."
#endif

const int PIN_COUNT = sizeof(DEFAULT_PINS) / sizeof(DEFAULT_PINS[0]);

// ============================================================================
// CONFIG — EDIT THESE FOR YOUR SETUP
// ============================================================================

const char* WIFI_SSID        = "X_Sabbir_X";
const char* WIFI_PASSWORD    = "heythere..";

// IP or hostname of the machine running the ESP Device Manager.
const char* SERVER_HOST      = "13.62.213.148";

// Port 3004 = the ESP bridge (raw WebSocket) on the device-service.
const uint16_t SERVER_PORT   = 3004;

// Port 3000 = the Next.js web app (used for OTA firmware downloads).
// Don't change this unless you changed the Next.js port.
const uint16_t HTTP_PORT     = 3000;

// How this device appears in the dashboard
const char* DEVICE_NAME      = "ESP32 V1";
const char* FIRMWARE_VERSION = "2.0.1";

// Set to true if your server uses HTTPS/wss
const bool USE_SSL           = false;

// ============================================================================
// Globals
// ============================================================================

WebSocketsClient webSocket;
unsigned long lastTelemetry = 0;
unsigned long bootTime = millis();
unsigned long lastWifiCheck = 0;
bool wsConnected = false;
bool otaInProgress = false;
bool pinState[64] = {false};
String pinModes[64]; // Stores "INPUT", "OUTPUT", "INPUT_PULLUP"

// ============================================================================
// Setup
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println(F("========================================"));
  Serial.println(F("  ESP Device Manager — Client Firmware v2"));
  Serial.println(F("========================================"));
  Serial.printf("Chip:      %s\n", CHIP_TYPE);
  Serial.printf("MAC:       %s\n", WiFi.macAddress().c_str());
  Serial.printf("Firmware:  v%s\n", FIRMWARE_VERSION);
  Serial.printf("Pin count: %d\n", PIN_COUNT);
  Serial.printf("Server:    %s:%u (ws) + %u (http)\n", SERVER_HOST, SERVER_PORT, HTTP_PORT);

  // Initialize all GPIO pins as INPUT by default (safer), except LED pins if we want
  for (int i = 0; i < PIN_COUNT; i++) {
    int pin = DEFAULT_PINS[i];
    if (pin < 64) {
      pinMode(pin, INPUT);
      pinModes[pin] = "INPUT";
      pinState[pin] = digitalRead(pin);
    }
  }

  // Connect to Wi-Fi
  connectWifi();

  // Connect WebSocket
  connectWebSocket();

  Serial.println(F("Setup complete. Listening for commands..."));
  Serial.println(F("----------------------------------------"));
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("Connecting to Wi-Fi '%s'...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

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

void connectWebSocket() {
  Serial.printf("Connecting to ws://%s:%u/ ...\n", SERVER_HOST, SERVER_PORT);
  if (USE_SSL) {
    webSocket.beginSSL(SERVER_HOST, SERVER_PORT, "/");
  } else {
    webSocket.begin(SERVER_HOST, SERVER_PORT, "/");
  }
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

// ============================================================================
// Main loop
// ============================================================================

void loop() {
  if (!otaInProgress) {
    webSocket.loop();
  }

  // Check Wi-Fi every 10 seconds, reconnect if needed
  if (millis() - lastWifiCheck >= 10000UL) {
    lastWifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[wifi] disconnected, reconnecting..."));
      connectWifi();
    }
  }

  // Send telemetry every 5 seconds when connected
  if (wsConnected && (millis() - lastTelemetry >= 5000UL)) {
    sendTelemetry();
    lastTelemetry = millis();
  }
}

// ============================================================================
// Outgoing messages
// ============================================================================

void sendRegistration() {
  JsonDocument doc;
  doc["type"]            = "register";
  doc["mac"]             = WiFi.macAddress();
  doc["chipType"]        = CHIP_TYPE;
  doc["name"]            = DEVICE_NAME;
  doc["ipAddress"]       = WiFi.localIP().toString();
  doc["firmwareVersion"] = FIRMWARE_VERSION;

  String json;
  serializeJson(doc, json);
  webSocket.sendTXT(json);
  Serial.println(F("[->] register"));
}

void sendTelemetry() {
  JsonDocument doc;
  doc["type"]            = "telemetry";
  doc["mac"]             = WiFi.macAddress();
  doc["chipType"]        = CHIP_TYPE;
  doc["ipAddress"]       = WiFi.localIP().toString();
  doc["freeHeap"]        = (uint32_t)ESP_FREE_HEAP;
  doc["wifiRssi"]        = WiFi.RSSI();
  doc["uptimeSeconds"]   = (uint32_t)((millis() - bootTime) / 1000UL);
  doc["firmwareVersion"] = FIRMWARE_VERSION;

  // GPIO state map — ArduinoJson v7 syntax
  JsonObject gpio = doc["gpioState"].to<JsonObject>();
  JsonObject mode = doc["gpioMode"].to<JsonObject>();
  for (int i = 0; i < PIN_COUNT; i++) {
    int pin = DEFAULT_PINS[i];
    if (pin < 64) {
      // If it's an input, read live value
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

void sendAck(const char* command, const char* status, const char* message) {
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

// ============================================================================
// Incoming message handler
// ============================================================================

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
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
      handleServerMessage((const char*)payload);
      break;
    }

    case WStype_ERROR:
      Serial.println(F("[ws] error"));
      break;

    default:
      break;
  }
}

void handleServerMessage(const char* jsonStr) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, jsonStr);
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
      sendTelemetry(); // confirm new state immediately
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
    ESP_RESTART;
  }
  else if (strcmp(cmdType, "factory-reset") == 0) {
    Serial.println(F("[cmd] factory-reset"));
    for (int i = 0; i < PIN_COUNT; i++) {
      int pin = DEFAULT_PINS[i];
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
}

void handleSerialCommand(String command) {
  command.trim();
  String output = "";
  
  if (command == "sys.info") {
    output = "Chip=" + String(CHIP_TYPE) + 
             " MAC=" + WiFi.macAddress() + 
             " IP=" + WiFi.localIP().toString() + 
             " Heap=" + String((unsigned)ESP_FREE_HEAP) + 
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
    for (int i = 0; i < PIN_COUNT; i++) {
      int pin = DEFAULT_PINS[i];
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

// ============================================================================
// OTA update via HTTP
// ============================================================================
// The device-service sends: {"type":"ota","path":"/api/firmware/[id]/bin","version":"1.5.0"}
// The ESP constructs the full URL: http://SERVER_HOST:3000/api/firmware/[id]/bin
// ============================================================================

void performOTA(String path, String version) {
  // Construct the download URL using the known server host + HTTP port
  String url = "http://" + String(SERVER_HOST) + ":" + String(HTTP_PORT) + path;
  Serial.printf("Starting OTA update from: %s\n", url.c_str());
  
  otaInProgress = true;
  webSocket.disconnect(); // Disable WS to free memory for OTA
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
      
      // Re-enable WS to report error
      otaInProgress = false;
      webSocket.begin(SERVER_HOST, SERVER_PORT, "/");
      delay(1000);
      sendAck("ota", "error", ("OTA update failed: " + errStr).c_str());
      break;
    }
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("OTA: No updates");
      otaInProgress = false;
      webSocket.begin(SERVER_HOST, SERVER_PORT, "/");
      delay(1000);
      sendAck("ota", "error", "No updates found");
      break;
    case HTTP_UPDATE_OK:
      Serial.println(F("OTA: success — rebooting with new firmware"));
      delay(100);
      ESP_RESTART;
      break;
  }
}
