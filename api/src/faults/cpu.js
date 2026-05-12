const { execInContainer } = require("../lib/dockerClient");

async function injectCPU(containerName, percent, durationSeconds) {
  const command = `stress-ng --cpu 0 --cpu-load ${percent} --timeout ${durationSeconds}s --metrics-brief >/tmp/stress-ng.log 2>&1 & echo $!`;
  const { stdout } = await execInContainer(containerName, command);
  const pid = Number.parseInt(stdout.trim(), 10);

  return {
    started: true,
    pid: Number.isNaN(pid) ? null : pid,
    containerName,
    percent,
    durationSeconds,
  };
}

async function stopCPU(containerName) {
  await execInContainer(containerName, "pkill -f stress-ng");

  return { stopped: true };
}

module.exports = {
  injectCPU,
  stopCPU,
};
