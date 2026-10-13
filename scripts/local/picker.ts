import { message, translate, type Locale } from '../../src/i18n';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { LocalError } from './store';

// The browser never supplies a filesystem path. Only the native user's choice
// grants access to another document. No path or HTML is interpolated into code.
export async function pickHtmlFile(locale: Locale = 'en'): Promise<string | null> {
  if (process.platform !== 'win32')
    throw new LocalError('PICKER_UNSUPPORTED', message('theFilePickerIsSupportedOnWindows'));
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '${translate(locale, 'pickerTitle').replaceAll("'", "''")}'
$dialog.Filter = '${translate(locale, 'pickerFilter').replaceAll("'", "''")} (*.html;*.htm)|*.html;*.htm'
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
  return new Promise((resolve, reject) => {
    execFile(
      join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 300_000, maxBuffer: 64 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error)
          reject(
            new LocalError('PICKER_FAILED', message('couldNotCompleteFileSelectionYourDocument')),
          );
        else resolve(stdout.trim() || null);
      },
    );
  });
}
