// Opt-in real-agent validation; never run by CI. Uses the user's existing agent authentication.
import { spawn } from 'node:child_process';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
const agent = process.argv[2];
if (!['claude', 'codex'].includes(agent))
  throw new Error('Usage: node scripts/smoke-ai.mjs claude|codex');
const directory = resolve('.cache', 'skill-live', agent);
await mkdir(directory, { recursive: true });
const file = join(directory, 'sample.review.html');
await copyFile('public/examples/onyu-studio.review.html', file);
const skill = join(homedir(), agent === 'claude' ? '.claude' : '.agents', 'skills', 'htmledit');
const prompt = `Use the htmledit skill at ${join(skill, 'SKILL.md')} to apply the saved pending notes in ${file}. This is an authorized local integration test. Read the skill and follow checkout/apply. Do not open a browser window; if opening the file use --no-browser. Only modify the candidate returned by checkout and this test file through apply. Do not modify source code, other user files, or install anything. Do not spawn other agents. Report completed notes and actual checks performed. Stop after one failed API/authentication attempt.`;
const args =
  agent === 'claude'
    ? [
        '--bare',
        '-p',
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        'Read,Edit,Write,Bash(node *),Bash(python *)',
        '--max-budget-usd',
        '2',
        '--no-session-persistence',
        '--output-format',
        'json',
      ]
    : [
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
        '--json',
        '-C',
        directory,
        '-',
      ];
const child = spawn(agent, args, {
  cwd: directory,
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stdout = '',
  stderr = '';
child.stdout.on('data', (value) => (stdout += value));
child.stderr.on('data', (value) => (stderr += value));
const timeout = setTimeout(() => {
  child.kill();
}, 240_000);
child.stdin.end(prompt);
child.on('error', (error) => {
  console.error(error.message);
  clearTimeout(timeout);
  process.exitCode = 1;
});
child.on('close', async (code) => {
  clearTimeout(timeout);
  await writeFile(join(directory, 'agent-output.log'), stdout + '\n' + stderr);
  const result = await readFile(file, 'utf8');
  const block = result.match(/<script[^>]*id="htmledit-review"[^>]*>([\s\S]*?)<\/script>/);
  const notes = block ? JSON.parse(block[1]).notes : [];
  console.log(
    JSON.stringify({
      agent,
      exitCode: code,
      done: notes.filter((n) => n.done).length,
      total: notes.length,
      log: join(directory, 'agent-output.log'),
    }),
  );
  const cleanup = spawn(
    process.execPath,
    [join(skill, 'scripts', 'run.mjs'), 'stop', '--file', file],
    { windowsHide: true, stdio: 'ignore' },
  );
  cleanup.on('error', () => {});
});
