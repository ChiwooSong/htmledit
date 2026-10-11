// Representative Chromium "Save page" output while viewing HTML source.
export function sourceViewer(source: string) {
  const escape = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const lines = source
    .split('\n')
    .map(
      (line, index) =>
        `<tr><td class="line-number" value="${index + 1}"></td><td class="line-content">${
          line ? `<span class="html-tag">${escape(line)}</span>` : '<br>'
        }</td></tr>`,
    );
  return `<!-- saved from url=(0022)file:///document.html --><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"></head><body><div class="line-gutter-backdrop"></div><form autocomplete="off"><label class="line-wrap-control">Line wrap<input type="checkbox" aria-label="Line wrap"></label></form><table><tbody>${lines.join('')}</tbody></table></body></html>`;
}

export function formattedSourceViewer(source: string) {
  return sourceViewer(source)
    .replace(/(id|onclick|title)="([^"]*)"/g, '$1="<span class="html-attribute-value">$2</span>"')
    .replaceAll('>', '>\n\n')
    .replaceAll('<', '\n\n<');
}
