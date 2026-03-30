import { group, sleep } from 'k6';
import {
  buildValidTelemetryPayload,
  checkTelemetryAccepted,
  postTelemetry,
} from './telemetry_shared.js';

export const options = {
  stages: [
    { duration: '30s', target: 25 },
    { duration: '40s', target: 45 },
    { duration: '3m30s', target: 45 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    telemetry_success_rate: ['rate>0.97'],
  },
};

export default function () {
  group('POST /telemetry em resistência', () => {
    const res = postTelemetry(buildValidTelemetryPayload());
    checkTelemetryAccepted(res);
  });

  sleep(0.08);
}
