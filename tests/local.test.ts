import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { DocumentStore, prepareFile, snapshot, validateReview } from '../scripts/local/store';
import { startServer } from '../scripts/local/server';
import { readDocument, exportDocument, addNote, listElements } from '../src/model/document';

const directories: string[] = [];
const servers: Awaited<ReturnType<typeof startServer>>[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'htmledit-test-'));
  directories.push(directory);
  const original = join(directory, '한글 문서.html');
  await writeFile(
    original,
    '<!doctype html><html><head><title>Test</title></head><body><h1>처음 제목</h1><p>설명</p></body></html>',
  );
  const file = await prepareFile(original);
  return { directory, original, file, store: new DocumentStore(file) };
}
afterEach(async () => {
  for (const { server } of servers.splice(0)) {
    const done = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await done;
  }
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
describe('local document transactions', () => {
  it('creates a review once, preserves original, and reopens the review', async () => {
    const { original, file } = await fixture();
    expect(await readFile(original, 'utf8')).not.toContain('data-htmledit');
    expect(await readFile(file, 'utf8')).toContain('htmledit-review');
    await expect(prepareFile(original)).rejects.toMatchObject({ code: 'EXISTS' });
    expect(await prepareFile(file)).toBe(file);
  });
  it('backs up exact bytes and rejects concurrent writes to the same revision', async () => {
    const { store } = await fixture();
    const initial = await store.read();
    const writes = await Promise.allSettled([
      store.save(initial.html.replace('처음 제목', '변경 하나'), initial.revision),
      store.save(initial.html.replace('처음 제목', '변경 둘'), initial.revision),
    ]);
    expect(writes[0].status).toBe('fulfilled');
    expect(writes[1]).toMatchObject({ status: 'rejected', reason: { code: 'CONFLICT' } });
    if (writes[0].status === 'fulfilled')
      expect(await readFile(writes[0].value.backup, 'utf8')).toBe(initial.html);
    expect((await store.read()).html).toContain('변경 하나');
  });
  it('AI candidate preserves notes and permits completion of a deletion', async () => {
    const { store } = await fixture();
    const initial = await store.read();
    let session = readDocument(initial.html);
    const target = listElements(session).find((e) => e.tag === 'p')!;
    session = addNote(session, target.id, 'self', '설명을 삭제해줘 </script> 👋');
    const noted = await store.save(exportDocument(session, 'review'), initial.revision);
    const checkout = await store.checkout();
    expect(await readFile(checkout.candidate, 'utf8')).toBe(noted.html);
    const broken = noted.html.replace('"notes":[{', '"notes":[]}</script><!--');
    await expect(store.save(broken, noted.revision, true)).rejects.toBeDefined();
    const next = noted.html.replace(/<p[^>]*>설명<\/p>/, '').replace('"done":false', '"done":true');
    await store.save(next, noted.revision, true);
    expect((await store.status()).notes[0]).toMatchObject({ done: true, targetFound: false });
  });
  it('rejects malformed metadata and duplicate targets without modifying the file', async () => {
    const { store } = await fixture();
    const initial = await store.read();
    const id = initial.html.match(/data-htmledit-id="([^"]+)"/)![1];
    const duplicate = initial.html.replace(
      '</body>',
      `<div data-htmledit-id="${id}"></div></body>`,
    );
    await expect(store.save(duplicate, initial.revision)).rejects.toMatchObject({
      code: 'TARGET_ID',
    });
    expect(() => validateReview(initial.html.replace('"version":1', '"version":9'))).toThrow();
    expect(await store.read()).toEqual(initial);
  });
  it('detects external changes and preserves a recoverable draft across store restart', async () => {
    const { store, file } = await fixture();
    const initial = await store.read();
    await store.saveDraft(initial.html.replace('처음 제목', '임시 작업'), initial.revision);
    await writeFile(file, initial.html.replace('처음 제목', '외부 변경'));
    await expect(store.save(initial.html, initial.revision)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const reopened = new DocumentStore(file);
    expect(await reopened.draft()).toMatchObject({
      revision: initial.revision,
      html: expect.stringContaining('임시 작업'),
    });
    const latest = await reopened.read();
    await reopened.saveDraft(latest.html, latest.revision);
    expect(await reopened.draft()).toBeNull();
  });
  it('rejects unsupported encodings and file sizes', async () => {
    const { original } = await fixture();
    await writeFile(original, Buffer.from([0xff, 0xff]));
    await expect(snapshot(original)).rejects.toMatchObject({ code: 'ENCODING' });
    await writeFile(original, Buffer.alloc(25 * 1024 * 1024 + 1));
    await expect(snapshot(original)).rejects.toMatchObject({ code: 'SIZE_LIMIT' });
  });
  it('preserves the working file when a backup cannot be created', async () => {
    const { store, directory } = await fixture();
    const initial = await store.read();
    await writeFile(join(directory, '.htmledit'), 'A file blocks the backup directory');
    await expect(
      store.save(initial.html.replace('처음 제목', 'Must not be written'), initial.revision),
    ).rejects.toBeDefined();
    expect(await store.read()).toEqual(initial);
  });
});
describe('local HTTP boundary', () => {
  it('requires token and correct origin and only serves its bound document', async () => {
    const { file } = await fixture();
    const service = await startServer(file, resolve('dist'));
    servers.push(service);
    const auth = { Authorization: `Bearer ${service.token}` };
    expect((await fetch(`${service.origin}/api/document`)).status).toBe(403);
    expect(
      (await fetch(`${service.origin}/api/document`, { headers: { ...auth, Origin: 'null' } }))
        .status,
    ).toBe(403);
    expect(
      (
        await fetch(`${service.origin}/api/document`, {
          headers: { ...auth, Origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(`${service.origin}/api/document?file=C:/secret`, { headers: auth })).status,
    ).toBe(200);
    const result = await (await fetch(`${service.origin}/api/document`, { headers: auth })).json();
    expect(result.file).toBe(file);
    expect((await fetch(`${service.origin}/api/arbitrary`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${service.origin}/package.json`)).status).toBe(404);
    const put = await fetch(`${service.origin}/api/document`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json', Origin: service.origin },
      body: JSON.stringify({
        html: result.html.replace('처음 제목', 'HTTP 변경'),
        revision: result.revision,
      }),
    });
    expect(put.status).toBe(200);
    const conflict = await fetch(`${service.origin}/api/document`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ html: result.html, revision: result.revision }),
    });
    expect(conflict.status).toBe(409);
    expect(await readFile(file, 'utf8')).toContain('HTTP 변경');
  });
});
