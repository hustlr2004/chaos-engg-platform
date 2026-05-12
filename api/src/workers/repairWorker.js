const EventEmitter = require("events");

const MetricsPoller = require("../observer/metricsPoller");
const { detectViolations } = require("../observer/thresholdDetector");
const { scaleOut } = require("../repair/scaleOut");
const { rollback } = require("../repair/rollback");
const { restartContainer } = require("../lib/dockerClient");

const DUPLICATE_REPAIR_WINDOW_MS = 30 * 1000;

function logWithTimestamp(message, details) {
  const timestamp = new Date().toISOString();

  if (typeof details === "undefined") {
    console.log(`[${timestamp}] ${message}`);
    return;
  }

  console.log(`[${timestamp}] ${message}`, details);
}

function loadPgPool(databaseUrl) {
  if (!databaseUrl) {
    return null;
  }

  try {
    const { Pool } = require("pg");
    return new Pool({ connectionString: databaseUrl });
  } catch (error) {
    logWithTimestamp("Postgres client unavailable for repair logging", {
      error: error.message,
    });
    return null;
  }
}

function loadCrashAndRedeploy(override) {
  if (override) {
    return override;
  }

  try {
    return require("../repair/crashAndRedeploy").crashAndRedeploy;
  } catch (error) {
    return async function missingCrashAndRedeploy() {
      throw new Error(
        "crashAndRedeploy is not available; provide it in RepairWorker options or add api/src/repair/crashAndRedeploy.js"
      );
    };
  }
}

class RepairWorker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.prometheusBaseUrl =
      options.prometheusBaseUrl || "http://prometheus:9090";
    this.metricsEmitter = options.metricsEmitter || new EventEmitter();
    this.metricsPoller =
      options.metricsPoller ||
      new MetricsPoller(this.prometheusBaseUrl, this.metricsEmitter);
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.imageNameByContainer = new Map(
      Object.entries(options.imageNameByContainer || {})
    );
    this.lastGoodTagByContainer = new Map(
      Object.entries(options.lastGoodTagByContainer || {})
    );
    this.lastRepairAtByContainer = new Map();
    this.db = options.db || loadPgPool(options.databaseUrl || process.env.DATABASE_URL);
    this.crashAndRedeploy = loadCrashAndRedeploy(options.crashAndRedeploy);

    this.onMetrics = this.onMetrics.bind(this);
    this.metricsEmitter.on("metrics", this.onMetrics);
  }

  start(intervalMs = this.pollIntervalMs) {
    logWithTimestamp("Starting RepairWorker", {
      prometheusBaseUrl: this.prometheusBaseUrl,
      intervalMs,
    });
    this.metricsPoller.start(intervalMs);
  }

  stop() {
    logWithTimestamp("Stopping RepairWorker");
    this.metricsPoller.stop();
    this.metricsEmitter.off("metrics", this.onMetrics);
  }

  async onMetrics(metrics) {
    const violations = detectViolations(metrics);

    for (const violation of violations) {
      await this.handleViolation(violation, metrics);
    }
  }

  shouldSkipRepair(containerName) {
    if (!containerName) {
      return false;
    }

    const lastRepairAt = this.lastRepairAtByContainer.get(containerName);

    if (!lastRepairAt) {
      return false;
    }

    return Date.now() - lastRepairAt < DUPLICATE_REPAIR_WINDOW_MS;
  }

  markRepairStarted(containerName) {
    if (containerName) {
      this.lastRepairAtByContainer.set(containerName, Date.now());
    }
  }

  async handleViolation(violation, metrics) {
    const containerName = violation.containerName || metrics.containerName;

    if (this.shouldSkipRepair(containerName)) {
      logWithTimestamp(`Skipping duplicate repair for ${containerName}`, {
        violationType: violation.type,
      });
      return;
    }

    this.markRepairStarted(containerName);

    const startedAt = Date.now();
    let repairAction = "UNKNOWN";
    let outcome = "success";
    let repairResult;

    try {
      repairResult = await this.runRepair(violation, metrics, containerName);
      repairAction = repairResult.repairAction;

      await this.saveRepairLog({
        containerName,
        violationType: violation.type,
        repairAction,
        outcome,
        durationMs: Date.now() - startedAt,
      });

      this.emit("repair", {
        containerName,
        violation,
        repairAction,
        outcome,
        durationMs: Date.now() - startedAt,
        result: repairResult.result,
      });
    } catch (error) {
      outcome = `error: ${error.message}`;
      repairAction = repairAction === "UNKNOWN" ? this.getRepairActionName(violation.type) : repairAction;

      logWithTimestamp(`Repair failed for ${containerName}`, {
        violationType: violation.type,
        error: error.message,
      });

      await this.saveRepairLog({
        containerName,
        violationType: violation.type,
        repairAction,
        outcome,
        durationMs: Date.now() - startedAt,
      });

      this.emit("repair", {
        containerName,
        violation,
        repairAction,
        outcome,
        durationMs: Date.now() - startedAt,
        error: error.message,
      });
    }
  }

  async runRepair(violation, metrics, containerName) {
    const imageName =
      metrics.imageName || this.imageNameByContainer.get(containerName);
    const lastGoodTag =
      metrics.lastGoodTag || this.lastGoodTagByContainer.get(containerName);

    switch (violation.type) {
      case "HIGH_CPU":
        return {
          repairAction: "scaleOut",
          result: await scaleOut(containerName, imageName),
        };
      case "HIGH_MEMORY":
        await restartContainer(containerName);
        return {
          repairAction: "restartContainer",
          result: { restarted: true, containerName },
        };
      case "CONTAINER_DOWN":
        return {
          repairAction: "crashAndRedeploy",
          result: await this.crashAndRedeploy(containerName, imageName),
        };
      case "HIGH_ERROR_RATE":
        return {
          repairAction: "rollback",
          result: await rollback(containerName, lastGoodTag),
        };
      default:
        throw new Error(`Unsupported violation type: ${violation.type}`);
    }
  }

  getRepairActionName(violationType) {
    switch (violationType) {
      case "HIGH_CPU":
        return "scaleOut";
      case "HIGH_MEMORY":
        return "restartContainer";
      case "CONTAINER_DOWN":
        return "crashAndRedeploy";
      case "HIGH_ERROR_RATE":
        return "rollback";
      default:
        return "unknown";
    }
  }

  async saveRepairLog({
    containerName,
    violationType,
    repairAction,
    outcome,
    durationMs,
  }) {
    if (!this.db || typeof this.db.query !== "function") {
      logWithTimestamp("Skipping repair_logs insert because no Postgres client is configured");
      return;
    }

    await this.db.query(
      `
        INSERT INTO repair_logs (
          container_name,
          violation_type,
          repair_action,
          outcome,
          duration_ms,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [containerName, violationType, repairAction, outcome, durationMs]
    );
  }
}

module.exports = RepairWorker;
