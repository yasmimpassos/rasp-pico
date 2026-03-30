#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <queue>
#include <time.h>

const char* ssid = "NOME_DO_SEU_WIFI";
const char* password = "SENHA_DO_SEU_WIFI";
const char* serverUrl = "https://SUA_URL_DO_NGROK/telemetry";
const int DEVICE_ID = 101;
const int MAX_QUEUE_SIZE = 20;

struct Telemetry {
  String type;
  String unit;
  String valType;
  float value;
};

enum SystemState {
  STATE_CHECK_WIFI,
  STATE_READ_SENSORS,
  STATE_TRANSMIT,
  STATE_IDLE
};

SystemState currentState = STATE_CHECK_WIFI;
std::queue<Telemetry> sensorQueue;
unsigned long lastSensorRead = 0;
const unsigned long sensorInterval = 5000;

void setup() {
  Serial.begin(115200);
  delay(1000);
  WiFi.begin(ssid, password);
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("\n--- Sistema de Monitoramento Iniciado ---");
}

String getTimestamp() {
  time_t now = time(nullptr);
  struct tm timeinfo;
  if (!gmtime_r(&now, &timeinfo)) return "2026-03-30T00:00:00Z";
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

void loop() {
  switch (currentState) {
    case STATE_CHECK_WIFI:
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WIFI] Conectado!");
        currentState = STATE_READ_SENSORS;
      } else {
        static unsigned long lastWait = 0;
        if (millis() - lastWait > 2000) {
          Serial.println("[WIFI] Aguardando conexao...");
          lastWait = millis();
        }
      }
      break;

    case STATE_READ_SENSORS:
      if (millis() - lastSensorRead >= sensorInterval) {
        readMockSensors();
        lastSensorRead = millis();
        currentState = STATE_TRANSMIT;
      } else if (!sensorQueue.empty()) {
        currentState = STATE_TRANSMIT;
      } else {
        currentState = STATE_IDLE;
      }
      break;

    case STATE_TRANSMIT:
      if (WiFi.status() != WL_CONNECTED) {
        currentState = STATE_CHECK_WIFI;
        break;
      }
      if (!sensorQueue.empty()) {
        Telemetry data = sensorQueue.front();
        if (sendDataToBackend(data)) {
          Serial.println("[HTTP] Telemetria entregue com sucesso.");
          sensorQueue.pop();
        } else {
          Serial.println("[HTTP] Falha na entrega. Retentando...");
          currentState = STATE_IDLE;
        }
      } else {
        currentState = STATE_READ_SENSORS;
      }
      break;

    case STATE_IDLE:
      if (millis() - lastSensorRead >= sensorInterval) currentState = STATE_READ_SENSORS;
      else if (WiFi.status() != WL_CONNECTED) currentState = STATE_CHECK_WIFI;
      delay(10);
      break;
  }
}

void readMockSensors() {
  float mockPot = random(0, 1000) / 10.0;
  enqueueData("Potenciometro", "%", "analog", mockPot);

  float mockBtn = random(0, 2);
  enqueueData("Botao", "bin", "discrete", mockBtn);
}

void enqueueData(String t, String u, String vt, float v) {
  if (sensorQueue.size() < MAX_QUEUE_SIZE) {
    sensorQueue.push({t, u, vt, v});
    Serial.printf("[FILA] Dados de %s adicionados. Total de dados na fila: %d\n", t.c_str(), sensorQueue.size());
  }
}

bool sendDataToBackend(Telemetry data) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  
  if (http.begin(client, serverUrl)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("ngrok-skip-browser-warning", "true");

    JsonDocument doc;
    doc["device_id"] = DEVICE_ID;
    doc["timestamp"] = getTimestamp();

    JsonObject sensor = doc["sensor"].to<JsonObject>();
    sensor["type"] = data.type;
    sensor["unit"] = data.unit;

    JsonObject reading = doc["reading"].to<JsonObject>();
    reading["value_type"] = data.valType;
    reading["value"] = data.value;

    String payload;
    serializeJson(doc, payload);
    Serial.print("[HTTP] Enviando POST: ");
    Serial.println(payload);

    int httpCode = http.POST(payload);
    if (httpCode > 0) {
      Serial.printf("[HTTP] Status: %d\n", httpCode);
      if (httpCode == 200 || httpCode == 201) {
        http.end();
        return true;
      }
    }
    http.end();
  }
  return false;
}
