import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { formattedSourceViewer } from '../fixtures/source-viewer';

const fixture = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Arial;padding:30px}.active{color:blue}section{padding:20px}h2{font-size:24px}
</style></head><body>
<nav><button id="first" onclick="go(0)">첫 화면</button><button id="second" onclick="go(1)">두 번째 화면</button><button id="third" onclick="go(2)">세 번째 화면</button></nav>
<section id="s0"><h2>온보딩</h2></section>
<section id="s1" style="display:none"><h2>전체 채팅</h2><p>화면 설명 <strong>강조</strong> 끝</p><button id="toggle" onclick="this.classList.toggle('active')">전환 버튼</button></section>
<section id="s2" hidden><h2>설정</h2></section>
<script>
const screens = [...document.querySelectorAll('section')]; const buttons = [...document.querySelectorAll('nav button')]; let current = 0;
function go(n) { screens[current].style.display = 'none'; buttons[current].classList.remove('active'); current=n; screens[n].hidden=false; screens[n].style.display='block'; buttons[n].classList.add('active'); }
go(0);
</script></body></html>`;

async function open(page: Page, source = fixture) {
  await page.goto('/');
  await page.getByTestId('html-file').setInputFiles({
    name: 'interactive.html',
    mimeType: 'text/html',
    buffer: Buffer.from(source),
  });
}
const live = (page: Page) => page.frameLocator('iframe[title="문서 동작 미리보기"]');
const editable = (page: Page) => page.frameLocator('iframe[title="문서 미리보기"]');
async function interact(page: Page) {
  await page.getByRole('button', { name: '문서 조작', exact: true }).click();
  await expect(page.getByText('문서 조작 준비 중…')).toHaveCount(0);
}

test('문서 목차의 앵커는 서버로 이동하지 않고 해당 위치와 편집 화면을 유지한다', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(
    page,
    `<!doctype html><html><head><style>
    nav {position:fixed;top:0;background:white;z-index:2} section{height:1200px;scroll-margin-top:50px}
    </style></head><body><nav>
    <a href="#summary">Summary</a><a href="#details"><span>Details</span></a>
    <a href="#%ED%95%9C%EA%B8%80">Unicode</a><a href="#legacy">Legacy</a>
    <a href="#bad%">Percent</a><a href="#missing">Missing</a><a href="#">Top</a>
    </nav><section id="summary"><h1>Summary heading</h1></section>
    <section id="details"><h2>Details heading</h2></section><section id="한글"><h2>한글 제목</h2></section>
    <section><a name="legacy">Legacy heading</a></section><section id="bad%">Percent heading</section>
    </body></html>`,
  );
  const navigations: string[] = [];
  await interact(page);
  await expect(live(page).locator('#summary')).toBeVisible();
  page.on('framenavigated', (frame) => navigations.push(frame.url()));
  for (const [label, selector] of [
    ['Details', '#details'],
    ['Unicode', '[id="한글"]'],
    ['Legacy', 'a[name="legacy"]'],
    ['Percent', '[id="bad%"]'],
    ['Summary', '#summary'],
  ]) {
    await live(page).getByRole('link', { name: label, exact: true }).click();
    await expect(live(page).locator(selector)).toBeInViewport();
    await expect(live(page).locator('body')).toBeVisible();
  }
  await live(page).getByRole('link', { name: 'Missing', exact: true }).click();
  await live(page).getByRole('link', { name: 'Details', exact: true }).press('Enter');
  await expect(live(page).locator('#details h2')).toBeInViewport();
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await expect(editable(page).locator('#details h2')).toBeInViewport();
  await editable(page).locator('#details h2').click();
  await expect(page.getByRole('textbox', { name: '문구 1', exact: true })).toHaveValue(
    'Details heading',
  );
  await interact(page);
  await live(page).getByRole('link', { name: 'Top', exact: true }).click();
  await expect(live(page).locator('#summary h1')).toBeInViewport();
  expect(navigations.filter((url) => url !== 'about:srcdoc')).toEqual([]);
  expect(errors).toEqual([]);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '완성본 저장', exact: true }).click();
  const html = await readFile((await (await downloaded).path())!, 'utf8');
  expect(html).toContain('href="#details"');
  expect(html).not.toContain('htmledit-connect');
});

test('정렬된 소스 보기 파일의 메뉴로 전체 채팅 화면에 이동한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const source = fixture.replace(
    "const screens = [...document.querySelectorAll('section')];",
    "const screens = [0,1,2].map(i => document.getElementById('s'+i));",
  );
  await open(page, formattedSourceViewer(source));
  await interact(page);
  await live(page).getByRole('button', { name: '두 번째 화면' }).click();
  await expect(live(page).locator('#s1')).toBeVisible();
  await expect(live(page).locator('#s0')).toBeHidden();
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await expect(editable(page).locator('#s1 h2')).toHaveText('전체 채팅');
  expect(errors).toEqual([]);
});

test('메뉴 이동 → 현재 화면 편집·메모 → 재조작 → 저장 후에도 메뉴 동작 유지', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await interact(page);
  await live(page).getByRole('button', { name: '두 번째 화면' }).click();
  await expect(live(page).locator('#s1')).toBeVisible();
  await expect(live(page).locator('#s0')).toBeHidden();
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await expect(editable(page).locator('#s1')).toBeVisible();
  await editable(page).locator('#s1 h2').click();
  await page.getByRole('textbox', { name: '문구 1', exact: true }).fill('수정된 채팅 👋');
  await page.getByRole('button', { name: '문구 적용', exact: true }).click();
  await page.getByRole('spinbutton', { name: '글자 크기' }).fill('32');
  await page.locator('.number-field').getByRole('button', { name: '적용', exact: true }).click();
  await expect(editable(page).locator('#s1 h2')).toHaveText('수정된 채팅 👋');
  await expect(editable(page).locator('#s1 h2')).toHaveCSS('font-size', '32px');
  await page.getByRole('button', { name: '메모 남기기', exact: true }).click();
  await editable(page).locator('#s1 h2').click();
  await page
    .getByRole('textbox', { name: '수정 요청', exact: true })
    .fill('채팅 제목 옆에 아이콘 추가');
  await page.getByRole('button', { name: '메모 추가', exact: true }).click();
  await expect(page.getByRole('button', { name: '메모 1 위치' })).toBeVisible();
  await interact(page);
  await expect(live(page).locator('#s1 h2')).toHaveText('수정된 채팅 👋');
  await live(page).getByRole('button', { name: '세 번째 화면' }).click();
  await expect(live(page).locator('#s2')).toBeVisible();
  await expect(live(page).locator('#s1')).toBeHidden();
  await live(page).getByRole('button', { name: '두 번째 화면' }).click();
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await expect(editable(page).locator('#s1 h2')).toHaveText('수정된 채팅 👋');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'AI 전달용 저장', exact: true }).click();
  const html = await readFile((await (await downloaded).path())!, 'utf8');
  expect(html).toContain('function go(n)');
  expect(html).toContain('id="s1" style="display:none"');
  expect(html).not.toContain('htmledit-connect');
  expect(html).not.toContain('Content-Security-Policy');
  await page.getByTestId('html-file').setInputFiles({
    name: 'result.review.html',
    mimeType: 'text/html',
    buffer: Buffer.from(html),
  });
  await interact(page);
  await live(page).getByRole('button', { name: '두 번째 화면' }).click();
  await expect(live(page).locator('#s1 h2')).toHaveText('수정된 채팅 👋');
  await page.getByRole('button', { name: '메모 남기기', exact: true }).click();
  await expect(page.getByTestId('note-card')).toContainText('채팅 제목 옆에 아이콘 추가');
  expect(errors).toEqual([]);
});

test('조작 상태에서 삭제·실행 취소·첫 화면 초기화가 동작한다', async ({ page }) => {
  await open(page);
  await interact(page);
  await live(page).getByRole('button', { name: '두 번째 화면' }).click();
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await editable(page).locator('#s1 p').click();
  await page.getByRole('button', { name: '선택 요소 삭제', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(editable(page).locator('#s1 p')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(editable(page).locator('#s1 p')).toHaveText('화면 설명 강조 끝');
  await interact(page);
  await expect(live(page).locator('#s1 p')).toHaveText('화면 설명 강조 끝');
  await live(page).getByRole('button', { name: '전환 버튼' }).click();
  await expect(live(page).locator('#toggle')).toHaveClass('active');
  await page.getByRole('button', { name: '첫 화면으로', exact: true }).click();
  await expect(live(page).locator('#s0')).toBeVisible();
  await expect(live(page).locator('#s1')).toBeHidden();
});

test('동작 프레임은 편집기와 저장소에서 격리되고 외부 링크·폼은 이동하지 않는다', async ({
  page,
}) => {
  await open(
    page,
    fixture.replace(
      '</body>',
      `<p id="isolation"></p><a href="https://example.com/">외부 이동</a><form action="https://example.com/"><button>전송</button></form><script>
    let blocked = 0;
    try {parent.document.title = 'escaped';} catch {blocked++;}
    try {localStorage.setItem('escaped','yes');} catch {blocked++;}
    document.getElementById('isolation').textContent = '차단 ' + blocked;
  </script></body>`,
    ),
  );
  await interact(page);
  await expect(page.locator('iframe[title="문서 동작 미리보기"]')).toHaveAttribute(
    'sandbox',
    'allow-scripts',
  );
  await expect(live(page).locator('#isolation')).toHaveText('차단 2');
  await live(page).getByRole('link', { name: '외부 이동' }).click();
  await live(page).getByRole('button', { name: '전송', exact: true }).click();
  await expect(live(page).locator('#isolation')).toHaveText('차단 2');
  await expect(page).toHaveTitle(/HTMLEdit/);
  expect(await page.evaluate(() => localStorage.getItem('escaped'))).toBeNull();
});
