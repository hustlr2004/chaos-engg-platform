const Docker = require("dockerode");

const docker = new Docker();

function normalizeContainerName(name) {
  return name.startsWith("/") ? name.slice(1) : name;
}

async function resolveContainer(nameOrId) {
  const container = docker.getContainer(nameOrId);

  try {
    await container.inspect();
    return container;
  } catch (error) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }

  const containers = await docker.listContainers({ all: true });
  const match = containers.find((entry) =>
    entry.Id.startsWith(nameOrId) ||
    entry.Names.some((name) => normalizeContainerName(name) === nameOrId)
  );

  if (!match) {
    throw new Error(`Container not found: ${nameOrId}`);
  }

  return docker.getContainer(match.Id);
}

function calculateCpuPercent(stats) {
  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage -
    stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount =
    stats.cpu_stats.online_cpus ||
    stats.cpu_stats.cpu_usage.percpu_usage?.length ||
    1;

  if (cpuDelta <= 0 || systemDelta <= 0) {
    return 0;
  }

  return Number(((cpuDelta / systemDelta) * cpuCount * 100).toFixed(2));
}

function calculateMemoryPercent(stats) {
  const usage = stats.memory_stats?.usage || 0;
  const limit = stats.memory_stats?.limit || 0;

  if (!limit) {
    return 0;
  }

  return Number(((usage / limit) * 100).toFixed(2));
}

async function getContainer(nameOrId) {
  return resolveContainer(nameOrId);
}

async function getContainerStats(nameOrId) {
  const container = await resolveContainer(nameOrId);
  const stream = await container.stats({ stream: true });

  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      try {
        const stats = JSON.parse(chunk.toString("utf8"));
        stream.off("data", onData);
        stream.off("error", onError);
        stream.destroy();

        const memoryUsageBytes = stats.memory_stats?.usage || 0;

        resolve({
          cpu_percent: calculateCpuPercent(stats),
          memory_percent: calculateMemoryPercent(stats),
          memory_usage_mb: Number(
            (memoryUsageBytes / 1024 / 1024).toFixed(2)
          ),
          pids: stats.pids_stats?.current || 0,
        });
      } catch (error) {
        stream.off("data", onData);
        stream.off("error", onError);
        stream.destroy();
        reject(error);
      }
    };

    const onError = (error) => {
      stream.off("data", onData);
      stream.off("error", onError);
      reject(error);
    };

    stream.on("data", onData);
    stream.on("error", onError);
  });
}

async function execInContainer(nameOrId, command) {
  const container = await resolveContainer(nameOrId);
  const exec = await container.exec({
    AttachStdout: true,
    AttachStderr: true,
    Cmd: ["sh", "-lc", command],
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    container.modem.demuxStream(stream, {
      write(chunk) {
        stdout += chunk.toString("utf8");
      },
    }, {
      write(chunk) {
        stderr += chunk.toString("utf8");
      },
    });

    stream.on("end", () => resolve({ stdout, stderr }));
    stream.on("error", reject);
  });
}

async function killContainer(nameOrId, signal = "SIGKILL") {
  const container = await resolveContainer(nameOrId);
  await container.kill({ signal });
}

async function restartContainer(nameOrId) {
  const container = await resolveContainer(nameOrId);
  await container.restart();
}

async function listRunningContainers() {
  const containers = await docker.listContainers();

  return containers.map((container) => ({
    id: container.Id,
    name: normalizeContainerName(container.Names[0] || ""),
    image: container.Image,
    status: container.Status,
  }));
}

module.exports = {
  execInContainer,
  getContainer,
  getContainerStats,
  killContainer,
  listRunningContainers,
  restartContainer,
};
