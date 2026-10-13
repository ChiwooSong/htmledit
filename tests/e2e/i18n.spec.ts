import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { locales, translate } from '../../src/i18n';
import { prepareFile, DocumentStore } from '../../scripts/local/store';
import { Preferences } from '../../scripts/local/preferences';
import { startServer } from '../../scripts/local/server';
import {
  readDocument,
  exportDocument,
  updateNote,
  changeText,
  listElements,
} from '../../src/model/document';

for (const locale of locales)
  test(`${locale}: edit, save and copy, apply and refresh`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const directory = await mkdtemp(join(tmpdir(), 'htmledit-i18n-browser-'));
    const original = join(directory, 'document.html');
    const source =
      '<html lang="fr"><head><meta charset="utf-8"></head><body><h1>Bonjour</h1><p>日本語 · ação · español</p></body></html>';
    await writeFile(original, source);
    const file = await prepareFile(original);
    const server = await startServer(
      file,
      resolve('dist'),
      undefined,
      new Preferences(join(directory, 'preferences.json')),
    );
    const t = <K extends import('../../src/i18n/types').MessageKey>(
      key: K,
      ...args: import('../../src/i18n/types').Arguments<K>
    ) => translate(locale, key, ...args);
    try {
      await page.goto(server.url);
      await page.getByTestId('language-select').selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const frame = page.frameLocator('iframe');
      await expect(frame.locator('h1')).toHaveText('Bonjour');
      await frame.locator('h1').click();
      await page
        .getByRole('textbox', { name: t('textPart', { number: 1 }), exact: true })
        .fill('Direct edit ✓');
      await page.getByRole('button', { name: t('applyText'), exact: true }).click();
      await page.getByRole('button', { name: t('addNotes'), exact: true }).click();
      await frame.locator('h1').click();
      const request = {
        ko: '제목을 바꿔주세요',
        en: 'Change this heading',
        es: 'Cambia este título',
        ja: 'この見出しを変更してください',
        'pt-BR': 'Altere este título',
      }[locale];
      await page.getByRole('textbox', { name: t('changeRequest'), exact: true }).fill(request);
      await page.getByRole('button', { name: t('addNote'), exact: true }).click();
      await page.getByRole('button', { name: t('saveAndCopyAiRequest'), exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(t('connectedHandoff', { file }));
      const saved = readDocument(await readFile(file, 'utf8'));
      expect(saved.notes[0].text).toBe(request);
      expect(saved.html).toContain('Direct edit ✓');
      const store = new DocumentStore(file),
        checked = await store.checkout();
      const candidate = updateNote(
        readDocument(await readFile(checked.candidate, 'utf8')),
        saved.notes[0].id,
        { done: true },
      );
      const heading = listElements(candidate).find((element) => element.tag === 'h1')!;
      const changed = changeText(
        candidate,
        heading.id,
        heading.textParts[0].index,
        'Applied by AI ✓',
      );
      await writeFile(checked.candidate, exportDocument(changed, 'review'));
      await store.save(await readFile(checked.candidate, 'utf8'), checked.revision, true);
      await expect(frame.locator('h1')).toHaveText('Applied by AI ✓');
      await page.getByRole('button', { name: new RegExp(t('reviewNotes')) }).click();
      await expect(page.locator('.note-summary')).toContainText(
        t('noteSummary', { total: 1, done: 1 }),
      );
      expect(await readFile(original, 'utf8')).toBe(source);
      await expect(frame.locator('html')).toHaveAttribute('lang', 'fr');
      await page.getByRole('button', { name: t('howToUse'), exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText(t('openYourHtml'));
      await page.getByRole('button', { name: t('gotIt'), exact: true }).click();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: t('saveFinalHtml'), exact: true }).click();
      const download = await downloadPromise;
      const clean = await readFile((await download.path())!, 'utf8');
      expect(clean).not.toContain('data-htmledit');
      expect(clean).not.toContain('htmledit-review');
      expect(clean).toContain('Applied by AI');
    } finally {
      const done = once(server.server, 'close');
      server.server.close();
      server.server.closeAllConnections();
      await done;
      await rm(directory, { recursive: true, force: true });
    }
  });

test('language changes preserve inputs, selection, history and the loaded example', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('language-select').selectOption('en');
  await page.getByRole('button', { name: /Try an example document/ }).click();
  const frame = page.frameLocator('iframe');
  const original = await frame.locator('body').innerHTML();
  await frame.locator('h1').click();
  await page.getByRole('textbox', { name: 'Text 1', exact: true }).fill('Draft text 日本語');
  await page.getByTestId('language-select').selectOption('ja');
  await expect(page.getByRole('textbox', { name: '文言1', exact: true })).toHaveValue(
    'Draft text 日本語',
  );
  expect(await frame.locator('body').innerHTML()).toBe(original);
  await page
    .getByRole('button', { name: translate('ja', 'applyText'), exact: true })
    .first()
    .click();
  await page.getByRole('button', { name: translate('ja', 'addNotes'), exact: true }).click();
  await frame.locator('h1').click();
  await page
    .getByRole('textbox', { name: translate('ja', 'changeRequest'), exact: true })
    .fill('未保存のメモ ação');
  await page.getByTestId('language-select').selectOption('pt-BR');
  await expect(
    page.getByRole('textbox', { name: translate('pt-BR', 'changeRequest'), exact: true }),
  ).toHaveValue('未保存のメモ ação');
  await expect(frame.locator('h1')).toContainText('Draft text 日本語');
  await page.getByRole('button', { name: translate('pt-BR', 'undo'), exact: true }).click();
  expect(await frame.locator('body').innerHTML()).toBe(original);
});

