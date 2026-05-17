const EventEmitter = require("events");
const { spawn } = require("child_process");
const path = require("path");

function emitLines(stream, emitter) {
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line) {
        continue;
      }

      emitter.emit("log", line);

      if (line.includes("http_req_duration") || line.includes("payment_duration")) {
        emitter.emit("metric", line);
      }
    }
  });

  stream.on("end", () => {
    if (!buffer) {
      return;
    }

    emitter.emit("log", buffer);

    if (buffer.includes("http_req_duration") || buffer.includes("payment_duration")) {
      emitter.emit("metric", buffer);
    }
  });
}

async function runLoadTest(targetUrl, scriptPath) {
  const emitter = new EventEmitter();
  const childProcess = spawnLoadTestProcess(targetUrl, scriptPath);

  emitLines(childProcess.stdout, emitter);
  emitLines(childProcess.stderr, emitter);

  const promise = new Promise((resolve) => {
    childProcess.on("error", (error) => {
      emitter.emit("log", error.message);
      resolve({
        passed: false,
        exitCode: null,
      });
    });

    childProcess.on("close", (exitCode) => {
      resolve({
        passed: exitCode === 0,
        exitCode,
      });
    });
  });

  return {
    emitter,
    promise,
    childProcess,
  };
}

async function stopLoadTest(childProcess) {
  childProcess.kill("SIGTERM");
}

function spawnLoadTestProcess(targetUrl, scriptPath) {
  const useDockerK6 = process.env.K6_USE_DOCKER === "true";

  if (!useDockerK6) {
    return spawn(
      "k6",
      ["run", "--env", `TARGET_URL=${targetUrl}`, scriptPath],
      {
        stdio: "pipe",
      }
    );
  }

  const scriptDirectory = path.dirname(scriptPath);
  const scriptName = path.basename(scriptPath);
  const dockerTargetUrl = targetUrl.replace(
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/,
    "http://host.docker.internal$2"
  );

  return spawn(
    "docker",
    [
      "run",
      "--rm",
      "-e",
      `TARGET_URL=${dockerTargetUrl}`,
      "-v",
      `${scriptDirectory}:/scripts:ro`,
      "grafana/k6",
      "run",
      `/scripts/${scriptName}`,
    ],
    {
      stdio: "pipe",
    }
  );
}

module.exports = {
  runLoadTest,
  stopLoadTest,
};
