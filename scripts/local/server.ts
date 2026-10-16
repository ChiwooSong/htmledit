import {
  message,
  MessageError,
  describeError,
  formatMessage,
  acceptLanguage,
  isMessage,
  type Locale,
} from '../../src/i18n';
import { Preferences } from './preferences';
import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { DocumentStore, LIMIT, LocalError } from './store';
import { ChangeRequestStore } from './change-requests';

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
    if (size > LIMIT * 2 + 4096)
      throw new LocalError('SIZE_LIMIT', message('theRequestIsTooLarge'), 413);
    buffers.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(buffers).toString('utf8'));
  } catch {
    throw new LocalError('JSON', message('aJsonRequestIsRequired'));
  }
}
export async function startServer(
  file: string,
  assets: string,
  openDocument?: (locale: Locale) => Promise<{ url: string } | null>,
  preferences = new Preferences(),
) {
  const store = new DocumentStore(file);
  const changes = new ChangeRequestStore(store);
  await store.read();
  const token = randomBytes(32).toString('hex');
  let origin = '';
  let choosing = false;
  const server = createServer(async (request, response) => {
    const locale = acceptLanguage(request.headers['accept-language']);
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
        throw new LocalError('HOST', message('hostNotAllowed'), 403);
      const url = new URL(request.url ?? '/', origin);
      if (url.pathname.startsWith('/api/')) {
        if (
          request.headers.authorization !== `Bearer ${token}` ||
          (request.headers.origin && request.headers.origin !== origin) ||
          ['cross-site', 'same-site'].includes(String(request.headers['sec-fetch-site']))
        )
          throw new LocalError('AUTH', message('onlyTheEditorConnectedToThisTask'), 403);
        if (
          url.pathname === '/api/change-requests' ||
          url.pathname.startsWith('/api/change-requests/')
        ) {
          const match = url.pathname.match(
            /^\/api\/change-requests(?:\/([0-9a-f-]{36})(?:\/(checkout|submit|commit))?)?$/,
          );
          if (!match || url.search)
            throw new LocalError('REQUEST_INPUT', 'Invalid change-request route.');
          const [, id, action] = match;
          if (request.method === 'GET' && !action)
            return json(200, id ? await changes.get(id) : await changes.list());
          const data = await body(request);
          if (!data || typeof data !== 'object' || Array.isArray(data))
            throw new LocalError('REQUEST_INPUT', 'A JSON object is required.');
          // Analysis commands may be called by the CLI; review/approval is an editor action.
          if ((!action || action === 'commit') && request.headers.origin !== origin)
            throw new LocalError('ORIGIN', 'Review changes from the connected editor.', 403);
          if (!id && request.method === 'POST') return json(201, await changes.create(data));
          if (id && !action && request.method === 'PUT')
            return json(200, await changes.update(id, data));
          if (id && !action && request.method === 'DELETE')
            return json(200, await changes.remove(id, data.revision));
          if (id && request.method === 'POST') {
            if (action === 'checkout') return json(200, await changes.checkout(id));
            if (action === 'submit') return json(200, await changes.submit(id, data));
            if (action === 'commit') return json(200, await changes.commit(id, data));
          }
          throw new LocalError('METHOD', 'Unsupported change-request operation.', 405);
        }
        if (url.pathname === '/api/preferences') {
          if (request.method === 'GET') return json(200, await preferences.read());
          if (request.method === 'PUT') {
            const value = await body(request);
            try {
              return json(200, await preferences.save(value));
            } catch (error) {
              if (error instanceof MessageError) throw new LocalError('INPUT', error.display);
              throw error;
            }
          }
          throw new LocalError('METHOD', message('requestNotAllowed'), 405);
        }
        if (request.method === 'POST' && url.pathname === '/api/open-document') {
          if (request.headers.origin !== origin)
            throw new LocalError('ORIGIN', message('chooseAFileFromTheEditor'), 403);
          const data = await body(request);
          if (
            url.search ||
            !data ||
            Array.isArray(data) ||
            typeof data !== 'object' ||
            Object.keys(data).length
          )
            throw new LocalError('INPUT', message('filePathsAreNotAcceptedInRequests'));
          if (!openDocument)
            throw new LocalError(
              'PICKER_UNAVAILABLE',
              message('reopenTheEditorWithTheLatestRuntime'),
            );
          if (choosing) throw new LocalError('BUSY', message('aFilePickerIsAlreadyOpen'), 409);
          choosing = true;
          try {
            return json(200, await openDocument(locale));
          } finally {
            choosing = false;
          }
        }
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
            throw new LocalError('INPUT', message('provideHtmlAndRevision'));
          return json(
            200,
            url.pathname === '/api/draft'
              ? await store.saveDraft(data.html, data.revision)
              : await store.save(data.html, data.revision, url.pathname === '/api/apply'),
          );
        }
        throw new LocalError('NOT_FOUND', message('unsupportedRequest'), 404);
      }
      if (!['GET', 'HEAD'].includes(request.method ?? ''))
        throw new LocalError('METHOD', message('requestNotAllowed'), 405);
      const pathname = decodeURIComponent(url.pathname);
      const target = resolve(assets, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(resolve(assets) + sep))
        throw new LocalError('PATH', message('pathNotAllowed'), 403);
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
      const display = describeError(error);
      json(
        error instanceof LocalError
          ? error.status
          : (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 404
            : 500,
        {
          code: error instanceof LocalError ? error.code : 'IO',
          message: formatMessage(locale, display),
          ...(isMessage(display) ? { messageKey: display.key, messageParams: display.params } : {}),
        },
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new MessageError(message('couldNotStartTheServer'));
  origin = `http://127.0.0.1:${address.port}`;
  return { server, origin, token, file, url: `${origin}/#htmledit=${token}` };
}
