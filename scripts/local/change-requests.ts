import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  readdir,
  rm,
  realpath,
  lstat,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DocumentStore, LocalError, hash, validateReview } from './store';
import {
  readDocument,
  exportDocument,
  addNote,
  listElements,
  RELATIONS,
} from '../../src/model/document';
import {
  SOURCE_LIMIT,
  paragraphs,
  type ChangeRequestBatch,
  type ChangeProposal,
  type ReviewedProposal,
  type BatchView,
} from '../../src/requests/types';

function fail(code: string, detail: string): never {
  throw new LocalError(
    `REQUEST_${code}`,
    detail,
    code === 'STALE' || code === 'REVISION' ? 409 : 400,
  );
}
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const noteId = (batch: ChangeRequestBatch, proposalId: string) =>
  `he-request-${hash(`${batch.id}:${batch.analysis!.number}:${proposalId}`).slice(0, 40)}`;
function sourceText(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > SOURCE_LIMIT)
    fail('SOURCE', 'Provide non-empty text, up to 200,000 characters.');
  return (value as string).replace(/\r\n?/g, '\n');
}
function titleText(value: unknown) {
  if (typeof value !== 'string' || value.length > 200)
    fail('INPUT', 'Title must be at most 200 characters.');
  return (value as string).trim() || 'Change requests';
}
function fingerprint(html: string, batch: ChangeRequestBatch) {
  const session = readDocument(html);
  const own = new Set(batch.analysis?.proposals.map((p) => noteId(batch, p.id)) ?? []);
  return hash(
    exportDocument({ ...session, notes: session.notes.filter((n) => !own.has(n.id)) }, 'review'),
  );
}
const targetIds = (html: string) => new Set(listElements(readDocument(html)).map((el) => el.id));
function validateProposal(
  value: unknown,
  batch: ChangeRequestBatch,
  ids: Set<string>,
): ChangeProposal {
  const keys = ['id', 'text', 'targetIds', 'relation', 'evidence', 'issues'];
  if (
    !record(value) ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in value))
  )
    fail('PROPOSAL', 'Invalid proposal fields. AI submissions cannot set approval state.');
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' ||
    !idPattern.test(v.id) ||
    typeof v.text !== 'string' ||
    !v.text.trim() ||
    v.text.length > 20_000
  )
    fail('PROPOSAL', 'Invalid proposal ID or text.');
  if (
    !Array.isArray(v.targetIds) ||
    v.targetIds.length > 5000 ||
    v.targetIds.some((id) => typeof id !== 'string' || !idPattern.test(id)) ||
    new Set(v.targetIds).size !== v.targetIds.length
  )
    fail('TARGET', 'Invalid target list.');
  if ((v.targetIds as string[]).some((id) => !ids.has(id)))
    fail('TARGET', 'A target does not exist in the analysis document.');
  if (typeof v.relation !== 'string' || !Object.hasOwn(RELATIONS, v.relation))
    fail('PROPOSAL', 'Invalid position.');
  if (
    !Array.isArray(v.issues) ||
    v.issues.some((i) => !['missing-target', 'unclear', 'conflict'].includes(i)) ||
    new Set(v.issues).size !== v.issues.length
  )
    fail('PROPOSAL', 'Invalid review issues.');
  if (!Array.isArray(v.evidence) || !v.evidence.length || v.evidence.length > 100)
    fail('EVIDENCE', 'Every proposal needs source evidence.');
  for (const e of v.evidence as unknown[]) {
    if (
      !record(e) ||
      Object.keys(e).some((k) => !['paragraphId', 'quote'].includes(k)) ||
      typeof e.paragraphId !== 'string' ||
      typeof e.quote !== 'string' ||
      !e.quote.trim() ||
      e.quote.length > 20_000 ||
      !batch.paragraphs.find((p) => p.id === e.paragraphId)?.text.includes(e.quote)
    )
      fail('EVIDENCE', 'Evidence must quote the referenced source paragraph exactly.');
  }
  const p = structuredClone(v) as unknown as ChangeProposal;
  if (!p.targetIds.length && !p.issues.includes('missing-target')) p.issues.push('missing-target');
  return p;
}

