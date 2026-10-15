import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { locales, translate } from '../../src/i18n';
import { noteTargets, readDocument } from '../../src/model/document';

// Emulate WebKit's refusal to deliver parent listeners in a sandboxed frame.
// This affects only the feature probe, not the app's handlers or sandbox.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const dispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (event) {
      if (event.type === 'htmledit-event-probe') return true;
      return dispatch.call(this, event);
    };
  });
});

const source = `<!doctype html><html><head><style>body{margin:30px}#scroll{overflow:auto;height:140px}#inner{height:600px}#spacer{height:1200px}</style></head><body>
<p id="intro">첫 문구 <strong>강조</strong> 마지막</p><a id="link" href="https://example.com">이동 금지</a>
<div id="scroll"><div id="inner">내부 스크롤</div></div><div id="spacer"></div><h2>마지막</h2>
<script>parent.__previewExecuted=true</script></body></html>`;

async function open(page: Page) {
  await page.goto('/');
  await page
    .getByTestId('html-file')
    .setInputFiles({ name: 'events.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  await expect(page.locator('.preview-event-surface')).toBeVisible();
}
async function point(page: Page, selector: string) {
  const box = await page.frameLocator('iframe').locator(selector).boundingBox();
  if (!box) throw Error('Missing target');
  return { x: box.x + 10, y: box.y + box.height / 2 };
}
async function click(page: Page, selector: string) {
  const p = await point(page, selector);
  await page.mouse.click(p.x, p.y);
}

for (const locale of locales) {
  test(`${locale}: parent surface preserves joint targets, batch deletion and one-step history`, async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('language-select').selectOption(locale);
    await click(page, '#intro');
    await page.keyboard.down('ControlOrMeta');
    await click(page, '#link');
    await page.keyboard.up('ControlOrMeta');
    await expect(page.locator('.selection-outline')).toHaveCount(2);
    await page.keyboard.down('ControlOrMeta');
    await click(page, '#link');
    await page.keyboard.up('ControlOrMeta');
    await expect(page.locator('.selection-outline')).toHaveCount(1);
    await page.keyboard.down('ControlOrMeta');
    await click(page, '#link');
    await page.keyboard.up('ControlOrMeta');
    await page
      .getByRole('button', { name: translate(locale, 'addGroupNote'), exact: true })
      .click();
    const request = '두 요소 위치를 바꿔 주세요 · 日本語 · ação <b> 👋';
    await page
      .getByRole('textbox', { name: translate(locale, 'changeRequest'), exact: true })
      .fill(request);
    await page.getByRole('button', { name: translate(locale, 'addNote'), exact: true }).click();
    await expect(page.locator('.note-marker')).toHaveCount(2);
    await expect(page.locator('.note-marker').first()).toHaveText('1');
    await expect(page.locator('.note-marker').last()).toHaveText('1');
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: translate(locale, 'saveReviewHtml'), exact: true })
      .click();
    const html = await readFile((await (await download).path())!, 'utf8');
    const before = readDocument(html);
    expect(before.notes).toHaveLength(1);
    expect(noteTargets(before.notes[0])).toHaveLength(2);
    expect(before.notes[0].text).toBe(request);
    await page.getByTestId('html-file').setInputFiles({
      name: 'joint.review.html',
      mimeType: 'text/html',
      buffer: Buffer.from(html),
    });
    await expect(page.locator('.note-marker')).toHaveCount(2);
    await page.locator('.note-marker').last().click();
    await expect(page.locator('.selection-outline')).toHaveCount(2);
    await page
      .getByRole('button', { name: translate(locale, 'editDirectly'), exact: true })
      .click();
    await page.locator('.preview-event-surface').focus();
    await page.keyboard.press('Delete');
    await expect(page.frameLocator('iframe').locator('#intro,#link')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.preview-event-surface').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.frameLocator('iframe').locator('#intro,#link')).toHaveCount(2);
    await expect(page.locator('.note-marker')).toHaveCount(2);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(page.frameLocator('iframe').locator('#intro,#link')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.note-marker')).toHaveCount(2);
  });
}

test('parent surface protects text editing and modal dialogs from batch Delete', async ({
  page,
}) => {
  await open(page);
  await click(page, '#intro');
  const text = page.getByRole('textbox', { name: '문구 1', exact: true });
  await text.press('Home');
  await text.press('Delete');
  await expect(page.frameLocator('iframe').locator('#intro')).toContainText('첫 문구');
  const p = await point(page, '#intro');
  await page.mouse.dblclick(p.x, p.y);
  const inline = page.locator('[data-htmledit-inline-editor]');
  await expect(inline).toBeVisible();
  await inline.press('Delete');
  await expect(page.frameLocator('iframe').locator('#intro')).toHaveCount(1);
  await inline.press('Escape');
  await page.getByRole('button', { name: '사용 방법', exact: true }).click();
  await page.keyboard.press('Delete');
  await expect(page.frameLocator('iframe').locator('#intro')).toHaveCount(1);
});

test('parent surface selects, edits nested text, adds notes and keeps scripts blocked', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-same-origin');
  await click(page, '#intro');
  await page.getByRole('textbox', { name: '문구 1', exact: true }).fill('변경 한글 ✓ ');
  await page.getByRole('button', { name: '문구 적용', exact: true }).first().click();
  await expect(page.frameLocator('iframe').locator('#intro strong')).toHaveText('강조');
  await expect(page.frameLocator('iframe').locator('#intro')).toContainText('변경 한글 ✓');
  await click(page, '#link');
  await expect(page.frameLocator('iframe').locator('#link')).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__previewExecuted),
  ).toBeUndefined();
  await page.getByRole('button', { name: '메모 남기기', exact: true }).click();
  await click(page, '#intro');
  await page.getByRole('textbox', { name: '수정 요청', exact: true }).fill('Safari 메모');
  await page.getByRole('button', { name: '메모 추가', exact: true }).click();
  await expect(page.getByTestId('note-card')).toContainText('Safari 메모');
  const marker = page.locator('.note-marker');
  await marker.click();
  await expect(page.locator('.selection-outline')).toBeVisible();
});

