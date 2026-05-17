const { execInContainer } = require("../lib/dockerClient");

async function injectCPU(containerName, percent, durationSeconds) {
  const command = `stress-ng --cpu 0 --cpu-load ${percent} --timeout ${durationSeconds}s &`;

  execInContainer(containerName, command);

  console.log(
    `[FAULT] CPU fault injected on ${containerName}: ${percent}% for ${durationSeconds}s`
  );

  return {
    injected: true,
    containerName,
    percent,
    durationSeconds,
    startedAt: new Date(),
  };
}

async function stopCPU(containerName) {
  await execInContainer(containerName, "pkill -f stress-ng");

  console.log(`[FAULT] CPU fault stopped on ${containerName}`);

  return {
    stopped: true,
    containerName,
    stoppedAt: new Date(),
  };
}

module.exports = {
  injectCPU,
  stopCPU,
};