test('automatic detection, persistent selection and unsupported-language fallback', async ({
  browser,
}) => {
  for (const [browserLocale, expected] of [
    ['es-MX', 'es'],
    ['pt-PT', 'pt-BR'],
    ['de-DE', 'en'],
  ] as const) {
    const context = await browser.newContext({ locale: browserLocale });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', expected);
      await page.getByTestId('language-select').selectOption('ja');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
      await page.getByTestId('language-select').selectOption('auto');
      await expect(page.locator('html')).toHaveAttribute('lang', expected);
    } finally {
      await context.close();
    }
  }
});

test('connected language survives a new port; preference failures keep unsaved work', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'htmledit-preference-browser-'));
  const servers: Awaited<ReturnType<typeof startServer>>[] = [];
  try {
    const original = join(directory, 'original.html');
    await writeFile(original, '<h1>Original</h1>');
    const file = await prepareFile(original);
    const preferencesFile = join(directory, 'preferences.json');
    for (let i = 0; i < 2; i++)
      servers.push(
        await startServer(file, resolve('dist'), undefined, new Preferences(preferencesFile)),
      );
    await page.goto(servers[0].url);
    await page.getByTestId('language-select').selectOption('es');
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(preferencesFile, 'utf8')).language;
        } catch (error) {
          // The first preference save is asynchronous; absence means keep waiting.
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        }
      })
      .toBe('es');
    await page.goto(servers[1].url);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.frameLocator('iframe').locator('h1').click();
    await page.getByRole('textbox', { name: 'Texto 1', exact: true }).fill('Unsaved text');
    await page.route('**/api/preferences', async (route) => {
      if (route.request().method() === 'PUT')
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"code":"IO","message":"disk unavailable"}',
        });
      else await route.continue();
    });
    await page.getByTestId('language-select').selectOption('ja');
    await expect(page.getByRole('alert')).toContainText(translate('ja', 'preferencesFailed'));
    await expect(page.getByRole('textbox', { name: '文言1', exact: true })).toHaveValue(
      'Unsaved text',
    );
    expect(JSON.parse(await readFile(preferencesFile, 'utf8')).language).toBe('es');
    await page
      .getByRole('button', { name: translate('ja', 'saveAndCopyAiRequest'), exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: translate('ja', 'applyOrCancelTheTextOrNote34') }),
    ).toBeVisible();
    expect(await readFile(file, 'utf8')).not.toContain('Unsaved text');
  } finally {
    for (const { server } of servers) {
      const done = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await done;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('inline editing and legacy draft diagnostics survive language changes', async ({ page }) => {
  await page.goto('/');
  const legacy = readDocument('<html lang="ko"><body><p>Original inline text</p></body></html>');
  await page.evaluate(async (session) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('htmledit-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put(
          {
            session: {
              ...session,
              warnings: [
                '외부 삽입 화면은 편집 중 표시하지 않습니다.',
                { key: 'embeddedExternalPagesAreHiddenWhileEditing', params: {} },
                'custom legacy detail',
              ],
            },
            savedAt: Date.now(),
          },
          'latest',
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, legacy);
  await page.reload();
  await page.getByRole('button', { name: '복구하기', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await frame.locator('p').dblclick();
  await page.getByRole('textbox', { name: '문구 직접 편집', exact: true }).fill('IME 日本語 ação');
  await page.getByTestId('language-select').selectOption('pt-BR');
  await expect(
    page.getByRole('textbox', { name: translate('pt-BR', 'inlineTextEditor'), exact: true }),
  ).toHaveValue('IME 日本語 ação');
  await page
    .locator('.inline-actions')
    .getByRole('button', { name: translate('pt-BR', 'apply'), exact: true })
    .click();
  await expect(frame.locator('p')).toHaveText('IME 日本語 ação');
  await page.locator('.document-warnings summary').click();
  await expect(page.locator('.document-warnings')).toContainText(
    translate('pt-BR', 'embeddedExternalPagesAreHiddenWhileEditing'),
  );
  await expect(page.locator('.document-warnings')).toContainText('custom legacy detail');
  await expect(
    page
      .locator('.document-warnings li')
      .filter({ hasText: translate('pt-BR', 'embeddedExternalPagesAreHiddenWhileEditing') }),
  ).toHaveCount(1);
});
