import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for the static site. They run against the built `out/`
// folder (npm run build first), served as plain files.
const PORT = Number(process.env.E2E_PORT ?? 4620);

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --directory out`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
