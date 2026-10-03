// Save every table to one JSON file - a quick, readable backup before a risky change.
//
//   node scripts/export-db.mjs <out.json> [--url-file .env.neon]
//
// Read-only: runs inside a READ ONLY transaction. Uses DATABASE_URL, or the first line of
// --url-file (the gitignored file holding the production connection string).
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const out = args[0];
const fileArg = args.indexOf("--url-file");
const url = fileArg >= 0 ? readFileSync(args[fileArg + 1], "utf8").trim().split(/\r?\n/)[0] : process.env.DATABASE_URL;
if (!out || !url) {
  console.error("Usage: node scripts/export-db.mjs <out.json> [--url-file <file>]");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN TRANSACTION READ ONLY");
  const tables = (await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).rows.map((r) => r.table_name);
  const dump = { exportedAt: new Date().toISOString(), tables: {} };
  let rows = 0;
  for (const t of tables) {
    dump.tables[t] = (await client.query(`select * from "${t}"`)).rows;
    rows += dump.tables[t].length;
  }
  await client.query("ROLLBACK");
  writeFileSync(out, JSON.stringify(dump));
  console.log(`Exported ${tables.length} tables, ${rows} rows -> ${out}`);
} finally {
  await client.end();
}
