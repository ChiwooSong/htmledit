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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new MessageError(message('couldNotReadTheImageFile')));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
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
