const BYTES_IN_MB = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;

class MetricsPoller {
  constructor(baseUrl, eventEmitter) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.eventEmitter = eventEmitter;
    this.intervalId = null;
    this.isPolling = false;
  }

  start(intervalMs) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error("intervalMs must be a positive number");
    }

    this.stop();

    this.poll().catch((error) => {
      console.error("MetricsPoller initial poll failed:", error.message);
    });

    this.intervalId = setInterval(() => {
      this.poll().catch((error) => {
        console.error("MetricsPoller poll failed:", error.message);
      });
    }, intervalMs);
  }

  stop() {
    if (!this.intervalId) {
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async poll() {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const [cpuMetrics, memoryMetrics, networkMetrics] = await Promise.all([
        this.queryPrometheus(
          'sum by (container) (rate(container_cpu_usage_seconds_total{container!=""}[1m])) * 100'
        ),
        this.queryPrometheus(
          'sum by (container) (container_memory_usage_bytes{container!=""})'
        ),
        this.queryPrometheus(
          'sum by (container) (container_network_receive_bytes_total{container!=""})'
        ),
      ]);

      const timestamp = Date.now();
      const metricsByContainer = new Map();

      this.mergeMetricResults(metricsByContainer, cpuMetrics, "cpuPercent");
      this.mergeMetricResults(metricsByContainer, memoryMetrics, "memoryMB", {
        transform: (value) => this.toMegabytes(value),
      });
      this.mergeMetricResults(metricsByContainer, networkMetrics, "networkRxMB", {
        transform: (value) => this.toMegabytes(value),
      });

      for (const metric of metricsByContainer.values()) {
        this.eventEmitter.emit("metrics", {
          containerName: metric.containerName,
          cpuPercent: metric.cpuPercent ?? 0,
          memoryMB: metric.memoryMB ?? 0,
          networkRxMB: metric.networkRxMB ?? 0,
          timestamp,
        });
      }
    } catch (error) {
      console.error("MetricsPoller failed to fetch metrics:", error.message);
    } finally {
      this.isPolling = false;
    }
  }

  async queryPrometheus(query) {
    const url = new URL("/api/v1/query", this.baseUrl);
    url.searchParams.set("query", query);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response;

    try {
      response = await fetch(url, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Prometheus request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data?.status !== "success") {
      throw new Error("Prometheus query was unsuccessful");
    }

    return data?.data?.result || [];
  }

  mergeMetricResults(targetMap, results, valueKey, options = {}) {
    const transform = options.transform || ((value) => value);

    for (const result of results) {
      const containerName = this.getContainerName(result.metric);

      if (!containerName) {
        continue;
      }

      const numericValue = Number(result.value?.[1]);

      if (!Number.isFinite(numericValue)) {
        continue;
      }

      const existing = targetMap.get(containerName) || { containerName };
      existing[valueKey] = Number(transform(numericValue).toFixed(2));
      targetMap.set(containerName, existing);
    }
  }

  getContainerName(metric = {}) {
    const containerName =
      metric.container || metric.container_name || metric.name || "";

    if (!containerName || containerName === "POD") {
      return null;
    }

    return containerName;
  }

  toMegabytes(value) {
    return value / BYTES_IN_MB;
  }
}

module.exports = MetricsPoller;
