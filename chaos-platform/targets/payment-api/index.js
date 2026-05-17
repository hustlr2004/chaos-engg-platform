const express = require("express");
const client = require("prom-client");

const app = express();
const port = 5001;

app.use(express.json());

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestDurationMs = new client.Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["route"],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
});

const paymentProcessedTotal = new client.Counter({
  name: "payment_processed_total",
  help: "Total number of successfully processed payments",
  registers: [register],
});

const paymentErrorsTotal = new client.Counter({
  name: "payment_errors_total",
  help: "Total number of failed payment requests",
  registers: [register],
});

function fibonacci(value) {
  if (value <= 1) {
    return value;
  }

  return fibonacci(value - 1) + fibonacci(value - 2);
}

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const route = req.route?.path || req.path;

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: String(res.statusCode),
    });
    httpRequestDurationMs.observe({ route }, elapsedMs);
  });

  next();
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

app.post("/payment", (req, res) => {
  const start = Date.now();

  fibonacci(40);
  paymentProcessedTotal.inc();

  res.json({
    success: true,
    amount: req.body.amount,
    processingMs: Date.now() - start,
  });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.use((req, res) => {
  paymentErrorsTotal.inc();
  res.status(404).json({
    error: "not found",
  });
});

app.listen(port, () => {
  console.log(`payment-api listening on port ${port}`);
});
