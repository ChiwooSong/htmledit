import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['scripts/local/cli.ts', 'scripts/local/platform.ts'],
  outdir: 'runtime',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
});
for (const agent of ['claude', 'codex']) {
  await mkdir(`skills/${agent}/htmledit/references`, { recursive: true });
  await copyFile('docs/REVIEW_FORMAT.md', `skills/${agent}/htmledit/references/review-format.md`);
}
