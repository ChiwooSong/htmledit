import { message, translate, type Locale } from '../../src/i18n';
import { win32 } from 'node:path';
import { LocalError } from './store';
import { runCommand, macGuiAvailable, type DesktopOptions } from './platform';

// The browser never supplies a filesystem path. Only the native user's choice
// grants access to another document. No path or HTML is interpolated into code.
const windowsScript = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = $env:HTMLEDIT_PICKER_TITLE
$dialog.Filter = $env:HTMLEDIT_PICKER_FILTER
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
$dialog.RestoreDirectory = $true
try {
  $owner.Show()
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write($dialog.FileName)
  }
} finally { $dialog.Dispose(); $owner.Dispose() }
`;
const macScript = `on run argv
  try
    set selectedFile to choose file with prompt (item 1 of argv) of type {"public.html"}
    return POSIX path of selectedFile
  on error errorText number errorNumber
    if errorNumber is -128 then return ""
    error errorText number errorNumber
  end try
end run`;

export async function pickHtmlFile(
  locale: Locale = 'en',
  options: DesktopOptions = {},
): Promise<string | null> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const title = translate(locale, 'pickerTitle');
  const filter = translate(locale, 'pickerFilter');
  let command: string;
  let args: string[];
  let commandEnv = env;
  if (platform === 'win32') {
    command = win32.join(
      env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    args = [
      '-NoProfile',
      '-STA',
      '-EncodedCommand',
      Buffer.from(windowsScript, 'utf16le').toString('base64'),
    ];
    commandEnv = {
      ...env,
      HTMLEDIT_PICKER_TITLE: title,
      HTMLEDIT_PICKER_FILTER: `${filter} (*.html;*.htm)|*.html;*.htm`,
    };
  } else if (platform === 'darwin') {
    if (!(await (options.macGui ?? macGuiAvailable)()))
      throw new LocalError('PICKER_UNAVAILABLE', message('pickerNeedsDesktop'));
    command = '/usr/bin/osascript';
    args = ['-e', macScript, title];
  } else if (platform === 'linux') {
    if (!env.DISPLAY && !env.WAYLAND_DISPLAY)
      throw new LocalError('PICKER_UNAVAILABLE', message('pickerNeedsDesktop'));
    command = 'zenity';
    args = [
      '--file-selection',
      `--title=${title}`,
      `--file-filter=${filter} | *.html *.htm *.HTML *.HTM`,
    ];
  } else throw new LocalError('PICKER_UNSUPPORTED', message('pickerPlatformUnsupported'));
  const result = await (options.run ?? runCommand)(command, args, {
    env: commandEnv,
    timeout: 300_000,
  });
  if (result.code === 'ENOENT')
    throw new LocalError(
      'PICKER_UNAVAILABLE',
      message('pickerToolMissing', { tool: platform === 'linux' ? 'zenity' : command }),
    );
  if (/cannot open display|cannot connect to display|failed to open display/i.test(result.stderr))
    throw new LocalError('PICKER_UNAVAILABLE', message('pickerNeedsDesktop'));
  if (platform === 'linux' && result.code === 1 && !result.killed) return null;
  if (result.code !== 0 || result.killed)
    throw new LocalError('PICKER_FAILED', message('couldNotCompleteFileSelectionYourDocument'));
  const selected = platform === 'win32' ? result.stdout : result.stdout.replace(/\r?\n$/, '');
  return selected || null;
}
