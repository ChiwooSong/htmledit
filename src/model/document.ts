import {
  message,
  MessageError,
  describeError,
  translate,
  type Locale,
  type DisplayMessage,
} from '../i18n';
import { parse, parseFragment, serialize, type DefaultTreeAdapterTypes as T } from 'parse5';
import { assertHtmlSize } from '../io/files';

export const TARGET_ATTR = 'data-htmledit-id';
export const REVIEW_ID = 'htmledit-review';
export const RELATIONS = {
  self: message('thisElement'),
  before: message('before'),
  after: message('after'),
  inside: message('inside'),
} as const;
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
  warnings: DisplayMessage[];
  metadataIssue?: DisplayMessage;
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
    throw new MessageError(message('invalidNoteListFormat'));
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
      throw new MessageError(message('invalidNoteContentOrIdentifier'));
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
  if (!source.trim()) throw new MessageError(message('thisFileIsEmptyChooseAnHtml'));
  const root = parse(source);
  const warnings = new Set<DisplayMessage>();
  let notes: Note[] = [];
  let metadataIssue: DisplayMessage | undefined;
  const blocks = elements(root).filter(
    (node) => node.tagName === 'script' && attr(node, 'id') === REVIEW_ID,
  );
  if (blocks.length) {
    try {
      if (blocks.length !== 1) throw new MessageError(message('duplicateReviewMetadataBlocks'));
      if (attr(blocks[0], 'type') !== 'application/json')
        throw new MessageError(message('invalidReviewMetadataBlockFormat'));
      const payload = JSON.parse(rawText(blocks[0]));
      if (payload?.version !== 1) throw new MessageError(message('unsupportedReviewFormatVersion'));
      notes = validateNotes(payload.notes);
    } catch (error) {
      metadataIssue =
        error instanceof Error ? describeError(error) : message('couldNotReadTheNotes');
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
      metadataIssue =
        error instanceof Error ? describeError(error) : message('couldNotReadTheNotes');
    }
    return {
      ...restored,
      metadataIssue: metadataIssue ?? restored.metadataIssue,
      warnings: [message('originalHtmlRestoredFromABrowserSource'), ...restored.warnings],
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
    warnings.add(message('thisDocumentContainsScriptsUseInteractFor'));
  }
  if (all.some((node) => ['iframe', 'object', 'embed'].includes(node.tagName)))
    warnings.add(message('embeddedExternalPagesAreHiddenWhileEditing'));
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
    warnings.add(message('relativePathsReferToSeparateFilesRelated'));
  }
  if (
    all.some((node) =>
      node.attrs.some(
        (item) => ['src', 'href'].includes(item.name) && /^https?:/i.test(item.value),
      ),
    ) ||
    cssUrls.some((url) => /^https?:/i.test(url))
  ) {
    warnings.add(message('externalImagesStylesAndFontsLoadFrom'));
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
      warnings.add(message('duplicateTargetIdentifiersFoundReassignTheAffected'));
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
  return {
    html: serialize(root),
    fileName,
    notes,
    warnings: [...new Map([...warnings].map((w) => [JSON.stringify(w), w])).values()],
    metadataIssue,
  };
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
  if (!node) throw new MessageError(message('couldNotFindTheSelectedElement'));
  return { tag: node.tagName, excerpt: excerpt(node) };
}
function mutate(
  session: DocumentSession,
  id: string,
  edit: (node: T.Element) => void,
): DocumentSession {
  const root = parse(session.html);
  const node = find(root, id);
  if (!node) throw new MessageError(message('couldNotFindTheSelectedElement'));
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
    if (child?.nodeName !== '#text') throw new MessageError(message('couldNotFindTheTextToEdit'));
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
    throw new MessageError(message('enterASixDigitColorCode'));
  if (
    property === 'font-size' &&
    (!/^\d+(\.\d+)?px$/.test(value) || parseFloat(value) < 1 || parseFloat(value) > 256)
  )
    throw new MessageError(message('fontSizeMustBeBetween1And'));
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
    throw new MessageError(message('chooseAPngJpegWebpOrGif'));
  return mutate(session, id, (node) => {
    if (node.tagName !== 'img') throw new MessageError(message('selectAnImage'));
    setAttr(node, 'src', dataUrl);
    node.attrs = node.attrs.filter((item) => !['srcset', 'sizes'].includes(item.name));
    if (node.parentNode && isElement(node.parentNode) && node.parentNode.tagName === 'picture') {
      node.parentNode.childNodes
        .filter((child) => isElement(child) && child.tagName === 'source')
        .forEach(remove);
    }
  });
}

