import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import {
  catalogs,
  locales,
  translate,
  message,
  formatMessage,
  legacyMessage,
  normalizeLocale,
  detectLocale,
  acceptLanguage,
  describeError,
  MessageError,
} from '../src/i18n';
import { exampleHtml } from '../src/example';
import { readDocument, addNote, exportDocument, listElements } from '../src/model/document';
import { Preferences } from '../scripts/local/preferences';
import { prepareFile } from '../scripts/local/store';
import { startServer } from '../scripts/local/server';

describe('localization contracts', () => {
  it('has complete, nonempty catalogs with the same interpolation slots', () => {
    const slots = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const locale of locales) {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(catalogs.en).sort());
      for (const key of Object.keys(catalogs.en) as (keyof typeof catalogs.en)[]) {
        expect(catalogs[locale][key].trim(), `${locale}:${key}`).not.toBe('');
        expect(slots(catalogs[locale][key]), `${locale}:${key}`).toEqual(slots(catalogs.en[key]));
      }
    }
  });
  it('resolves supported regional languages and preference order', () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('es-MX')).toBe('es');
    expect(normalizeLocale('pt_PT.UTF-8')).toBe('pt-BR');
    expect(detectLocale(['de-DE', 'ja-JP', 'en'])).toBe('ja');
    expect(detectLocale(['fr'])).toBe('en');
    expect(acceptLanguage('en;q=0.5, ja;q=0.9, ko;q=0')).toBe('ja');
  });
  it('interpolates paths literally and formats timestamps and plural counts', () => {
    const file = 'C:/문서/ação/{time}/<draft>.html';
    for (const locale of locales) {
      expect(translate(locale, 'connectedHandoff', { file })).toContain(file);
      expect(translate(locale, 'draftSavedAt', { time: 0 })).toContain(
        new Date(0).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      );
    }
    expect(translate('en', 'pendingOne', { count: 1 })).toBe('1 request is waiting');
    expect(translate('es', 'pendingOther', { count: 2 })).toBe('Hay 2 solicitudes pendientes');
  });
  it('restores known legacy diagnostics and preserves unknown diagnostic detail', () => {
    expect(formatMessage('ja', legacyMessage('메모 저장 블록이 중복되어 있습니다.'))).toBe(
      catalogs.ja.duplicateReviewMetadataBlocks,
    );
    expect(legacyMessage('custom diagnostic')).toBe('custom diagnostic');
    expect(formatMessage('es', describeError(new Error('EACCES /document')))).toContain(
      'EACCES /document',
    );
    expect(describeError(new MessageError(message('invalidPreferences')))).toEqual(
      message('invalidPreferences'),
    );
  });
  it('localizes only bundled examples and retains the same structure', () => {
    const structures = locales.map((locale) => {
      const html = exampleHtml(locale);
      expect(html).toContain(`lang="${locale}"`);
      if (locale !== 'ko') expect(html).not.toMatch(/[가-힣]/);
      return listElements(readDocument(html)).map((element) => element.tag);
    });
    structures.forEach((value) => expect(value).toEqual(structures[0]));
  });
  it('does not localize user HTML or notes when formatting UI messages', () => {
    let session = readDocument('<html lang="fr"><body><h1>Bonjour 日本語 ação</h1></body></html>');
    session = addNote(
      session,
      listElements(session).find((el) => el.tag === 'h1')!.id,
      'before',
      'Añade «✓» <svg> 日本語',
    );
    const before = JSON.stringify(session);
    locales.forEach((locale) =>
      formatMessage(locale, message('noteSummary', { total: 1, done: 0 })),
    );
    expect(JSON.stringify(session)).toBe(before);
    const output = exportDocument(session, 'review');
    expect(output).toContain('lang="fr"');
    expect(output).toContain('HTMLEdit AI HANDOFF v1');
    expect(readDocument(output).notes).toEqual(session.notes);
  });
  it('shares preferences across authenticated servers without accepting arbitrary data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'htmledit-language-'));
    const servers: Awaited<ReturnType<typeof startServer>>[] = [];
    try {
      const original = join(directory, 'test.html');
      await writeFile(original, '<h1>Keep me</h1>');
      const file = await prepareFile(original),
        initial = await readFile(file, 'utf8');
      const path = join(directory, 'preferences.json');
      for (let i = 0; i < 2; i++)
        servers.push(await startServer(file, resolve('dist'), undefined, new Preferences(path)));
      const [a, b] = servers;
      expect((await fetch(`${a.origin}/api/preferences`)).status).toBe(403);
      const headers = {
        Authorization: `Bearer ${a.token}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'ja',
      };
      const invalid = await fetch(`${a.origin}/api/preferences`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ language: 'de', file: 'other' }),
      });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({
        code: 'INPUT',
        messageKey: 'invalidPreferences',
        message: catalogs.ja.invalidPreferences,
      });
      expect(
        (
          await fetch(`${a.origin}/api/preferences`, {
            method: 'PUT',
            headers: { ...headers, Origin: 'https://example.com' },
            body: '{"language":"es"}',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${a.origin}/api/preferences`, {
            method: 'PUT',
            headers,
            body: '{"language":"pt-BR"}',
          })
        ).status,
      ).toBe(200);
      const saved = await fetch(`${b.origin}/api/preferences`, {
        headers: { Authorization: `Bearer ${b.token}` },
      });
      expect(await saved.json()).toEqual({ language: 'pt-BR' });
      expect(await readFile(file, 'utf8')).toBe(initial);
      await writeFile(path, 'broken');
      await expect(new Preferences(path).read()).rejects.toThrow();
      await new Preferences(path).save({ language: 'auto' });
      expect(await new Preferences(path).read()).toEqual({ language: 'auto' });
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
});
