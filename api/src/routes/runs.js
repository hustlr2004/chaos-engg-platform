const crypto = require("crypto");

const express = require("express");
const { Queue } = require("bullmq");

const { stopCPU } = require("../faults/cpu");
const { stopMemory } = require("../faults/memory");
const { removeAllToxics } = require("../faults/network");

const QUEUE_NAME = "chaos-runs";

function createQueue(options = {}) {
  if (options.queue) {
    return options.queue;
  }

  return new Queue(QUEUE_NAME, {
    connection: options.redisConnection || {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
    },
  });
}

function createRunsRouter(options = {}) {
  const router = express.Router();
  const db = options.db || null;
  const queue = createQueue(options);

  router.post("/start", async (req, res, next) => {
    try {
      const { targetId, experimentConfig } = req.body || {};
      const runId = crypto.randomUUID();

      validateStartRequest(targetId, experimentConfig);

      await queue.add(
        "start-run",
        {
          runId,
          targetId,
          experimentConfig,
          createdAt: new Date().toISOString(),
        },
        {
          jobId: runId,
        }
      );

      if (db) {
        await db.query(
          `
            INSERT INTO runs (
              id,
              target_id,
              status,
              experiment_config,
              created_at
            )
            VALUES ($1, $2, $3, $4::jsonb, NOW())
          `,
          [runId, targetId, "queued", JSON.stringify(experimentConfig)]
        );
      }

      res.status(202).json({
        runId,
        status: "queued",
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:runId", async (req, res, next) => {
    try {
      const { runId } = req.params;

      if (!db) {
        throw new Error("Database client is required for run lookups");
      }

      const runResult = await db.query(
        `
          SELECT
            id,
            target_id,
            status,
            experiment_config,
            started_at,
            completed_at,
            outcome,
            created_at
          FROM runs
          WHERE id = $1
        `,
        [runId]
      );

      if (runResult.rowCount === 0) {
        res.status(404).json({
          error: "Run not found",
        });
        return;
      }

      const logsResult = await db.query(
        `
          SELECT
            id,
            run_id,
            level,
            message,
            created_at
          FROM run_logs
          WHERE run_id = $1
          ORDER BY created_at ASC
        `,
        [runId]
      );

      res.json({
        ...runResult.rows[0],
        logs: logsResult.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:runId/abort", async (req, res, next) => {
    try {
      const { runId } = req.params;

      if (!db) {
        throw new Error("Database client is required for aborting runs");
      }

      const runResult = await db.query(
        `
          SELECT
            id,
            target_id,
            status
          FROM runs
          WHERE id = $1
        `,
        [runId]
      );

      if (runResult.rowCount === 0) {
        res.status(404).json({
          error: "Run not found",
        });
        return;
      }

      const run = runResult.rows[0];
      const containerName = run.target_id;

      await db.query(
        `
          UPDATE runs
          SET status = $2,
              outcome = $3,
              completed_at = NOW()
          WHERE id = $1
        `,
        [runId, "aborted", "aborted"]
      );

      await Promise.allSettled([
        stopCPU(containerName),
        stopMemory(containerName),
        removeAllToxics(containerName),
      ]);

      await db.query(
        `
          INSERT INTO run_logs (
            run_id,
            level,
            message,
            created_at
          )
          VALUES ($1, $2, $3, NOW())
        `,
        [runId, "info", "Run aborted and active faults stopped"]
      );

      res.json({
        aborted: true,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      if (!db) {
        throw new Error("Database client is required for listing runs");
      }

      const result = await db.query(
        `
          SELECT
            id,
            status,
            target_id AS target,
            EXTRACT(
              EPOCH FROM COALESCE(completed_at, NOW()) - COALESCE(started_at, created_at)
            ) * 1000 AS duration,
            outcome,
            created_at
          FROM runs
          ORDER BY created_at DESC
          LIMIT 50
        `
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function validateStartRequest(targetId, experimentConfig) {
  if (!targetId || typeof targetId !== "string") {
    throw new Error("targetId is required");
  }

  if (!experimentConfig || typeof experimentConfig !== "object") {
    throw new Error("experimentConfig is required");
  }

  if (!Array.isArray(experimentConfig.faults)) {
    throw new Error("experimentConfig.faults must be an array");
  }

  const loadProfile = experimentConfig.loadProfile;

  if (!loadProfile || typeof loadProfile !== "object") {
    throw new Error("experimentConfig.loadProfile is required");
  }

  const requiredFields = ["startRps", "peakRps", "rampSeconds"];

  for (const field of requiredFields) {
    if (!Number.isFinite(loadProfile[field])) {
      throw new Error(`experimentConfig.loadProfile.${field} must be a number`);
    }
  }
}

module.exports = {
  createRunsRouter,
  QUEUE_NAME,
};
