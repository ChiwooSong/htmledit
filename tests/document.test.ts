import { describe, expect, it } from 'vitest';
import { parse } from 'parse5';
import {
  addNote,
  changeStyle,
  changeText,
  deleteElement,
  exportDocument,
  exportName,
  listElements,
  previewHtml,
  readDocument,
  rebindNote,
  replaceImage,
  TARGET_ATTR,
  updateNote,
  walk,
} from '../src/model/document';
import { commit, createHistory, redo, undo } from '../src/model/history';
import { EXAMPLE_HTML } from '../src/example';
import { formattedSourceViewer, sourceViewer } from './fixtures/source-viewer';

const fixture =
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>원본 제목</title><style>p{color:red}strong{font-weight:700}</style></head><body><h1>안녕 <strong>온기</strong> 👋</h1><p style="background-color: #eee; color:red; padding:8px">설명</p><picture><source srcset="other.webp"><img src="old.png" srcset="a.png 1x, b.png 2x" sizes="100vw" alt="이미지" width="200"></picture><script>window.original = "<keep>";</script></body></html>';
const named = (session: ReturnType<typeof readDocument>, tag: string) =>
  listElements(session).find((item) => item.tag === tag)!;
const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

describe('HTML 문서 모델과 왕복 저장', () => {
  it('소스 보기 저장 파일에서 디자인과 중첩 태그, 원본 스크립트를 복원한다', () => {
    const session = readDocument(sourceViewer(fixture), 'wireframe.html');
    const clean = exportDocument(session, 'clean');
    expect(clean).toBe(exportDocument(readDocument(fixture), 'clean'));
    expect(session.fileName).toBe('wireframe.html');
    expect(session.warnings.some((item) => item.includes('소스 보기'))).toBe(true);
    expect(session.warnings.some((item) => item.includes('스크립트'))).toBe(true);
    expect(previewHtml(session)).not.toContain('<script>');
    expect(clean).not.toContain('line-content');
    expect(clean).not.toContain('Line wrap');
  });
  it('소스 보기의 공백과 엔티티를 한 번만 복원한다', () => {
    const source =
      '<!doctype html>\n<html><body><pre>첫 줄\n\n  &lt;b&gt; "한글" 👋 &amp; 끝</pre></body></html>';
    const clean = exportDocument(readDocument(sourceViewer(source)), 'clean');
    expect(clean).toContain('<pre>첫 줄\n\n  &lt;b&gt; "한글" 👋 &amp; 끝</pre>');
  });
  it('소스 보기로 저장한 전달용 HTML의 메모와 대상도 복원한다', () => {
    let session = readDocument(fixture);
    const target = named(session, 'h1');
    session = addNote(session, target.id, 'before', '아이콘 추가 <svg> 👋');
    const restored = readDocument(sourceViewer(exportDocument(session, 'review')));
    expect(restored.notes).toEqual(session.notes);
    expect(named(restored, 'h1').id).toBe(target.id);
    expect(restored.metadataIssue).toBeUndefined();
  });
  it('정렬된 소스 보기의 구문 span 줄바꿈이 ID와 스크립트를 손상시키지 않는다', () => {
    const source = `<!doctype html>\n<html><body><button id="nav" onclick="go(0)">이동</button>
<section id="s0" title="공백 유지">화면</section><pre>첫 줄

  &lt;svg&gt; &amp; 끝</pre>
<script>function go(n) { document.getElementById('s'+n).style.display='block'; }\ngo(0);</script></body></html>`;
    const restored = readDocument(formattedSourceViewer(source));
    expect(exportDocument(restored, 'clean')).toBe(exportDocument(readDocument(source), 'clean'));
  });
  it('HTML 코드를 설명하는 일반 문서는 자동 변환하지 않는다', () => {
    const source =
      '<html><body><h1>HTML 예제</h1><table><tr><td class="line-number">1</td><td class="line-content">&lt;html&gt;예제&lt;/html&gt;</td></tr></table></body></html>';
    const session = readDocument(source);
    expect(exportDocument(session, 'clean')).toContain(
      '<td class="line-content">&lt;html&gt;예제&lt;/html&gt;</td>',
    );
    expect(named(session, 'h1').excerpt).toBe('HTML 예제');
    expect(session.warnings).toEqual([]);
  });
  it('내장 SVG의 색상 참조를 누락된 외부 파일로 오인하지 않는다', () => {
    expect(readDocument(EXAMPLE_HTML).warnings).toEqual([]);
  });
  it('CSS 안의 상대 경로 이미지와 import 스타일을 안내한다', () => {
    expect(
      readDocument(
        '<style>@import "theme.css";p{background:url(./hero.png)}</style><p>문구</p>',
      ).warnings.some((item) => item.includes('상대 경로')),
    ).toBe(true);
    expect(
      readDocument(
        '<style>p{background:url("https://example.com/hero.png")}</style><p>문구</p>',
      ).warnings.some((item) => item.includes('외부 이미지')),
    ).toBe(true);
  });
  it('원본 head, doctype, 스타일, 스크립트, 중첩 마크업을 유지한다', () => {
    const session = readDocument(fixture);
    const clean = exportDocument(session, 'clean');
    expect(clean.toLowerCase()).toContain('<!doctype html>');
    expect(clean).toContain('<title>원본 제목</title>');
    expect(clean).toContain('<style>p{color:red}strong{font-weight:700}</style>');
    expect(clean).toContain('<script>window.original = "<keep>";</script>');
    expect(clean).toContain('<h1>안녕 <strong>온기</strong> 👋</h1>');
    expect(clean).not.toContain(TARGET_ATTR);
    expect(clean).not.toContain('htmledit-review');
    expect(clean).not.toContain('Content-Security-Policy');
  });
  it('단일 텍스트 노드 수정으로 중첩 강조와 다른 문구를 보존한다', () => {
    const session = readDocument(fixture);
    const title = named(session, 'h1');
    const edited = changeText(session, title.id, 0, '반가워 "한국" 🏡 <태그> ');
    const clean = exportDocument(edited, 'clean');
    expect(clean).toContain('반가워 "한국" 🏡 &lt;태그&gt; <strong>온기</strong> 👋');
    expect(() => changeText(session, title.id, 1, '잘못된 요소')).toThrow();
  });
  it('색상 변경 시 관련 없는 스타일과 배경색은 유지한다', () => {
    let session = readDocument(fixture);
    session = changeStyle(session, named(session, 'p').id, 'color', '#123456');
    session = changeStyle(session, named(session, 'p').id, 'font-size', '24px');
    const clean = exportDocument(session, 'clean');
    expect(clean).toContain('background-color: #eee');
    expect(clean).toContain('padding:8px');
    expect(clean).toContain('color: #123456 !important');
    expect(clean).toContain('font-size: 24px !important');
    expect(clean).not.toContain('color:red; padding');
  });
  it('반응형 이미지의 srcset과 picture source 충돌을 제거한다', () => {
    const session = readDocument(fixture);
    const next = replaceImage(session, named(session, 'img').id, pixel);
    const clean = exportDocument(next, 'clean');
    expect(clean).toContain(pixel);
    expect(clean).not.toContain('srcset');
    expect(clean).not.toContain('<source');
    expect(clean).toContain('alt="이미지" width="200"');
  });
  it('지원하지 않는 이미지나 색상, 크기, 요소 삭제를 거절한다', () => {
    const session = readDocument(fixture);
    const p = named(session, 'p');
    expect(() =>
      replaceImage(session, named(session, 'img').id, 'data:image/svg+xml,test'),
    ).toThrow();
    expect(() => changeStyle(session, p.id, 'color', 'url(evil)')).toThrow();
    expect(() => changeStyle(session, p.id, 'font-size', '300px')).toThrow();
    expect(() => deleteElement(session, named(session, 'body').id)).toThrow();
  });
  it('UTF-8로 내보낼 때 원본 인코딩 선언도 일치시킨다', () => {
    const session = readDocument(
      '<meta charset="euc-kr"><meta http-equiv="content-type" content="text/html;charset=euc-kr"><p>한국어</p>',
    );
    const clean = exportDocument(session, 'clean');
    expect(clean).toContain('charset="utf-8"');
    expect(clean).toContain('text/html; charset=utf-8');
  });
  it('연속된 가져오기·내보내기에 메모 블록이나 안내가 중복되지 않는다', () => {
    let session = readDocument(fixture, 'sample.html');
    session = addNote(session, named(session, 'p').id, 'inside', '여기 수정');
    for (let i = 0; i < 3; i++)
      session = readDocument(exportDocument(session, 'review'), 'sample.review.html');
    const review = exportDocument(session, 'review');
    expect(review.match(/id="htmledit-review"/g)).toHaveLength(1);
    expect(review.match(/HTMLEdit AI HANDOFF v1/g)).toHaveLength(1);
    expect(session.notes).toHaveLength(1);
    expect(exportName(session.fileName, 'review')).toBe('sample.review.html');
    expect(exportName(session.fileName, 'clean')).toBe('sample.edited.html');
  });
});

