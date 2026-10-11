import { parse, parseFragment, serialize, type DefaultTreeAdapterTypes as T } from 'parse5';

export const TARGET_ATTR = 'data-htmledit-id';
export const REVIEW_ID = 'htmledit-review';
export const RELATIONS = { self: '이 요소', before: '앞', after: '뒤', inside: '안쪽' } as const;
export type Relation = keyof typeof RELATIONS;
export interface Note {
  id: string;
  targetId: string;
  relation: Relation;
  text: string;
  done: boolean;
  target: { tag: string; excerpt: string };
}
export interface DocumentSession {
  html: string;
  fileName: string;
  notes: Note[];
  warnings: string[];
  metadataIssue?: string;
}
export interface ElementInfo {
  id: string;
  tag: string;
  excerpt: string;
  parentId?: string;
  textParts: { index: number; value: string }[];
}

export const newId = () => `he-${crypto.randomUUID()}`;
const isElement = (node: T.Node): node is T.Element => 'tagName' in node;
const children = (node: T.Node): T.ChildNode[] => ('childNodes' in node ? node.childNodes : []);
export function walk(node: T.Node, visit: (node: T.Node) => void) {
  visit(node);
  children(node).forEach((child) => walk(child, visit));
  if (isElement(node) && node.tagName === 'template') walk((node as T.Template).content, visit);
}
function elements(root: T.Node): T.Element[] {
  const list: T.Element[] = [];
  walk(root, (node) => {
    if (isElement(node)) list.push(node);
  });
  return list;
}
function attr(node: T.Element, name: string) {
  return node.attrs.find((item) => item.name === name)?.value;
}
function setAttr(node: T.Element, name: string, value: string) {
  const current = node.attrs.find((item) => item.name === name);
  if (current) current.value = value;
  else node.attrs.push({ name, value });
}
function remove(node: T.ChildNode) {
  if (node.parentNode)
    node.parentNode.childNodes = node.parentNode.childNodes.filter((child) => child !== node);
}
function append(parent: T.ParentNode, node: T.ChildNode) {
  node.parentNode = parent;
  parent.childNodes.push(node);
}
function text(node: T.Node): string {
  if (node.nodeName === '#text') return (node as T.TextNode).value;
  if (isElement(node) && ['script', 'style', 'template'].includes(node.tagName)) return '';
  return children(node).map(text).join('');
}
function rawText(node: T.Element) {
  return node.childNodes
    .filter((child) => child.nodeName === '#text')
    .map((child) => (child as T.TextNode).value)
    .join('');
}
function excerpt(node: T.Element) {
  return (text(node) || attr(node, 'alt') || '').replace(/\s+/g, ' ').trim().slice(0, 100);
}
function find(root: T.Node, id: string) {
  return elements(root).find((node) => attr(node, TARGET_ATTR) === id);
}
function body(root: T.Node) {
  return elements(root).find((node) => node.tagName === 'body')!;
}
function head(root: T.Node) {
  return elements(root).find((node) => node.tagName === 'head')!;
}
function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

// Chromium saves its view-source shell as HTML, with the original document
// entity-encoded in a table. Require the whole shell to avoid converting code examples.
function sourceViewerHtml(root: T.Node): string | undefined {
  const all = elements(body(root));
  const hasClass = (node: T.Element, value: string) =>
    (attr(node, 'class') ?? '').split(/\s+/).includes(value);
  if (
    !all.some((node) => hasClass(node, 'line-gutter-backdrop')) ||
    !all.some((node) => hasClass(node, 'line-wrap-control'))
  )
    return;
  const tables = all.filter((node) => node.tagName === 'table');
  if (tables.length !== 1) return;
  const rows = elements(tables[0]).filter((node) => node.tagName === 'tr');
  if (!rows.length) return;
  const lines: string[] = [];
  for (const row of rows) {
    const cells = row.childNodes.filter(isElement);
    if (
      cells.length !== 2 ||
      cells[0].tagName !== 'td' ||
      !hasClass(cells[0], 'line-number') ||
      cells[1].tagName !== 'td' ||
      !hasClass(cells[1], 'line-content')
    )
      return;
    // parse5 decoded one layer of entities. A second decode would damage literals.
    // A source-view row represents exactly one original line. Formatting the
    // saved shell can insert newlines around syntax spans, even inside a quoted
    // attribute. Those belong to the shell; original line breaks come from rows.
    lines.push(text(cells[1]).replace(/[\r\n]/g, ''));
  }
  const source = lines.join('\n');
  if (/<(?:!doctype\s+html|html|head|body)\b/i.test(source)) return source;
}

