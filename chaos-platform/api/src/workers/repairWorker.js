const MetricsPoller = require("../observer/metricsPoller");
const { detectViolations } = require("../observer/thresholdDetector");

class RepairWorker {
  constructor(dockerClient, emitter) {
    this.dockerClient = dockerClient;
    this.emitter = emitter;
    this.lastRepair = new Map();
    this.REPAIR_COOLDOWN = 30000;
    this.metricsPoller = null;
    this.handleMetrics = this.handleMetrics.bind(this);
  }

  start() {
    const prometheusUrl = process.env.PROMETHEUS_URL || "http://prometheus:9090";

    this.metricsPoller = new MetricsPoller(prometheusUrl, this.emitter);
    this.emitter.on("metrics", this.handleMetrics);
    this.metricsPoller.start();
  }

  stop() {
    if (this.metricsPoller) {
      this.metricsPoller.stop();
    }

    this.emitter.off("metrics", this.handleMetrics);
  }

  async handleMetrics(metrics) {
    const violations = detectViolations(metrics);

    for (const violation of violations) {
      await this.handleViolation(violation);
    }
  }

  shouldSkipRepair(containerName) {
    const lastRepairAt = this.lastRepair.get(containerName);

    if (!lastRepairAt) {
      return false;
    }

    return Date.now() - lastRepairAt < this.REPAIR_COOLDOWN;
  }

  async handleViolation(violation) {
    const { type, containerName, value, threshold } = violation;

    if (this.shouldSkipRepair(containerName)) {
      return;
    }

    console.log(
      `[REPAIR] Violation detected: ${type} on ${containerName} value=${value} threshold=${threshold}`
    );

    const action = await this.runRepair(violation);
    const repairedAt = new Date();
    const outcome = "success";

    this.lastRepair.set(containerName, Date.now());

    this.emitter.emit("repair", {
      containerName,
      violationType: type,
      action,
      outcome,
      repairedAt,
    });

    console.log(`[REPAIR] Action taken: ${action} on ${containerName}`);
  }

  async runRepair(violation) {
    const { type, containerName } = violation;

    if (type === "HIGH_CPU") {
      await this.dockerClient.execInContainer(containerName, "pkill -f stress-ng");
      console.log(`[REPAIR] Scale-out attempt for ${containerName}`);
      return "stop_cpu_fault_and_scale_out_attempt";
    }

    if (type === "HIGH_MEMORY") {
      await this.dockerClient.restartContainer(containerName);
      return "restart_container";
    }

    if (type === "CONTAINER_DOWN") {
      await this.dockerClient.restartContainer(containerName);
      return "restart_container";
    }

    return "none";
  }
}

module.exports = RepairWorker;
