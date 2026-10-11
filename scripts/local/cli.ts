import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { readFile, writeFile, mkdir, cp, readdir, rm, open, rename } from 'node:fs/promises';
import { canonicalFile, prepareFile, hash, snapshot, DocumentStore, LocalError } from './store';
import { startServer } from './server';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userHome = process.env.HTMLEDIT_USER_HOME || homedir();
const home = process.env.HTMLEDIT_HOME || join(userHome, '.htmledit');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
type Connection = { origin: string; token: string; file: string; pid: number; version: string };
const registry = (file: string) =>
  join(home, 'sessions', `${hash(process.platform === 'win32' ? file.toLowerCase() : file)}.json`);
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const output = (value: unknown) =>
  console.log(JSON.stringify(value, null, args.includes('--json') ? undefined : 2));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(connection: Connection, path: string, method = 'GET', data?: unknown) {
  const response = await fetch(`${connection.origin}/api/${path}`, {
    method,
    headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(30_000),
  });
  const value = await response.json();
  if (!response.ok) throw new LocalError(value.code, value.message, response.status);
  return value;
}
async function live(file: string): Promise<Connection | undefined> {
  try {
    const connection: Connection = JSON.parse(await readFile(registry(file), 'utf8'));
    if (connection.file !== file || !/^http:\/\/127\.0\.0\.1:\d+$/.test(connection.origin)) return;
    const response = await fetch(`${connection.origin}/api/status`, {
      headers: { Authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok && (await response.json()).file === file) return connection;
  } catch {
    /* A stale registry is not a running server. */
  }
}
async function serve(file: string) {
  await mkdir(join(home, 'sessions'), { recursive: true });
  const lock = `${registry(file)}.lock`;
  try {
    await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let pid: number;
    try {
      pid = Number(await readFile(lock, 'utf8'));
    } catch {
      throw new LocalError('BUSY', '서버가 시작 중입니다. 다시 시도해 주세요.');
    }
    let alive = true;
    try {
      process.kill(pid!, 0);
    } catch (error) {
      alive = (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
    if (alive) throw new LocalError('BUSY', '이미 실행 중이거나 시작 중인 작업입니다.');
    await rm(lock, { force: true });
    await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  }
  try {
    const instance = await startServer(file, join(root, 'dist'));
    const connection: Connection = {
      origin: instance.origin,
      token: instance.token,
      file,
      pid: process.pid,
      version: manifest.version,
    };
    await writeFile(registry(file), JSON.stringify(connection), { mode: 0o600 });
    const stop = () => {
      instance.server.close();
      instance.server.closeIdleConnections();
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    await new Promise<void>((resolve) => instance.server.once('close', resolve));
    await rm(registry(file), { force: true });
  } finally {
    await rm(lock, { force: true });
  }
}
async function ensure(file: string) {
  const existing = await live(file);
  if (existing) {
    if (existing.version !== manifest.version)
      throw new LocalError(
        'VERSION',
        '다른 버전의 서버가 실행 중입니다. 브라우저 작업을 저장한 뒤 stop으로 종료하고 다시 열어 주세요.',
      );
    return existing;
  }
  await mkdir(join(home, 'sessions'), { recursive: true });
  const log = await open(`${registry(file)}.log`, 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '_serve', file], {
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
    windowsHide: true,
  });
  let launchError: Error | undefined;
  child.once('error', (error) => {
    launchError = error;
  });
  child.unref();
  await log.close();
  for (let i = 0; i < 60; i++) {
    if (launchError) throw launchError;
    await delay(100);
    const connection = await live(file);
    if (connection) return connection;
  }
  throw new LocalError('START_FAILED', `서버를 시작하지 못했습니다. 로그: ${registry(file)}.log`);
}
function browser(url: string) {
  let child;
  if (process.platform === 'win32')
    child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
  else
    child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
      detached: true,
      stdio: 'ignore',
    });
  child.on('error', () =>
    console.error('브라우저를 자동으로 열지 못했습니다. 출력한 URL을 열어 주세요.'),
  );
  child.unref();
}
async function hashes(directory: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    if (entry.name === '.htmledit-install.json') continue;
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, await hashes(directory, relative));
    else if (entry.isFile()) result[relative] = hash(await readFile(join(directory, relative)));
    else throw new LocalError('INSTALL_CHANGED', '스킬 폴더에 지원하지 않는 링크가 있습니다.');
  }
  return result;
}
async function managed(directory: string) {
  try {
    const actual = await hashes(directory);
    const saved = JSON.parse(await readFile(join(directory, '.htmledit-install.json'), 'utf8'));
    if (saved.owner !== 'htmledit' || JSON.stringify(actual) !== JSON.stringify(saved.hashes))
      throw new LocalError(
        'INSTALL_CHANGED',
        `기존 스킬을 수정했거나 다른 스킬이 있습니다. 먼저 별도 보관해 주세요: ${directory}`,
      );
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Distinguish missing directory from an unmanaged skill with no receipt.
      try {
        await readdir(directory);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw e;
      }
      throw new LocalError('INSTALL_CHANGED', `관리되지 않는 기존 스킬입니다: ${directory}`);
    }
    throw error;
  }
}
async function install(uninstall = false) {
  const agent = option('--agent') ?? 'all';
  if (!['claude', 'codex', 'all'].includes(agent))
    throw new LocalError('AGENT', '--agent claude|codex|all 중 선택해 주세요.');
  const agents = agent === 'all' ? ['claude', 'codex'] : [agent];
  const destinations = agents.map((a) => ({
    agent: a,
    path: join(userHome, a === 'claude' ? '.claude' : '.agents', 'skills', 'htmledit'),
  }));
  for (const target of destinations) await managed(target.path);
  if (uninstall) {
    for (const target of destinations)
      if (await managed(target.path)) await rm(target.path, { recursive: true });
    output({
      removed: destinations.map((t) => t.path),
      message: '문서·백업·실행 도구는 보존했습니다.',
    });
    return;
  }
  const runtime = join(home, 'versions', manifest.version);
  await mkdir(runtime, { recursive: true });
  for (const name of ['dist', 'runtime', 'bin', 'skills', 'package.json', 'LICENSE']) {
    if (resolve(root) !== resolve(runtime))
      await cp(join(root, name), join(runtime, name), { recursive: true });
  }
  for (const target of destinations) {
    const staging = `${target.path}.install-${process.pid}`;
    await mkdir(dirname(staging), { recursive: true });
    await cp(join(root, 'skills', target.agent, 'htmledit'), staging, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await mkdir(join(staging, 'scripts'), { recursive: true });
    await writeFile(
      join(staging, 'scripts', 'run.mjs'),
      `#!/usr/bin/env node\nimport ${JSON.stringify(pathToFileURL(join(runtime, 'runtime', 'cli.mjs')).href)};\n`,
    );
    await writeFile(
      join(staging, '.htmledit-install.json'),
      JSON.stringify({
        owner: 'htmledit',
        version: manifest.version,
        hashes: await hashes(staging),
      }),
    );
    if (await managed(target.path)) await rm(target.path, { recursive: true });
    await rename(staging, target.path);
  }
  output({
    installed: destinations.map((t) => t.path),
    version: manifest.version,
    runtime,
    message: 'Claude Code/Codex에서 htmledit 스킬을 선택하세요. 보이지 않으면 새 세션을 여세요.',
  });
}
async function main() {
  const command = args[0];
  if (command === 'install' || command === 'uninstall') return install(command === 'uninstall');
  if (command === '--version') return output({ version: manifest.version });
  if (command === '_serve') return serve(await canonicalFile(args[1]));
  if (command === 'open') {
    if (!args[1] || args[1].startsWith('--'))
      throw new LocalError('INPUT', 'open <HTML 경로>가 필요합니다.');
    const file = await prepareFile(args[1]);
    const connection = await ensure(file);
    const url = `${connection.origin}/#htmledit=${connection.token}`;
    if (!args.includes('--no-browser')) browser(url);
    return output({ file, url, version: connection.version });
  }
  if (['status', 'checkout', 'apply', 'stop'].includes(command)) {
    const name = option('--file');
    if (!name) throw new LocalError('INPUT', '--file <작업 파일>이 필요합니다.');
    const file = await canonicalFile(name);
    const connection = await live(file);
    if (command === 'status')
      return output({
        connected: Boolean(connection),
        ...(await new DocumentStore(file).status()),
      });
    if (command === 'stop')
      return output(
        connection
          ? await request(connection, 'stop', 'POST')
          : { stopped: true, alreadyStopped: true },
      );
    const running = connection ?? (await ensure(file));
    if (command === 'checkout') return output(await request(running, 'checkout', 'POST'));
    const candidate = option('--candidate');
    const revision = option('--revision');
    if (!candidate || !revision)
      throw new LocalError('INPUT', '--candidate와 --revision이 필요합니다.');
    const value = await snapshot(await canonicalFile(candidate));
    const result = await request(running, 'apply', 'POST', { html: value.html, revision });
    return output({ file, revision: result.revision, backup: result.backup });
  }
  console.log(
    'HTMLEdit\n  install --agent claude|codex|all\n  open <file.html> [--no-browser]\n  status|checkout|stop --file <file.review.html>\n  apply --file <file.review.html> --candidate <file> --revision <hash>\n  uninstall --agent claude|codex|all\n명령 결과는 JSON이며 --json으로 간결하게 출력합니다.',
  );
  if (command && !['--help', '-h'].includes(command)) process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      code: error instanceof LocalError ? error.code : 'IO',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
