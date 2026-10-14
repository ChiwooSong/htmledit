import { message, MessageError } from '../i18n';
export const HTML_LIMIT = 25 * 1024 * 1024;
export const IMAGE_LIMIT = 10 * 1024 * 1024;
export function assertHtmlSize(source: string) {
  if (new TextEncoder().encode(source).byteLength > HTML_LIMIT)
    throw new MessageError(message('theSavedHtmlWouldExceed25mbUse'));
}

export async function readHtmlFile(file: File) {
  if (!/\.html?$/i.test(file.name)) throw new MessageError(message('chooseAnHtmlOrHtmFile'));
  if (file.size > HTML_LIMIT) throw new MessageError(message('chooseAnHtmlFileUpTo25mb'));
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new MessageError(message('chooseAnHtmlFileSavedAsUtf'));
  }
  return source.replace(/^\uFEFF/, '');
}
export async function readImageFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
    throw new MessageError(message('chooseAPngJpegWebpOrGif'));
  if (file.size > IMAGE_LIMIT) throw new MessageError(message('chooseAReplacementImageUpTo10mb'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (imageMime(bytes) !== file.type) throw new MessageError(message('imageInvalidData'));
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new MessageError(message('couldNotReadTheImageFile')));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
  await decodeImage(data);
  return data;
}

export function imageMime(bytes: Uint8Array): string | undefined {
  const starts = (...signature: number[]) => signature.every((b, i) => bytes[i] === b);
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return 'image/png';
  if (starts(255, 216, 255)) return 'image/jpeg';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
}
async function decodeImage(data: string) {
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => finish(false), 15_000);
    const finish = (ok: boolean) => {
      clearTimeout(timeout);
      image.onload = image.onerror = null;
      image.src = '';
      if (ok) resolve();
      else reject(new MessageError(message('imageInvalidData')));
    };
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = data;
  });
}
export async function readImageUrl(value: string, signal?: AbortSignal): Promise<string> {
  let url: URL;
  try {
    url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error();
  } catch {
    throw new MessageError(message('imageInvalidUrl'));
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(url.href, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new MessageError(message('imageUrlFailed'));
    if (Number(response.headers.get('content-length')) > IMAGE_LIMIT) {
      controller.abort();
      throw new MessageError(message('chooseAReplacementImageUpTo10mb'));
    }
    const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!mime || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
      controller.abort();
      throw new MessageError(message('chooseAPngJpegWebpOrGif'));
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > IMAGE_LIMIT) {
          controller.abort();
          throw new MessageError(message('chooseAReplacementImageUpTo10mb'));
        }
        chunks.push(new Uint8Array(value));
      }
    } finally {
      reader.releaseLock();
    }
    return await readImageFile(new File(chunks, 'image', { type: mime }));
  } catch (error) {
    if (error instanceof MessageError) throw error;
    throw new MessageError(message(timedOut ? 'imageUrlTimeout' : 'imageUrlFailed'));
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
export function downloadHtml(source: string, name: string) {
  assertHtmlSize(source);
  const url = URL.createObjectURL(new Blob([source], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
