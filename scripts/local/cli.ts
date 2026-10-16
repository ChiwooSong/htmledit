import { Preferences } from './preferences';
import {
  message,
  describeError,
  formatMessage,
  translate,
  normalizeLocale,
  detectLocale,
  isMessage,
  type Locale,
} from '../../src/i18n';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  readFile,
  writeFile,
  mkdir,
  cp,
  readdir,
  rm,
  open,
  rename,
  realpath,
} from 'node:fs/promises';
import {
  canonicalFile,
  prepareFile,
  prepareSelectedFile,
  hash,
  snapshot,
  DocumentStore,
  LocalError,
} from './store';
import { startServer } from './server';
import { pickHtmlFile } from './picker';
import { openBrowser } from './platform';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userHome = process.env.HTMLEDIT_USER_HOME || homedir();
const home = process.env.HTMLEDIT_HOME || join(userHome, '.htmledit');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
type Connection = { origin: string; token: string; file: string; pid: number; version: string };
const registry = (file: string) =>
  join(home, 'sessions', `${hash(process.platform === 'win32' ? file.toLowerCase() : file)}.json`);
const rawArgs = process.argv.slice(2);
const languageIndex = rawArgs.indexOf('--lang');
const requestedLanguage = languageIndex < 0 ? undefined : rawArgs[languageIndex + 1];
const args =
  languageIndex < 0
    ? rawArgs
    : rawArgs.filter((_, index) => index !== languageIndex && index !== languageIndex + 1);
