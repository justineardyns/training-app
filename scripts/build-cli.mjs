// Bundelt de coach-CLI tot één bestand zonder afhankelijkheden (Node 20+).
import { build } from 'esbuild';
import { execSync } from 'node:child_process';

let version = 'dev';
try {
  version = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {}

await build({
  entryPoints: ['cli/coach-cli.ts'],
  outfile: 'dist/coach-cli.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: false,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  define: { 'process.env.COACH_VERSION': JSON.stringify(version) },
});
console.log('✓ dist/coach-cli.mjs', version);
