import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { translate, locales } from '../../src/i18n';
const pixel =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const html =
  '<!doctype html><html lang="ko"><body><h1>제목</h1><div><p>한글 <strong>강조</strong></p></div><ul><li>항목</li></ul></body></html>';
async function open(page: Page) {
  await page.goto('/');
  await page.getByTestId('html-file').setInputFiles({
    name: '이미지 日本語 ação.html',
    mimeType: 'text/html',
    buffer: Buffer.from(html),
  });
  await page.frameLocator('iframe').locator('h1').click();
  await page.getByRole('button', { name: '이미지 삽입', exact: true }).click();
}
async function file(page: Page) {
  await page.getByTestId('image-file').setInputFiles({
    name: '사진 日本語 ação.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pixel, 'base64'),
  });
  await expect(page.getByRole('button', { name: '이미지 적용', exact: true })).toBeEnabled();
}
async function download(page: Page, name: string) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const result = await waiting;
  return readFile((await result.path())!, 'utf8');
}
test('preview is disposable; insertion, notes, undo and exports preserve image bytes', async ({
  page,
}, info) => {
  await open(page);
  await file(page);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('h1 + img')).toHaveAttribute('src', `data:image/png;base64,${pixel}`);
  await expect(page.locator('.unsaved-dot')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  expect(await download(page, '완성본 저장')).not.toContain('data:image');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(frame.locator('img')).toHaveCount(0);
  await page.getByRole('button', { name: '이미지 삽입', exact: true }).click();
  await file(page);
  await page.getByLabel('이미지 크기', { exact: true }).selectOption('percent');
  await page.getByLabel('너비 (%)', { exact: true }).fill('50');
  await page.getByLabel('이미지 정렬', { exact: true }).selectOption('center');
  await page.getByLabel('대체 텍스트', { exact: true }).fill('새 이미지 日本語 ação');
  await page.getByRole('button', { name: '모바일 너비', exact: true }).click();
  await expect(page.locator('.image-insertion-outline')).toBeVisible();
  await page.screenshot({ path: info.outputPath('image-preview.png'), fullPage: true });
  await page.getByRole('button', { name: '이미지 적용', exact: true }).click();
  await expect(page.locator('.unsaved-dot')).toHaveCount(1);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(frame.locator('img')).toHaveCount(0);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await frame.locator('img').click();
  await page.getByRole('button', { name: '이 요소에 메모 남기기', exact: true }).click();
  await page
    .getByRole('textbox', { name: '수정 요청', exact: true })
    .fill('이미지 위에 여백을 추가해 주세요.');
  await page.getByRole('button', { name: '메모 추가', exact: true }).click();
  const review = await download(page, 'AI 전달용 저장');
  expect(review).toContain(pixel);
  expect(review).toContain('이미지 위에 여백');
  const clean = await download(page, '완성본 저장');
  expect(clean).toContain(pixel);
  expect(clean).not.toContain('data-htmledit');
  expect(clean).not.toContain('htmledit-review');
  await page.getByTestId('html-file').setInputFiles({
    name: 'again.review.html',
    mimeType: 'text/html',
    buffer: Buffer.from(review),
  });
  await expect(frame.locator('img')).toHaveAttribute('alt', '새 이미지 日本語 ação');
  await expect(frame.locator('img')).toHaveAttribute('style', /width: 50%/);
});
test('URL loads bytes, rejects non-images, and preserves document on network failure', async ({
  page,
}) => {
  await open(page);
  await page.route('https://images.example/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(pixel, 'base64'),
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  await page.getByLabel('이미지 URL', { exact: true }).fill('https://images.example/test.png');
  await page.getByRole('button', { name: '이미지 가져오기', exact: true }).click();
  await expect(page.getByRole('button', { name: '이미지 적용', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '이미지 적용', exact: true }).click();
  await page.getByRole('button', { name: '이미지 교체', exact: true }).click();
  await page.route('https://images.example/bad', (route) => route.abort('failed'));
  await page.getByLabel('이미지 URL', { exact: true }).fill('https://images.example/bad');
  await page.getByRole('button', { name: '이미지 가져오기', exact: true }).click();
  await expect(page.locator('.image-error')).toContainText('로컬 파일');
  await expect(page.frameLocator('iframe').locator('img')).toHaveAttribute(
    'src',
    `data:image/png;base64,${pixel}`,
  );
  await page
    .getByTestId('image-file')
    .setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('.image-error')).toContainText('형식');
});
test('image paste and drop are scoped; invalid positions cannot be applied', async ({ page }) => {
  await open(page);
  await page.getByTestId('image-paste').evaluate((element, base64) => {
    const data = new DataTransfer();
    data.items.add(
      new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], 'pasted.png', {
        type: 'image/png',
      }),
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, pixel);
  await expect(page.getByRole('button', { name: '이미지 적용', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.frameLocator('iframe').locator('li').click();
  await page.getByRole('button', { name: '이미지 삽입', exact: true }).click();
  // Never silently use another relation when the default is invalid.
  await expect(page.getByTestId('image-position').locator('option[value="after"]')).toHaveAttribute(
    'disabled',
    '',
  );
  await page.getByTestId('image-position').selectOption('inside');
  await page.getByTestId('image-paste').evaluate((element, base64) => {
    const data = new DataTransfer();
    data.items.add(
      new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], 'dropped.png', {
        type: 'image/png',
      }),
    );
    element.dispatchEvent(
      new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }),
    );
    element.dispatchEvent(
      new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
    );
  }, pixel);
  await page.getByRole('button', { name: '이미지 적용', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('li img')).toHaveCount(1);
  await expect(page.frameLocator('iframe').locator('strong')).toHaveText('강조');
});
test('late downloads cannot insert into another document', async ({ page }) => {
  await open(page);
  let release!: () => void;
  await page.route('https://images.example/slow', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({ contentType: 'image/png', body: Buffer.from(pixel, 'base64') })
      .catch(() => {});
  });
  await page.getByLabel('이미지 URL', { exact: true }).fill('https://images.example/slow');
  await page.getByRole('button', { name: '이미지 가져오기', exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.frameLocator('iframe').locator('strong').click();
  release();
  await expect(page.locator('.image-panel')).toHaveCount(0);
  await expect(page.frameLocator('iframe').locator('img')).toHaveCount(0);
});
test('all five languages preserve in-progress insertion options', async ({ page }) => {
  await open(page);
  await file(page);
  await page.getByLabel('대체 텍스트', { exact: true }).fill('User text 👋');
  for (const locale of locales) {
    await page.getByTestId('language-select').selectOption(locale);
    await expect(page.getByLabel(translate(locale, 'imageAlt'), { exact: true })).toHaveValue(
      'User text 👋',
    );
    await expect(
      page.getByRole('button', { name: translate(locale, 'imageApply'), exact: true }),
    ).toBeEnabled();
    await expect(page.frameLocator('iframe').locator('html')).toHaveAttribute('lang', 'ko');
  }
});

test('all four image formats decode, properties stay editable, and replacement preserves layout', async ({
  page,
}) => {
  await open(page);
  const formats = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    canvas.getContext('2d')!.fillRect(0, 0, 32, 24);
    return ['image/png', 'image/jpeg', 'image/webp'].map((mime) => ({
      mime,
      data: canvas.toDataURL(mime).split(',')[1],
    }));
  });
  formats.push({
    mime: 'image/gif',
    data: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  });
  for (const { mime, data } of formats) {
    await page.getByTestId('image-file').setInputFiles({
      name: 'image.' + mime.split('/')[1],
      mimeType: mime,
      buffer: Buffer.from(data, 'base64'),
    });
    await expect(page.getByRole('button', { name: '이미지 적용', exact: true })).toBeEnabled();
    await expect(page.frameLocator('iframe').locator('img')).toHaveAttribute(
      'src',
      `data:${mime};base64,${data}`,
    );
  }
  await page.getByRole('button', { name: '이미지 적용', exact: true }).click();
  await page.getByRole('button', { name: '이미지 크기·정렬', exact: true }).click();
  await page.getByLabel('이미지 크기', { exact: true }).selectOption('percent');
  await page.getByLabel('너비 (%)', { exact: true }).fill('30');
  await page.getByLabel('이미지 정렬', { exact: true }).selectOption('right');
  await page.getByRole('button', { name: '이미지 적용', exact: true }).click();
  const before = await page.frameLocator('iframe').locator('img').getAttribute('style');
  await page.getByRole('button', { name: '이미지 교체', exact: true }).click();
  await file(page);
  await page.getByRole('button', { name: '이미지 적용', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('img')).toHaveAttribute('style', before!);
});

test('real clipboard image paste uses the focused panel and leaves text paste alone', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    canvas.getContext('2d')!.fillRect(0, 0, 32, 24);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value!), 'image/png'),
    );
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  });
  await page.getByTestId('image-paste').focus();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.getByRole('button', { name: '이미지 적용', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.frameLocator('iframe').locator('strong').dblclick();
  await page.evaluate(() => navigator.clipboard.writeText('붙여넣기 日本語 ação'));
  await page.getByRole('textbox', { name: '문구 직접 편집' }).fill('');
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.getByRole('textbox', { name: '문구 직접 편집' })).toHaveValue(
    '붙여넣기 日本語 ação',
  );
});
