import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readDocument, listElements, addNote, exportDocument } from '../../src/model/document';
import { sourceViewer } from '../fixtures/source-viewer';

const tinyImage =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const fixture =
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>테스트 문서</title><style>body{font-family:Arial;padding:35px;margin:0}h1{font-size:30px}article{padding:15px;border:1px solid #ddd}img{width:160px;height:100px;object-fit:cover}</style></head><body><h1>처음 제목</h1><article><h2>카드 제목</h2><p>처음 <strong>강조 문구</strong> 끝 문구</p></article><picture><source srcset="missing.webp"><img src="data:image/png;base64,' +
  tinyImage +
  '" alt="테스트 이미지" srcset="missing.png 2x"></picture><a href="https://example.com">이동 링크</a></body></html>';
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  runtimeErrors.set(page, []);
  page.on('pageerror', (error) => runtimeErrors.get(page)!.push(error.message));
});
test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});
async function open(page: Page, html = fixture, name = 'sample.html') {
  await page.goto('/');
  await page
    .getByTestId('html-file')
    .setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(html) });
  await expect(page.frameLocator('iframe').locator('body')).toBeVisible();
}
async function download(page: Page, label: 'AI 전달용 저장' | '완성본 저장') {
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const file = await promise;
  return { name: file.suggestedFilename(), content: await readFile((await file.path())!, 'utf8') };
}
async function note(page: Page, content: string) {
  await page.getByRole('button', { name: '메모 남기기', exact: true }).click();
  await page.frameLocator('iframe').locator('h1').click();
  await page.getByRole('textbox', { name: '수정 요청', exact: true }).fill(content);
  await page.getByLabel('요청할 위치').selectOption('before');
  await page.getByRole('button', { name: '메모 추가', exact: true }).click();
}

test('소스 보기 저장 파일을 화면으로 복원해 편집·저장·다시 열 수 있다', async ({ page }) => {
  await open(page, sourceViewer(fixture), 'source.html');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('h1')).toHaveText('처음 제목');
  await expect(frame.locator('h1')).toHaveCSS('font-size', '30px');
  await expect(frame.locator('.line-content')).toHaveCount(0);
  await frame.locator('h1').click();
  await page.getByRole('textbox', { name: '문구 1', exact: true }).fill('복원한 제목 👋');
  await page.getByRole('button', { name: '문구 적용', exact: true }).click();
  await note(page, '제목 앞에 아이콘 추가');
  const review = await download(page, 'AI 전달용 저장');
  expect(review.content).not.toContain('line-gutter-backdrop');
  await page.getByTestId('html-file').setInputFiles({
    name: review.name,
    mimeType: 'text/html',
    buffer: Buffer.from(review.content),
  });
  await page.getByRole('button', { name: /수정 메모/ }).click();
  await expect(frame.locator('h1')).toHaveText('복원한 제목 👋');
  await expect(page.getByTestId('note-card')).toContainText('제목 앞에 아이콘 추가');
});

test('시작 화면과 예제 문서가 실제로 표시된다', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '화면에서 고치고, 메모로 전달하세요.' }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('welcome.png'), fullPage: true });
  await page.getByRole('button', { name: /예제 문서로 둘러보기/ }).click();
  await expect(page.frameLocator('iframe').locator('h1')).toContainText('당신의 일상에');
  await page.frameLocator('iframe').locator('h1').click();
  await expect(page.getByText('선택한 요소', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true });
});

