import { expect, it } from 'vitest';
import { assertHtmlSize, HTML_LIMIT, readHtmlFile } from '../src/io/files';

it('UTF-8 HTML 파일과 BOM을 읽는다', async () => {
  const file = new File(['\uFEFF<p>한글 👋</p>'], 'sample.htm', { type: 'text/html' });
  expect(await readHtmlFile(file)).toBe('<p>한글 👋</p>');
});
it('HTML 외 파일과 잘못된 UTF-8 바이트를 거절한다', async () => {
  await expect(readHtmlFile(new File(['text'], 'bad.txt'))).rejects.toThrow('.html');
  await expect(
    readHtmlFile(new File([new Uint8Array([0xff, 0xfe, 0x80])], 'bad.html')),
  ).rejects.toThrow('UTF-8');
});
it('지원 크기를 넘는 입력을 파싱 전에 거절한다', async () => {
  const oversized = new File([new Uint8Array(HTML_LIMIT + 1)], 'large.html');
  await expect(readHtmlFile(oversized)).rejects.toThrow('25MB');
});
it('내보낸 파일도 같은 UTF-8 바이트 제한을 지켜 재열기 가능하다', () => {
  expect(() => assertHtmlSize('a'.repeat(HTML_LIMIT))).not.toThrow();
  expect(() => assertHtmlSize('한'.repeat(Math.floor(HTML_LIMIT / 3) + 1))).toThrow('25MB');
});
