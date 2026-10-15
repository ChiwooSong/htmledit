import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { zipSync, strToU8 } from 'fflate';
import { prepareFile, DocumentStore } from '../../scripts/local/store';
import { ChangeRequestStore } from '../../scripts/local/change-requests';
import { startServer } from '../../scripts/local/server';
import { readDocument, listElements, exportDocument } from '../../src/model/document';
import { requestText } from '../../src/requests/i18n';
import { translate } from '../../src/i18n';

test('import → AI proposals → user review → notes → undo/redo → scoped handoff → reload', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const root = await realpath(tmpdir()),
    dir = await mkdtemp(join(root, 'htmledit-request-ui-'));
  const original = join(dir, 'review.html');
  await writeFile(
    original,
    '<!doctype html><html><body><h1>원래 제목</h1><p>설명</p><button>시작하기</button></body></html>',
  );
  const file = await prepareFile(original),
    store = new DocumentStore(file),
    requests = new ChangeRequestStore(store);
  const service = await startServer(file, resolve('dist'));
  try {
    await page.goto(service.url);
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('h1')).toHaveText('원래 제목');
    await page.getByRole('button', { name: '변경 요청 가져오기', exact: true }).click();
    const panel = page.getByRole('complementary', { name: '변경 요청 가져오기' });
    await panel.getByLabel('제목 (선택)').fill('내 변경 요청');
    const source =
      '제목을 새 제목으로 바꿔.\n\n설명은 삭제. 아니, 유지할까?\n\n버튼 앞에 아이콘 추가.';
    await panel.getByLabel('변경 요청 원문', { exact: true }).fill(source);
    await panel.getByRole('button', { name: '분석 요청 복사', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('복사했습니다');
    const b = (await requests.list())[0],
      check = await requests.checkout(b.id);
    const before = await store.read(),
      ids = listElements(readDocument(before.html));
    const target = (tag: string) => ids.find((e) => e.tag === tag)!.id;
    await requests.submit(b.id, {
      revision: check.revision,
      submission: {
        version: 1,
        proposals: [
          {
            id: 'title',
            text: '제목을 새 제목으로 변경',
            targetIds: [target('h1')],
            relation: 'self',
            evidence: [{ paragraphId: 'p1', quote: '제목을 새 제목으로 바꿔.' }],
            issues: [],
          },
          {
            id: 'conflict',
            text: '설명 삭제 또는 유지 확인',
            targetIds: [],
            relation: 'self',
            evidence: [{ paragraphId: 'p2', quote: '설명은 삭제. 아니, 유지할까?' }],
            issues: ['conflict'],
          },
          {
            id: 'icon',
            text: '버튼 앞에 아이콘 추가',
            targetIds: [target('button')],
            relation: 'before',
            evidence: [{ paragraphId: 'p3', quote: '버튼 앞에 아이콘 추가.' }],
            issues: [],
          },
        ],
      },
    });
    const title = panel.locator('[data-proposal-id="title"]'),
      conflict = panel.locator('[data-proposal-id="conflict"]'),
      icon = panel.locator('[data-proposal-id="icon"]');
    await expect(title).toBeVisible();
    expect(await readFile(file, 'utf8')).toBe(before.html);
    await expect(conflict.getByRole('button', { name: '승인', exact: true })).toBeDisabled();
    await title.getByRole('button', { name: '대상 위치 보기' }).click();
    await title.getByRole('button', { name: '승인', exact: true }).click();
    await icon.getByRole('button', { name: '제외', exact: true }).click();
    await conflict.getByRole('button', { name: '제안 수정' }).click();
    await conflict
      .getByRole('textbox', { name: '변경 요청', exact: true })
      .fill('설명은 유지하고 문구를 간결하게 다듬기');
    await frame.locator('p').click();
    await conflict.getByRole('button', { name: '선택한 요소로 재지정' }).click();
    await conflict
      .getByRole('checkbox', { name: '요청을 명확히 하고 대상을 확인했습니다.' })
      .check();
    await conflict.getByRole('button', { name: '검토 저장' }).click();
    await conflict.getByRole('button', { name: '승인', exact: true }).click();
    await panel.getByRole('button', { name: '승인한 항목을 메모로 추가' }).click();
    await expect(title).toContainText('메모로 추가됨');
    const converted = await store.read();
    expect(readDocument(converted.html).notes).toHaveLength(2);
    expect(exportDocument(readDocument(converted.html), 'clean')).toBe(
      exportDocument(readDocument(before.html), 'clean'),
    );
    await page.getByRole('button', { name: /실행 취소/ }).click();
    // Saving undo removes converted notes; the stable IDs allow safe re-conversion.
    await panel.getByRole('button', { name: '분석 요청 복사' }).click();
    await expect.poll(async () => readDocument((await store.read()).html).notes.length).toBe(0);
    await page.getByRole('button', { name: /다시 실행/ }).click();
    await panel.getByRole('button', { name: '분석 요청 복사' }).click();
    await expect.poll(async () => readDocument((await store.read()).html).notes.length).toBe(2);
    await expect(
      panel.getByRole('button', { name: '저장하고 AI 요청 복사', exact: true }),
    ).toBeEnabled();
    await panel.getByRole('button', { name: '저장하고 AI 요청 복사', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('apply ONLY');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const view = await requests.get(b.id);
    expect(copied).toContain(view.noteIds.title);
    expect(copied).toContain(view.noteIds.conflict);
    expect(copied).not.toContain(view.noteIds.icon);
    await page.reload();
    await expect(frame.locator('h1')).toHaveText('원래 제목');
    await page.getByRole('button', { name: '변경 요청 가져오기', exact: true }).click();
    await panel.getByLabel('가져온 요청', { exact: true }).selectOption(b.id);
    await expect(title).toContainText('메모로 추가됨');
    // New DOCX source goes through the bounded worker; markup remains literal text.
    await panel.getByLabel('가져온 요청', { exact: true }).selectOption('');
    const docx = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>한글 😊 &lt;b&gt;메모&lt;/b&gt;</w:t></w:r></w:p></w:body></w:document>',
      ),
    });
    await panel.locator('input[type=file]').setInputFiles({
      name: '개인 메모.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from(docx),
    });
    await expect(panel.getByRole('textbox', { name: '변경 요청 원문', exact: true })).toHaveValue(
      '한글 😊 <b>메모</b>',
    );
    for (const locale of ['en', 'es', 'ja', 'pt-BR', 'ko'] as const) {
      await page.getByTestId('language-select').selectOption(locale);
      const translated = page.getByRole('complementary', { name: requestText(locale, 'title') });
      await expect(
        translated.getByRole('textbox', { name: requestText(locale, 'source'), exact: true }),
      ).toHaveValue('한글 😊 <b>메모</b>');
    }
    await panel.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('현재 입력을 저장하거나 취소');
    const disk = await store.read();
    await store.save(disk.html.replace('원래 제목</h1>', '외부 수정</h1>'), disk.revision);
    await expect(
      page.getByRole('button', { name: translate('ko', 'reopenDiskVersion') }),
    ).toBeVisible();
    await expect(panel.getByRole('textbox', { name: '변경 요청 원문', exact: true })).toHaveValue(
      '한글 😊 <b>메모</b>',
    );
    await expect(frame.locator('h1')).toHaveText('원래 제목');
    await panel.getByRole('button', { name: '취소', exact: true }).click();
    expect(await readFile(original, 'utf8')).not.toContain('data-htmledit');
  } finally {
    const done = once(service.server, 'close');
    service.server.close();
    service.server.closeAllConnections();
    await done;
    if (!resolve(dir).startsWith(root + sep) || !dir.includes('htmledit-request-ui-'))
      throw new Error('Unsafe cleanup');
    await rm(dir, { recursive: true, force: true });
  }
});
