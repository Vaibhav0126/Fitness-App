import { defineConfig, devices } from "@playwright/test";

/*
 * Smoke test against a production build. Needs a Postgres whose database name
 * contains "test" (E2E_DATABASE_URL), migrated. Emails go to .e2e/outbox.
 *   pnpm build && pnpm test:e2e
 */
const PORT = 3200;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:55432/train_test";
if (!/test/.test(new URL(DATABASE_URL).pathname))
  throw new Error("E2E_DATABASE_URL must point at a *test* database");

export default defineConfig({
  testDir: "test/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      APP_URL: `http://localhost:${PORT}`,
      ALLOW_CONSOLE_EMAIL: "true",
      EMAIL_OUTBOX_DIR: ".e2e/outbox",
    },
  },
});
