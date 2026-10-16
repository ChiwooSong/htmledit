import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { zipSync, strToU8 } from 'fflate';
import { ChangeRequestStore } from '../scripts/local/change-requests';
import { DocumentStore, prepareFile } from '../scripts/local/store';
import { startServer } from '../scripts/local/server';
import { readDocument, listElements, addNote, exportDocument } from '../src/model/document';
import { extractText } from '../src/requests/extract';
import { type ChangeProposal } from '../src/requests/types';

const paths: string[] = [];
const servers: Awaited<ReturnType<typeof startServer>>[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) {
    const done = once(s.server, 'close');
    s.server.close();
    s.server.closeAllConnections();
    await done;
  }
  for (const path of paths.splice(0)) {
    if (
      !resolve(path).startsWith(resolve(await realpath(tmpdir())) + sep) ||
      !path.includes('htmledit-requests-')
    )
      throw new Error('Unsafe cleanup');
    await rm(path, { recursive: true, force: true });
  }
});
async function fixture() {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'htmledit-requests-'));
  paths.push(dir);
  const original = join(dir, 'test.html');
  await writeFile(
    original,
    '<!doctype html><html><body><h1>제목</h1><p>설명</p><button>시작</button></body></html>',
  );
  const file = await prepareFile(original),
    document = new DocumentStore(file),
    store = new ChangeRequestStore(document);
  const doc = await document.read();
  const targets = listElements(readDocument(doc.html))
    .filter((e) => ['h1', 'p'].includes(e.tag))
    .map((e) => e.id);
  const batch = await store.create({
    title: '자유 메모',
    source:
      '제목은 "새 제목 😊"으로 바꾸고 <b>아이콘</b>도 넣자.\n\n설명은 지워. 아니, 설명은 남겨 둬.\n\n오늘 커피 맛있네.',
  });
  const checkout = await store.checkout(batch.id);
  const p: ChangeProposal = {
    id: 'title',
    text: '제목 문구를 새 제목 😊으로 변경',
    targetIds: [targets[0]],
    relation: 'self',
    evidence: [{ paragraphId: 'p1', quote: '제목은 "새 제목 😊"으로 바꾸고' }],
    issues: [],
  };
  const submit = (proposals: ChangeProposal[]) =>
    store.submit(batch.id, { revision: checkout.revision, submission: { version: 1, proposals } });
  return { dir, file, original, document, store, doc, batch, checkout, p, targets, submit };
}
it('submit never changes HTML; only human-approved proposals become stable, undoable notes', async () => {
  const f = await fixture();
  let session = readDocument(f.doc.html);
  session = addNote(session, f.targets[0], 'before', '기존 메모');
  await f.document.save(exportDocument(session, 'review'), f.doc.revision);
  const checkout = await f.store.checkout(f.batch.id);
  const before = await f.document.read();
  const submitted = await f.store.submit(f.batch.id, {
    revision: checkout.revision,
    submission: {
      version: 1,
      proposals: [f.p, { ...f.p, id: 'other', targetIds: f.targets, text: '공동 변경' }],
    },
  });
  expect(submitted.analysis?.proposals.map((p) => p.decision)).toEqual(['pending', 'pending']);
  expect(await readFile(f.file, 'utf8')).toBe(before.html);
  await expect(
    f.store.commit(f.batch.id, { revision: submitted.revision, documentRevision: before.revision }),
  ).rejects.toMatchObject({ code: 'REQUEST_UNRESOLVED' });
  const approved = await f.store.update(f.batch.id, {
    revision: submitted.revision,
    action: 'review',
    proposalId: 'title',
    decision: 'approved',
  });
  const result = await f.store.commit(f.batch.id, {
    revision: approved.revision,
    documentRevision: before.revision,
  });
  expect(result.addedIds).toHaveLength(1);
  const after = readDocument(result.document.html);
  expect(after.notes.map((n) => n.text)).toEqual(['기존 메모', f.p.text]);
  expect(exportDocument(after, 'clean')).toBe(exportDocument(readDocument(before.html), 'clean'));
  expect(result.document.html).not.toContain('오늘 커피');
  expect(result.batch.stale).toBe(false);
  expect(
    (
      await f.store.commit(f.batch.id, {
        revision: approved.revision,
        documentRevision: result.document.revision,
      })
    ).addedIds,
  ).toEqual([]);
  const undone = await f.document.save(before.html, result.document.revision);
  expect((await f.store.get(f.batch.id)).convertedNoteIds).toEqual([]);
  const recovered = await f.store.commit(f.batch.id, {
    revision: approved.revision,
    documentRevision: undone.revision,
  });
  expect(recovered.addedIds).toEqual(result.addedIds);
  expect(
    (await new ChangeRequestStore(new DocumentStore(f.file)).get(f.batch.id)).convertedNoteIds,
  ).toEqual(result.addedIds);
  await f.store.remove(f.batch.id, approved.revision);
  expect(readDocument((await f.document.read()).html).notes).toHaveLength(2);
  expect(await f.store.list()).toEqual([]);
});
it('rejects AI approval, fabricated targets/evidence, duplicate IDs and unsafe extra fields', async () => {
  const f = await fixture();
  for (const proposal of [
    { ...f.p, decision: 'approved' },
    { ...f.p, targetIds: ['nonexistent'] },
    { ...f.p, evidence: [{ paragraphId: 'p1', quote: 'fabricated' }] },
    { ...f.p, issues: ['invented'] },
  ]) {
    await expect(f.submit([proposal as ChangeProposal])).rejects.toBeTruthy();
  }
  await expect(f.submit([f.p, f.p])).rejects.toMatchObject({ code: 'REQUEST_PROPOSAL' });
  expect(await readFile(f.file, 'utf8')).toBe(f.doc.html);
  const b = await f.submit([f.p]);
  const approved = await f.store.update(b.id, {
    revision: b.revision,
    action: 'review',
    proposalId: 'title',
    decision: 'approved',
  });
  expect((await f.submit([f.p])).analysis?.proposals[0].decision).toBe('approved');
  expect((await f.store.get(b.id)).revision).toBe(approved.revision);
});
it('unresolved and conflicting requests cannot bypass individual or bulk approval', async () => {
  const f = await fixture();
  let b = await f.submit([{ ...f.p, targetIds: [], issues: ['conflict'] }]);
  await expect(
    f.store.update(b.id, {
      revision: b.revision,
      action: 'review',
      proposalId: 'title',
      decision: 'approved',
      resolved: true,
    }),
  ).rejects.toMatchObject({ code: 'REQUEST_UNRESOLVED' });
  await expect(
    f.store.update(b.id, { revision: b.revision, action: 'approve-selected', ids: ['title'] }),
  ).rejects.toMatchObject({ code: 'REQUEST_UNRESOLVED' });
  b = await f.store.update(b.id, {
    revision: b.revision,
    action: 'review',
    proposalId: 'title',
    text: '사용자가 확정한 내용',
    targetIds: f.targets,
    resolved: true,
    decision: 'approved',
  });
  const result = await f.store.commit(b.id, {
    revision: b.revision,
    documentRevision: f.doc.revision,
  });
  expect(readDocument(result.document.html).notes[0].targets).toHaveLength(2);
  expect(result.document.html).toContain('"version":2');
});
it('bulk approval is atomic, text edits revoke approval, and withdrawn clarification prevents conversion', async () => {
  const f = await fixture();
  let b = await f.submit([
    f.p,
    { ...f.p, id: 'second', targetIds: [f.targets[1]] },
    { ...f.p, id: 'uncertain', issues: ['unclear'] },
  ]);
  await expect(
    f.store.update(b.id, {
      revision: b.revision,
      action: 'approve-selected',
      ids: ['title', 'uncertain'],
    }),
  ).rejects.toMatchObject({ code: 'REQUEST_UNRESOLVED' });
  expect((await f.store.get(b.id)).analysis?.proposals.every((p) => p.decision === 'pending')).toBe(
    true,
  );
  b = await f.store.update(b.id, {
    revision: b.revision,
    action: 'approve-selected',
    ids: ['title', 'second'],
  });
  expect(b.analysis?.proposals.filter((p) => p.decision === 'approved')).toHaveLength(2);
  b = await f.store.update(b.id, {
    revision: b.revision,
    action: 'review',
    proposalId: 'title',
    text: '사용자가 요청을 변경',
  });
  expect(b.analysis?.proposals[0].decision).toBe('pending');
  b = await f.store.update(b.id, {
    revision: b.revision,
    action: 'review',
    proposalId: 'uncertain',
    resolved: true,
    decision: 'approved',
  });
  b = await f.store.update(b.id, {
    revision: b.revision,
    action: 'review',
    proposalId: 'uncertain',
    resolved: false,
  });
  expect(b.analysis?.proposals[2].decision).toBe('pending');
  const result = await f.store.commit(b.id, {
    revision: b.revision,
    documentRevision: f.doc.revision,
  });
  expect(result.noteIds).toEqual([b.noteIds.second]);
});
it('changed source/HTML and old revisions block conversion; reanalysis resets approvals', async () => {
  const f = await fixture();
  let b = await f.submit([f.p]);
  b = await f.store.update(b.id, {
    revision: b.revision,
    action: 'review',
    proposalId: 'title',
    decision: 'approved',
  });
  const changed = await f.document.save(
    f.doc.html.replace('제목</h1>', '수정</h1>'),
    f.doc.revision,
  );
  expect((await f.store.get(b.id)).stale).toBe(true);
  await expect(
    f.store.commit(b.id, { revision: b.revision, documentRevision: changed.revision }),
  ).rejects.toMatchObject({ code: 'REQUEST_STALE' });
  const c = await f.store.checkout(b.id);
  b = await f.store.submit(b.id, {
    revision: c.revision,
    submission: { version: 1, proposals: [f.p] },
  });
  expect(b.analysis?.proposals[0].decision).toBe('pending');
  expect(b.history).toHaveLength(1);
  const old = b.revision;
  b = await f.store.update(b.id, {
    revision: old,
    action: 'source',
    title: b.title,
    source: '새 요구',
  });
  expect(b.stale).toBe(true);
  await expect(
    f.store.update(b.id, { revision: old, action: 'source', title: b.title, source: '덮어쓰기' }),
  ).rejects.toMatchObject({ code: 'REQUEST_REVISION' });
  expect((await f.store.get(b.id)).source).toBe('새 요구');
});
it('allows zero suggestions and accepts no prescribed source format', async () => {
  const f = await fixture();
  expect((await f.submit([])).analysis).toMatchObject({ submitted: true, proposals: [] });
  for (const source of [
    '회의에서 제목 바꾸기로 함',
    '부장님: 버튼 이름은 문의로',
    '혼자 생각해보니 설명 빼자',
    '1. 제목 수정\n2. 아이콘 추가',
    '색은 파랑. 왜냐면 어제 얘기한 브랜드… 아 그리고 버튼도 바꾸자',
  ]) {
    const b = await f.store.create({ source });
    expect(b.paragraphs[0].text).toBe(source);
  }
});
it('authenticated APIs separate analysis from browser review and preserve HTTP errors', async () => {
  const f = await fixture(),
    server = await startServer(f.file, resolve('dist'));
  servers.push(server);
  const url = new URL(server.url),
    token = new URLSearchParams(url.hash.slice(1)).get('htmledit')!;
  const endpoint = url.origin + '/api/change-requests';
  expect((await fetch(endpoint)).status).toBe(403);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  expect(
    (await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ source: '요청' }) }))
      .status,
  ).toBe(403);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...headers, Origin: url.origin },
    body: JSON.stringify({ source: '요청' }),
  });
  expect(response.status).toBe(201);
  const b = await response.json();
  const c = await fetch(`${endpoint}/${b.id}/checkout`, { method: 'POST', headers, body: '{}' });
  expect(c.ok).toBe(true);
  const check = await c.json();
  const submitted = await fetch(`${endpoint}/${b.id}/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ revision: check.revision, submission: { version: 1, proposals: [] } }),
  });
  expect(submitted.ok).toBe(true);
  expect((await fetch(`${endpoint}/${b.id}`, { method: 'PUT', headers, body: '{}' })).status).toBe(
    403,
  );
});
it('extracts plain UTF8 and DOCX text without executing markup; rejects corruption and limits', () => {
  const text = '한글 😊 "따옴표" <script>alert(1)</script>';
  expect(extractText(strToU8(text), 'md')).toBe(text);
  expect(() => extractText(new Uint8Array([0xff]), 'txt')).toThrow('UTF8');
  expect(() => extractText(strToU8(''), 'txt')).toThrow('EMPTY');
  expect(() => extractText(strToU8('x'.repeat(200001)), 'txt')).toThrow('SIZE');
  expect(() => extractText(strToU8('x'), 'pdf')).toThrow('TYPE');
  const docx = (xml: string) =>
    zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8(xml) });
  const xml =
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>제목</w:t></w:r><w:r><w:t> 변경 😊</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>표 수정</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  expect(extractText(docx(xml), 'docx')).toBe('제목 변경 😊\n\n표 수정');
  expect(() => extractText(strToU8('broken'), 'docx')).toThrow('DOCX');
  expect(() => extractText(docx('<!DOCTYPE x [<!ENTITY x "x">]>' + xml), 'docx')).toThrow('DOCX');
  expect(() => extractText(docx('<w:document>'), 'docx')).toThrow('DOCX');
  const bomb = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(xml),
    padding: new Uint8Array(51 * 1024 * 1024),
  });
  expect(() => extractText(bomb, 'docx')).toThrow('SIZE');
});
