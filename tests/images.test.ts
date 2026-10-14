import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse, serialize } from 'parse5';
import {
  addNote,
  deleteElement,
  exportDocument,
  imageDetails,
  imagePositions,
  insertImage,
  listElements,
  readDocument,
  updateImagePresentation,
  type ImagePresentation,
} from '../src/model/document';
import { commit, createHistory, redo, undo } from '../src/model/history';
import { imageMime, IMAGE_LIMIT, readImageFile, readImageUrl } from '../src/io/files';
const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const options: ImagePresentation = { width: 50, align: 'center', alt: '한글 日本語 ação "<img>"' };
const source =
  '<!doctype html><html lang="ko"><body><h1>Title</h1><div><p>Text <strong>bold</strong></p></div><ul><li>Item</li></ul><table><tbody><tr><td>Cell</td></tr></tbody></table><img alt="old"></body></html>';
const base = () => readDocument(source, 'image.html');
const named = (session: ReturnType<typeof base>, tag: string) =>
  listElements(session).find((e) => e.tag === tag)!.id;
describe('image insertion model', () => {
  it.each(['before', 'after', 'inside'] as const)(
    'inserts %s and round-trips structure, IDs, and image bytes',
    (position) => {
      const session = base();
      const result = insertImage(session, named(session, 'div'), position, pixel, options);
      const html = exportDocument(result.session, 'review');
      expect(serialize(parse(html))).toBe(html);
      expect(html).toContain(pixel);
      const reopened = readDocument(html, 'reopened.html');
      expect(imageDetails(reopened, result.id)).toEqual({ ...options, src: pixel });
      const root = parse(html);
      const body = (root.childNodes.find((n) => n.nodeName === 'html') as any).childNodes.find(
        (n: any) => n.nodeName === 'body',
      );
      const divIndex = body.childNodes.findIndex((n: any) => n.nodeName === 'div');
      const img =
        position === 'inside'
          ? body.childNodes[divIndex].childNodes.at(-1)
          : body.childNodes[divIndex + (position === 'before' ? -1 : 1)];
      expect(img.attrs.find((a: any) => a.name === 'data-htmledit-id').value).toBe(result.id);
      expect(session.html).not.toContain(pixel);
    },
  );
  it('rejects invalid structure without relocating content', () => {
    const session = base();
    for (const tag of ['ul', 'table', 'tbody', 'tr', 'img']) {
      expect(imagePositions(session, named(session, tag))).not.toContain('inside');
      expect(() => insertImage(session, named(session, tag), 'inside', pixel, options)).toThrow();
    }
    expect(imagePositions(session, named(session, 'li'))).toEqual(['inside']);
    expect(imagePositions(session, named(session, 'td'))).toEqual(['inside']);
    expect(imagePositions(session, named(session, 'body'))).toEqual(['inside']);
    expect(() => insertImage(session, 'deleted', 'after', pixel, options)).toThrow();
  });
  it('keeps insertion atomic, restores targets with undo, and strips metadata only in clean exports', () => {
    const session = base();
    const inserted = insertImage(session, named(session, 'h1'), 'after', pixel, options);
    const withNote = addNote(inserted.session, inserted.id, 'self', '余白を調整 · ajustar margem');
    let history = commit(createHistory(session), inserted.session);
    expect(undo(history).present).toBe(session);
    expect(redo(undo(history)).present).toBe(inserted.session);
    history = commit(history, withNote);
    history = commit(history, deleteElement(withNote, inserted.id));
    expect(history.present.notes).toEqual(withNote.notes);
    expect(listElements(history.present).some((e) => e.id === inserted.id)).toBe(false);
    expect(listElements(undo(history).present).some((e) => e.id === inserted.id)).toBe(true);
    const reopened = readDocument(exportDocument(withNote, 'review'), 'test.review.html');
    expect(reopened.notes).toEqual(withNote.notes);
    const clean = exportDocument(withNote, 'clean');
    expect(clean).toContain(pixel);
    expect(clean).not.toContain('data-htmledit');
    expect(clean).not.toContain('htmledit-review');
    expect(clean).toContain('lang="ko"');
  });
  it('updates presentation without changing the image, and rejects invalid width and oversized exports', () => {
    const session = base();
    const inserted = insertImage(session, named(session, 'div'), 'inside', pixel, options);
    const next = updateImagePresentation(inserted.session, inserted.id, {
      width: 'original',
      align: 'right',
      alt: 'New',
    });
    expect(imageDetails(next, inserted.id)).toEqual({
      src: pixel,
      width: 'original',
      align: 'right',
      alt: 'New',
    });
    expect(() =>
      insertImage(session, named(session, 'div'), 'inside', pixel, { ...options, width: NaN }),
    ).toThrow();
    expect(() =>
      insertImage(
        session,
        named(session, 'div'),
        'inside',
        'data:image/svg+xml;base64,AAAA',
        options,
      ),
    ).toThrow();
    const large = {
      ...session,
      html: session.html.replace('</body>', `${'a'.repeat(25 * 1024 * 1024)}</body>`),
    };
    expect(() => insertImage(large, named(session, 'div'), 'inside', pixel, options)).toThrow(
      '25MB',
    );
  }, 15_000); // This boundary case deliberately parses a 25MB document.
});
describe('image input boundaries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('recognizes the supported byte signatures only', () => {
    expect(imageMime(Uint8Array.from(Buffer.from(pixel.split(',')[1], 'base64')))).toBe(
      'image/png',
    );
    expect(imageMime(new Uint8Array([255, 216, 255, 224]))).toBe('image/jpeg');
    expect(imageMime(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(imageMime(new TextEncoder().encode('RIFF0000WEBP'))).toBe('image/webp');
    expect(imageMime(new TextEncoder().encode('<svg/>'))).toBeUndefined();
  });
  it('rejects MIME mismatches, unsupported formats, and size before decoding', async () => {
    await expect(
      readImageFile(new File(['<svg/>'], 'fake.png', { type: 'image/png' })),
    ).rejects.toThrow();
    await expect(
      readImageFile(new File(['<svg/>'], 'fake.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow();
    await expect(
      readImageFile(new File([new Uint8Array(IMAGE_LIMIT + 1)], 'big.png', { type: 'image/png' })),
    ).rejects.toThrow('10MB');
  });
  it.each([
    'file:///secret.png',
    'data:image/png;base64,AAAA',
    'https://user:password@example.com/x.png',
    'not a url',
  ])('rejects URL %s before fetching', async (url) => {
    await expect(readImageUrl(url)).rejects.toThrow();
  });
  it('bounds downloads even without Content-Length and omits credentials', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array(IMAGE_LIMIT + 1), { headers: { 'Content-Type': 'image/png' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(readImageUrl('https://example.com/image')).rejects.toThrow('10MB');
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    fetcher.mockResolvedValue(
      new Response('x', {
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(IMAGE_LIMIT + 1) },
      }),
    );
    await expect(readImageUrl('https://example.com/image')).rejects.toThrow('10MB');
  });
  it('distinguishes HTTP, content-type, network and timeout failures', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(readImageUrl('https://example.com/image')).rejects.toThrow();
    fetcher.mockResolvedValue(
      new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    );
    await expect(readImageUrl('https://example.com/image')).rejects.toThrow('PNG');
    fetcher.mockRejectedValue(new TypeError('CORS blocked'));
    await expect(readImageUrl('https://example.com/image')).rejects.toThrow();
    vi.useFakeTimers();
    fetcher.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () => reject(new Error('abort'))),
        ),
    );
    const pending = readImageUrl('https://example.com/image');
    const assertion = expect(pending).rejects.toThrow(/timed out|시간이 초과/);
    await vi.advanceTimersByTimeAsync(15001);
    await assertion;
  });
});