export class ChangeRequestStore {
  private queue: Promise<unknown> = Promise.resolve();
  readonly directory: string;
  constructor(readonly document: DocumentStore) {
    this.directory = join(
      dirname(document.file),
      '.htmledit',
      hash(document.file).slice(0, 16),
      'requests',
    );
  }
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(run);
    this.queue = operation.catch(() => {});
    return operation;
  }
  private path(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) fail('INPUT', 'Invalid request batch ID.');
    return join(this.directory, id);
  }
  private async safe(directory: string, create = false) {
    if (create) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(dirname(dirname(this.directory)), '.gitignore'), '*\n', {
        flag: 'wx',
      }).catch((e) => {
        if (e.code !== 'EEXIST') throw e;
      });
    }
    if ((await realpath(directory)) !== resolve(directory))
      fail('PATH', 'Request folder changed. Reopen the document.');
  }
  private async read(id: string): Promise<ChangeRequestBatch> {
    const directory = this.path(id);
    await this.safe(directory);
    const file = join(directory, 'batch.json');
    if ((await lstat(file)).isSymbolicLink() || (await lstat(file)).size > 25 * 1024 * 1024)
      fail('INPUT', 'Invalid request data file.');
    const batch = JSON.parse(await readFile(file, 'utf8'));
    if (
      !record(batch) ||
      batch.version !== 1 ||
      batch.id !== id ||
      !Array.isArray(batch.history) ||
      !Array.isArray(batch.paragraphs) ||
      typeof batch.revision !== 'string'
    )
      fail('INPUT', 'Unsupported or damaged request data.');
    return batch as unknown as ChangeRequestBatch;
  }
  private async write(batch: ChangeRequestBatch) {
    const directory = this.path(batch.id);
    await this.safe(directory, true);
    batch.updatedAt = Date.now();
    batch.revision = randomUUID();
    const data = JSON.stringify(batch);
    if (Buffer.byteLength(data) > 25 * 1024 * 1024)
      fail('INPUT', 'Request history is too large. Create a new batch.');
    const tmp = join(directory, `${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, data, { flag: 'wx' });
      await rename(tmp, join(directory, 'batch.json'));
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }
  private check(batch: ChangeRequestBatch, revision: unknown) {
    if (batch.revision !== revision)
      fail('REVISION', 'The request batch changed. Refresh and review it again.');
  }
  private async view(batch: ChangeRequestBatch): Promise<BatchView> {
    const doc = await this.document.read();
    validateReview(doc.html);
    const notes = new Set(readDocument(doc.html).notes.map((n) => n.id));
    const noteIds = Object.fromEntries(
      (batch.analysis?.proposals ?? []).map((p) => [p.id, noteId(batch, p.id)]),
    );
    return {
      ...batch,
      stale:
        !!batch.analysis &&
        (batch.sourceHash !== batch.analysis.sourceHash ||
          fingerprint(doc.html, batch) !== batch.analysis.fingerprint),
      noteIds,
      convertedNoteIds: Object.values(noteIds).filter((id) => notes.has(id)),
    };
  }
  async list() {
    try {
      await this.safe(this.directory);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const ids = (await readdir(this.directory, { withFileTypes: true })).filter(
      (e) => e.isDirectory() && /^[0-9a-f-]{36}$/.test(e.name),
    );
    const batches = await Promise.all(
      ids.map(async (e) => {
        const b = await this.read(e.name);
        return { id: b.id, title: b.title, updatedAt: b.updatedAt };
      }),
    );
    return batches.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async get(id: string) {
    return this.view(await this.read(id));
  }
  create(data: Record<string, unknown>) {
    return this.serial(async () => {
      const source = sourceText(data.source);
      const batch: ChangeRequestBatch = {
        version: 1,
        id: randomUUID(),
        title: titleText(data.title ?? ''),
        source,
        sourceHash: hash(source),
        paragraphs: paragraphs(source),
        revision: '',
        updatedAt: 0,
        history: [],
      };
      await this.write(batch);
      return this.view(batch);
    });
  }
  update(id: string, data: Record<string, unknown>) {
    return this.serial(async () => {
      const b = await this.read(id);
      this.check(b, data.revision);
      if (data.action === 'source') {
        b.source = sourceText(data.source);
        b.title = titleText(data.title);
        b.sourceHash = hash(b.source);
        b.paragraphs = paragraphs(b.source);
      } else if (data.action === 'review') {
        const view = await this.view(b);
        if (view.stale) fail('STALE', 'Reanalyze the changed document or source first.');
        const p = b.analysis?.proposals.find((p) => p.id === data.proposalId);
        if (!p || !b.analysis?.submitted) fail('PROPOSAL', 'Proposal not found.');
        if (view.convertedNoteIds.includes(noteId(b, p.id)))
          fail('CONVERTED', 'Edit the converted note in the editor.');
        const previous = JSON.stringify({
          text: p.text,
          targetIds: p.targetIds,
          relation: p.relation,
        });
        const validated = validateProposal(
          {
            id: p.id,
            text: data.text ?? p.text,
            targetIds: data.targetIds ?? p.targetIds,
            relation: data.relation ?? p.relation,
            evidence: p.evidence,
            issues: p.issues,
          },
          b,
          targetIds((await this.document.read()).html),
        );
        Object.assign(p, validated);
        if (
          previous !==
          JSON.stringify({ text: p.text, targetIds: p.targetIds, relation: p.relation })
        ) {
          p.decision = 'pending';
          p.resolved = false;
        }
        if (typeof data.resolved === 'boolean') {
          p.resolved = data.resolved;
          if (!p.resolved && p.issues.length && p.decision === 'approved') p.decision = 'pending';
        }
        if (data.decision !== undefined) {
          if (!['pending', 'approved', 'excluded'].includes(String(data.decision)))
            fail('INPUT', 'Invalid review decision.');
          if (
            data.decision === 'approved' &&
            (!p.targetIds.length || (p.issues.length && !p.resolved))
          )
            fail('UNRESOLVED', 'Resolve the request and select its targets before approving.');
          p.decision = data.decision as ReviewedProposal['decision'];
        }
      } else if (data.action === 'approve-selected') {
        const view = await this.view(b);
        if (view.stale) fail('STALE', 'Reanalyze first.');
        if (!Array.isArray(data.ids) || !data.ids.length) fail('INPUT', 'Select proposals first.');
        for (const id of data.ids as string[]) {
          const p = b.analysis?.proposals.find((p) => p.id === id);
          if (
            !p ||
            !p.targetIds.length ||
            p.issues.length ||
            view.convertedNoteIds.includes(noteId(b, p.id))
          )
            fail('UNRESOLVED', 'Bulk approval excludes proposals needing clarification.');
          p.decision = 'approved';
        }
      } else fail('INPUT', 'Unknown review action.');
      await this.write(b);
      return this.view(b);
    });
  }
  checkout(id: string) {
    return this.serial(async () => {
      const b = await this.read(id),
        doc = await this.document.read();
      validateReview(doc.html);
      if (b.analysis) b.history.push(b.analysis);
      b.analysis = {
        number: (b.analysis?.number ?? 0) + 1,
        documentRevision: doc.revision,
        fingerprint: '',
        sourceHash: b.sourceHash,
        checkoutRevision: randomUUID(),
        submitted: false,
        proposals: [],
      };
      b.analysis.fingerprint = fingerprint(doc.html, b);
      const directory = this.path(id);
      await this.safe(directory, true);
      const prefix = `round-${b.analysis.number}-${b.analysis.checkoutRevision}`;
      const snapshot = join(directory, `${prefix}.html`),
        candidate = join(directory, `${prefix}.proposals.json`);
      await writeFile(snapshot, doc.html, { flag: 'wx' });
      await writeFile(candidate, JSON.stringify({ version: 1, proposals: [] }, null, 2), {
        flag: 'wx',
      });
      await this.write(b);
      return {
        file: this.document.file,
        batchId: id,
        round: b.analysis.number,
        revision: b.analysis.checkoutRevision,
        documentRevision: doc.revision,
        sourceHash: b.sourceHash,
        paragraphs: b.paragraphs,
        document: snapshot,
        candidate,
      };
    });
  }
  submit(id: string, data: Record<string, unknown>) {
    return this.serial(async () => {
      const b = await this.read(id),
        a = b.analysis;
      if (!a || a.checkoutRevision !== data.revision)
        fail('REVISION', 'Use a current request checkout.');
      if ((await this.view(b)).stale) fail('STALE', 'Document or source changed. Reanalyze.');
      const payload = data.submission;
      if (
        !record(payload) ||
        Object.keys(payload).some((k) => !['version', 'proposals'].includes(k)) ||
        payload.version !== 1 ||
        !Array.isArray(payload.proposals) ||
        payload.proposals.length > 500
      )
        fail('PROPOSAL', 'Invalid proposal document (maximum 500 proposals).');
      const submissionHash = hash(JSON.stringify(payload));
      if (a.submitted) {
        if (a.submissionHash === submissionHash) return this.view(b);
        fail('REVISION', 'This round was already submitted. Start a new checkout.');
      }
      const ids = targetIds((await this.document.read()).html);
      const proposals = (payload.proposals as unknown[]).map((v) => validateProposal(v, b, ids));
      if (new Set(proposals.map((p) => p.id)).size !== proposals.length)
        fail('PROPOSAL', 'Duplicate proposal IDs.');
      a.proposals = proposals.map((p) => ({ ...p, decision: 'pending', resolved: false }));
      a.submitted = true;
      a.submissionHash = submissionHash;
      await this.write(b);
      return this.view(b);
    });
  }
  commit(id: string, data: Record<string, unknown>) {
    return this.serial(async () => {
      const b = await this.read(id);
      this.check(b, data.revision);
      const view = await this.view(b);
      if (view.stale) fail('STALE', 'Document or source changed. Reanalyze.');
      const doc = await this.document.read();
      if (doc.revision !== data.documentRevision)
        fail('REVISION', 'Save and review the current document first.');
      let session = readDocument(doc.html, doc.fileName);
      const approved = (b.analysis?.proposals ?? []).filter((p) => p.decision === 'approved');
      if (!approved.length) fail('UNRESOLVED', 'Approve at least one proposal.');
      const addedIds: string[] = [];
      for (const p of approved) {
        if (!p.targetIds.length || (p.issues.length && !p.resolved))
          fail('UNRESOLVED', 'Resolve all approved requests.');
        const id = noteId(b, p.id);
        if (session.notes.some((n) => n.id === id)) continue;
        session = addNote(session, p.targetIds, p.relation, p.text);
        session.notes[session.notes.length - 1] = { ...session.notes.at(-1)!, id };
        addedIds.push(id);
      }
      const result = addedIds.length
        ? await this.document.save(exportDocument(session, 'review'), doc.revision)
        : doc;
      return {
        document: result,
        batch: await this.view(b),
        noteIds: approved.map((p) => noteId(b, p.id)),
        addedIds,
      };
    });
  }
  remove(id: string, revision: unknown) {
    return this.serial(async () => {
      const b = await this.read(id);
      this.check(b, revision);
      const target = resolve(this.path(id));
      await this.safe(target);
      if (!target.startsWith(resolve(this.directory) + sep)) fail('PATH', 'Invalid deletion path.');
      await rm(target, { recursive: true });
      return { deleted: true };
    });
  }
}
