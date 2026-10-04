import { defineConfig } from "@playwright/test";

// Browser tests of the real flows, run against a production build and a throwaway, freshly
// seeded database (CI starts one in a Postgres service; locally use `npm run db:dev`).
//   npm run build && npm run test:e2e
// PW_CHANNEL=msedge uses an installed Edge instead of Playwright's own Chromium.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1, // the flows share one seeded database
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100/login",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
