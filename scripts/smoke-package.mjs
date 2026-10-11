import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const temporary = await mkdtemp(join(tmpdir(), 'htmledit-package-'));
const userHome = join(temporary, 'user');
const env = {
  ...process.env,
  HTMLEDIT_USER_HOME: userHome,
  HTMLEDIT_HOME: join(userHome, '.htmledit'),
};
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run with npm run test:package');
async function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: temporary, env, windowsHide: true, ...options });
    let out = '',
      err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${args.join(' ')}: ${code}\n${err}\n${out}`)),
    );
  });
}
let runner;
let review;
try {
  const packed = JSON.parse(
    await run(
      process.execPath,
      [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary],
      { cwd: process.cwd() },
    ),
  )[0];
  assert(
    !packed.files.some((f) =>
      /(^|\/)(\.cache|\.htmledit|node_modules|tests|test-results)\//.test(f.path),
    ),
  );
  await mkdir(join(temporary, 'consumer'));
  // Exercise npm exec's local-tarball path, which installs and runs the package bin.
  const tarball = join(temporary, packed.filename);
  await run(
    process.execPath,
    [
      npm,
      'exec',
      '--yes',
      `--package=${tarball}`,
      '--',
      'htmledit',
      'install',
      '--agent',
      'all',
      '--json',
    ],
    { cwd: join(temporary, 'consumer') },
  );
  runner = join(userHome, '.agents', 'skills', 'htmledit', 'scripts', 'run.mjs');
  const original = join(temporary, '한글 document.html');
  await writeFile(original, '<html><body><h1>Package smoke</h1></body></html>');
  const opened = JSON.parse(
    await run(process.execPath, [runner, 'open', original, '--no-browser', '--json']),
  );
  review = opened.file;
  assert(review.endsWith('.review.html'));
  assert((await fetch(opened.url)).ok);
  const again = JSON.parse(
    await run(process.execPath, [runner, 'open', review, '--no-browser', '--json']),
  );
  assert.equal(again.url, opened.url);
  const checked = JSON.parse(
    await run(process.execPath, [runner, 'checkout', '--file', review, '--json']),
  );
  await writeFile(
    checked.candidate,
    (await readFile(checked.candidate, 'utf8')).replace('Package smoke', 'Applied candidate'),
  );
  const result = JSON.parse(
    await run(process.execPath, [
      runner,
      'apply',
      '--file',
      review,
      '--candidate',
      checked.candidate,
      '--revision',
      checked.revision,
      '--json',
    ]),
  );
  assert((await readFile(result.backup, 'utf8')).includes('Package smoke'));
  assert((await readFile(review, 'utf8')).includes('Applied candidate'));
  // Installer works without the npx cache: its script resolves the persistent runtime.
  assert((await readFile(runner, 'utf8')).includes('/.htmledit/versions/'));
  await run(process.execPath, [runner, 'install', '--agent', 'all']);
  await writeFile(
    join(userHome, '.agents', 'skills', 'htmledit', 'SKILL.md'),
    '\nuser customization',
    { flag: 'a' },
  );
  await assert.rejects(
    run(process.execPath, [runner, 'install', '--agent', 'all']),
    /INSTALL_CHANGED/,
  );
  await run(process.execPath, [runner, 'stop', '--file', review]);
  review = undefined;
  await run(process.execPath, [runner, 'uninstall', '--agent', 'claude']);
  assert((await readFile(original, 'utf8')).includes('Package smoke'));
  console.log(
    JSON.stringify(
      {
        passed: true,
        version: packed.version,
        files: packed.files.length,
        checks: [
          'npm exec tarball',
          'both skill installs',
          'persistent runtime',
          'open/reuse',
          'checkout/apply/backup',
          'reinstall',
          'modified-skill protection',
          'stop',
          'uninstall',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (review && runner)
    await run(process.execPath, [runner, 'stop', '--file', review]).catch(() => {});
  await rm(temporary, { recursive: true, force: true });
}