test('직접 편집·메모·두 종류 저장·재열기의 전체 흐름', async ({ page }) => {
  await open(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('h1').click();
  await expect(page.getByRole('spinbutton', { name: '글자 크기' })).toHaveValue('30');
  await page.getByRole('textbox', { name: '문구 1', exact: true }).fill('바뀐 제목 🏡');
  await page.getByRole('button', { name: '문구 적용', exact: true }).click();
  await expect(frame.locator('h1')).toHaveText('바뀐 제목 🏡');
  await page.getByRole('spinbutton', { name: '글자 크기' }).fill('42');
  await page.locator('.number-field').getByRole('button', { name: '적용', exact: true }).click();
  await expect(frame.locator('h1')).toHaveCSS('font-size', '42px');
  await page.getByRole('textbox', { name: '글자색 코드' }).fill('#123456');
  await page.locator('.color-field').getByRole('button', { name: '적용', exact: true }).click();
  await expect(frame.locator('h1')).toHaveCSS('color', 'rgb(18, 52, 86)');
  const value = '여기에 아이콘 🏡 "추가" </script><script>alert(1)</script> & <b>코드</b>';
  await note(page, value);
  await expect(page.getByTestId('note-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '메모 1 위치' })).toBeVisible();
  const review = await download(page, 'AI 전달용 저장');
  expect(review.name).toBe('sample.review.html');
  expect(review.content).toContain('htmledit-review');
  expect(review.content).not.toContain('selection-outline');
  expect(review.content).not.toContain('Content-Security-Policy');
  expect(review.content).not.toContain('</script><script>alert(1)');
  const clean = await download(page, '완성본 저장');
  expect(clean.content).not.toContain('data-htmledit-id');
  expect(clean.content).not.toContain('htmledit-review');
  expect(clean.content).toContain('바뀐 제목 🏡');
  await page.getByTestId('html-file').setInputFiles({
    name: review.name,
    mimeType: 'text/html',
    buffer: Buffer.from(review.content),
  });
  await page.getByRole('button', { name: /수정 메모/ }).click();
  await expect(page.getByTestId('note-card')).toContainText(value);
  await expect(frame.locator('h1')).toHaveText('바뀐 제목 🏡');
  await page.getByTestId('note-card').getByRole('button', { name: '완료', exact: true }).click();
  await expect(
    page.getByTestId('note-card').getByRole('button', { name: '다시 열기', exact: true }),
  ).toBeVisible();
  await page
    .getByTestId('note-card')
    .getByRole('button', { name: '다시 열기', exact: true })
    .click();
  await page.getByTestId('note-card').getByRole('button', { name: '수정', exact: true }).click();
  await page.getByRole('textbox', { name: '수정 요청', exact: true }).fill('새로운 요청');
  await page.getByRole('button', { name: '메모 수정 저장', exact: true }).click();
  await expect(page.getByTestId('note-card')).toContainText('새로운 요청');
  await page.getByRole('button', { name: '메모 1 삭제' }).click();
  await expect(page.getByTestId('note-card')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByTestId('note-card')).toHaveCount(1);
});

test('한글 문구를 제자리에서 편집해도 강조 태그를 유지한다', async ({ page }) => {
  await open(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('strong').dblclick();
  const editor = page.getByRole('textbox', { name: '문구 직접 편집' });
  await expect(editor).toBeVisible();
  await editor.fill('한글 입력 👋 <코드>');
  await editor.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
  await expect(editor).toBeVisible();
  await page.locator('.inline-actions').getByRole('button', { name: '적용', exact: true }).click();
  await expect(frame.locator('strong')).toHaveText('한글 입력 👋 <코드>');
  await expect(frame.locator('article p')).toContainText('처음 한글 입력 👋 <코드> 끝 문구');
  const clean = await download(page, '완성본 저장');
  expect(clean.content).toContain('<strong>한글 입력 👋 &lt;코드&gt;</strong>');
});

test('이미지 교체가 반응형 source보다 우선하며 HTML에 포함된다', async ({ page }) => {
  await open(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('img').click();
  await expect(page.getByRole('button', { name: '이미지 교체', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이미지 교체', exact: true }).click();
  await page.getByTestId('image-file').setInputFiles({
    name: 'new.png',
    mimeType: 'image/png',
    buffer: Buffer.from(tinyImage, 'base64'),
  });
  await page.getByRole('button', { name: '이미지 적용', exact: true }).click();
  await expect(frame.locator('source')).toHaveCount(0);
  await expect(frame.locator('img')).not.toHaveAttribute('srcset', /.+/);
  const clean = await download(page, '완성본 저장');
  expect(clean.content).toContain(`data:image/png;base64,${tinyImage}`);
  expect(clean.content).not.toContain('srcset');
});

test('대상 삭제·실행 취소·메모 재지정이 연결을 유지한다', async ({ page }) => {
  await open(page);
  await note(page, '제목 요청');
  await page.getByRole('button', { name: '요소 편집', exact: true }).click();
  await page.getByRole('button', { name: '선택 요소 삭제', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '요소 삭제', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('h1')).toHaveCount(0);
  await page.getByRole('button', { name: /수정 메모/ }).click();
  await expect(page.getByTestId('note-card')).toContainText('대상 없음');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('h1')).toHaveCount(1);
  await expect(page.getByTestId('note-card')).not.toContainText('대상 없음');
  await page.getByTestId('note-card').getByRole('button', { name: '대상 재지정' }).click();
  await page.frameLocator('iframe').locator('h2').click();
  await page.getByRole('button', { name: '선택한 요소에 연결', exact: true }).click();
  await expect(page.getByTestId('note-card')).toContainText('〈h2〉');
});

test('최근 작업을 IndexedDB에서 복구한다', async ({ page }) => {
  await open(page);
  await note(page, '임시 복구 메모');
  // A timestamp can belong to the initial document save; wait for this edit's transaction.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string[]>((resolve, reject) => {
            const request = indexedDB.open('htmledit-local', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const transaction = db.transaction('drafts', 'readonly');
              const draft = transaction.objectStore('drafts').get('latest');
              transaction.oncomplete = () => {
                db.close();
                resolve(
                  draft.result?.session.notes.map((note: { text: string }) => note.text) ?? [],
                );
              };
              transaction.onerror = () => {
                db.close();
                reject(transaction.error);
              };
            };
          }),
      ),
    )
    .toContain('임시 복구 메모');
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByRole('button', { name: '복구하기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '복구하기', exact: true }).click();
  await page.getByRole('button', { name: /수정 메모/ }).click();
  await expect(page.getByTestId('note-card')).toContainText('임시 복구 메모');
  await expect(page.frameLocator('iframe').locator('h1')).toHaveText('처음 제목');
});

test('수정 전 소스 보기 임시 작업을 복구할 때 내부 메모와 기존 메모를 유지한다', async ({
  page,
}) => {
  let session = readDocument(fixture, 'old-source.html');
  const target = listElements(session).find((element) => element.tag === 'h1')!.id;
  session = addNote(session, target, 'before', '복원된 페이지의 메모');
  const oldDraft = {
    session: {
      ...session,
      html: sourceViewer(exportDocument(session, 'review')),
      notes: [
        {
          ...session.notes[0],
          id: 'old-wrapper-note',
          targetId: 'missing-wrapper',
          text: '기존 소스 화면의 메모',
        },
      ],
    },
    savedAt: Date.now(),
  };
  await page.goto('/');
  await page.evaluate(async (draft) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('htmledit-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put(draft, 'latest');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, oldDraft);
  await page.reload();
  await page.getByRole('button', { name: '복구하기', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('h1')).toHaveText('처음 제목');
  await page.getByRole('button', { name: /수정 메모/ }).click();
  await expect(page.getByTestId('note-card')).toHaveCount(2);
  await expect(
    page.getByTestId('note-card').filter({ hasText: '복원된 페이지의 메모' }),
  ).not.toContainText('대상 없음');
  await expect(
    page.getByTestId('note-card').filter({ hasText: '기존 소스 화면의 메모' }),
  ).toContainText('대상 없음');
});

test('잘못된 메모와 누락된 대상을 조용히 버리지 않는다', async ({ page }) => {
  await open(
    page,
    '<p>원본 내용</p><script id="htmledit-review" type="application/json">{"version":99,"notes":[]}</script>',
  );
  await expect(page.getByText(/지원하지 않는 메모 형식 버전/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI 전달용 저장' })).toBeDisabled();
  await page.getByRole('button', { name: '읽을 수 없는 메모 제외', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '메모 제외', exact: true }).click();
  const clean = await download(page, '완성본 저장');
  expect(clean.content).toContain('원본 내용');
  let session = readDocument('<h1>대상</h1><p>내용</p>');
  const id = listElements(session).find((element) => element.tag === 'h1')!.id;
  session = addNote(session, id, 'self', '누락된 대상 요청');
  const missing = exportDocument(session, 'review').replace(`data-htmledit-id="${id}"`, '');
  await page.getByTestId('html-file').setInputFiles({
    name: 'missing.review.html',
    mimeType: 'text/html',
    buffer: Buffer.from(missing),
  });
  await page.getByRole('button', { name: /수정 메모/ }).click();
  await expect(page.getByTestId('note-card')).toContainText('대상 없음');
});

test('스크립트·이벤트·자동 이동·링크·폼·noscript가 편집기를 이탈시키지 않는다', async ({
  page,
}) => {
  const source =
    '<!doctype html><meta http-equiv="refresh" content="0;url=https://example.com"><body onload="parent.document.title=\'PWNED\'"><p onclick="parent.document.title=\'PWNED\'">안전한 문구</p><script>parent.document.title="PWNED";location.href="https://example.com"</script><iframe srcdoc="<script>parent.parent.document.title=\'PWNED\'</script>"></iframe><noscript><iframe src="https://example.com"></iframe><meta http-equiv="refresh" content="0;url=https://example.com"></noscript><a href="https://example.com">이동 금지</a><form action="https://example.com"><button type="submit">전송 금지</button></form></body>';
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await open(page, source);
  const frame = page.frameLocator('iframe');
  await frame.locator('p').click();
  await frame.locator('a').click();
  await frame.locator('button').click();
  await expect(page).toHaveTitle(/HTMLEdit/);
  await expect(frame.locator('p')).toHaveText('안전한 문구');
  await expect(frame.locator('iframe')).toHaveCount(0);
  expect(dialogs).toEqual([]);
  const clean = await download(page, '완성본 저장');
  expect(clean.content).toContain('parent.document.title="PWNED"');
});

test('스크롤과 너비 변경 후에도 메모 표식이 대상에 붙는다', async ({ page }) => {
  await open(
    page,
    '<!doctype html><style>body{margin:0}h1{margin:0;padding:20px}div{height:1600px}</style><h1>표식 대상</h1><div>긴 내용</div>',
  );
  await note(page, '표식 테스트');
  const marker = page.getByRole('button', { name: '메모 1 위치' });
  await expect(marker).toBeVisible();
  await page.getByRole('button', { name: '모바일 너비' }).click();
  await expect(page.locator('.frame-wrap')).toHaveCSS('width', '390px');
  const frameBox = (await page.locator('iframe').boundingBox())!;
  const markerBox = (await marker.boundingBox())!;
  expect(Math.abs(markerBox.x - frameBox.x)).toBeLessThan(12);
  await page
    .frameLocator('iframe')
    .locator('body')
    .evaluate((element) => (element.ownerDocument.scrollingElement!.scrollTop = 300));
  await expect(marker).toHaveCount(0);
  await page.getByTestId('note-card').getByRole('button', { name: '1', exact: true }).click();
  await expect(marker).toBeVisible();
});

test('단순 재저장은 시각 결과를 유지하고 AI 메모를 문서에 표시하지 않는다', async ({
  page,
}, testInfo) => {
  await open(page);
  // Compare document pixels, excluding the editor's rounded-frame compositing.
  // On the Windows CI GPU, reloading changes only the 5px corner antialiasing.
  await page.addStyleTag({
    content: '.frame-wrap, .frame-wrap iframe { border-radius: 0 !important; }',
  });
  const ready = async () => {
    await page
      .frameLocator('iframe')
      .locator('body')
      .evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {})));
      });
    await page.mouse.move(0, 0);
  };
  await ready();
  const before = await page
    .locator('iframe')
    .screenshot({ path: testInfo.outputPath('before.png') });
  const clean = await download(page, '완성본 저장');
  await page
    .getByTestId('html-file')
    .setInputFiles({ name: clean.name, mimeType: 'text/html', buffer: Buffer.from(clean.content) });
  await expect(page.frameLocator('iframe').locator('h1')).toHaveText('처음 제목');
  await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
  await ready();
  const after = await page.locator('iframe').screenshot({ path: testInfo.outputPath('after.png') });
  expect(after.equals(before)).toBe(true);
  const review = await readFile('public/examples/onyu-studio.review.html', 'utf8');
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(review)}`);
  await expect(page.locator('h1')).toContainText('당신의 일상에');
  await expect(page.locator('#htmledit-review')).not.toBeVisible();
  await expect(page.getByText(/수정 요청을 포함/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('review-in-browser.png'), fullPage: true });
});

test('지원하지 않는 파일과 잘못된 이미지에 오류를 표시한다', async ({ page }) => {
  await page.goto('/');
  await page
    .getByTestId('html-file')
    .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('내용') });
  await expect(page.getByRole('alert')).toContainText('.html 또는 .htm');
  await page
    .getByTestId('html-file')
    .setInputFiles({ name: 'empty.html', mimeType: 'text/html', buffer: Buffer.from(' ') });
  await expect(page.getByRole('alert')).toContainText('비어 있는 파일');
  await page
    .getByTestId('html-file')
    .setInputFiles({ name: 'sample.html', mimeType: 'text/html', buffer: Buffer.from(fixture) });
  await page.frameLocator('iframe').locator('img').click();
  await page.getByRole('button', { name: '이미지 교체', exact: true }).click();
  await page
    .getByTestId('image-file')
    .setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('.image-error')).toContainText('PNG·JPEG');
});

test('끌어다 놓은 HTML을 열고 메모 표식에서 목록으로 이동한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('.dropzone').evaluate((element, html) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([html], 'dropped.html', { type: 'text/html' }));
    element.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
  }, fixture);
  await expect(page.frameLocator('iframe').locator('h1')).toHaveText('처음 제목');
  await note(page, '표식에서 열기');
  await page.getByRole('button', { name: '요소 편집', exact: true }).click();
  await page.getByRole('button', { name: '메모 1 위치' }).click();
  await expect(page.getByTestId('note-card')).toContainText('표식에서 열기');
});

test('AI 전달 설명 복사와 메모 필터가 작동한다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await note(page, '완료 필터 요청');
  await page.getByTestId('note-card').getByRole('button', { name: '완료', exact: true }).click();
  await page.locator('.note-filters').getByRole('button', { name: '미완료', exact: true }).click();
  await expect(page.getByTestId('note-card')).toHaveCount(0);
  await page.locator('.note-filters').getByRole('button', { name: '완료', exact: true }).click();
  await expect(page.getByTestId('note-card')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '저장하고 AI 요청 복사', exact: true }).click();
  const saved = await downloadPromise;
  expect(saved.suggestedFilename()).toBe('sample.review.html');
  const exported = readDocument(
    await readFile((await saved.path())!, 'utf8'),
    'sample.review.html',
  );
  expect(exported.notes[0]).toMatchObject({ text: '완료 필터 요청', done: true });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('sample.review.html');
  expect(copied).toContain('targetId');
  expect(copied).toContain('done:false');
});

test('세 가지 요청을 반영한 결과에서 완료 메모와 디자인을 복원한다', async ({ page }, testInfo) => {
  const result = await readFile('public/examples/onyu-studio.ai-result.review.html', 'utf8');
  await open(page, result, 'onyu-studio.ai-result.review.html');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('h1')).toContainText('나답게 머무는 공간,');
  await expect(frame.locator('h1 em')).toHaveText('온기');
  await expect(frame.locator('.card').first().locator('svg')).toHaveCount(1);
  await expect(frame.locator('.card').last().locator('p')).toHaveCount(0);
  await expect(frame.locator('.card').last().locator('h3')).toHaveText('공간 스타일링');
  await page.getByRole('button', { name: /수정 메모/ }).click();
  await expect(page.getByTestId('note-card')).toHaveCount(3);
  await expect(page.locator('.note-summary')).toContainText('전체 3 · 완료 3');
  await page.screenshot({ path: testInfo.outputPath('ai-result.png'), fullPage: true });
});

test('원본 예제와 완성본의 브라우저 렌더링이 같다', async ({ page }, testInfo) => {
  const original = await readFile('public/examples/onyu-studio.html', 'utf8');
  const clean = exportDocument(readDocument(original), 'clean');
  const capture = async (html: string, name: string) => {
    await page.setContent(html);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => image.decode()));
    });
    // Full-page capture can trigger another compositor paint on macOS. Require
    // consecutive identical captures before comparing the two documents.
    let previous = await page.screenshot({ fullPage: true });
    await expect
      .poll(async () => {
        const current = await page.screenshot({ fullPage: true, path: testInfo.outputPath(name) });
        const settled = current.equals(previous);
        previous = current;
        return settled;
      })
      .toBe(true);
    return previous;
  };
  const before = await capture(original, 'original.png');
  const after = await capture(clean, 'exported.png');
  // macOS can round composited channels by 1–3/255 across identical paints.
  // Compare every decoded pixel with only that channel tolerance, not a budget
  // of missing/shifted pixels or a percentage of allowed visual differences.
  const difference = await page.evaluate(
    async (screenshots) => {
      const pixels = await Promise.all(
        screenshots.map(async (source) => {
          const image = new Image();
          image.src = source;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height);
        }),
      );
      const [a, b] = pixels;
      let maxChannelDelta = 0;
      if (a.width === b.width && a.height === b.height) {
        for (let i = 0; i < a.data.length; i++) {
          maxChannelDelta = Math.max(maxChannelDelta, Math.abs(a.data[i] - b.data[i]));
        }
      }
      return { sameSize: a.width === b.width && a.height === b.height, maxChannelDelta };
    },
    [before, after].map((buffer) => `data:image/png;base64,${buffer.toString('base64')}`),
  );
  expect(difference.sameSize).toBe(true);
  expect(difference.maxChannelDelta).toBeLessThanOrEqual(3);
});

test('상위 카드 선택과 문서 안의 실행 취소·다시 실행 단축키', async ({ page }) => {
  await open(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('h2').click();
  await page.getByRole('button', { name: '상위 요소 선택', exact: true }).click();
  await expect(page.locator('.tag-name')).toHaveText('article');
  await page.getByRole('button', { name: '선택 요소 삭제', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '요소 삭제', exact: true }).click();
  await expect(frame.locator('article')).toHaveCount(0);
  await frame.locator('h1').click();
  await frame.locator('h1').press('ControlOrMeta+z');
  await expect(frame.locator('article')).toHaveCount(1);
  await frame.locator('h1').click();
  await frame.locator('h1').press('ControlOrMeta+Shift+z');
  await expect(frame.locator('article')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(frame.locator('article')).toHaveCount(1);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(frame.locator('article')).toHaveCount(0);
  await page.getByRole('button', { name: '태블릿 너비', exact: true }).click();
  await expect(page.locator('.frame-wrap')).toHaveCSS('width', '768px');
});
