const express = require("express");
const client = require("prom-client");

const app = express();
const port = 5001;
let inFlightPayments = 0;

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
  labelNames: ["method", "route", "status_code"],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

const processCpuUsage = new client.Gauge({
  name: "process_cpu_usage",
  help: "Process CPU usage in microseconds",
  registers: [register],
  collect() {
    const usage = process.cpuUsage();
    this.set(usage.user + usage.system);
  },
});

const processMemoryUsage = new client.Gauge({
  name: "process_memory_usage",
  help: "Process memory usage in bytes",
  registers: [register],
  collect() {
    this.set(process.memoryUsage().rss);
  },
});

function fibonacci(value) {
  if (value <= 1) {
    return value;
  }

  return fibonacci(value - 1) + fibonacci(value - 2);
}

app.use((req, res, next) => {
  const end = httpRequestDurationMs.startTimer({
    method: req.method,
    route: req.path,
  });

  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: req.path,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    end(labels);
    processCpuUsage.set(process.cpuUsage().user + process.cpuUsage().system);
    processMemoryUsage.set(process.memoryUsage().rss);
  });

  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/payment", (req, res) => {
  inFlightPayments += 1;
  const fib = fibonacci(40);

  if (inFlightPayments > 8 || (req.body && req.body.triggerCrash)) {
    setImmediate(() => {
      throw new Error("payment processor overheated");
    });
  }

  res.status(201).json({
    accepted: true,
    paymentId: Date.now(),
    processingScore: fib,
  });

  inFlightPayments -= 1;
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  console.log(`payment-api listening on ${port}`);
});
