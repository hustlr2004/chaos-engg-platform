const { PassThrough } = require("stream");

const Docker = require("dockerode");

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
});

function timestamp() {
  return new Date().toISOString();
}

function getContainer(name) {
  return docker.getContainer(name);
}

function calculateCpuPercent(stats) {
  const cpuStats = stats.cpu_stats || {};
  const precpuStats = stats.precpu_stats || {};
  const cpuUsage = cpuStats.cpu_usage || {};
  const precpuUsage = precpuStats.cpu_usage || {};

  const delta = cpuUsage.total_usage - precpuUsage.total_usage;
  const systemDelta = cpuStats.system_cpu_usage - precpuStats.system_cpu_usage;
  const onlineCpus = cpuStats.online_cpus || cpuUsage.percpu_usage?.length || 1;

  if (!Number.isFinite(delta) || !Number.isFinite(systemDelta) || systemDelta <= 0) {
    return 0;
  }

  return (delta / systemDelta) * onlineCpus * 100;
}

async function getContainerStats(name) {
  const container = getContainer(name);
  const stream = await container.stats({ stream: true });

  return new Promise((resolve, reject) => {
    stream.once("data", (chunk) => {
      stream.destroy();

      const stats = JSON.parse(chunk.toString());
      const memoryStats = stats.memory_stats || {};
      const memoryUsageBytes = memoryStats.usage || 0;
      const memoryLimitBytes = memoryStats.limit || 0;
      const memoryUsageMB = memoryUsageBytes / 1024 / 1024;
      const memoryPercent =
        memoryLimitBytes > 0 ? (memoryUsageBytes / memoryLimitBytes) * 100 : 0;

      resolve({
        cpuPercent: calculateCpuPercent(stats),
        memoryPercent,
        memoryUsageMB,
        pids: stats.pids_stats?.current || 0,
      });
    });

    stream.once("error", reject);
  });
}

async function execInContainer(name, command) {
  const container = getContainer(name);
  const exec = await container.exec({
    AttachStdout: true,
    AttachStderr: true,
    Cmd: command.split(" "),
  });

  const stream = await exec.start({
    hijack: true,
    stdin: false,
  });

  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();
  const stdoutChunks = [];
  const stderrChunks = [];

  stdoutStream.on("data", (chunk) => stdoutChunks.push(chunk));
  stderrStream.on("data", (chunk) => stderrChunks.push(chunk));
  docker.modem.demuxStream(stream, stdoutStream, stderrStream);

  await new Promise((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const result = await exec.inspect();

  return {
    stdout: Buffer.concat(stdoutChunks).toString(),
    stderr: Buffer.concat(stderrChunks).toString(),
    exitCode: result.ExitCode,
  };
}

async function killContainer(name, signal = "SIGKILL") {
  console.log(`[CHAOS] Killing ${name} with ${signal} at ${timestamp()}`);
  const container = getContainer(name);
  await container.kill({ signal });
}

async function restartContainer(name) {
  console.log(`[REPAIR] Restarting ${name} at ${timestamp()}`);
  const container = getContainer(name);
  await container.restart();
}

async function listRunningContainers() {
  const containers = await docker.listContainers();

  return containers.map((container) => ({
    id: container.Id,
    name: (container.Names?.[0] || "").replace(/^\//, ""),
    image: container.Image,
    status: container.Status,
    created: container.Created,
  }));
}

module.exports = {
  docker,
  execInContainer,
  getContainer,
  getContainerStats,
  killContainer,
  listRunningContainers,
  restartContainer,
};
