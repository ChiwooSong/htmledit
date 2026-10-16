// Browser fixture driver. AI interpretation and candidate editing happen separately,
// between prepare and review. This script never generates AI proposals or HTML edits.
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { readDocument, exportDocument, listElements, addNote } from '../src/model/document';

const [mode, agent = 'codex'] = process.argv.slice(2);
if (!['codex', 'claude'].includes(agent) || !['prepare', 'review'].includes(mode))
  throw new Error('prepare|review codex|claude');
const root = resolve('.cache/request-live'),
  dir = join(root, agent),
  stateFile = join(dir, 'state.json');
await mkdir(dir, { recursive: true });
const env = {
  ...process.env,
  HTMLEDIT_HOME: join(root, 'home'),
  HTMLEDIT_USER_HOME: join(root, 'user'),
};
const cli = (args: string[]) =>
  JSON.parse(
    execFileSync(process.execPath, [resolve('runtime/cli.mjs'), ...args, '--json'], {
      env,
      encoding: 'utf8',
      windowsHide: true,
    }),
  );
const browser = await chromium.launch({ channel: 'chrome' }),
  context = await browser.newContext({
    locale: 'ko-KR',
    viewport: { width: 1500, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
  }),
  page = await context.newPage();
try {
  if (mode === 'prepare') {
    const original = join(dir, 'original.html');
    const html =
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>변경 요청 검증</title><style>body{font:18px sans-serif;background:#edf2e9;color:#243c32;padding:50px}main{max-width:800px;margin:auto}h1{font-size:44px}section{display:flex;gap:20px}article{padding:24px;background:white;border-radius:16px;flex:1}button{background:#2c5743;color:white;padding:14px 24px;border:0;border-radius:8px;margin-top:25px}.eyebrow{letter-spacing:3px;color:#547760}</style></head><body><main><p class="eyebrow">PROJECT NOTE / 2026</p><h1>우리의 새 프로젝트</h1><p>팀이 함께 만드는 소개 페이지</p><section><article><h2>첫째 카드</h2><p>이 설명은 유지해야 합니다.</p></article><article><h2>둘째 카드</h2><p>이 설명은 길어서 삭제하려고 합니다.</p></article></section><button>시작하기</button><footer>기존 메모 대상</footer></main></body></html>';
    await writeFile(original, html);
    let session = readDocument(html, 'original.html');
    session = addNote(
      session,
      listElements(session).find((e) => e.tag === 'footer')!.id,
      'self',
      '기존 메모: 푸터를 영어로 바꾸기 (이번 반영 대상 아님)',
    );
    const file = join(dir, 'working.review.html');
    await writeFile(file, exportDocument(session, 'review'));
    const opened = cli(['open', file, '--no-browser']);
    await page.goto(opened.url);
    await expect(page.frameLocator('iframe').locator('h1')).toHaveText('우리의 새 프로젝트');
    await page.getByRole('button', { name: '변경 요청 가져오기', exact: true }).click();
    const panel = page.getByRole('complementary', { name: '변경 요청 가져오기' });
    const source = `첫 화면 큰 제목은 '함께 만드는 변화'로 바꾸자.\n\n시작하기 버튼 앞에 작은 별 아이콘을 하나 넣어 줘.\n\n둘째 카드의 설명 문장은 빼자.\n\n두 카드 제목은 모두 글자를 조금 크게 해 줘.\n\n큰 제목은 아까 말한 '함께 만드는 변화'가 맞아. 같은 요청이야.\n\n첫째 카드 배경은 파란색이 좋아.\n\n아니, 첫째 카드 배경은 초록색으로 해야 해. 아직 결정 못 했어.\n\n저것도 좀 더 눈에 띄게 해 줘.\n\n오늘 커피가 맛있었네. 다음에 또 마시자.`;
    await panel.getByLabel('제목 (선택)').fill(`${agent} 자유 변경 요청`);
    await panel.getByRole('textbox', { name: '변경 요청 원문', exact: true }).fill(source);
    await panel.getByRole('button', { name: '분석 요청 복사', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('복사했습니다');
    const batch = cli(['requests', 'status', '--file', file])[0];
    await writeFile(
      stateFile,
      JSON.stringify(
        {
          file,
          original,
          url: opened.url,
          batchId: batch.id,
          source,
          before: await readFile(file, 'utf8'),
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: join(dir, 'source.png') });
    console.log(JSON.stringify({ file, batchId: batch.id, source }));
  } else {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    expect(await readFile(state.file, 'utf8')).toBe(state.before);
    await page.goto(state.url);
    await expect(page.frameLocator('iframe').locator('h1')).toHaveText('우리의 새 프로젝트');
    await page.getByRole('button', { name: '변경 요청 가져오기', exact: true }).click();
    const panel = page.getByRole('complementary', { name: '변경 요청 가져오기' });
    await panel.getByLabel('가져온 요청', { exact: true }).selectOption(state.batchId);
    const batch = cli(['requests', 'status', '--file', state.file, '--batch', state.batchId]);
    const approved: string[] = [];
    for (const p of batch.analysis.proposals) {
      const card = panel.locator(`[data-proposal-id="${p.id}"]`);
      // Simulated user explicitly approves only the first three unambiguous changes.
      if (
        !p.issues.length &&
        p.evidence.some((e: any) => ['p1', 'p2', 'p3'].includes(e.paragraphId))
      ) {
        await card.getByRole('button', { name: '승인', exact: true }).click();
        approved.push(p.id);
      } else await card.getByRole('button', { name: '제외', exact: true }).click();
    }
    expect(approved).toHaveLength(3);
    await page.screenshot({ path: join(dir, 'review.png') });
    await panel.getByRole('button', { name: '승인한 항목을 메모로 추가', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: '저장하고 AI 요청 복사', exact: true }),
    ).toBeEnabled();
    await panel.getByRole('button', { name: '저장하고 AI 요청 복사', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('apply ONLY');
    const request = await page.evaluate(() => navigator.clipboard.readText());
    const now = cli(['requests', 'status', '--file', state.file, '--batch', state.batchId]);
    const noteIds = approved.map((id) => now.noteIds[id]);
    await writeFile(
      join(dir, 'approved.json'),
      JSON.stringify({ file: state.file, noteIds, request }, null, 2),
    );
    await writeFile(join(dir, 'before-apply.html'), await readFile(state.file, 'utf8'));
    console.log(JSON.stringify({ phase: 'approved', file: state.file, noteIds }));
    await expect(page.frameLocator('iframe').locator('h1')).toHaveText('함께 만드는 변화', {
      timeout: 240_000,
    });
    const current = readDocument(await readFile(state.file, 'utf8'));
    expect(current.notes.filter((n) => noteIds.includes(n.id)).every((n) => n.done)).toBe(true);
    expect(current.notes.find((n) => !noteIds.includes(n.id))?.done).toBe(false);
    await expect(page.frameLocator('iframe').locator('article').nth(1).locator('p')).toHaveCount(0);
    await expect(page.frameLocator('iframe').locator('article').first().locator('p')).toHaveText(
      '이 설명은 유지해야 합니다.',
    );
    await expect(page.frameLocator('iframe').locator('button')).toHaveText('시작하기');
    await page.screenshot({ path: join(dir, 'after.png') });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '완성본 저장', exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(join(dir, 'final.html'));
    const clean = await readFile(join(dir, 'final.html'), 'utf8');
    expect(clean).not.toContain('data-htmledit-id');
    expect(clean).not.toContain('오늘 커피');
    await page.reload();
    await expect(page.frameLocator('iframe').locator('h1')).toHaveText('함께 만드는 변화');
    expect(await readFile(state.original, 'utf8')).not.toContain('data-htmledit');
    await writeFile(
      join(dir, 'verified.json'),
      JSON.stringify(
        {
          agent,
          noteIds,
          automaticRefresh: true,
          cleanExport: true,
          reload: true,
          originalSha256: createHash('sha256')
            .update(await readFile(state.original))
            .digest('hex'),
          proposals: batch.analysis.proposals,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ phase: 'verified', agent, notes: noteIds.length }));
  }
} finally {
  await browser.close();
}
