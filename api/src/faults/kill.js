const Docker = require("dockerode");

const {
  getContainer,
  killContainer: killDockerContainer,
} = require("../lib/dockerClient");

const docker = new Docker();

function timestamp() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function killContainer(containerName) {
  console.log(`[${timestamp()}] Killing container ${containerName}`);
  await killDockerContainer(containerName);
}

async function crashAndRedeploy(containerName, imageName, port) {
  const existingContainer = await getContainer(containerName);

  console.log(`[${timestamp()}] Killing container ${containerName}`);
  await killDockerContainer(containerName);
  await sleep(2000);
  await existingContainer.remove({ force: true });

  const newContainer = await docker.createContainer({
    Image: imageName,
    name: containerName,
    ExposedPorts: {
      [`${port}/tcp`]: {},
    },
    HostConfig: {
      PortBindings: {
        [`${port}/tcp`]: [{ HostPort: String(port) }],
      },
    },
  });

  await newContainer.start();

  return {
    killed: true,
    redeployed: true,
    newContainerId: newContainer.id,
  };
}

module.exports = {
  crashAndRedeploy,
  killContainer,
};
