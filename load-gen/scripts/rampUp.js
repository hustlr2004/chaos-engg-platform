import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

export const payment_success_rate = new Rate("payment_success_rate");
export const payment_duration = new Trend("payment_duration");

const targetUrl = __ENV.TARGET_URL;
const endpointPath = __ENV.TARGET_PATH || "/payment";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "60s", target: 10 },
    { duration: "30s", target: 50 },
    { duration: "60s", target: 50 },
    { duration: "30s", target: 200 },
    { duration: "60s", target: 200 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1000"],
  },
};

export default function () {
  if (!targetUrl) {
    throw new Error("TARGET_URL environment variable is required");
  }

  const url = `${targetUrl.replace(/\/$/, "")}${endpointPath}`;
  const payload = JSON.stringify({
    amount: 100,
    currency: "USD",
    username: "chaos-user",
    password: "chaos-pass",
  });
  const params = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  const response = http.post(url, payload, params);
  const isSuccess = check(response, {
    "status is 200": (res) => res.status === 200,
    "response time < 1000ms": (res) => res.timings.duration < 1000,
  });

  payment_success_rate.add(isSuccess);
  payment_duration.add(response.timings.duration);
}
