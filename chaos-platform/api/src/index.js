const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const EventEmitter = require("events");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const { injectCPU, stopCPU } = require("./faults/cpu");
const dockerClient = require("./lib/dockerClient");
const { runLoadTest, stopLoadTest } = require("./lib/loadGenRunner");
const RepairWorker = require("./workers/repairWorker");

const PORT = process.env.PORT || 4000;
const TARGET_URL = process.env.TARGET_URL || "http://payment-api:5001";
const TC03_SCRIPT_PATH = path.resolve(
  __dirname,
  "../../load-gen/scripts/tc03-spike.js"
);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
const emitter = new EventEmitter();
const repairWorker = new RepairWorker(dockerClient, emitter);

let activeLoadTest = null;
let currentRun = {
  status: "idle",
  startedAt: null,
  logs: [],
  metrics: [],
};

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
  });
});

app.post("/api/runs/tc03/start", async (req, res, next) => {
  try {
    if (currentRun.status === "running") {
      res.status(409).json(currentRun);
      return;
    }

    currentRun = {
      status: "running",
      startedAt: new Date(),
      logs: [],
      metrics: [],
    };

    await injectCPU("payment-api", 90, 180);

    activeLoadTest = await runLoadTest(
      TARGET_URL,
      TC03_SCRIPT_PATH
    );

    activeLoadTest.emitter.on("log", (line) => {
      currentRun.logs.push(line);
      io.to("tc03").emit("log", line);
    });

    activeLoadTest.emitter.on("metric", (line) => {
      currentRun.metrics.push(line);
      io.to("tc03").emit("metric", line);
    });

    activeLoadTest.promise.then((result) => {
      currentRun.status = result.passed ? "passed" : "failed";
      currentRun.exitCode = result.exitCode;
      currentRun.finishedAt = new Date();
      activeLoadTest = null;
      io.to("tc03").emit("run-complete", currentRun);
    });

    res.status(202).json(currentRun);
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/tc03/status", (req, res) => {
  res.json(currentRun);
});

app.post("/api/runs/tc03/abort", async (req, res, next) => {
  try {
    if (activeLoadTest?.childProcess) {
      await stopLoadTest(activeLoadTest.childProcess);
    }

    await stopCPU("payment-api");

    currentRun.status = "aborted";
    currentRun.abortedAt = new Date();
    activeLoadTest = null;

    res.json(currentRun);
  } catch (error) {
    next(error);
  }
});

io.on("connection", (socket) => {
  socket.join("tc03");
});

emitter.on("repair", (data) => {
  io.to("tc03").emit("repair", data);
});

app.use((error, req, res, next) => {
  console.error("[SERVER] Error:", error.message);
  res.status(500).json({
    error: error.message,
  });
});

server.listen(PORT, () => {
  repairWorker.start();
  console.log(`[SERVER] Chaos API running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  repairWorker.stop();
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  repairWorker.stop();
  server.close(() => process.exit(0));
});
