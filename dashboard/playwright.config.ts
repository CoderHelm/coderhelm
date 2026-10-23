import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3111);
const BASE_URL = `http://localhost:${PORT}`;

// The spec mocks every API call with page.route, so the dashboard is pointed at
// its own origin: nothing can reach a real backend.
//
// E2E_STATIC=1 serves the static export in out/ (CI builds it first with
// NEXT_PUBLIC_API_URL pointing here) instead of `next dev`: the build that
// ships, and no per-page compile, so workers can run side by side.
const STATIC = !!process.env.E2E_STATIC;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: STATIC ? 3 : 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: STATIC ? `node scripts/serve-out.mjs ${PORT}` : `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NEXT_PUBLIC_API_URL: BASE_URL, NEXT_PUBLIC_STREAM_URL: BASE_URL },
  },
});