test('parent surface double-click and keyboard history preserve nested markup', async ({
  page,
}) => {
  await open(page);
  const p = await point(page, '#intro');
  await page.mouse.dblclick(p.x, p.y);
  const editor = page.locator('[data-htmledit-inline-editor]');
  await expect(editor).toBeVisible();
  await editor.fill('직접 편집 ');
  await editor.press('ControlOrMeta+Enter');
  await expect(page.frameLocator('iframe').locator('#intro')).toContainText('직접 편집');
  await page.locator('.preview-event-surface').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.frameLocator('iframe').locator('#intro')).toContainText('첫 문구');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.frameLocator('iframe').locator('#intro')).toContainText('직접 편집');
  await expect(page.frameLocator('iframe').locator('#intro strong')).toHaveText('강조');
});

test('parent surface scrolls nested areas and hides during Interact mode', async ({ page }) => {
  await open(page);
  const p = await point(page, '#scroll');
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, 120);
  await expect
    .poll(() =>
      page
        .frameLocator('iframe')
        .locator('#scroll')
        .evaluate((e) => e.scrollTop),
    )
    .toBeGreaterThan(0);
  await page.mouse.wheel(0, 900);
  await expect
    .poll(() =>
      page
        .frameLocator('iframe')
        .locator('html')
        .evaluate((e) => e.scrollTop),
    )
    .toBeGreaterThan(0);
  await page.locator('.preview-event-surface').focus();
  await page.keyboard.press('Home');
  await expect
    .poll(() =>
      page
        .frameLocator('iframe')
        .locator('html')
        .evaluate((e) => e.scrollTop),
    )
    .toBe(0);
  await page.getByRole('button', { name: '문서 조작', exact: true }).click();
  await expect(page.locator('.preview-event-surface')).toBeHidden();
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await expect(page.locator('.preview-event-surface')).toBeVisible();
});
