import { describe, it, expect, vi } from 'vitest';
import { pickHtmlFile } from '../scripts/local/picker';
import { openBrowser, runCommand, type CommandResult } from '../scripts/local/platform';
const result = (code: number | string = 0, stdout = '', stderr = ''): CommandResult => ({
  code,
  stdout,
  stderr,
});

describe('native desktop integration', () => {
  it.each(['win32', 'darwin', 'linux'] as const)(
    'preserves selected Unicode paths on %s',
    async (platform) => {
      const path =
        platform === 'win32'
          ? "C:\\한글 日本語 ação\\quoted ' file.html"
          : "/tmp/한글 日本語 ação/quoted ' file.html ";
      const run = vi.fn().mockResolvedValue(result(0, path + (platform === 'win32' ? '' : '\n')));
      expect(
        await pickHtmlFile('ja', {
          platform,
          env: { DISPLAY: ':0' },
          macGui: async () => true,
          run,
        }),
      ).toBe(path);
      const [command, args, options] = run.mock.calls[0];
      expect([command, ...args].join(' ')).not.toContain(path);
      expect(options.timeout).toBe(300_000);
      if (platform === 'win32') {
        const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
        expect(script).toContain('$env:HTMLEDIT_PICKER_TITLE');
        expect(options.env.HTMLEDIT_PICKER_TITLE).toContain('別のHTML');
      } else if (platform === 'darwin') {
        expect(args[1]).toContain('errorNumber is -128');
        expect(args[1]).not.toContain('別のHTML');
        expect(args[2]).toContain('別のHTML');
      } else expect(args).toContain('--file-selection');
    },
  );
  it.each(['win32', 'darwin', 'linux'] as const)(
    'treats native cancellation as no selection on %s',
    async (platform) => {
      expect(
        await pickHtmlFile('en', {
          platform,
          env: { DISPLAY: ':0' },
          macGui: async () => true,
          run: async () => result(platform === 'linux' ? 1 : 0),
        }),
      ).toBeNull();
    },
  );
  it('distinguishes missing tools, display failure, timeout, and native errors', async () => {
    const options = { platform: 'linux' as const, env: { DISPLAY: ':0' } };
    await expect(
      pickHtmlFile('en', { ...options, run: async () => result('ENOENT') }),
    ).rejects.toMatchObject({ code: 'PICKER_UNAVAILABLE' });
    await expect(
      pickHtmlFile('en', {
        ...options,
        run: async () => result(1, '', 'Gtk-WARNING: cannot open display'),
      }),
    ).rejects.toMatchObject({ code: 'PICKER_UNAVAILABLE' });
    await expect(
      pickHtmlFile('en', { ...options, run: async () => ({ ...result(1), killed: true }) }),
    ).rejects.toMatchObject({ code: 'PICKER_FAILED' });
    await expect(
      pickHtmlFile('en', { ...options, run: async () => result(2) }),
    ).rejects.toMatchObject({ code: 'PICKER_FAILED' });
  });
  it('does not launch dialogs without a desktop or on unsupported platforms', async () => {
    const run = vi.fn();
    await expect(pickHtmlFile('en', { platform: 'linux', env: {}, run })).rejects.toMatchObject({
      code: 'PICKER_UNAVAILABLE',
    });
    await expect(
      pickHtmlFile('en', { platform: 'darwin', macGui: async () => false, run }),
    ).rejects.toMatchObject({ code: 'PICKER_UNAVAILABLE' });
    await expect(pickHtmlFile('en', { platform: 'freebsd', run })).rejects.toMatchObject({
      code: 'PICKER_UNSUPPORTED',
    });
    expect(run).not.toHaveBeenCalled();
  });
  it.each([
    ['win32', 'rundll32.exe'],
    ['darwin', '/usr/bin/open'],
    ['linux', 'xdg-open'],
  ] as const)('opens browsers with argument arrays on %s', async (platform, command) => {
    const run = vi.fn().mockResolvedValue(result());
    const url = 'http://127.0.0.1:12345/#htmledit=test&value=quoted';
    expect(await openBrowser(url, { platform, env: { DISPLAY: ':0' }, run })).toBe(true);
    expect(run.mock.calls[0][0]).toBe(command);
    expect(run.mock.calls[0][1].at(-1)).toBe(url);
  });
  it('reports browser nonzero exits, missing commands, timeouts and headless sessions', async () => {
    for (const failure of [result(3), result('ENOENT'), { ...result(), killed: true }])
      expect(
        await openBrowser('http://127.0.0.1:12345', {
          platform: 'linux',
          env: { DISPLAY: ':0' },
          run: async () => failure,
        }),
      ).toBe(false);
    const run = vi.fn();
    expect(await openBrowser('http://127.0.0.1:12345', { platform: 'linux', env: {}, run })).toBe(
      false,
    );
    expect(run).not.toHaveBeenCalled();
  });
  it('collects real process exit status without a shell', async () => {
    const actual = await runCommand(
      process.execPath,
      ['-e', 'process.stdout.write("ok"); process.stderr.write("details"); process.exit(7)'],
      { env: process.env, timeout: 5000 },
    );
    expect(actual).toMatchObject({ code: 7, stdout: 'ok', stderr: 'details' });
  });
});
