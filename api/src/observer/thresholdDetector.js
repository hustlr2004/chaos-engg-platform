const CPU_THRESHOLD_PERCENT = 85;
const MEMORY_THRESHOLD_RATIO = 0.8;
const CONTAINER_DOWN_MISSED_POLLS = 3;
const ERROR_RATE_THRESHOLD = 0.05;

const consecutiveMissedPolls = new Map();

function detectViolations(metrics = {}) {
  const violations = [];
  const containerName = metrics.containerName || null;

  if (containerName) {
    consecutiveMissedPolls.set(containerName, 0);
  }

  addCpuViolation(violations, metrics);
  addMemoryViolation(violations, metrics);
  addErrorRateViolation(violations, metrics);
  addContainerDownViolations(violations, metrics);

  return violations;
}

function addCpuViolation(violations, metrics) {
  if (!metrics.containerName || !Number.isFinite(metrics.cpuPercent)) {
    return;
  }

  if (metrics.cpuPercent > CPU_THRESHOLD_PERCENT) {
    violations.push({
      containerName: metrics.containerName,
      type: "HIGH_CPU",
      severity: "critical",
      value: metrics.cpuPercent,
      threshold: CPU_THRESHOLD_PERCENT,
    });
  }
}

function addMemoryViolation(violations, metrics) {
  if (!metrics.containerName || !Number.isFinite(metrics.memoryMB)) {
    return;
  }

  const limitMB = getMemoryLimitMB(metrics);

  if (!Number.isFinite(limitMB) || limitMB <= 0) {
    return;
  }

  const threshold = Number((limitMB * MEMORY_THRESHOLD_RATIO).toFixed(2));

  if (metrics.memoryMB > threshold) {
    violations.push({
      containerName: metrics.containerName,
      type: "HIGH_MEMORY",
      severity: "high",
      value: metrics.memoryMB,
      threshold,
    });
  }
}

function addErrorRateViolation(violations, metrics) {
  if (!Number.isFinite(metrics.errorRate)) {
    return;
  }

  if (metrics.errorRate > ERROR_RATE_THRESHOLD) {
    const violation = {
      type: "HIGH_ERROR_RATE",
      severity: "high",
      value: metrics.errorRate,
      threshold: ERROR_RATE_THRESHOLD,
    };

    if (metrics.containerName) {
      violation.containerName = metrics.containerName;
    }

    violations.push(violation);
  }
}

function addContainerDownViolations(violations, metrics) {
  const expectedContainers = getExpectedContainers(metrics);
  const activeContainers = getActiveContainers(metrics);

  if (!expectedContainers.length) {
    return;
  }

  const activeSet = new Set(activeContainers);

  for (const name of expectedContainers) {
    if (activeSet.has(name)) {
      consecutiveMissedPolls.set(name, 0);
      continue;
    }

    const missedPolls = (consecutiveMissedPolls.get(name) || 0) + 1;
    consecutiveMissedPolls.set(name, missedPolls);

    if (missedPolls >= CONTAINER_DOWN_MISSED_POLLS) {
      violations.push({
        containerName: name,
        type: "CONTAINER_DOWN",
        severity: "critical",
        value: missedPolls,
        threshold: CONTAINER_DOWN_MISSED_POLLS,
      });
    }
  }
}

function getMemoryLimitMB(metrics) {
  const limitCandidates = [
    metrics.memoryLimitMB,
    metrics.containerLimitMB,
    metrics.memoryLimit,
  ];

  for (const candidate of limitCandidates) {
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return null;
}

function getExpectedContainers(metrics) {
  const containers = metrics.expectedContainers || metrics.knownContainers || [];
  return normalizeContainerList(containers);
}

function getActiveContainers(metrics) {
  const containers =
    metrics.activeContainers ||
    metrics.currentContainers ||
    (metrics.containerName ? [metrics.containerName] : []);

  return normalizeContainerList(containers);
}

function normalizeContainerList(containers) {
  if (!Array.isArray(containers)) {
    return [];
  }

  return containers.filter(
    (name, index) =>
      typeof name === "string" &&
      name.length > 0 &&
      containers.indexOf(name) === index
  );
}

module.exports = {
  consecutiveMissedPolls,
  detectViolations,
  missedPollsByContainer: consecutiveMissedPolls,
};
