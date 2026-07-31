// Local dev database: real PostgreSQL via embedded-postgres (no install/admin
// needed — binaries live in node_modules). Data persists in .pgdata/.
// Run with: npm run db:dev   (keep the process running while you develop)

import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".pgdata");
const PORT = 54329;

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });

  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log("Initializing new Postgres data directory...");
    await pg.initialise();
  }

  await pg.start();
  try {
    await pg.createDatabase("canopy");
  } catch {
    // already exists
  }

  console.log("");
  console.log(`Postgres running on port ${PORT} (data: .pgdata/)`);
  console.log(
    `DATABASE_URL="postgres://postgres:postgres@localhost:${PORT}/canopy"`,
  );
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    console.log("\nStopping Postgres...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
