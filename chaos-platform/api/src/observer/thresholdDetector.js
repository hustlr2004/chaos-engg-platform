const THRESHOLDS = {
  CPU_PERCENT: 85,
  MEMORY_MB: 400,
  ERROR_RATE: 0.05,
};

function detectViolations(metrics) {
  const violations = [];
  const detectedAt = new Date();

  if (metrics.cpuPercent > THRESHOLDS.CPU_PERCENT) {
    violations.push({
      type: "HIGH_CPU",
      severity: "critical",
      containerName: metrics.containerName,
      value: metrics.cpuPercent,
      threshold: THRESHOLDS.CPU_PERCENT,
      detectedAt,
    });
  }

  if (metrics.memoryMB > THRESHOLDS.MEMORY_MB) {
    violations.push({
      type: "HIGH_MEMORY",
      severity: "high",
      containerName: metrics.containerName,
      value: metrics.memoryMB,
      threshold: THRESHOLDS.MEMORY_MB,
      detectedAt,
    });
  }

  return violations;
}

module.exports = {
  THRESHOLDS,
  detectViolations,
};
