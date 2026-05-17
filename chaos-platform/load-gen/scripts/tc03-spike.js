import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

export const paymentDuration = new Trend("payment_duration");
export const paymentErrorRate = new Rate("payment_error_rate");

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "10s", target: 2000 },
    { duration: "2m", target: 2000 },
    { duration: "30s", target: 10 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.1"],
    http_req_duration: ["p(95)<2000"],
    payment_error_rate: ["rate<0.1"],
  },
};

export default function () {
  const targetUrl = __ENV.TARGET_URL;
  const payload = JSON.stringify({
    amount: 99.99,
    currency: "USD",
  });
  const params = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  const response = http.post(`${targetUrl}/payment`, payload, params);
  const acceptedStatus = response.status === 200 || response.status === 503;

  paymentDuration.add(response.timings.duration);
  paymentErrorRate.add(!acceptedStatus);

  check(response, {
    "status is 200 or 503": () => acceptedStatus,
  });

  sleep(0);
}
