import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';

export type CommandResult = {
  stdout: string;
  stderr: string;
  code: number | string;
  killed?: boolean;
};
export type CommandRunner = (
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeout: number },
) => Promise<CommandResult>;
export const runCommand: CommandRunner = (command, args, options) =>
  new Promise((resolve) => {
    execFile(
      command,
      args,
      { ...options, windowsHide: true, maxBuffer: 64 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) =>
        resolve({ stdout, stderr, code: error?.code ?? 0, killed: error?.killed }),
    );
  });
export type DesktopOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  run?: CommandRunner;
  macGui?: () => Promise<boolean>;
};
export async function macGuiAvailable() {
  try {
    return (await stat('/dev/console')).uid === process.getuid?.();
  } catch {
    return false;
  }
}
export async function openBrowser(url: string, options: DesktopOptions = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  let command: string;
  let args: string[];
  if (platform === 'win32') {
    command = 'rundll32.exe';
    args = ['url.dll,FileProtocolHandler', url];
  } else if (platform === 'darwin') {
    command = '/usr/bin/open';
    args = [url];
  } else if (platform === 'linux' && (env.DISPLAY || env.WAYLAND_DISPLAY)) {
    command = 'xdg-open';
    args = [url];
  } else return false;
  const result = await (options.run ?? runCommand)(command, args, { env, timeout: 15_000 });
  return result.code === 0 && !result.killed;
}
