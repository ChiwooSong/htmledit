import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { LocalError } from './store';

// The browser never supplies a filesystem path. Only the native user's choice
// grants access to another document. No path or HTML is interpolated into code.
export async function pickHtmlFile(): Promise<string | null> {
  if (process.platform !== 'win32')
    throw new LocalError(
      'PICKER_UNSUPPORTED',
      '파일 선택 창은 Windows에서 지원합니다. 다른 환경에서는 AI에게 파일을 열어 달라고 요청해 주세요.',
    );
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'HTMLEdit - 다른 HTML 문서 열기'
$dialog.Filter = 'HTML 문서 (*.html;*.htm)|*.html;*.htm'
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
            new LocalError(
              'PICKER_FAILED',
              '파일 선택 창을 완료하지 못했습니다. 기존 문서는 유지됩니다. 다시 시도해 주세요.',
            ),
          );
        else resolve(stdout.trim() || null);
      },
    );
  });
}
