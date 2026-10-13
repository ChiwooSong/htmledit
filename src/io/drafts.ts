import { message, MessageError, legacyMessage, isMessage } from '../i18n';
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
    request.onblocked = () => reject(new MessageError(message('anotherWindowIsUsingDraftStorage')));
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
      reject(transaction.error ?? new MessageError(message('couldNotFinishSavingTheDraft')));
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
    throw new MessageError(message('draftDataIsDamaged'));
  const session = readDocument(value.session.html, value.session.fileName);
  // Include notes newly recognized inside a saved browser source-viewer page.
  session.notes = [
    ...new Map(
      [...session.notes, ...validateNotes(value.session.notes)].map((note) => [note.id, note]),
    ).values(),
  ];
  session.metadataIssue =
    typeof value.session.metadataIssue === 'string' || isMessage(value.session.metadataIssue)
      ? typeof value.session.metadataIssue === 'string'
        ? legacyMessage(value.session.metadataIssue)
        : value.session.metadataIssue
      : session.metadataIssue;
  const warnings = [
    ...session.warnings,
    ...(Array.isArray(value.session.warnings)
      ? value.session.warnings.filter(
          (item: unknown) =>
            isMessage(item) ||
            (typeof item === 'string' && !item.startsWith('스크립트는 편집 중 실행되지 않습니다.')),
        )
      : []),
  ].map((item) => (typeof item === 'string' ? legacyMessage(item) : item));
  session.warnings = [...new Map(warnings.map((item) => [JSON.stringify(item), item])).values()];
  return { session, savedAt: value.savedAt };
}
export async function saveDraft(session: DocumentSession): Promise<number> {
  const savedAt = Date.now();
  await operation('readwrite', (store) => store.put({ session, savedAt }, 'latest'));
  return savedAt;
}
export const deleteDraft = () => operation('readwrite', (store) => store.delete('latest'));
