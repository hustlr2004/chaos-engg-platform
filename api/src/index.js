const http = require("http");

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const { Pool } = require("pg");
const client = require("prom-client");
const { Server } = require("socket.io");

const RepairWorker = require("./workers/repairWorker");

const PORT = 4000;

function createPlaceholderRouter(resourceName) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.status(200).json({
      resource: resourceName,
      items: [],
    });
  });

  return router;
}

function createRepairLogsRouter(db) {
  const router = express.Router();

  router.get("/", async (req, res, next) => {
    try {
      const result = await db.query(
        `
          SELECT
            id,
            container_name,
            violation_type,
            repair_action,
            outcome,
            duration_ms,
            created_at
          FROM repair_logs
          ORDER BY created_at DESC
          LIMIT 100
        `
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });
  const register = new client.Registry();
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  client.collectDefaultMetrics({ register });

  app.use(cors());
  app.use(helmet());
  app.use(express.json());

  app.use("/api/targets", createPlaceholderRouter("targets"));
  app.use("/api/experiments", createPlaceholderRouter("experiments"));
  app.use("/api/runs", createPlaceholderRouter("runs"));
  app.use("/api/repair-logs", createRepairLogsRouter(db));

  app.get("/metrics", async (req, res, next) => {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    console.error("Unhandled API error:", error);
    res.status(500).json({
      error: "Internal Server Error",
    });
  });

  io.on("connection", (socket) => {
    socket.join("live-feed");
  });

  const repairWorker = new RepairWorker({
    db,
    databaseUrl: process.env.DATABASE_URL,
  });

  repairWorker.on("repair", (repairResult) => {
    io.to("live-feed").emit("repair", repairResult);
  });

  repairWorker.start();

  server.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
  });

  return {
    app,
    db,
    io,
    repairWorker,
    server,
  };
}

module.exports = {
  startServer,
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start API server:", error);
    process.exit(1);
  });
}
