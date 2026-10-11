import { describe, it, expect } from 'vitest';
import { validateViewState } from '../src/preview/interaction';
import { previewHtml, readDocument } from '../src/model/document';

describe('문서 조작 경계', () => {
  it('알려진 요소의 표시 상태만 받아들이며 이벤트와 임의 ID는 버린다', () => {
    const state = validateViewState(
      {
        elements: {
          known: {
            attrs: { class: 'active', hidden: null, onclick: 'bad()', srcdoc: 'bad' },
            styles: {
              display: { value: 'block', priority: '' },
              'bad;property': { value: 'none', priority: '' },
            },
            x: NaN,
            y: -9,
          },
          unknown: { attrs: { class: 'injected' } },
        },
        x: 0,
        y: 20,
      },
      new Set(['known']),
    )!;
    expect(Object.keys(state.elements)).toEqual(['known']);
    expect(state.elements.known.attrs).toEqual({ class: 'active', hidden: null });
    expect(state.elements.known.styles).toEqual({ display: { value: 'block', priority: '' } });
    expect(state.elements.known.y).toBe(0);
    expect(validateViewState(null, new Set())).toBeNull();
  });
  it('동작 모드에서 내부 스크립트만 남기고 자동 이동과 삽입 프레임은 제거한다', () => {
    const session = readDocument(
      '<html><head><meta http-equiv="refresh" content="0;url=https://example.com"><script src="https://example.com/code.js"></script></head><body><button onclick="go()">이동</button><iframe srcdoc="bad"></iframe><script>function go(){}</script></body></html>',
    );
    const html = previewHtml(session, '/* bridge */');
    expect(html).toContain('function go(){}');
    expect(html).toContain('onclick="go()"');
    expect(html).not.toContain('code.js');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('url=https');
    expect(html.indexOf('/* bridge */')).toBeLessThan(html.indexOf('function go()'));
    expect(previewHtml(session)).not.toContain('onclick=');
  });
});
