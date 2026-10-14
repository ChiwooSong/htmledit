import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(project, 'dist');
try {
  await stat(resolve(root, 'index.html'));
} catch {
  console.error('실행 파일이 없습니다. 먼저 npm run build를 실행해 주세요.');
  process.exit(1);
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
};
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(405);
    response.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const data = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
const port = 5173;
server.on('error', (error) => {
  console.error(
    `HTMLEdit를 실행하지 못했습니다: ${error.message}\n포트 ${port}를 사용하는 기존 창을 닫거나 http://127.0.0.1:${port}를 확인해 주세요.`,
  );
  process.exit(1);
});
server.listen(port, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(
    `HTMLEdit 실행 중: ${url}\n종료하려면 Ctrl+C를 누르세요. 문서 파일은 서버로 전송되지 않습니다.`,
  );
  if (!process.env.HTMLEDIT_NO_BROWSER) {
    const { openBrowser } = await import('../runtime/platform.mjs');
    if (!(await openBrowser(url))) console.error(`Open the editor manually: ${url}`);
  }
});
