/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { build as esbuild } from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// De app draait op https://<gebruiker>.github.io/training-app/
const base = process.env.BASE_PATH ?? '/training-app/';

function listPublicFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listPublicFiles(full, root) : [relative(root, full)];
  });
}

/**
 * Eigen, kleine service worker: precache van alle build-bestanden (offline in de gym)
 * + Web Push. Geen Workbox nodig.
 */
function serviceWorker(): Plugin {
  return {
    name: 'coach-service-worker',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const files = [
        ...Object.keys(bundle),
        ...listPublicFiles('public'),
      ].filter((f) => !f.endsWith('.map') && f !== 'sw.js' && !f.endsWith('coach-cli.mjs'));
      const precache = [...new Set(['', ...files])].sort();
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12);
      const result = await esbuild({
        entryPoints: ['src/sw.ts'],
        bundle: true,
        write: false,
        format: 'iife',
        minify: true,
        target: 'es2020',
        define: {
          __PRECACHE__: JSON.stringify(precache),
          __VERSION__: JSON.stringify(version),
        },
      });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: result.outputFiles[0]!.text });
    },
  };
}

export default defineConfig({
  base,
  plugins: [preact(), serviceWorker()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts', 'cli/**/*.test.ts'],
    environment: 'node',
  },
});
