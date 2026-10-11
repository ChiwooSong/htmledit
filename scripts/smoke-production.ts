import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against the built app launched by start.cmd / npm start.
await mkdir('docs/screenshots', { recursive: true });
const results = [];
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('heading', { name: '화면에서 고치고, 메모로 전달하세요.' }).waitFor();
    if (channel === 'chrome') await page.screenshot({ path: 'docs/screenshots/welcome.png' });
    await page.getByRole('button', { name: /예제 문서로 둘러보기/ }).click();
    await page.frameLocator('iframe').locator('h1').click();
    await page.getByRole('textbox', { name: '문구 1', exact: true }).fill('실행 확인 문구,');
    await page.getByRole('button', { name: '문구 적용', exact: true }).first().click();
    assert.ok(
      (await page.frameLocator('iframe').locator('h1').textContent())?.includes('실행 확인 문구,'),
    );
    await page.getByRole('button', { name: '메모 남기기', exact: true }).click();
    await page.frameLocator('iframe').locator('h1').click();
    await page
      .getByRole('textbox', { name: '수정 요청', exact: true })
      .fill('이 제목 앞에 집 아이콘을 넣어주세요.');
    await page.getByRole('button', { name: '메모 추가', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'AI 전달용 저장', exact: true }).click();
    const file = await pending;
    assert.equal(file.suggestedFilename(), 'onyu-studio.review.html');
    if (channel === 'chrome') {
      await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
      await page.screenshot({ path: 'docs/screenshots/editor-notes.png' });
    }
    assert.deepEqual(errors, []);
    results.push({
      channel,
      version: browser.version(),
      title: await page.title(),
      checks: [
        'built app opens',
        'text edit',
        'anchored note',
        'review download',
        'no runtime errors',
      ],
    });
  } finally {
    await browser.close();
  }
}
await writeFile(
  'docs/production-smoke.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2) + '\n',
);
console.log(
  '실행 파일로 시작한 완성 빌드: Chrome·Edge 열기 / 문구 수정 / 메모 / 전달용 저장 통과.',
);