const preferences = new Preferences(join(home, 'preferences.json'));
let cliLocale: Locale = 'en';
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const output = (value: unknown) =>
  console.log(
    JSON.stringify(
      value,
      (_key, item) => (isMessage(item) ? formatMessage(cliLocale, item) : item),
      args.includes('--json') ? undefined : 2,
    ),
  );
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(connection: Connection, path: string, method = 'GET', data?: unknown) {
  const response = await fetch(`${connection.origin}/api/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${connection.token}`,
      'Content-Type': 'application/json',
      'Accept-Language': cliLocale,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(30_000),
  });
  const value = await response.json();
  if (!response.ok) {
    const display = { key: value.messageKey, params: value.messageParams };
    throw new LocalError(value.code, isMessage(display) ? display : value.message, response.status);
  }
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
      throw new LocalError('BUSY', message('theServerIsStartingTryAgain'));
    }
    let alive = true;
    try {
      process.kill(pid!, 0);
    } catch (error) {
      alive = (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
    if (alive) throw new LocalError('BUSY', message('thisTaskIsAlreadyRunningOrStarting'));
    await rm(lock, { force: true });
    await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  }
  try {
    const instance = await startServer(
      file,
      join(root, 'dist'),
      async (locale) => {
        const selected = await pickHtmlFile(locale);
        if (!selected) return null;
        const next = await ensure(await prepareSelectedFile(selected));
        return { url: `${next.origin}/#htmledit=${next.token}` };
      },
      preferences,
    );
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
      throw new LocalError('VERSION', message('aDifferentServerVersionIsRunningSave'));
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
  throw new LocalError('START_FAILED', message('serverLog', { file: `${registry(file)}.log` }));
}
async function hashes(directory: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    if (entry.name === '.htmledit-install.json') continue;
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, await hashes(directory, relative));
    else if (entry.isFile()) result[relative] = hash(await readFile(join(directory, relative)));
    else
      throw new LocalError('INSTALL_CHANGED', message('theSkillFolderContainsAnUnsupportedLink'));
  }
  return result;
}
async function managed(directory: string) {
  try {
    const actual = await hashes(directory);
    const saved = JSON.parse(await readFile(join(directory, '.htmledit-install.json'), 'utf8'));
    if (saved.owner !== 'htmledit' || JSON.stringify(actual) !== JSON.stringify(saved.hashes))
      throw new LocalError('INSTALL_CHANGED', message('modifiedSkill', { file: directory }));
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
      throw new LocalError('INSTALL_CHANGED', message('unmanagedSkill', { file: directory }));
    }
    throw error;
  }
}
async function install(uninstall = false) {
  const agent = option('--agent') ?? 'all';
  if (!['claude', 'codex', 'all'].includes(agent))
    throw new LocalError('AGENT', message('chooseAgentClaudeCodexOrAll'));
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
      message: message('documentsBackupsAndRuntimeWerePreserved'),
    });
    return;
  }
  const runtime = join(home, 'versions', manifest.version);
  await mkdir(runtime, { recursive: true });
  const sameRuntime = (await realpath(root)) === (await realpath(runtime));
  for (const name of [
    'dist',
    'runtime',
    'bin',
    'skills',
    'docs',
    'README.md',
    'package.json',
    'LICENSE',
  ]) {
    if (!sameRuntime) await cp(join(root, name), join(runtime, name), { recursive: true });
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
    message: message('selectTheHtmleditSkillInClaudeCode'),
  });
}
async function main() {
  const system = detectLocale([
    process.env.LC_ALL ?? '',
    process.env.LC_MESSAGES ?? '',
    process.env.LANG ?? '',
    Intl.DateTimeFormat().resolvedOptions().locale,
  ]);
  let saved: 'auto' | Locale = 'auto';
  try {
    saved = (await preferences.read()).language;
  } catch {
    console.error(translate(system, 'preferencesReadFailed'));
  }
  cliLocale = saved === 'auto' ? system : saved;
  if (languageIndex >= 0) {
    const normalized = normalizeLocale(requestedLanguage ?? '');
    if (!normalized)
      throw new LocalError('INPUT', message('invalidLanguage', { value: requestedLanguage ?? '' }));
    cliLocale = normalized;
  }
  const command = args[0];
  if (command === 'install' || command === 'uninstall') return install(command === 'uninstall');
  if (command === '--version') return output({ version: manifest.version });
  if (command === '_serve') return serve(await canonicalFile(args[1]));
  if (command === 'open') {
    if (!args[1] || args[1].startsWith('--'))
      throw new LocalError('INPUT', message('provideOpenHtmlPath'));
    const file = await prepareFile(args[1]);
    const connection = await ensure(file);
    const url = `${connection.origin}/${languageIndex >= 0 ? '?lang=' + encodeURIComponent(cliLocale) : ''}#htmledit=${connection.token}`;
    if (!args.includes('--no-browser') && !(await openBrowser(url)))
      console.error(translate(cliLocale, 'couldNotOpenTheBrowserAutomaticallyOpen'));
    return output({ file, url, version: connection.version });
  }
  if (command === 'requests') {
    const name = option('--file');
    if (!name) throw new LocalError('INPUT', message('provideFileWorkingFile'));
    const batch = option('--batch');
    if (batch && !/^[0-9a-f-]{36}$/.test(batch))
      throw new LocalError('REQUEST_INPUT', 'Invalid request batch ID.');
    const running = await ensure(await canonicalFile(name));
    const route = `change-requests${batch ? '/' + batch : ''}`;
    if (args[1] === 'status') return output(await request(running, route));
    if (!batch) throw new LocalError('REQUEST_INPUT', 'Provide --batch <request batch ID>.');
    if (args[1] === 'checkout')
      return output(await request(running, route + '/checkout', 'POST', {}));
    if (args[1] === 'submit') {
      const candidate = option('--candidate'),
        revision = option('--revision');
      if (!candidate || !revision)
        throw new LocalError('INPUT', message('provideCandidateAndRevision'));
      const info = await import('node:fs/promises').then((fs) => fs.stat(candidate));
      if (!info.isFile() || info.size > 10 * 1024 * 1024)
        throw new LocalError('REQUEST_INPUT', 'Proposal file is too large or invalid.');
      const bytes = await readFile(candidate);
      if (bytes.length > 10 * 1024 * 1024)
        throw new LocalError('REQUEST_INPUT', 'Proposal file is too large.');
      const submission = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      return output(await request(running, route + '/submit', 'POST', { revision, submission }));
    }
    throw new LocalError('REQUEST_INPUT', 'Use requests status|checkout|submit.');
  }
  if (['status', 'checkout', 'apply', 'stop'].includes(command)) {
    const name = option('--file');
    if (!name) throw new LocalError('INPUT', message('provideFileWorkingFile'));
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
      throw new LocalError('INPUT', message('provideCandidateAndRevision'));
    const value = await snapshot(await canonicalFile(candidate));
    const result = await request(running, 'apply', 'POST', { html: value.html, revision });
    return output({ file, revision: result.revision, backup: result.backup });
  }
  console.log(
    'HTMLEdit\n  install --agent claude|codex|all\n  open <file.html> [--no-browser]\n  status|checkout|stop --file <file.review.html>\n  apply --file <file.review.html> --candidate <file> --revision <hash>\n  uninstall --agent claude|codex|all\n' +
      '  requests status|checkout|submit --file <review.html> [--batch <id>] [--candidate <json> --revision <hash>]\n' +
      translate(cliLocale, 'cliHelp') +
      '',
  );
  if (command && !['--help', '-h'].includes(command)) process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      code: error instanceof LocalError ? error.code : 'IO',
      message: formatMessage(cliLocale, describeError(error)),
      ...(isMessage(describeError(error))
        ? {
            messageKey: (describeError(error) as import('../../src/i18n').Message).key,
            messageParams: (describeError(error) as import('../../src/i18n').Message).params,
          }
        : {}),
    }),
  );
  process.exitCode = 1;
});
