const path = require("path");

const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const requiredVariables = [
  "DATABASE_URL",
  "REDIS_URL",
  "DOCKER_SOCKET",
  "PROMETHEUS_URL",
  "TOXIPROXY_API_URL",
  "TOXIPROXY_PROXY_PORT",
  "JWT_SECRET",
  "NODE_ENV",
  "PORT",
];

const missingVariables = requiredVariables.filter((name) => {
  const value = process.env[name];
  return typeof value !== "string" || value.trim().length === 0;
});

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVariables.join(", ")}`
  );
}

function parseInteger(name) {
  const rawValue = process.env[name];
  const parsedValue = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }

  return parsedValue;
}

const config = Object.freeze({
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  dockerSocket: process.env.DOCKER_SOCKET,
  prometheusUrl: process.env.PROMETHEUS_URL,
  toxiproxyApiUrl: process.env.TOXIPROXY_API_URL,
  toxiproxyProxyPort: parseInteger("TOXIPROXY_PROXY_PORT"),
  jwtSecret: process.env.JWT_SECRET,
  nodeEnv: process.env.NODE_ENV,
  port: parseInteger("PORT"),
});

module.exports = config;