export function validateNotes(value: unknown): Note[] {
  if (!Array.isArray(value) || value.length > 5000)
    throw new Error('메모 목록 형식이 올바르지 않습니다.');
  const ids = new Set<string>();
  return value.map((item) => {
    if (
      !item ||
      !isId(item.id) ||
      !isId(item.targetId) ||
      !(item.relation in RELATIONS) ||
      !Object.hasOwn(RELATIONS, item.relation) ||
      typeof item.text !== 'string' ||
      item.text.length > 20_000 ||
      typeof item.done !== 'boolean' ||
      !item.target ||
      typeof item.target.tag !== 'string' ||
      typeof item.target.excerpt !== 'string' ||
      ids.has(item.id)
    )
      throw new Error('메모 내용 또는 식별자가 올바르지 않습니다.');
    ids.add(item.id);
    return {
      id: item.id,
      targetId: item.targetId,
      relation: item.relation,
      text: item.text,
      done: item.done,
      target: { tag: item.target.tag.slice(0, 100), excerpt: item.target.excerpt.slice(0, 200) },
    };
  });
}

function stripToolData(root: T.Node) {
  walk(root, (node) => {
    if (isElement(node)) {
      node.attrs = node.attrs.filter((item) => item.name !== TARGET_ATTR);
      if (node.tagName === 'script' && attr(node, 'id') === REVIEW_ID) remove(node);
    } else if (
      node.nodeName === '#comment' &&
      (node as T.CommentNode).data.trimStart().startsWith('HTMLEdit AI HANDOFF v1')
    )
      remove(node as T.CommentNode);
  });
}

