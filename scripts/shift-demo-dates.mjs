// Move every demo date forward by N days, so a demo seeded weeks ago reads as "now".
//
//   node scripts/shift-demo-dates.mjs --days 56            dry run (changes rolled back)
//   node scripts/shift-demo-dates.mjs --days 56 --apply    really do it
//
// Uses DATABASE_URL. Everything happens in ONE transaction: it all moves, or nothing does.
//
// Why not just re-seed? The seed wipes every table, including anything testers did on the
// live demo since. Shifting keeps all of it. Use a whole number of weeks so every date keeps
// its weekday (timesheets stay on weekdays, payroll on the same day).
//
// Rules:
//  - Every timestamp/date column in every table moves by N days, EXCEPT
//      _prisma_migrations (Prisma's own log) and Holiday.date (holidays are calendar facts).
//  - Things that already HAPPENED (createdAt, approvedAt, clockIn, ... - any "...At" column,
//    plus clockIn/clockOut) must not end up in the future. Activity that happened after the
//    seed would, so those values are clamped to "now". Plans (dueDate, endDate, payDate, ...)
//    may legitimately be in the future and are left as shifted.
import pg from "pg";

const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1]);
const apply = args.includes("--apply");
if (!Number.isInteger(days) || args.indexOf("--days") < 0) {
  console.error("Usage: node scripts/shift-demo-dates.mjs --days <whole number> [--apply]");
  process.exit(2);
}
// --url-file <file>: read the connection string from a file (e.g. the gitignored .env.neon)
const fileArg = args.indexOf("--url-file");
const url = fileArg >= 0
  ? (await import("node:fs")).readFileSync(args[fileArg + 1], "utf8").trim().split(/\r?\n/)[0]
  : process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL or pass --url-file <file>.");
  process.exit(2);
}

// Dates the app writes out as WORDS when a record is created (inbox summaries, the coverage
// email and its notifications, offer letters, pay-stub notices). Formats, from the code that
// writes them: "Aug 16", "Sun Aug 9", "Sunday, August 9", "September 14, 2026". The audit
// log is left alone on purpose - it is a record of what happened.
// Each entry: table, text column, and the row's own timestamp used to work out the year
// of a year-less date ("Aug 16") - the year that puts it nearest that timestamp.
const TEXT_COLUMNS = [
  ["ApprovalRequest", "summary", "createdAt"],
  ["Notification", "body", "createdAt"],
  ["CoverageRequest", "emailSubject", "createdAt"],
  ["CoverageRequest", "emailBody", "createdAt"],
  ["OfferLetter", "body", "sentAt"],
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DATE_IN_TEXT = new RegExp(
  `\\b(?:(${DAYS.map((d) => d + "|" + d.slice(0, 3)).join("|")})(,?) )?` +
  `(${MONTHS.map((m) => m + "|" + m.slice(0, 3)).join("|")}) (\\d{1,2})\\b(?:, (\\d{4}))?`, "g");

function shiftText(text, n, ref) {
  return text.replace(DATE_IN_TEXT, (all, wd, comma, mon, day, year) => {
    const m = MONTHS.findIndex((x) => x.startsWith(mon));
    let y = year ? Number(year) : ref.getUTCFullYear();
    if (!year) {   // the year nearest the record's own timestamp
      const pick = [y - 1, y, y + 1].map((yy) => Date.UTC(yy, m, Number(day)));
      y = new Date(pick.reduce((a, b) => (Math.abs(b - ref) < Math.abs(a - ref) ? b : a))).getUTCFullYear();
    }
    const d = new Date(Date.UTC(y, m, Number(day)) + n * 86400000);
    const monName = mon.length === 3 ? MONTHS[d.getUTCMonth()].slice(0, 3) : MONTHS[d.getUTCMonth()];
    const wdName = wd ? (wd.length === 3 ? DAYS[d.getUTCDay()].slice(0, 3) : DAYS[d.getUTCDay()]) + comma + " " : "";
    return `${wdName}${monName} ${d.getUTCDate()}${year ? ", " + d.getUTCFullYear() : ""}`;
  });
}

const SKIP_TABLES = new Set(["_prisma_migrations"]);
const SKIP_COLUMNS = new Set(["Holiday.date"]);
const isEvent = (col) => /At$/.test(col) || col === "clockIn" || col === "clockOut";

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  const { rows: cols } = await client.query(`
    select table_name, column_name, data_type
      from information_schema.columns
     where table_schema = 'public'
       and data_type in ('timestamp without time zone', 'timestamp with time zone', 'date')
     order by table_name, column_name`);

  // Text first, while each row's timestamp is still the original (it decides the year).
  let rewritten = 0;
  for (const [t, col, refCol] of TEXT_COLUMNS) {
    const { rows } = await client.query(`select id, "${col}" v, "${refCol}" ref from "${t}" where "${col}" is not null`);
    for (const r of rows) {
      const ref = r.ref instanceof Date ? r.ref : new Date();
      const next = shiftText(r.v, days, ref);
      if (next !== r.v) {
        await client.query(`update "${t}" set "${col}" = $1 where id = $2`, [next, r.id]);
        rewritten++;
      }
    }
  }
  console.log(`  ${rewritten} text value(s) with dates written in words rewritten`);

  let moved = 0, clamped = 0, columns = 0;
  for (const { table_name: t, column_name: c, data_type: type } of cols) {
    if (SKIP_TABLES.has(t) || SKIP_COLUMNS.has(`${t}.${c}`)) continue;
    columns++;
    const r = await client.query(
      `update "${t}" set "${c}" = "${c}" + make_interval(days => $1) where "${c}" is not null`, [days]);
    moved += r.rowCount;
    if (isEvent(c)) {
      // Prisma stores DateTime as timestamp(3) WITHOUT time zone, in UTC. now() has
      // microseconds; storing it in a millisecond column ROUNDS, sometimes up - past now -
      // which made the check below fail about half the time. Truncate instead.
      const nowExpr = type === "timestamp with time zone" ? "now()" : "(now() at time zone 'UTC')";
      const now = `date_trunc('milliseconds', ${nowExpr})`;
      const k = await client.query(`update "${t}" set "${c}" = ${now} where "${c}" > ${nowExpr}`);
      if (k.rowCount) console.log(`  ${t}.${c}: ${k.rowCount} value(s) would have been in the future - set to now`);
      clamped += k.rowCount;
    }
  }

  // Check before committing: nothing that already happened may be in the future.
  const future = [];
  for (const { table_name: t, column_name: c, data_type: type } of cols) {
    if (SKIP_TABLES.has(t) || !isEvent(c)) continue;
    const now = type === "timestamp with time zone" ? "now()" : "(now() at time zone 'UTC')";
    const n = Number((await client.query(`select count(*) n from "${t}" where "${c}" > ${now}`)).rows[0].n);
    if (n) future.push(`${t}.${c} x${n}`);
  }
  if (future.length) throw new Error(`past events would be in the future (${future.join(", ")}) - nothing changed`);

  console.log(`${columns} date columns, ${moved} values moved ${days} days, ${clamped} clamped to now.`);
  if (apply) {
    await client.query("COMMIT");
    console.log("APPLIED.");
  } else {
    await client.query("ROLLBACK");
    console.log("Dry run - rolled back. Add --apply to really do it.");
  }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAILED, nothing changed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
