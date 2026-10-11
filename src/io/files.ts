export const HTML_LIMIT = 25 * 1024 * 1024;
export const IMAGE_LIMIT = 10 * 1024 * 1024;
export function assertHtmlSize(source: string) {
  if (new TextEncoder().encode(source).byteLength > HTML_LIMIT)
    throw new Error(
      '저장할 HTML이 25MB를 넘습니다. 더 작은 이미지로 교체하거나 메모를 줄여 주세요.',
    );
}

export async function readHtmlFile(file: File) {
  if (!/\.html?$/i.test(file.name)) throw new Error('.html 또는 .htm 파일을 선택해 주세요.');
  if (file.size > HTML_LIMIT) throw new Error('HTML 파일은 25MB 이하로 선택해 주세요.');
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error('UTF-8로 저장된 HTML을 선택해 주세요.');
  }
  return source.replace(/^\uFEFF/, '');
}
export async function readImageFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
    throw new Error('PNG·JPEG·WebP·GIF 이미지를 선택해 주세요.');
  if (file.size > IMAGE_LIMIT) throw new Error('교체할 이미지는 10MB 이하로 선택해 주세요.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
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
