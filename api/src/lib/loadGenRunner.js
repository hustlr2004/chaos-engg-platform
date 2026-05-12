const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { EventEmitter } = require("events");
const { spawn } = require("child_process");

const loadGenEvents = new EventEmitter();

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) {
    return 0;
  }

  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  const safeIndex = Math.min(Math.max(index, 0), sortedValues.length - 1);

  return sortedValues[safeIndex];
}

function toSecondBucket(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 19);
}

function parseK6Results(fileContents) {
  const durationValues = [];
  const failedRequestValues = [];
  const requestBuckets = new Map();
  let totalRequests = 0;

  const lines = fileContents.split("\n").filter(Boolean);

  for (const line of lines) {
    let entry;

    try {
      entry = JSON.parse(line);
    } catch (error) {
      continue;
    }

    if (entry.type !== "Point" || !entry.metric) {
      continue;
    }

    if (entry.metric === "http_req_duration") {
      durationValues.push(Number(entry.data?.value) || 0);
    }

    if (entry.metric === "http_req_failed") {
      failedRequestValues.push(Number(entry.data?.value) || 0);
    }

    if (entry.metric === "http_reqs") {
      totalRequests += Number(entry.data?.value) || 0;

      const bucket = toSecondBucket(entry.data?.time || new Date().toISOString());
      const currentCount = requestBuckets.get(bucket) || 0;
      requestBuckets.set(bucket, currentCount + (Number(entry.data?.value) || 0));
    }
  }

  durationValues.sort((a, b) => a - b);

  const p95Latency = Number(percentile(durationValues, 95).toFixed(2));
  const errorRate = failedRequestValues.length
    ? Number(
        (
          failedRequestValues.reduce((sum, value) => sum + value, 0) /
          failedRequestValues.length
        ).toFixed(4)
      )
    : 0;
  const peakRps = Number(
    Math.max(0, ...Array.from(requestBuckets.values())).toFixed(2)
  );
  const passed = errorRate < 0.05 && p95Latency < 1000;

  return {
    p95Latency,
    errorRate,
    totalRequests,
    peakRps,
    passed,
  };
}

async function runLoadTest(targetUrl, scriptPath, envVars = {}) {
  const timestamp = Date.now();
  const resultsDir = path.resolve(process.cwd(), "results");
  const outputFile = path.join(resultsDir, `run-${timestamp}.json`);

  await fs.promises.mkdir(resultsDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const child = spawn(
      "k6",
      ["run", "--out", `json=${outputFile}`, scriptPath],
      {
        env: {
          ...process.env,
          ...envVars,
          TARGET_URL: targetUrl,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    const stdoutReader = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    stdoutReader.on("line", (line) => {
      loadGenEvents.emit("log", line);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        loadGenEvents.emit("log", line);
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", async (code) => {
      try {
        if (code !== 0) {
          reject(new Error(`k6 exited with code ${code}`));
          return;
        }

        const fileContents = await fs.promises.readFile(outputFile, "utf8");
        resolve(parseK6Results(fileContents));
      } catch (error) {
        reject(error);
      }
    });
  });
}

runLoadTest.events = loadGenEvents;

module.exports = {
  loadGenEvents,
  runLoadTest,
};
