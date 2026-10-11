import { readDocument, validateNotes, type DocumentSession } from '../model/document';

export interface Draft {
  session: DocumentSession;
  savedAt: number;
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('htmledit-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 창에서 임시 저장 공간을 사용 중입니다.'));
  });
}
async function operation<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', mode);
    const request = action(transaction.objectStore('drafts'));
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('임시 저장을 완료하지 못했습니다.'));
    };
  });
}
export async function loadDraft(): Promise<Draft | null> {
  const value = await operation('readonly', (store) => store.get('latest'));
  if (!value) return null;
  if (
    typeof value.savedAt !== 'number' ||
    !value.session ||
    typeof value.session.html !== 'string' ||
    typeof value.session.fileName !== 'string'
  )
    throw new Error('임시 작업 데이터가 손상되었습니다.');
  const session = readDocument(value.session.html, value.session.fileName);
  // Include notes newly recognized inside a saved browser source-viewer page.
  session.notes = [
    ...new Map(
      [...session.notes, ...validateNotes(value.session.notes)].map((note) => [note.id, note]),
    ).values(),
  ];
  session.metadataIssue =
    typeof value.session.metadataIssue === 'string'
      ? value.session.metadataIssue
      : session.metadataIssue;
  session.warnings = [
    ...new Set([
      ...session.warnings,
      ...(Array.isArray(value.session.warnings)
        ? value.session.warnings.filter(
            (item: unknown) =>
              typeof item === 'string' && !item.startsWith('스크립트는 편집 중 실행되지 않습니다.'),
          )
        : []),
    ]),
  ] as string[];
  return { session, savedAt: value.savedAt };
}
export async function saveDraft(session: DocumentSession): Promise<number> {
  const savedAt = Date.now();
  await operation('readwrite', (store) => store.put({ session, savedAt }, 'latest'));
  return savedAt;
}
export const deleteDraft = () => operation('readwrite', (store) => store.delete('latest'));
