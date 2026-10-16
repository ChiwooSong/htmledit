import { Unzip, UnzipInflate } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { FILE_LIMIT, SOURCE_LIMIT } from './types';

export function checkedText(text: string) {
  if (!text.trim()) throw new Error('EMPTY');
  if (text.length > SOURCE_LIMIT) throw new Error('SIZE');
  return text.replace(/\r\n?/g, '\n');
}
export function extractText(bytes: Uint8Array, extension: string) {
  if (bytes.length > FILE_LIMIT) throw new Error('SIZE');
  if (extension === 'txt' || extension === 'md') {
    try {
      return checkedText(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      if (error instanceof TypeError) throw new Error('UTF8');
      throw error;
    }
  }
  if (extension !== 'docx') throw new Error('TYPE');
  // Bound actual decompressed bytes, not only the untrusted ZIP size fields.
  let total = 0,
    count = 0,
    completed = 0;
  let exceeded = false;
  const parts: Uint8Array[] = [];
  const names = new Set<string>();
  const zip = new Unzip((file) => {
    if (++count > 1000 || names.has(file.name)) throw new Error('DOCX');
    names.add(file.name);
    file.ondata = (error, chunk, final) => {
      if (error) throw new Error('DOCX');
      total += chunk.length;
      if (total > 50 * 1024 * 1024) {
        exceeded = true;
        throw new Error('SIZE');
      }
      if (file.name === 'word/document.xml') parts.push(chunk);
      if (final) completed++;
    };
    file.start();
  });
  zip.register(UnzipInflate);
  try {
    // Small compressed chunks limit the largest allocation by the inflater.
    for (let offset = 0; offset < bytes.length; offset += 1024)
      zip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
    if (!names.has('[Content_Types].xml') || !parts.length || completed !== count)
      throw new Error('DOCX');
    const data = new Uint8Array(parts.reduce((size, p) => size + p.length, 0));
    let offset = 0;
    for (const part of parts) {
      data.set(part, offset);
      offset += part.length;
    }
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(data);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DOCX');
    const doc = new DOMParser({
      onError: () => {
        throw new Error('DOCX');
      },
    }).parseFromString(xml, 'text/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const strict = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
    const output: string[] = [];
    let length = 0;
    const append = (text: string) => {
      length += text.length;
      if (length > SOURCE_LIMIT) throw new Error('SIZE');
      output.push(text);
    };
    const visit = (node: any) => {
      const word = node.namespaceURI === ns || node.namespaceURI === strict;
      if (word && ['del', 'moveFrom', 'instrText'].includes(node.localName)) return;
      if (word && node.localName === 't') {
        append(node.textContent ?? '');
        return;
      }
      if (word && node.localName === 'tab') append('\t');
      if (word && ['br', 'cr'].includes(node.localName)) append('\n');
      for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
      if (word && node.localName === 'p') append('\n\n');
    };
    if (!doc.documentElement || doc.documentElement.localName !== 'document')
      throw new Error('DOCX');
    visit(doc.documentElement);
    return checkedText(output.join('').trim());
  } catch (error) {
    if (exceeded) throw new Error('SIZE');
    if (error instanceof Error && ['SIZE', 'EMPTY'].includes(error.message)) throw error;
    throw new Error('DOCX');
  }
}
