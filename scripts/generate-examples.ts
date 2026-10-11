import { mkdir, writeFile } from 'node:fs/promises';
import { EXAMPLE_HTML } from '../src/example';
import { addNote, exportDocument, listElements, readDocument } from '../src/model/document';

let session = readDocument(EXAMPLE_HTML, 'onyu-studio.html');
const elements = listElements(session);
const hero = elements.find((element) => element.tag === 'h1')!;
const title = elements.find(
  (element) => element.tag === 'h3' && element.excerpt === '주거 공간 디자인',
)!;
const description = elements.find(
  (element) => element.tag === 'p' && element.excerpt.startsWith('작은 변화로'),
)!;
session = addNote(
  session,
  hero.id,
  'self',
  '첫 줄 “당신의 일상에,”를 “나답게 머무는 공간,”으로 바꿔 주세요. 강조된 “온기”와 줄바꿈은 유지해 주세요.',
);
session = addNote(
  session,
  title.id,
  'before',
  '제목 왼쪽에 작은 집 모양 아이콘을 추가해 주세요. 제목과 같은 줄에 놓고 기존 녹색 계열을 사용해 주세요.',
);
session = addNote(
  session,
  description.id,
  'self',
  '이 설명 문단을 삭제해 주세요. 카드 제목과 번호는 유지해 주세요.',
);
await mkdir('public/examples', { recursive: true });
await writeFile('public/examples/onyu-studio.html', EXAMPLE_HTML, 'utf8');
await writeFile(
  'public/examples/onyu-studio.review.html',
  exportDocument(session, 'review'),
  'utf8',
);
console.log('예제 문서와 세 가지 수정 요청이 있는 전달용 HTML을 생성했습니다.');
