import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, realpath, lstat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import {
  readDocument,
  exportDocument,
  walk,
  TARGET_ATTR,
  REVIEW_ID,
} from '../../src/model/document';

export const LIMIT = 25 * 1024 * 1024;
export class LocalError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
// Working files live next to the user's document, which may be inside a Git
// repository. The .htmledit root gets a `*` .gitignore once; an existing file is kept.
async function localDirectory(root: string, directory: string) {
  await mkdir(directory, { recursive: true });
  if ((await realpath(directory)) !== resolve(directory))
    throw new LocalError(
      'PATH_CHANGED',
      '작업용 폴더가 다른 위치를 가리킵니다. 링크를 제거한 뒤 다시 시도해 주세요.',
    );
  try {
    await writeFile(join(root, '.gitignore'), '*\n', { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}
export async function canonicalFile(file: string) {
  if (!/\.html?$/i.test(file)) throw new LocalError('FILE_TYPE', 'HTML 파일을 지정해 주세요.');
  const resolved = await realpath(resolve(file));
  if (!(await lstat(resolved)).isFile())
    throw new LocalError('FILE_TYPE', '일반 파일만 열 수 있습니다.');
  return resolved;
}
export async function snapshot(file: string) {
  const size = (await lstat(file)).size;
  if (size > LIMIT) throw new LocalError('SIZE_LIMIT', 'HTML은 25MB 이하만 지원합니다.');
  const bytes = await readFile(file);
  if (bytes.length > LIMIT) throw new LocalError('SIZE_LIMIT', 'HTML은 25MB 이하만 지원합니다.');
  let html: string;
  try {
    html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new LocalError('ENCODING', 'UTF-8 HTML만 지원합니다.');
  }
  return { html, revision: hash(bytes), file, fileName: basename(file) };
}
// Validate raw IDs before readDocument can repair duplicate IDs for the editor.
export function validateReview(html: string, previous?: string) {
  if (Buffer.byteLength(html) > LIMIT)
    throw new LocalError('SIZE_LIMIT', 'HTML은 25MB 이하만 지원합니다.');
  const ids = new Set<string>();
  let blocks = 0;
  walk(parse(html), (node) => {
    if (!('tagName' in node)) return;
    const element = node as T.Element;
    if (element.attrs.some((a) => a.name === 'id' && a.value === REVIEW_ID)) blocks++;
    const id = element.attrs.find((a) => a.name === TARGET_ATTR)?.value;
    if (id) {
      if (ids.has(id) || !/^[\w-]{1,100}$/.test(id))
        throw new LocalError('TARGET_ID', '대상 식별자가 중복되거나 잘못되었습니다.');
      ids.add(id);
    }
  });
  const session = readDocument(html);
  if (blocks !== 1 || session.metadataIssue)
    throw new LocalError('METADATA', '메모 형식 v1을 보존한 작업 파일이 필요합니다.');
  if (previous !== undefined) {
    const old = readDocument(previous);
    if (old.metadataIssue)
      throw new LocalError(
        'METADATA',
        '기존 메모가 손상되었습니다. 편집기에서 먼저 확인해 주세요.',
      );
    for (const note of old.notes) {
      const next = session.notes.find((n) => n.id === note.id);
      if (
        !next ||
        next.targetId !== note.targetId ||
        next.text !== note.text ||
        next.relation !== note.relation
      )
        throw new LocalError(
          'NOTE_CHANGED',
          'AI 수정안은 기존 메모의 ID·내용·대상·위치를 보존해야 합니다.',
        );
      if (!note.done && next.done && !ids.has(next.targetId)) {
        // Completed deletion requests legitimately remove their targets.
        continue;
      }
      if (!next.done && !ids.has(next.targetId))
        throw new LocalError(
          'ORPHAN_NOTE',
          '미완료 메모의 대상이 없습니다. 편집기에서 대상을 재지정해 주세요.',
        );
    }
  }
  return session;
}
export async function prepareFile(input: string) {
  const source = await canonicalFile(input);
  const current = await snapshot(source);
  if (/\.review\.html?$/i.test(source)) return source;
  const session = readDocument(current.html, current.fileName);
  if (session.metadataIssue)
    throw new LocalError(
      'METADATA',
      '원본 메모가 손상되었습니다. 다운로드 방식 편집기에서 먼저 확인해 주세요.',
    );
  const file = source.replace(/\.html?$/i, '.review.html');
  const html = exportDocument(session, 'review');
  validateReview(html);
  try {
    await writeFile(file, html, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new LocalError(
        'EXISTS',
        `작업 파일이 이미 있습니다. 이 파일을 직접 열어 주세요: ${file}`,
      );
    throw error;
  }
  return canonicalFile(file);
}
// A native file choice may name the original again. Reuse its existing review,
// validating it instead of replacing saved edits or notes.
export async function prepareSelectedFile(input: string) {
  const source = await canonicalFile(input);
  let file: string;
  try {
    file = await prepareFile(source);
  } catch (error) {
    if (!(error instanceof LocalError) || error.code !== 'EXISTS') throw error;
    file = await canonicalFile(source.replace(/\.html?$/i, '.review.html'));
  }
  validateReview((await snapshot(file)).html);
  return file;
}
export class DocumentStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public file: string) {}
  private get root() {
    return join(dirname(this.file), '.htmledit');
  }
  private get workspace() {
    return join(this.root, hash(this.file).slice(0, 16));
  }
  private get draftFile() {
    return join(this.workspace, 'draft.json');
  }
  async draft() {
    try {
      if ((await lstat(this.draftFile)).size > LIMIT * 2 + 4096)
        throw new LocalError('SIZE_LIMIT', '임시 작업이 너무 큽니다.');
      const value = JSON.parse(await readFile(this.draftFile, 'utf8'));
      if (
        typeof value?.html !== 'string' ||
        typeof value?.revision !== 'string' ||
        typeof value?.savedAt !== 'number'
      )
        throw new LocalError('DRAFT', '임시 작업이 손상되었습니다.');
      validateReview(value.html);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async saveDraft(html: string, revision: string) {
    validateReview(html);
    const savedAt = Date.now();
    if (html === (await this.read()).html) {
      await unlink(this.draftFile).catch(() => {});
      return { savedAt };
    }
    await localDirectory(this.root, this.workspace);
    const temp = `${this.draftFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify({ html, revision, savedAt }));
      await rename(temp, this.draftFile);
    } finally {
      await unlink(temp).catch(() => {});
    }
    return { savedAt };
  }
  private async checkPath() {
    if ((await lstat(this.file)).isSymbolicLink() || (await realpath(this.file)) !== this.file)
      throw new LocalError('PATH_CHANGED', '작업 파일 경로가 변경되었습니다. 다시 연결해 주세요.');
  }
  async read() {
    await this.checkPath();
    return snapshot(this.file);
  }
  async status() {
    const value = await this.read();
    const session = readDocument(value.html, value.fileName);
    const root = parse(value.html);
    const counts = new Map<string, number>();
    walk(root, (n) => {
      if ('attrs' in n) {
        const id = n.attrs.find((a) => a.name === TARGET_ATTR)?.value;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    });
    return {
      file: value.file,
      revision: value.revision,
      metadataIssue: session.metadataIssue,
      notes: session.notes.map((n) => ({ ...n, targetFound: counts.get(n.targetId) === 1 })),
    };
  }
  async checkout() {
    const value = await this.read();
    validateReview(value.html);
    const directory = join(this.workspace, 'candidates');
    await localDirectory(this.root, directory);
    const candidate = join(directory, `${randomUUID()}.review.html`);
    await writeFile(candidate, value.html, { flag: 'wx' });
    return { file: this.file, candidate, revision: value.revision };
  }
  save(html: string, revision: string, ai = false) {
    const operation = this.queue.then(async () => {
      const current = await this.read();
      if (current.revision !== revision)
        throw new LocalError(
          'CONFLICT',
          '파일이 변경되었습니다. 최신 작업 파일을 다시 읽어 주세요.',
          409,
        );
      validateReview(html, ai ? current.html : undefined);
      const directory = join(this.workspace, 'backups');
      await localDirectory(this.root, directory);
      const backup = join(directory, `${Date.now()}-${randomUUID()}.html`);
      // Preserve original bytes, including BOM, in the backup.
      const original = await readFile(this.file);
      if (hash(original) !== revision)
        throw new LocalError('CONFLICT', '파일이 변경되었습니다. 다시 읽어 주세요.', 409);
      await writeFile(backup, original, { flag: 'wx' });
      const temp = join(dirname(this.file), `.${basename(this.file)}.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, html, { flag: 'wx' });
        await this.checkPath();
        if ((await snapshot(this.file)).revision !== revision)
          throw new LocalError('CONFLICT', '파일이 변경되었습니다. 다시 읽어 주세요.', 409);
        await rename(temp, this.file);
      } finally {
        await unlink(temp).catch(() => {});
      }
      return { ...(await this.read()), backup };
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
