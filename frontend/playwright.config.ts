import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: real browsers against the real backend and a production
 * build of the frontend. Both servers start on their own ports with a fresh
 * SQLite database, so the run never touches your dev servers or data.
 *
 *   cd frontend && npm run test:e2e
 *
 * Needs the backend's Python dependencies installed for `python3` (or set
 * E2E_PYTHON), and a browser: `npx playwright install chromium`.
 */

const API_PORT = 8010;
const WEB_PORT = 3010;
const python = process.env.E2E_PYTHON ?? "python3";

export default defineConfig({
  testDir: "./e2e",
  // The tests share one seeded database and talk to each other in real time,
  // so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "api",
      cwd: "../backend",
      command: `rm -f e2e.db e2e.db-shm e2e.db-wal && ${python} -m uvicorn app.main:app --port ${API_PORT} --log-level warning`,
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        DATABASE_URL: "sqlite:///./e2e.db",
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        PURGE_INTERVAL_SECONDS: "1",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: "web",
      command: `npx next build && npx next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
        NEXT_DIST_DIR: ".next-e2e",
      },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
