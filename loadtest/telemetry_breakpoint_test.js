import { group } from 'k6';
import {
  buildValidTelemetryPayload,
  checkTelemetryAccepted,
  postTelemetry,
} from './telemetry_shared.js';

export const options = {
  scenarios: {
    capacity_limit_ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 30,
      timeUnit: '1s',
      preAllocatedVUs: 60,
      maxVUs: 1000,
      stages: [
        { duration: '30s', target: 60 },
        { duration: '1m', target: 120 },
        { duration: '1m', target: 220 },
        { duration: '1m', target: 320 },
        { duration: '1m', target: 450 },
        { duration: '1m', target: 600 },
        { duration: '1m', target: 800 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<450'],
    telemetry_success_rate: ['rate>0.98'],
  },
};

export default function () {
  group('POST /telemetry em limite de capacidade', () => {
    const res = postTelemetry(buildValidTelemetryPayload());
    checkTelemetryAccepted(res);
  });
}
