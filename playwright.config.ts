import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173/training-app/',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/training-app/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
