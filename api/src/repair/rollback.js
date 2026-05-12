const Docker = require("dockerode");

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

function pullImage(imageTag) {
  return new Promise((resolve, reject) => {
    docker.pull(imageTag, (pullError, stream) => {
      if (pullError) {
        reject(pullError);
        return;
      }

      docker.modem.followProgress(
        stream,
        (progressError) => {
          if (progressError) {
            reject(progressError);
            return;
          }

          resolve();
        }
      );
    });
  });
}

function getPortBindings(originalInspect) {
  const portBindings = originalInspect.HostConfig?.PortBindings || {};

  if (Object.keys(portBindings).length > 0) {
    return portBindings;
  }

  const networkPorts = originalInspect.NetworkSettings?.Ports || {};

  if (Object.keys(networkPorts).length > 0) {
    return networkPorts;
  }

  throw new Error("Original container does not have any published ports");
}

function getHostHealthPort(portBindings) {
  const [firstPortBinding] = Object.values(portBindings);
  const firstHostBinding = Array.isArray(firstPortBinding)
    ? firstPortBinding[0]
    : null;

  if (!firstHostBinding?.HostPort) {
    throw new Error("Unable to determine host port for health checks");
  }

  return firstHostBinding.HostPort;
}

function getExposedPorts(portBindings, originalInspect) {
  const exposedPorts = {};

  for (const containerPort of Object.keys(portBindings)) {
    exposedPorts[containerPort] = {};
  }

  if (Object.keys(exposedPorts).length > 0) {
    return exposedPorts;
  }

  return originalInspect.Config.ExposedPorts || {};
}

async function waitForHealthCheck(containerName, hostPort) {
  for (let attempt = 1; attempt <= HEALTH_CHECK_ATTEMPTS; attempt += 1) {
    logWithTimestamp(
      `Checking health for ${containerName} on port ${hostPort} (attempt ${attempt}/${HEALTH_CHECK_ATTEMPTS})`
    );

    try {
      const response = await fetch(`http://127.0.0.1:${hostPort}/health`);

      if (response.status === 200) {
        logWithTimestamp(`Health check passed for ${containerName}`);
        return true;
      }
    } catch (error) {
      logWithTimestamp(`Health check request failed for ${containerName}`, {
        error: error.message,
      });
    }

    if (attempt < HEALTH_CHECK_ATTEMPTS) {
      await delay(HEALTH_CHECK_DELAY_MS);
    }
  }

  return false;
}

async function rollback(containerName, lastGoodImageTag) {
  const startTime = Date.now();
  logWithTimestamp(
    `Starting rollback for ${containerName} to image ${lastGoodImageTag}`
  );

  const originalContainer = await resolveContainer(containerName);
  const originalInspect = await originalContainer.inspect();
  const fromImage = originalInspect.Config.Image;
  const portBindings = getPortBindings(originalInspect);
  const hostHealthPort = getHostHealthPort(portBindings);

  logWithTimestamp(`Stopping current container ${containerName}`);
  await originalContainer.stop();

  logWithTimestamp(`Removing current container ${containerName}`);
  await originalContainer.remove();

  logWithTimestamp(`Pulling rollback image ${lastGoodImageTag}`);
  await pullImage(lastGoodImageTag);

  const createOptions = {
    name: containerName,
    Image: lastGoodImageTag,
    Env: originalInspect.Config.Env || [],
    Cmd: originalInspect.Config.Cmd,
    Entrypoint: originalInspect.Config.Entrypoint,
    WorkingDir: originalInspect.Config.WorkingDir,
    ExposedPorts: getExposedPorts(portBindings, originalInspect),
    HostConfig: {
      PortBindings: portBindings,
    },
  };

  if (originalInspect.HostConfig?.NetworkMode) {
    createOptions.HostConfig.NetworkMode = originalInspect.HostConfig.NetworkMode;
  }

  logWithTimestamp(`Creating rollback container ${containerName}`, {
    fromImage,
    toImage: lastGoodImageTag,
    hostPort: hostHealthPort,
  });

  const replacementContainer = await docker.createContainer(createOptions);

  logWithTimestamp(`Starting rollback container ${containerName}`);
  await replacementContainer.start();

  const healthy = await waitForHealthCheck(containerName, hostHealthPort);

  if (!healthy) {
    throw new Error(`Rollback health check failed for ${containerName}`);
  }

  const duration = Date.now() - startTime;

  logWithTimestamp(`Rollback completed for ${containerName}`, {
    duration,
  });

  return {
    rolledBack: true,
    fromImage,
    toImage: lastGoodImageTag,
    duration,
  };
}

module.exports = {
  rollback,
};