describe('메모 형식과 대상 연결', () => {
  it('한국어·이모지·HTML 코드가 포함된 메모를 안전하게 왕복 저장한다', () => {
    let session = readDocument(fixture);
    const value = '집 🏡 "추가" </script><script>alert(1)</script> & <b>진하게</b>';
    session = addNote(session, named(session, 'h1').id, 'before', value);
    const saved = exportDocument(session, 'review');
    expect(saved).not.toContain('</script><script>alert(1)');
    expect(saved).toContain('\\u003c/script\\u003e');
    const restored = readDocument(saved);
    expect(restored.notes[0].text).toBe(value);
    expect(restored.notes[0].relation).toBe('before');
    expect(listElements(restored).some((item) => item.id === restored.notes[0].targetId)).toBe(
      true,
    );
    expect(exportDocument(restored, 'clean')).not.toContain(value);
  });
  it('삭제된 대상의 메모는 남으며 실행 취소로 대상을 복원한다', () => {
    let session = readDocument(fixture);
    const target = named(session, 'p');
    session = addNote(session, target.id, 'self', '설명 삭제');
    let history = createHistory(session);
    history = commit(history, deleteElement(history.present, target.id));
    expect(history.present.notes).toHaveLength(1);
    expect(listElements(history.present).some((item) => item.id === target.id)).toBe(false);
    history = undo(history);
    expect(listElements(history.present).some((item) => item.id === target.id)).toBe(true);
    history = redo(history);
    expect(listElements(history.present).some((item) => item.id === target.id)).toBe(false);
  });
  it('누락된 대상을 다른 요소로 명시적으로 재연결한다', () => {
    let session = readDocument(fixture);
    session = addNote(session, named(session, 'p').id, 'after', '추가');
    session = deleteElement(session, named(session, 'p').id);
    const title = named(session, 'h1');
    session = rebindNote(session, session.notes[0].id, title.id);
    expect(session.notes[0].targetId).toBe(title.id);
    expect(session.notes[0].target.tag).toBe('h1');
  });
  it('완료 여부를 AI 결과에서 그대로 읽고 자동 추정하지 않는다', () => {
    let session = readDocument(fixture);
    session = addNote(session, named(session, 'p').id, 'self', '수정');
    const noteId = session.notes[0].id;
    const done = updateNote(session, noteId, { done: true, text: '수정됨' });
    expect(readDocument(exportDocument(done, 'review')).notes[0].done).toBe(true);
    expect(readDocument(exportDocument(session, 'review')).notes[0].done).toBe(false);
    expect(readDocument(exportDocument(session, 'clean')).notes).toHaveLength(0);
  });
  it('대상 ID가 중복되면 어느 쪽에도 임의 연결하지 않는다', () => {
    let session = readDocument('<p>첫 번째</p>');
    const target = named(session, 'p');
    session = addNote(session, target.id, 'self', '수정');
    const saved = exportDocument(session, 'review').replace(
      '</body>',
      `<p ${TARGET_ATTR}="${target.id}">두 번째</p></body>`,
    );
    const reopened = readDocument(saved);
    expect(reopened.warnings.some((item) => item.includes('중복'))).toBe(true);
    expect(listElements(reopened).filter((item) => item.id === target.id)).toHaveLength(0);
    expect(reopened.notes[0].targetId).toBe(target.id);
  });
  it.each(['not json', '{"version":99,"notes":[]}', '{"version":1,"notes":[{}]}'])(
    '잘못된 메모를 알리고 저장을 막는다: %s',
    (metadata) => {
      const session = readDocument(
        `<p>원본</p><script id="htmledit-review" type="application/json">${metadata}</script>`,
      );
      expect(session.metadataIssue).toBeTruthy();
      expect(() => exportDocument(session, 'review')).toThrow();
      expect(exportDocument({ ...session, metadataIssue: undefined }, 'clean')).toContain('원본');
    },
  );
  it('중복 메모 블록을 거절한다', () => {
    const block =
      '<script id="htmledit-review" type="application/json">{"version":1,"notes":[]}</script>';
    expect(readDocument(`<p>원본</p>${block}${block}`).metadataIssue).toContain('중복');
  });
  it('새 변경이 있으면 다시 실행 기록을 지운다', () => {
    let history = createHistory(0);
    history = commit(history, 1);
    history = commit(history, 2);
    history = undo(history);
    history = commit(history, 3);
    expect(history.future).toEqual([]);
    expect(undo(history).present).toBe(1);
  });
});