export type ImagePosition = 'before' | 'after' | 'inside';
export interface ImagePresentation {
  width: 'original' | number;
  align: 'left' | 'center' | 'right';
  alt: string;
}
// Conservative flow-content containers: never let the HTML parser relocate the image.
const imageContainers = new Set([
  'body',
  'div',
  'main',
  'section',
  'article',
  'aside',
  'nav',
  'header',
  'footer',
  'figure',
  'figcaption',
  'blockquote',
  'li',
  'dd',
  'dt',
  'td',
  'th',
  'form',
  'fieldset',
  'details',
  'dialog',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);
function insertionParent(target: T.Element, position: ImagePosition) {
  const parent = position === 'inside' ? target : target.parentNode;
  if (
    !parent ||
    !isElement(parent) ||
    parent.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
    !imageContainers.has(parent.tagName)
  )
    return;
  // Template content and inert/non-rendered ancestry cannot be a visual insertion target.
  let ancestor: T.Node | null = parent;
  let inBody = false;
  while (ancestor) {
    if (isElement(ancestor) && ['template', 'head', 'svg', 'math'].includes(ancestor.tagName))
      return;
    if (isElement(ancestor) && ancestor.tagName === 'body') inBody = true;
    ancestor = 'parentNode' in ancestor ? ancestor.parentNode : null;
  }
  return inBody ? parent : undefined;
}
export function imagePositions(session: DocumentSession, id: string): ImagePosition[] {
  const target = find(parse(session.html), id);
  return target
    ? (['before', 'after', 'inside'] as const).filter((p) => insertionParent(target, p))
    : [];
}
function imageStyle(node: T.Element, options: ImagePresentation) {
  if (
    (options.width !== 'original' &&
      (!Number.isFinite(options.width) || options.width < 1 || options.width > 100)) ||
    !['left', 'center', 'right'].includes(options.align)
  )
    throw new MessageError(message('imageInvalidSize'));
  const properties = new Set([
    'width',
    'height',
    'max-width',
    'min-width',
    'display',
    'margin',
    'margin-left',
    'margin-right',
    'margin-inline',
    'margin-inline-start',
    'margin-inline-end',
    'align-self',
    'justify-self',
  ]);
  const previous = (attr(node, 'style') ?? '')
    .split(';')
    .filter((part) => !properties.has(part.split(':')[0].trim().toLowerCase()))
    .filter(Boolean);
  const left = options.align === 'left' ? '0' : 'auto';
  const right = options.align === 'right' ? '0' : 'auto';
  setAttr(
    node,
    'style',
    [
      ...previous,
      `width: ${options.width === 'original' ? 'auto' : `${options.width}%`} !important`,
      'height: auto !important',
      'max-width: 100% !important',
      'min-width: 0 !important',
      'display: block !important',
      `margin-left: ${left} !important`,
      `margin-right: ${right} !important`,
      `align-self: ${options.align === 'center' ? 'center' : options.align === 'left' ? 'flex-start' : 'flex-end'} !important`,
      `justify-self: ${options.align === 'center' ? 'center' : options.align === 'left' ? 'start' : 'end'} !important`,
    ].join('; '),
  );
  node.attrs = node.attrs.filter((a) => !['width', 'height'].includes(a.name));
  setAttr(node, 'alt', options.alt);
}
export function imageDetails(session: DocumentSession, id: string) {
  const node = find(parse(session.html), id);
  if (!node || node.tagName !== 'img') throw new MessageError(message('selectAnImage'));
  const style = attr(node, 'style') ?? '';
  const width = style.match(/(?:^|;)\s*width:\s*([\d.]+)%/i);
  const left = /margin-left:\s*auto/i.test(style);
  const right = /margin-right:\s*auto/i.test(style);
  return {
    src: attr(node, 'src') ?? '',
    width: width ? Number(width[1]) : 'original',
    align: left ? (right ? 'center' : 'right') : 'left',
    alt: attr(node, 'alt') ?? '',
  } as ImagePresentation & { src: string };
}
export function updateImagePresentation(
  session: DocumentSession,
  id: string,
  options: ImagePresentation,
) {
  return mutate(session, id, (node) => {
    if (node.tagName !== 'img') throw new MessageError(message('selectAnImage'));
    imageStyle(node, options);
  });
}
export function insertImage(
  session: DocumentSession,
  targetId: string,
  position: ImagePosition,
  dataUrl: string,
  options: ImagePresentation,
  id = newId(),
): { session: DocumentSession; id: string } {
  if (!/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(dataUrl))
    throw new MessageError(message('chooseAPngJpegWebpOrGif'));
  const root = parse(session.html);
  const target = find(root, targetId);
  const parent = target && insertionParent(target, position);
  if (!parent || !target || !['before', 'after', 'inside'].includes(position))
    throw new MessageError(message('imageInvalidPosition'));
  if (find(root, id) || !isId(id)) throw new MessageError(message('imageInvalidPosition'));
  const node = parseFragment('<img>').childNodes[0] as T.Element;
  setAttr(node, TARGET_ATTR, id);
  setAttr(node, 'src', dataUrl);
  imageStyle(node, options);
  node.parentNode = parent;
  const index =
    position === 'inside'
      ? parent.childNodes.length
      : parent.childNodes.indexOf(target) + (position === 'after' ? 1 : 0);
  parent.childNodes.splice(index, 0, node);
  const next = { ...session, html: serialize(root) };
  assertHtmlSize(exportDocument(next, 'review'));
  return { session: next, id };
}
export function deleteElement(session: DocumentSession, id: string) {
  return mutate(session, id, (node) => {
    if (['html', 'body', 'head'].includes(node.tagName))
      throw new MessageError(message('youCannotDeleteTheEntireDocument'));
    remove(node);
  });
}
export function addNote(
  session: DocumentSession,
  targetId: string,
  relation: Relation,
  content: string,
): DocumentSession {
  if (session.notes.length >= 5000) throw new MessageError(message('aDocumentCanContainUpTo5'));
  if (!content.trim() || content.length > 20_000)
    throw new MessageError(message('enterARequestBetween1And20'));
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
    throw new MessageError(message('enterARequestBetween1And20'));
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
  if (session.metadataIssue) throw new MessageError(message('someNotesCannotBeReadKeepThe'));
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
      data: ` HTMLEdit AI HANDOFF v1\nRead version:1 and notes in script#${REVIEW_ID}. Apply only done:false requests.\nMatch targetId to [${TARGET_ATTR}="ID"]. Relations: self, before, after, inside.\nPreserve the design, scripts, styles, identifiers and other notes. Mark only fulfilled notes done:true.\nIf targets are missing or duplicated, ask the user instead of guessing from excerpts.\nUse the editor to export final HTML without review metadata. `,
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

export function handoffMessage(session: DocumentSession, locale: Locale = 'en') {
  return translate(locale, 'fileHandoff', { file: exportName(session.fileName, 'review') });
}
