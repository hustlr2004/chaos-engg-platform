const axios = require("axios");

const BYTES_IN_MB = 1024 * 1024;

class MetricsPoller {
  constructor(prometheusUrl, emitter) {
    this.prometheusUrl = prometheusUrl.replace(/\/+$/, "");
    this.emitter = emitter;
    this.missedPolls = new Map();
    this.intervalId = null;
  }

  start(intervalMs = 5000) {
    this.stop();

    this.intervalId = setInterval(async () => {
      try {
        const [cpuResponse, memoryResponse] = await Promise.all([
          this.queryPrometheus("container_cpu_usage_seconds_total"),
          this.queryPrometheus("container_memory_usage_bytes"),
        ]);

        const metricsByContainer = new Map();

        this.mergeMetric(
          metricsByContainer,
          cpuResponse.data?.data?.result || [],
          "cpuPercent"
        );
        this.mergeMetric(
          metricsByContainer,
          memoryResponse.data?.data?.result || [],
          "memoryMB",
          (value) => value / BYTES_IN_MB
        );

        for (const [containerName, metrics] of metricsByContainer.entries()) {
          this.missedPolls.set(containerName, 0);
          this.emitter.emit("metrics", {
            containerName,
            cpuPercent: metrics.cpuPercent || 0,
            memoryMB: metrics.memoryMB || 0,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        console.error("[METRICS] Poll failed:", error.message);
      }
    }, intervalMs);
  }

  stop() {
    if (!this.intervalId) {
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  queryPrometheus(query) {
    return axios.get(`${this.prometheusUrl}/api/v1/query`, {
      params: {
        query,
      },
    });
  }

  mergeMetric(metricsByContainer, results, key, transform = (value) => value) {
    for (const result of results) {
      const containerName = this.getContainerName(result.metric);

      if (!containerName) {
        continue;
      }

      const rawValue = Number(result.value?.[1]);

      if (!Number.isFinite(rawValue)) {
        continue;
      }

      const metrics = metricsByContainer.get(containerName) || {};
      metrics[key] = transform(rawValue);
      metricsByContainer.set(containerName, metrics);
    }
  }

  getContainerName(metric = {}) {
    return metric.container_name || metric.container || metric.name || null;
  }
}

module.exports = MetricsPoller;
