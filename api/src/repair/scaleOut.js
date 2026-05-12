const Docker = require("dockerode");
const portfinder = require("portfinder");

const docker = new Docker();

const HEALTH_CHECK_ATTEMPTS = 10;
const HEALTH_CHECK_DELAY_MS = 1000;

function logWithTimestamp(message, details) {
  const timestamp = new Date().toISOString();

  if (typeof details === "undefined") {
    console.log(`[${timestamp}] ${message}`);
    return;
  }

  console.log(`[${timestamp}] ${message}`, details);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

function getContainerPort(originalConfig, options = {}) {
  if (options.containerPort) {
    return options.containerPort;
  }

  const exposedPorts = Object.keys(originalConfig.ExposedPorts || {});

  if (!exposedPorts.length) {
    throw new Error("Original container does not expose any ports");
  }

  return exposedPorts[0];
}

async function isReplicaHealthy(replicaPort) {
  try {
    const response = await fetch(`http://127.0.0.1:${replicaPort}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function waitForHealthyReplica(replicaName, replicaPort) {
  for (let attempt = 1; attempt <= HEALTH_CHECK_ATTEMPTS; attempt += 1) {
    logWithTimestamp(
      `Checking health for ${replicaName} on port ${replicaPort} (attempt ${attempt}/${HEALTH_CHECK_ATTEMPTS})`
    );

    const healthy = await isReplicaHealthy(replicaPort);

    if (healthy) {
      logWithTimestamp(`Replica ${replicaName} passed health check`);
      return true;
    }

    if (attempt < HEALTH_CHECK_ATTEMPTS) {
      await delay(HEALTH_CHECK_DELAY_MS);
    }
  }

  logWithTimestamp(`Replica ${replicaName} did not become healthy in time`);
  return false;
}

async function scaleOut(containerName, imageName, options = {}) {
  const startedAt = new Date().toISOString();
  logWithTimestamp(`Starting scale-out for ${containerName}`);

  const originalContainer = await resolveContainer(containerName);
  logWithTimestamp(`Resolved original container ${containerName}`);

  const originalInspect = await originalContainer.inspect();
  const replicaName = `${containerName}-replica-${Date.now()}`;
  const replicaImage = imageName || originalInspect.Config.Image;
  const replicaPort = await portfinder.getPortPromise({
    port: options.startPort || 3000,
    stopPort: options.stopPort || 3999,
  });
  const containerPort = getContainerPort(originalInspect.Config, options);

  logWithTimestamp(`Using image ${replicaImage} for replica ${replicaName}`);
  logWithTimestamp(`Selected host port ${replicaPort} for replica ${replicaName}`);

  const createOptions = {
    name: replicaName,
    Image: replicaImage,
    Env: originalInspect.Config.Env || [],
    Cmd: options.cmd || originalInspect.Config.Cmd,
    Entrypoint: options.entrypoint || originalInspect.Config.Entrypoint,
    WorkingDir: options.workingDir || originalInspect.Config.WorkingDir,
    ExposedPorts: {
      [containerPort]: {},
    },
    HostConfig: {
      PortBindings: {
        [containerPort]: [{ HostPort: String(replicaPort) }],
      },
    },
  };

  if (options.networkMode || originalInspect.HostConfig?.NetworkMode) {
    createOptions.HostConfig.NetworkMode =
      options.networkMode || originalInspect.HostConfig.NetworkMode;
  }

  logWithTimestamp(`Creating replica container ${replicaName}`, {
    image: replicaImage,
    containerPort,
    replicaPort,
  });

  const replicaContainer = await docker.createContainer(createOptions);
  logWithTimestamp(`Created replica container ${replicaName}`);

  await replicaContainer.start();
  logWithTimestamp(`Started replica container ${replicaName}`);

  const healthy = await waitForHealthyReplica(replicaName, replicaPort);

  return {
    replicaName,
    replicaPort,
    healthy,
    startedAt,
  };
}

module.exports = {
  scaleOut,
};
