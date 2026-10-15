import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { locales, translate, type Locale } from '../../src/i18n';
import {
  deleteElements,
  exportDocument,
  noteTargets,
  readDocument,
  updateNote,
} from '../../src/model/document';
import { DocumentStore, prepareFile } from '../../scripts/local/store';
import { startServer } from '../../scripts/local/server';
import type { Arguments, MessageKey } from '../../src/i18n/types';

const source =
  '<html lang="ko"><body><h1>첫 제목</h1><p>두 번째 문구</p><footer>Footer</footer></body></html>';
async function open(page: Page) {
  await page.goto('/');
  await page
    .getByTestId('html-file')
    .setInputFiles({ name: 'group.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  await expect(page.frameLocator('iframe').locator('h1')).toHaveText('첫 제목');
}
async function saved(page: Page, locale: Locale, kind: 'review' | 'clean' = 'review') {
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', {
      name: translate(locale, kind === 'review' ? 'saveReviewHtml' : 'saveFinalHtml'),
      exact: true,
    })
    .click();
  return readFile((await (await pending).path())!, 'utf8');
}

for (const locale of locales) {
  test(`${locale}: multi-select, one joint note, reopen and batch delete`, async ({ page }) => {
    await open(page);
    await page.getByTestId('language-select').selectOption(locale);
    const t = <K extends MessageKey>(key: K, ...args: Arguments<K>) =>
      translate(locale, key, ...args);
    const frame = page.frameLocator('iframe');
    await frame.locator('h1').click();
    await frame.locator('p').click({ modifiers: ['Control'] });
    await expect(page.locator('.selection-outline')).toHaveCount(2);
    await expect(
      page.getByRole('textbox', {
        name: translate(locale, 'textPart', { number: 1 }),
        exact: true,
      }),
    ).toHaveCount(0);
    await frame.locator('p').click({ modifiers: ['Control'] });
    await expect(page.locator('.selection-outline')).toHaveCount(1);
    await frame.locator('p').click({ modifiers: ['Meta'] });
    await expect(page.locator('.selection-outline')).toHaveCount(2);
    await page.getByRole('button', { name: t('addGroupNote'), exact: true }).click();
    const request = '두 요소를 합쳐 주세요 · 日本語 · ação · <b> 👋';
    await page.getByRole('textbox', { name: t('changeRequest'), exact: true }).fill(request);
    // Locale changes must retain both selected targets and the draft request.
    await page.getByTestId('language-select').selectOption(locale === 'en' ? 'ko' : 'en');
    await expect(page.locator('.selection-outline')).toHaveCount(2);
    await page.getByTestId('language-select').selectOption(locale);
    await expect(page.getByRole('textbox', { name: t('changeRequest'), exact: true })).toHaveValue(
      request,
    );
    await page.getByRole('button', { name: t('addNote'), exact: true }).click();
    await expect(page.getByTestId('note-card')).toHaveCount(1);
    await expect(page.locator('.note-marker')).toHaveCount(2);
    await expect(page.locator('.note-marker').first()).toHaveText('1');
    await expect(page.locator('.note-marker').last()).toHaveText('1');
    if (locale === 'ko')
      await page.screenshot({
        path: `.cache/multi-selection/joint-note-${test.info().project.name}.png`,
      });
    const html = await saved(page, locale);
    const document = readDocument(html);
    expect(document.notes).toHaveLength(1);
    expect(document.notes[0].text).toBe(request);
    expect(noteTargets(document.notes[0])).toHaveLength(2);
    await page.getByTestId('html-file').setInputFiles({
      name: 'group.review.html',
      mimeType: 'text/html',
      buffer: Buffer.from(html),
    });
    await expect(page.locator('.note-marker')).toHaveCount(2);
    await page.locator('.note-marker').last().click();
    await expect(page.locator('.selection-outline')).toHaveCount(2);
    // Keep a draft note while deleting the selected group from the outer document.
    await page.getByRole('textbox', { name: t('changeRequest'), exact: true }).fill('다음 요청');
    await page.getByRole('button', { name: t('reviewNotes'), exact: false }).focus();
    await page.keyboard.press('Delete');
    await expect(frame.locator('h1,p')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: t('changeRequest'), exact: true })).toHaveValue(
      '다음 요청',
    );
    await expect(page.getByTestId('note-card')).toHaveCount(1);
    await expect(page.locator('.note-target-list button:disabled')).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(frame.locator('h1,p')).toHaveCount(2);
    await expect(page.locator('.note-marker')).toHaveCount(2);
    const clean = await saved(page, locale, 'clean');
    expect(clean).not.toMatch(/htmledit|HANDOFF/);
    expect(clean).toContain('첫 제목');
  });
}

