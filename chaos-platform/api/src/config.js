const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const requiredEnvVars = ["DATABASE_URL", "PROMETHEUS_URL"];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required env var: ${varName}`);
  }
}

module.exports = Object.freeze({
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  prometheusUrl: process.env.PROMETHEUS_URL,
  dockerHost: process.env.DOCKER_HOST,
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  targetUrl: process.env.TARGET_URL,
});