describe('스크립트 없는 미리보기', () => {
  it('실행 요소·이벤트·자동 이동·폼 전송을 차단하고 원본은 보존한다', () => {
    const source =
      '<!doctype html><meta http-equiv="refresh" content="0;url=https://example.com"><base href="https://example.com"><body onload="alert(1)"><p onclick="alert(2)">안전</p><iframe srcdoc="evil"></iframe><object data="evil"></object><form action="https://example.com"><button>보내기</button></form><script>alert(3)</script></body>';
    const session = readDocument(source);
    const preview = previewHtml(session);
    expect(preview).not.toContain('<script');
    expect(preview).not.toContain('<iframe');
    expect(preview).not.toContain('<object');
    expect(preview).not.toContain('<base');
    expect(preview).not.toContain('onload=');
    expect(preview).not.toContain('onclick=');
    expect(preview).not.toContain('http-equiv="refresh"');
    expect(preview).toContain("form-action 'none'");
    expect(preview).toContain("script-src 'none'");
    expect(exportDocument(session, 'clean')).toContain('<script>alert(3)</script>');
    expect(exportDocument(session, 'clean')).toContain('onclick="alert(2)"');
  });
  it('noscript 안의 내용도 스크립트 비활성 상태로 안전하게 해석한다', () => {
    const session = readDocument(
      '<noscript><iframe src="https://example.com"></iframe><meta http-equiv="refresh" content="0;url=https://example.com"></noscript><p>내용</p>',
    );
    const preview = previewHtml(session);
    expect(preview).not.toContain('<iframe');
    expect(preview).not.toContain('http-equiv="refresh"');
  });
  it('위험 요소가 텍스트 사이에 있어도 편집 인덱스를 유지한다', () => {
    const session = readDocument('<p>앞<script>alert(1)</script>뒤 <strong>강조</strong></p>');
    const originalParts = named(session, 'p').textParts;
    const root = parse(previewHtml(session));
    const parts: { index: number; value: string }[] = [];
    walk(root, (node) => {
      if ('tagName' in node && node.tagName === 'p')
        node.childNodes.forEach((child, index) => {
          if (child.nodeName === '#text')
            parts.push({ index, value: (child as { value: string }).value });
        });
    });
    expect(parts).toEqual(originalParts);
  });
});