test('Delete from iframe is immediate, undo/redo work, text input and document body are protected', async ({
  page,
}) => {
  await open(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('h1').click();
  await page.keyboard.press('Delete');
  await expect(frame.locator('h1')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(frame.locator('h1')).toHaveText('첫 제목');
  await page.keyboard.press('Control+y');
  await expect(frame.locator('h1')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(frame.locator('h1')).toBeVisible();
  await frame.locator('h1').click();
  const text = page.getByRole('textbox', { name: '문구 1', exact: true });
  await text.focus();
  await text.press('Home');
  await text.press('Delete');
  await expect(frame.locator('h1')).toHaveText('첫 제목');
  await expect(text).toHaveValue(' 제목');
  await frame.locator('h1').dblclick();
  const inline = page.locator('[data-htmledit-inline-editor]');
  await expect(inline).toBeVisible();
  await inline.press('Home');
  await inline.press('Delete');
  await expect(frame.locator('h1')).toHaveText('첫 제목');
  await inline.press('Escape');
  await frame.locator('h1').click();
  await page.getByRole('button', { name: '상위 요소 선택' }).click();
  await page.keyboard.press('Delete');
  await expect(frame.locator('h1,p,footer')).toHaveCount(3);
});

test('note-mode selection preserves typed requests and partial missing groups can be reassigned', async ({
  page,
}) => {
  await open(page);
  const frame = page.frameLocator('iframe');
  await page.getByRole('button', { name: '메모 남기기', exact: true }).click();
  await frame.locator('h1').click();
  const input = page.getByRole('textbox', { name: '수정 요청', exact: true });
  await input.fill('합칠 문구');
  await input.press('Home');
  await input.press('Delete');
  await expect(input).toHaveValue('칠 문구');
  await expect(frame.locator('h1')).toHaveText('첫 제목');
  await frame.locator('p').click({ modifiers: ['Control'] });
  await expect(page.locator('.selection-outline')).toHaveCount(2);
  await expect(input).toHaveValue('칠 문구');
  await page.getByRole('button', { name: '메모 추가', exact: true }).click();
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await frame.locator('h1').click();
  await expect(page.locator('.selection-outline')).toHaveCount(1);
  await page.keyboard.press('Delete');
  await expect(frame.locator('h1')).toHaveCount(0);
  await page.getByRole('button', { name: '수정 메모', exact: false }).click();
  await expect(page.locator('.note-target-list button:disabled')).toHaveCount(1);
  await page.locator('.note-target-list button:enabled').click();
  await expect(page.locator('.selection-outline')).toHaveCount(1);
  await page.getByRole('button', { name: '대상 재지정', exact: true }).click();
  await frame.locator('p').click();
  await frame.locator('footer').click({ modifiers: ['Control'] });
  await page.getByRole('button', { name: '선택한 요소에 연결', exact: true }).click();
  await expect(page.locator('.note-target-list button:disabled')).toHaveCount(0);
  await expect(page.locator('.note-marker')).toHaveCount(2);
  const html = await saved(page, 'ko');
  expect(noteTargets(readDocument(html).notes[0]).map((target) => target.tag)).toEqual([
    'p',
    'footer',
  ]);
});

test('joint note checkout/apply preserves targets, backups and automatic refresh', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const dir = await mkdtemp(join(tmpdir(), 'htmledit-joint-note-'));
  const original = join(dir, 'sample.html');
  await writeFile(original, source);
  const file = await prepareFile(original);
  const server = await startServer(file, resolve('dist'));
  try {
    await page.goto(server.url);
    await page.getByTestId('language-select').selectOption('ko');
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('h1')).toBeVisible();
    await frame.locator('h1').click();
    await frame.locator('p').click({ modifiers: ['Control'] });
    await page.getByRole('button', { name: '선택한 요소에 메모 하나 남기기' }).click();
    await page
      .getByRole('textbox', { name: '수정 요청', exact: true })
      .fill('두 요소를 삭제해 주세요');
    await page.getByRole('button', { name: '메모 추가', exact: true }).click();
    await page
      .getByRole('button', { name: translate('ko', 'saveAndCopyAiRequest'), exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('targets');
    const store = new DocumentStore(file);
    await expect.poll(async () => (await store.status()).notes.length).toBe(1);
    const before = await store.read();
    const checkout = await store.checkout();
    const document = readDocument(await readFile(checkout.candidate, 'utf8'));
    const targets = noteTargets(document.notes[0]).map((target) => target.id);
    const changed = updateNote(deleteElements(document, targets), document.notes[0].id, {
      done: true,
    });
    await writeFile(checkout.candidate, exportDocument(changed, 'review'));
    const result = await store.save(
      await readFile(checkout.candidate, 'utf8'),
      checkout.revision,
      true,
    );
    expect(await readFile(result.backup, 'utf8')).toBe(before.html);
    await expect(frame.locator('h1,p')).toHaveCount(0);
    const status = await store.status();
    expect(status.notes[0].done).toBe(true);
    expect(status.notes[0].targetFound).toBe(false);
    expect(noteTargets(status.notes[0]).map((target) => target.id)).toEqual(targets);
    expect(await readFile(original, 'utf8')).toBe(source);
  } finally {
    const closed = once(server.server, 'close');
    server.server.close();
    server.server.closeAllConnections();
    await closed;
    await rm(dir, { recursive: true, force: true });
  }
});
