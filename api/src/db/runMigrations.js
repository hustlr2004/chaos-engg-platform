const path = require("path");

const pgMigrate = require("node-pg-migrate").default;

const config = require("../config");

async function runMigrations() {
  await pgMigrate({
    databaseUrl: config.databaseUrl,
    dir: path.resolve(__dirname, "migrations"),
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    verbose: true,
  });
}

module.exports = {
  runMigrations,
};

if (require.main === module) {
  runMigrations().catch((error) => {
    console.error("Failed to run migrations:", error);
    process.exit(1);
  });
}
