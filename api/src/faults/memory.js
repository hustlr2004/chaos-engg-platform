const { execInContainer } = require("../lib/dockerClient");

function timestamp() {
  return new Date().toISOString();
}

async function injectMemory(containerName, percent, durationSeconds) {
  console.log(
    `[${timestamp()}] Starting memory fault on ${containerName} at ${percent}% for ${durationSeconds}s`
  );

  await execInContainer(
    containerName,
    `stress-ng --vm 1 --vm-bytes ${percent}% --timeout ${durationSeconds}s`
  );

  return {
    started: true,
    containerName,
    percent,
    durationSeconds,
  };
}

async function stopMemory(containerName) {
  console.log(`[${timestamp()}] Stopping memory fault on ${containerName}`);

  await execInContainer(containerName, "pkill -f stress-ng");

  return { stopped: true };
}

module.exports = {
  injectMemory,
  stopMemory,
};
