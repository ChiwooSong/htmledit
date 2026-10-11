// A reproducible record of the three requests manually interpreted from the demo HTML.
// This script is a verification fixture, not an AI integration in the editor.
import { readFile, writeFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { parse, parseFragment, serialize, type DefaultTreeAdapterTypes as T } from 'parse5';
import {
  changeText,
  deleteElement,
  exportDocument,
  listElements,
  readDocument,
  TARGET_ATTR,
  updateNote,
  walk,
} from '../src/model/document';

let session = readDocument(
  await readFile('public/examples/onyu-studio.review.html', 'utf8'),
  'onyu-studio.review.html',
);
assert.equal(session.notes.length, 3);
const [wording, iconRequest, deletion] = session.notes;
const title = listElements(session).find((element) => element.id === wording.targetId)!;
assert.equal(title.tag, 'h1');
session = changeText(session, title.id, title.textParts[0].index, '나답게 머무는 공간,');

const root = parse(session.html);
let target: T.Element | undefined;
walk(root, (node) => {
  if (
    'tagName' in node &&
    node.attrs.some(
      (attribute) => attribute.name === TARGET_ATTR && attribute.value === iconRequest.targetId,
    )
  )
    target = node;
});
assert.ok(target);
assert.equal(target.tagName, 'h3');
const row = parseFragment(
  '<div style="display:flex;align-items:center;gap:8px;margin:26px 0 12px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#738068" stroke-width="1.6" aria-hidden="true" focusable="false"><path d="M3 11 12 3l9 8M5 10v11h14V10M9 21v-7h6v7"/></svg></div>',
).childNodes[0] as T.Element;
const parent = target.parentNode!;
const position = parent.childNodes.indexOf(target);
row.parentNode = parent;
parent.childNodes[position] = row;
target.parentNode = row;
target.attrs.push({ name: 'style', value: 'margin:0' });
row.childNodes.push(target);
session = { ...session, html: serialize(root) };
session = deleteElement(session, deletion.targetId);
for (const note of session.notes) session = updateNote(session, note.id, { done: true });
const result = exportDocument(session, 'review');
await writeFile('public/examples/onyu-studio.ai-result.review.html', result, 'utf8');
const reopened = readDocument(result);
assert.equal(reopened.notes.filter((note) => note.done).length, 3);
assert.ok(result.includes('나답게 머무는 공간,'));
assert.ok(result.includes('온기</em>를 더합니다.'));
assert.ok(result.includes('aria-hidden="true"'));
assert.ok(!listElements(reopened).some((element) => element.id === deletion.targetId));
assert.ok(result.includes('공간 스타일링'));
console.log(
  '수동 해석한 요청 3개 반영: 문구 변경 / 집 아이콘 삽입 / 설명 삭제. 완료 상태 왕복 복원 통과.',
);