export function readDocument(source: string, fileName = 'document.html'): DocumentSession {
  if (!source.trim()) throw new Error('비어 있는 파일입니다. HTML 문서를 선택해 주세요.');
  const root = parse(source);
  const warnings = new Set<string>();
  let notes: Note[] = [];
  let metadataIssue: string | undefined;
  const blocks = elements(root).filter(
    (node) => node.tagName === 'script' && attr(node, 'id') === REVIEW_ID,
  );
  if (blocks.length) {
    try {
      if (blocks.length !== 1) throw new Error('메모 저장 블록이 중복되어 있습니다.');
      if (attr(blocks[0], 'type') !== 'application/json')
        throw new Error('메모 저장 블록의 형식이 올바르지 않습니다.');
      const payload = JSON.parse(rawText(blocks[0]));
      if (payload?.version !== 1) throw new Error('지원하지 않는 메모 형식 버전입니다.');
      notes = validateNotes(payload.notes);
    } catch (error) {
      metadataIssue = error instanceof Error ? error.message : '메모를 읽을 수 없습니다.';
    }
    blocks.forEach(remove);
  }
  walk(root, (node) => {
    if (
      node.nodeName === '#comment' &&
      (node as T.CommentNode).data.trimStart().startsWith('HTMLEdit AI HANDOFF v1')
    )
      remove(node as T.CommentNode);
  });
  const originalHtml = sourceViewerHtml(root);
  if (originalHtml !== undefined) {
    const restored = readDocument(originalHtml, fileName);
    try {
      restored.notes = validateNotes([...notes, ...restored.notes]);
    } catch (error) {
      metadataIssue = error instanceof Error ? error.message : '메모를 읽을 수 없습니다.';
    }
    return {
      ...restored,
      metadataIssue: metadataIssue ?? restored.metadataIssue,
      warnings: [
        '브라우저의 소스 보기로 저장된 파일에서 원래 HTML을 복원했습니다. 원본 파일은 변경하지 않습니다.',
        ...restored.warnings,
      ],
    };
  }
  const all = elements(root);
  // Scan CSS itself, not encoded SVG/image payloads or JavaScript strings.
  const cssUrls = all.flatMap((node) => {
    const css = `${node.tagName === 'style' ? rawText(node) : ''}\n${attr(node, 'style') ?? ''}`;
    return Array.from(
      css.matchAll(
        /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi,
      ),
      (match) => (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '').trim(),
    );
  });
  if (
    all.some(
      (node) =>
        node.tagName === 'script' &&
        !['application/json', 'application/ld+json'].includes(attr(node, 'type') ?? ''),
    )
  ) {
    warnings.add(
      '스크립트가 있는 문서입니다. 메뉴와 탭은 문서 조작 모드에서 이용한 뒤 직접 편집으로 전환하세요. 외부 스크립트로 생성되는 화면은 지원하지 않습니다.',
    );
  }
  if (all.some((node) => ['iframe', 'object', 'embed'].includes(node.tagName)))
    warnings.add('외부 삽입 화면은 편집 중 표시하지 않습니다.');
  if (
    all.some((node) =>
      node.attrs.some(
        (item) =>
          ['src', 'href', 'poster', 'srcset'].includes(item.name) &&
          !/^(https?:|data:|blob:|#|mailto:|tel:|javascript:|\s*$)/i.test(item.value),
      ),
    ) ||
    cssUrls.some((url) => !/^(https?:|data:|blob:|#|\s*$)/i.test(url))
  ) {
    warnings.add(
      '별도 파일을 가리키는 상대 경로가 있습니다. 첫 버전은 관련 폴더를 불러오지 않아 일부 이미지나 스타일이 누락될 수 있습니다.',
    );
  }
  if (
    all.some((node) =>
      node.attrs.some(
        (item) => ['src', 'href'].includes(item.name) && /^https?:/i.test(item.value),
      ),
    ) ||
    cssUrls.some((url) => /^https?:/i.test(url))
  ) {
    warnings.add(
      '외부 이미지·스타일·폰트는 원래 주소에서 불러옵니다. 해당 자원에 접근할 수 있어야 같은 모습으로 표시됩니다.',
    );
  }
  const counts = new Map<string, number>();
  all.forEach((node) => {
    const id = attr(node, TARGET_ATTR);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const used = new Set(all.map((node) => attr(node, TARGET_ATTR)).filter(Boolean));
  elements(body(root)).forEach((node) => {
    if (['script', 'style', 'meta', 'link', 'template'].includes(node.tagName)) return;
    const id = attr(node, TARGET_ATTR);
    if (id && isId(id) && counts.get(id) === 1) return;
    if (id && counts.get(id)! > 1)
      warnings.add('중복된 대상 식별자가 있습니다. 관련 메모의 대상을 다시 지정해 주세요.');
    let replacement = newId();
    while (used.has(replacement)) replacement = newId();
    used.add(replacement);
    setAttr(node, TARGET_ATTR, replacement);
  });
  // Non-editable head nodes must not accidentally resolve a missing note target.
  const bodyNodes = new Set(elements(body(root)));
  all
    .filter((node) => !bodyNodes.has(node))
    .forEach((node) => {
      node.attrs = node.attrs.filter((item) => item.name !== TARGET_ATTR);
    });
  return { html: serialize(root), fileName, notes, warnings: [...warnings], metadataIssue };
}

export function listElements(session: DocumentSession): ElementInfo[] {
  return elements(parse(session.html))
    .filter((node) => attr(node, TARGET_ATTR))
    .map((node) => ({
      id: attr(node, TARGET_ATTR)!,
      tag: node.tagName,
      excerpt: excerpt(node),
      parentId:
        node.parentNode && isElement(node.parentNode)
          ? attr(node.parentNode, TARGET_ATTR)
          : undefined,
      textParts: node.childNodes.flatMap((child, index) =>
        child.nodeName === '#text' && (child as T.TextNode).value.trim()
          ? [{ index, value: (child as T.TextNode).value }]
          : [],
      ),
    }));
}
export function describeTarget(session: DocumentSession, id: string) {
  const node = find(parse(session.html), id);
  if (!node) throw new Error('선택한 요소를 찾을 수 없습니다.');
  return { tag: node.tagName, excerpt: excerpt(node) };
}
function mutate(
  session: DocumentSession,
  id: string,
  edit: (node: T.Element) => void,
): DocumentSession {
  const root = parse(session.html);
  const node = find(root, id);
  if (!node) throw new Error('선택한 요소를 찾을 수 없습니다.');
  edit(node);
  return { ...session, html: serialize(root) };
}
export function changeText(
  session: DocumentSession,
  id: string,
  childIndex: number,
  value: string,
) {
  return mutate(session, id, (node) => {
    const child = node.childNodes[childIndex];
    if (child?.nodeName !== '#text')
      throw new Error('수정할 문구를 찾을 수 없습니다. 다시 선택해 주세요.');
    (child as T.TextNode).value = value;
  });
}
export function changeStyle(
  session: DocumentSession,
  id: string,
  property: 'color' | 'font-size',
  value: string,
) {
  if (property === 'color' && !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error('색상은 6자리 색상 코드로 입력해 주세요.');
  if (
    property === 'font-size' &&
    (!/^\d+(\.\d+)?px$/.test(value) || parseFloat(value) < 1 || parseFloat(value) > 256)
  )
    throw new Error('글자 크기는 1~256 사이로 입력해 주세요.');
  return mutate(session, id, (node) => {
    const old = attr(node, 'style') ?? '';
    const cleaned = old
      .replace(new RegExp(`(^|;)\\s*${property}\\s*:[^;]*(?=;|$)`, 'gi'), '$1')
      .replace(/;+\s*$/g, '');
    setAttr(
      node,
      'style',
      `${cleaned}${cleaned.trim() ? '; ' : ''}${property}: ${value} !important;`,
    );
  });
}
export function replaceImage(session: DocumentSession, id: string, dataUrl: string) {
  if (!/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(dataUrl))
    throw new Error('PNG·JPEG·WebP·GIF 이미지를 선택해 주세요.');
  return mutate(session, id, (node) => {
    if (node.tagName !== 'img') throw new Error('이미지를 선택해 주세요.');
    setAttr(node, 'src', dataUrl);
    node.attrs = node.attrs.filter((item) => !['srcset', 'sizes'].includes(item.name));
    if (node.parentNode && isElement(node.parentNode) && node.parentNode.tagName === 'picture') {
      node.parentNode.childNodes
        .filter((child) => isElement(child) && child.tagName === 'source')
        .forEach(remove);
    }
  });
}
export function deleteElement(session: DocumentSession, id: string) {
  return mutate(session, id, (node) => {
    if (['html', 'body', 'head'].includes(node.tagName))
      throw new Error('문서 전체는 삭제할 수 없습니다.');
    remove(node);
  });
}
export function addNote(
  session: DocumentSession,
  targetId: string,
  relation: Relation,
  content: string,
): DocumentSession {
  if (session.notes.length >= 5000)
    throw new Error('한 문서에는 메모를 최대 5,000개까지 저장할 수 있습니다.');
  if (!content.trim() || content.length > 20_000)
    throw new Error('수정 요청을 1~20,000자 이내로 입력해 주세요.');
  const note: Note = {
    id: newId(),
    targetId,
    relation,
    text: content.trim(),
    done: false,
    target: describeTarget(session, targetId),
  };
  return { ...session, notes: [...session.notes, note] };
}
export function updateNote(
  session: DocumentSession,
  id: string,
  patch: Partial<Pick<Note, 'text' | 'done' | 'relation'>>,
): DocumentSession {
  if (patch.text !== undefined && (!patch.text.trim() || patch.text.length > 20_000))
    throw new Error('수정 요청을 1~20,000자 이내로 입력해 주세요.');
  return {
    ...session,
    notes: session.notes.map((note) =>
      note.id === id ? { ...note, ...patch, text: patch.text?.trim() ?? note.text } : note,
    ),
  };
}
export function rebindNote(
  session: DocumentSession,
  noteId: string,
  targetId: string,
): DocumentSession {
  const target = describeTarget(session, targetId);
  return {
    ...session,
    notes: session.notes.map((note) => (note.id === noteId ? { ...note, targetId, target } : note)),
  };
}
export function exportDocument(session: DocumentSession, kind: 'review' | 'clean'): string {
  if (session.metadataIssue)
    throw new Error(
      '읽을 수 없는 메모가 있습니다. 원본을 보관한 뒤 메모 제외 여부를 선택해 주세요.',
    );
  const root = parse(session.html);
  // Exports are UTF-8 regardless of the input's original encoding declaration.
  const encodings = elements(head(root)).filter(
    (node) => node.tagName === 'meta' && attr(node, 'charset'),
  );
  encodings.forEach((node) => setAttr(node, 'charset', 'utf-8'));
  const encoding = encodings[0] ?? parseFragment('<meta charset="utf-8">').childNodes[0];
  if (encodings.length) remove(encoding);
  encoding.parentNode = head(root);
  head(root).childNodes.unshift(encoding);
  elements(head(root))
    .filter(
      (node) =>
        node.tagName === 'meta' &&
        (attr(node, 'http-equiv') ?? '').toLowerCase() === 'content-type',
    )
    .forEach((node) => setAttr(node, 'content', 'text/html; charset=utf-8'));
  if (kind === 'clean') stripToolData(root);
  else {
    const payload = JSON.stringify({ version: 1, notes: session.notes })
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
    const block = parseFragment(
      `<script id="${REVIEW_ID}" type="application/json" hidden style="display:none!important">${payload}</script>`,
    ).childNodes[0];
    append(head(root), block);
    append(head(root), {
      nodeName: '#comment',
      parentNode: null,
      data: ` HTMLEdit AI HANDOFF v1\n이 파일은 화면에서 편집한 HTML과 위치별 수정 요청을 포함합니다.\nscript#${REVIEW_ID}의 JSON에서 version:1 및 notes를 읽으세요. done:false인 요청을 처리하세요.\n각 targetId는 [${TARGET_ATTR}="해당 ID"] 요소를 가리킵니다. relation은 self(이 요소), before(앞), after(뒤), inside(안쪽)입니다.\n대상이 없거나 중복이면 target의 요약만으로 임의 적용하지 말고 사용자에게 확인하세요.\n기존 디자인과 대상 식별자를 유지하세요. 적용한 메모는 done:true로 표시하고 나머지 메모는 보존하세요.\n최종 배포 문서는 편집기의 완성본 HTML 저장으로 메모를 제거할 수 있습니다. `,
    });
  }
  return serialize(root);
}
export function exportName(fileName: string, kind: 'review' | 'clean') {
  return `${fileName.replace(/\.(review|edited)\.html?$/i, '').replace(/\.html?$/i, '') || 'document'}.${kind === 'review' ? 'review' : 'edited'}.html`;
}

export function previewHtml(session: DocumentSession, bridgeScript?: string): string {
  const interactive = bridgeScript !== undefined;
  const root = parse(session.html, { scriptingEnabled: interactive });
  walk(root, (node) => {
    if (!isElement(node)) return;
    if (
      ['iframe', 'object', 'embed', 'base'].includes(node.tagName) ||
      (node.tagName === 'script' && (!interactive || Boolean(attr(node, 'src')))) ||
      (node.tagName === 'meta' &&
        ['refresh', 'content-security-policy'].includes(
          (attr(node, 'http-equiv') ?? '').toLowerCase(),
        ))
    ) {
      // Keep a comment placeholder so text-node child indices remain stable.
      if (node.parentNode) {
        const parent = node.parentNode;
        const index = parent.childNodes.indexOf(node);
        parent.childNodes[index] = {
          nodeName: '#comment',
          data: 'preview: inactive content',
          parentNode: parent,
        };
      }
      return;
    }
    node.attrs = node.attrs.filter(
      (item) =>
        (interactive || !item.name.startsWith('on')) &&
        item.name !== 'srcdoc' &&
        item.name !== 'autofocus' &&
        item.name !== 'contenteditable',
    );
  });
  const policies = parseFragment(
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${interactive ? "'unsafe-inline'" : "'none'"}; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; media-src data: https:; object-src 'none'; frame-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'"><meta name="referrer" content="no-referrer">${interactive ? `<script>${bridgeScript}</script>` : '<style>*{animation-play-state:paused!important;caret-color:transparent}</style>'}`,
  ).childNodes;
  policies.reverse().forEach((node) => {
    node.parentNode = head(root);
    head(root).childNodes.unshift(node);
  });
  return serialize(root);
}

export function handoffMessage(session: DocumentSession) {
  return `첨부한 ${exportName(session.fileName, 'review')}의 HTMLEdit 수정 요청을 반영해 주세요. 파일 안의 script#${REVIEW_ID} JSON에서 미완료 메모(done:false)를 읽고, targetId와 data-htmledit-id가 일치하는 요소에 지정된 위치 관계대로 적용해 주세요. 기존 디자인과 식별자를 유지하고, 반영한 메모는 done:true로 표시해 수정된 HTML 파일을 돌려주세요. 대상이 없거나 중복된 요청은 임의 적용하지 말고 알려주세요.`;
}
