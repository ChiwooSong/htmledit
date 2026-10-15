import { describe, expect, it } from 'vitest';
import {
  addNote,
  deleteElements,
  exportDocument,
  listElements,
  noteTargets,
  readDocument,
  rebindNote,
  updateNote,
  validateNotes,
} from '../src/model/document';
import { commit, createHistory, redo, undo } from '../src/model/history';
import { validateReview } from '../scripts/local/store';

const initial = () =>
  readDocument(
    '<html lang="ko"><body><article><h1>제목</h1><p>설명</p></article><footer>끝</footer></body></html>',
  );
const id = (session: ReturnType<typeof initial>, tag: string) =>
  listElements(session).find((item) => item.tag === tag)!.id;

describe('multiple selection commands and joint notes', () => {
  it('deletes parent/child selections atomically and restores everything in one undo', () => {
    const session = initial();
    const targets = [id(session, 'h1'), id(session, 'article'), id(session, 'p')];
    const withNote = addNote(session, targets, 'self', '이 내용을 합쳐 주세요 👋 <b> "ação"');
    const removed = deleteElements(withNote, targets);
    expect(listElements(removed).map((item) => item.tag)).toEqual(['body', 'footer']);
    expect(removed.notes).toEqual(withNote.notes);
    const history = commit(createHistory(withNote), removed);
    expect(undo(history).present).toEqual(withNote);
    expect(redo(undo(history)).present).toEqual(removed);
    expect(() => deleteElements(session, [id(session, 'h1'), id(session, 'body')])).toThrow();
    expect(() => deleteElements(session, [id(session, 'h1'), 'missing'])).toThrow();
    expect(listElements(session)).toHaveLength(5);
  });

  it('round-trips one joint note, retains v1 for single notes and strips all tool data in final HTML', () => {
    const session = initial();
    const ids = [id(session, 'h1'), id(session, 'p')];
    const single = addNote(session, ids[0], 'self', 'Single');
    expect(exportDocument(single, 'review')).toContain('"version":1');
    const group = addNote(single, ids, 'self', '한 문장으로 합치기 </script> 日本語');
    const html = exportDocument(group, 'review');
    expect(html).toContain('"version":2');
    expect(html).toContain('ONE joint request');
    expect(html).not.toContain('합치기 </script>');
    const restored = readDocument(html);
    expect(restored.metadataIssue).toBeUndefined();
    expect(restored.notes).toEqual(group.notes);
    expect(noteTargets(restored.notes[1]).map((target) => target.id)).toEqual(ids);
    expect(exportDocument(restored, 'clean')).not.toMatch(/htmledit|HANDOFF/);
    expect(exportDocument(restored, 'clean')).toContain('lang="ko"');
    const rebound = rebindNote(group, group.notes[1].id, id(session, 'footer'));
    expect(rebound.notes[1].targets).toBeUndefined();
    expect(exportDocument(rebound, 'review')).toContain('"version":1');
    expect(rebindNote(rebound, group.notes[1].id, ids).notes[1].targets).toHaveLength(2);
  });

  it('rejects malformed groups instead of silently dropping their targets', () => {
    const session = initial();
    const group = addNote(session, [id(session, 'h1'), id(session, 'p')], 'self', 'merge');
    const note = group.notes[0];
    for (const targets of [
      null,
      [],
      [note.targets![0]],
      [...note.targets!, note.targets![0]],
      [{ ...note.targets![0], id: 'other' }, note.targets![1]],
    ]) {
      expect(() => validateNotes([{ ...note, targets }])).toThrow();
    }
    expect(
      readDocument(exportDocument(group, 'review').replace('"version":2', '"version":1'))
        .metadataIssue,
    ).toBeDefined();
    expect(
      readDocument(exportDocument(group, 'review').replace('"version":2', '"version":99'))
        .metadataIssue,
    ).toBeDefined();
    const duplicate = group.html.replace(
      `data-htmledit-id="${id(session, 'p')}"`,
      `data-htmledit-id="${id(session, 'h1')}"`,
    );
    const restored = readDocument(exportDocument({ ...group, html: duplicate }, 'review'));
    expect(restored.notes).toEqual(group.notes);
    expect(listElements(restored).some((item) => item.id === id(session, 'h1'))).toBe(false);
  });

  it('requires AI apply to preserve the entire target list and pending targets', () => {
    const session = initial();
    const ids = [id(session, 'h1'), id(session, 'p')];
    const group = addNote(session, ids, 'self', 'merge');
    const previous = exportDocument(group, 'review');
    const missing = deleteElements(group, [ids[1]]);
    expect(() => validateReview(exportDocument(missing, 'review'), previous)).toThrow();
    const changed = rebindNote(group, group.notes[0].id, ids[0]);
    expect(() => validateReview(exportDocument(changed, 'review'), previous)).toThrow();
    const reordered = rebindNote(group, group.notes[0].id, [...ids].reverse());
    expect(() => validateReview(exportDocument(reordered, 'review'), previous)).toThrow();
    const changedSummary = structuredClone(group);
    changedSummary.notes[0].targets![1].excerpt = 'changed';
    expect(() => validateReview(exportDocument(changedSummary, 'review'), previous)).toThrow();
    const done = updateNote(missing, group.notes[0].id, { done: true });
    expect(validateReview(exportDocument(done, 'review'), previous).notes[0].done).toBe(true);
  });
});
