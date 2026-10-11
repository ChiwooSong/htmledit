import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { DocumentStore, LIMIT, LocalError } from './store';

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
async function body(request: IncomingMessage) {
  const buffers: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > LIMIT * 2 + 4096) throw new LocalError('SIZE_LIMIT', '요청이 너무 큽니다.', 413);
    buffers.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(buffers).toString('utf8'));
  } catch {
    throw new LocalError('JSON', 'JSON 요청이 필요합니다.');
  }
}
export async function startServer(file: string, assets: string) {
  const store = new DocumentStore(file);
  await store.read();
  const token = randomBytes(32).toString('hex');
  let origin = '';
  const server = createServer(async (request, response) => {
    const json = (status: number, value: unknown) => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.headers.host !== new URL(origin).host)
        throw new LocalError('HOST', '허용하지 않는 호스트입니다.', 403);
      const url = new URL(request.url ?? '/', origin);
      if (url.pathname.startsWith('/api/')) {
        if (
          request.headers.authorization !== `Bearer ${token}` ||
          (request.headers.origin && request.headers.origin !== origin) ||
          ['cross-site', 'same-site'].includes(String(request.headers['sec-fetch-site']))
        )
          throw new LocalError('AUTH', '이 작업에 연결된 편집기만 접근할 수 있습니다.', 403);
        if (request.method === 'GET' && url.pathname === '/api/document')
          return json(200, await store.read());
        if (request.method === 'GET' && url.pathname === '/api/status')
          return json(200, await store.status());
        if (request.method === 'GET' && url.pathname === '/api/draft')
          return json(200, await store.draft());
        if (request.method === 'POST' && url.pathname === '/api/checkout')
          return json(200, await store.checkout());
        if (request.method === 'POST' && url.pathname === '/api/stop') {
          json(200, { stopped: true });
          server.close();
          server.closeIdleConnections();
          return;
        }
        if (
          (request.method === 'PUT' && ['/api/document', '/api/draft'].includes(url.pathname)) ||
          (request.method === 'POST' && url.pathname === '/api/apply')
        ) {
          const data = await body(request);
          if (typeof data?.html !== 'string' || typeof data?.revision !== 'string')
            throw new LocalError('INPUT', 'html과 revision이 필요합니다.');
          return json(
            200,
            url.pathname === '/api/draft'
              ? await store.saveDraft(data.html, data.revision)
              : await store.save(data.html, data.revision, url.pathname === '/api/apply'),
          );
        }
        throw new LocalError('NOT_FOUND', '지원하지 않는 요청입니다.', 404);
      }
      if (!['GET', 'HEAD'].includes(request.method ?? ''))
        throw new LocalError('METHOD', '허용하지 않는 요청입니다.', 405);
      const pathname = decodeURIComponent(url.pathname);
      const target = resolve(assets, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(resolve(assets) + sep))
        throw new LocalError('PATH', '허용하지 않는 경로입니다.', 403);
      const bytes = await readFile(target);
      response.writeHead(200, {
        'Content-Type': mime[extname(target)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "frame-ancestors 'none'",
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      json(
        error instanceof LocalError
          ? error.status
          : (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 404
            : 500,
        {
          code: error instanceof LocalError ? error.code : 'IO',
          message: error instanceof Error ? error.message : '파일 작업 실패',
        },
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('서버를 시작하지 못했습니다.');
  origin = `http://127.0.0.1:${address.port}`;
  return { server, origin, token, file, url: `${origin}/#htmledit=${token}` };
}
