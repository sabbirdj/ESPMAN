#ifndef ESPMAN_H
#define ESPMAN_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

#ifdef ESP8266
  #include <ESP8266WiFi.h>
  #include <ESP8266httpUpdate.h>
#elif defined(ESP32) || defined(CONFIG_IDF_TARGET_ESP32) || defined(CONFIG_IDF_TARGET_ESP32S2) || defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32C6)
  #include <WiFi.h>
  #include <HTTPUpdate.h>
#else
  #error "Unsupported platform. This sketch supports only ESP8266 and ESP32 families."
#endif

class ESPManager {
public:
    ESPManager();

    // Configuration
    void setWiFi(const char* ssid, const char* password);
    void setServer(const char* host, uint16_t wsPort = 3004, uint16_t httpPort = 3000, bool useSSL = false);
    void setDevice(const char* name, const char* version);

    // Initialization and loop
    void begin();
    void loop();

private:
    // Config values
    const char* _wifiSSID;
    const char* _wifiPassword;
    const char* _serverHost;
    uint16_t _serverPort;
    uint16_t _httpPort;
    bool _useSSL;
    const char* _deviceName;
    const char* _firmwareVersion;
    const char* _chipType;

    // State
    WebSocketsClient webSocket;
    unsigned long lastTelemetry;
    unsigned long bootTime;
    unsigned long lastWifiCheck;
    bool wsConnected;
    bool otaInProgress;
    
    // Hardware
    int _pinCount;
    int _defaultPins[64];
    bool pinState[64];
    String pinModes[64];

    // Internal methods
    void initHardwareConfig();
    void connectWifi();
    void connectWebSocket();
    void sendRegistration();
    void sendTelemetry();
    void sendAck(const char* actionType, const char* status, const char* message);
    void handleSerialCommand(String command);
    void performOTA(String path, String version);
    void handleWebSocketMessage(WStype_t type, uint8_t * payload, size_t length);

    // Static callback wrapper for WebSocket
    static void staticWebSocketEvent(WStype_t type, uint8_t * payload, size_t length);
    static ESPManager* _instance;
};

#endif
