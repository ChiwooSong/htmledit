export interface LocalDocument {
  file: string;
  fileName: string;
  html: string;
  revision: string;
}
export interface LocalDraft {
  html: string;
  revision: string;
  savedAt: number;
}
export class ConnectionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
// The token lives in the top-level tab only. Never pass it into preview srcdoc.
export function connectionToken() {
  const fragment = new URLSearchParams(location.hash.slice(1)).get('htmledit');
  if (fragment && /^[a-f0-9]{64}$/.test(fragment)) {
    sessionStorage.setItem('htmledit-connection', fragment);
    window.history.replaceState(null, '', location.pathname + location.search);
    return fragment;
  }
  return sessionStorage.getItem('htmledit-connection');
}
export async function localRequest<T>(
  token: string,
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(15_000),
  });
  const value = await response.json();
  if (!response.ok) throw new ConnectionError(value.code, value.message);
  return value;
}
