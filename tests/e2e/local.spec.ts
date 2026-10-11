import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { prepareFile } from '../../scripts/local/store';
import { startServer } from '../../scripts/local/server';

test('작업 파일 저장, 외부 변경 갱신, 충돌과 임시 복구', async ({ page }, testInfo) => {
  const directory = await mkdtemp(join(tmpdir(), 'htmledit-browser-'));
  const original = join(directory, '브라우저 문서.html');
  await writeFile(
    original,
    '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>공유 문서</h1><p>설명</p></body></html>',
  );
  const file = await prepareFile(original);
  const service = await startServer(file, resolve('dist'));
  try {
    await page.goto(service.url);
    const frame = page.frameLocator('iframe[sandbox="allow-same-origin"]');
    await expect(frame.locator('h1')).toHaveText('공유 문서');
    await expect(page).not.toHaveURL(/htmledit=/);
    await frame.locator('h1').click();
    await page.getByRole('textbox', { name: '문구 1', exact: true }).fill('브라우저가 저장한 제목');
    await page.getByRole('button', { name: '문구 적용', exact: true }).click();
    await page.getByRole('button', { name: '작업 파일 저장', exact: true }).click();
    await expect(page.getByText(/작업 파일을 저장했습니다/)).toBeVisible();
    expect(await readFile(file, 'utf8')).toContain('브라우저가 저장한 제목');
    expect(await readFile(original, 'utf8')).toContain('공유 문서');
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace('브라우저가 저장한 제목', 'AI가 반영한 제목'),
    );
    await expect(frame.locator('h1')).toHaveText('AI가 반영한 제목');
    await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
    await frame.locator('h1').click();
    await page
      .getByRole('textbox', { name: '문구 1', exact: true })
      .fill('아직 저장하지 않은 작업');
    await page.getByRole('button', { name: '문구 적용', exact: true }).click();
    await expect(page.getByText(/임시 저장.*\d/)).toBeVisible();
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace('AI가 반영한 제목', '다른 탭의 변경'),
    );
    await expect(
      page.getByRole('button', { name: '디스크 버전 다시 열기', exact: true }),
    ).toBeVisible();
    await expect(frame.locator('h1')).toHaveText('아직 저장하지 않은 작업');
    await expect(page.getByRole('button', { name: '작업 파일 저장', exact: true })).toBeDisabled();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '내 작업 별도 저장' }).click();
    const download = await downloadPromise;
    expect(await readFile((await download.path())!, 'utf8')).toContain('아직 저장하지 않은 작업');
    // A new tab shares the file, but gets its own authenticated session storage.
    const restored = await page.context().newPage();
    await restored.goto(service.url);
    await expect(restored.getByRole('button', { name: '연결 작업 복구' })).toBeVisible();
    await restored.getByRole('button', { name: '연결 작업 복구' }).click();
    await expect(restored.frameLocator('iframe').locator('h1')).toHaveText(
      '아직 저장하지 않은 작업',
    );
    await expect(
      restored.getByRole('button', { name: '작업 파일 저장', exact: true }),
    ).toBeDisabled();
    await restored.close();
    if (testInfo.project.name === 'chrome') {
      await mkdir('.cache', { recursive: true });
      await page.screenshot({ path: '.cache/local-connection.png', fullPage: true });
    }
    await page.getByRole('button', { name: '디스크 버전 다시 열기', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '디스크 버전 다시 열기' }).click();
    await expect(frame.locator('h1')).toHaveText('다른 탭의 변경');
  } finally {
    const closed = once(service.server, 'close');
    service.server.close();
    service.server.closeAllConnections();
    await closed;
    await rm(directory, { recursive: true, force: true });
  }
});

test('문서 조작 스크립트가 연결 토큰과 파일 API에 접근하지 못한다', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'htmledit-isolation-'));
  const original = join(directory, 'isolation.html');
  await writeFile(
    original,
    `<html><body><h1>격리 확인</h1><script>
    try { parent.sessionStorage.getItem('htmledit-connection'); document.body.dataset.parent='exposed'; } catch { document.body.dataset.parent='blocked'; }
    fetch('/api/document').then(r => document.body.dataset.api=String(r.status)).catch(() => document.body.dataset.api='blocked');
    </script></body></html>`,
  );
  const file = await prepareFile(original);
  const service = await startServer(file, resolve('dist'));
  try {
    await page.goto(service.url);
    await expect(page.frameLocator('iframe').locator('h1')).toHaveText('격리 확인');
    await page.getByRole('button', { name: '문서 조작', exact: true }).click();
    const frame = page.frameLocator('iframe[sandbox="allow-scripts"]');
    await expect(frame.locator('body')).toHaveAttribute('data-parent', 'blocked');
    await expect(frame.locator('body')).toHaveAttribute('data-api', 'blocked');
    expect(
      await page.locator('iframe[sandbox="allow-scripts"]').getAttribute('srcdoc'),
    ).not.toContain(service.token);
  } finally {
    const closed = once(service.server, 'close');
    service.server.close();
    service.server.closeAllConnections();
    await closed;
    await rm(directory, { recursive: true, force: true });
  }
});
