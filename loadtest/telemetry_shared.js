import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:8080';

export const telemetryRequests = new Counter('telemetry_requests_total');
export const telemetrySuccessRate = new Rate('telemetry_success_rate');
export const telemetryRequestDuration = new Trend('telemetry_request_duration_ms');
export const telemetryPayloadBytes = new Trend('telemetry_payload_bytes');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomSensorTemplate() {
  const sensors = [
    { type: 'temperature', unit: 'celsius', value_type: 'analog', value: () => randomFloat(18, 36) },
    { type: 'humidity', unit: 'percent', value_type: 'analog', value: () => randomFloat(30, 90) },
    { type: 'presence', unit: 'boolean', value_type: 'discrete', value: () => (Math.random() > 0.5 ? 1 : 0) },
    { type: 'vibration', unit: 'm/s2', value_type: 'analog', value: () => randomFloat(0, 12) },
    { type: 'luminosity', unit: 'lux', value_type: 'analog', value: () => randomFloat(100, 3000) },
    { type: 'pressure', unit: 'bar', value_type: 'analog', value: () => randomFloat(0.8, 3.2) },
  ];

  return sensors[randomInt(0, sensors.length - 1)];
}

export function buildValidTelemetryPayload() {
  const sensor = randomSensorTemplate();

  return {
    device_id: randomInt(1, 100000),
    timestamp: new Date().toISOString(),
    sensor: {
      type: sensor.type,
      unit: sensor.unit,
    },
    reading: {
      value_type: sensor.value_type,
      value: sensor.value(),
    },
  };
}

export function buildInvalidTelemetryPayloadMissingSensor() {
  return {
    device_id: randomInt(1, 100000),
    timestamp: new Date().toISOString(),
    reading: {
      value_type: 'analog',
      value: randomFloat(0, 100),
    },
  };
}

function parseJSON(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function statusMatchesExpected(res, expectedStatus) {
  if (Array.isArray(expectedStatus)) {
    return expectedStatus.includes(res.status);
  }

  if (typeof expectedStatus === 'number') {
    return res.status === expectedStatus;
  }

  return res.status === 200;
}

function recordCommonMetrics(res, payload, expectedStatus) {
  telemetryRequests.add(1);
  telemetrySuccessRate.add(statusMatchesExpected(res, expectedStatus));
  telemetryRequestDuration.add(res.timings.duration);
  telemetryPayloadBytes.add(payload.length);
}

export function postTelemetry(payloadObject, params = {}) {
  const payload = JSON.stringify(payloadObject);
  const requestParams = {
    headers: { 'Content-Type': 'application/json' },
    ...(params.requestParams || {}),
  };

  const res = http.post(`${BASE_URL}/telemetry`, payload, requestParams);
  recordCommonMetrics(res, payload, params.expectedStatus);
  return res;
}

export function checkTelemetryAccepted(res) {
  return check(res, {
    'telemetry status 200': (r) => r.status === 200,
    'telemetry resposta de sucesso': (r) => {
      const body = parseJSON(r.body);
      return body !== null && body.message === 'Telemetry enviada com sucesso';
    },
  });
}

export function checkTelemetryRejected(res) {
  return check(res, {
    'telemetry inválida status 400': (r) => r.status === 400,
    'telemetry inválida retorna erro': (r) => {
      const body = parseJSON(r.body);
      return body !== null && typeof body.error === 'string' && body.error.length > 0;
    },
  });
}
