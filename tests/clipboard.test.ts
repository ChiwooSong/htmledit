import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyWhenReady } from '../src/io/clipboard';

afterEach(() => vi.unstubAllGlobals());
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function clipboard() {
  let contents = 'previous clipboard';
  vi.stubGlobal(
    'ClipboardItem',
    class {
      constructor(readonly data: Record<string, Promise<Blob>>) {}
    },
  );
  const write = vi.fn(async (items: { data: Record<string, Promise<Blob>> }[]) => {
    const blob = await items[0].data['text/plain'];
    contents = await blob.text();
  });
  vi.stubGlobal('navigator', { clipboard: { write } });
  return { write, contents: () => contents };
}
describe('save-gated clipboard', () => {
  it('starts within the gesture but does not expose text before saving completes', async () => {
    const c = clipboard(),
      save = deferred<string | null>();
    const result = copyWhenReady(() => save.promise);
    expect(c.write).toHaveBeenCalledOnce();
    expect(c.contents()).toBe('previous clipboard');
    save.resolve('Saved 한글 日本語 ação');
    expect(await result).toBe(true);
    expect(c.contents()).toBe('Saved 한글 日本語 ação');
  });
  it('cancels without replacing the prior clipboard when save or revision checks fail', async () => {
    const c = clipboard();
    expect(await copyWhenReady(async () => null)).toBe(false);
    expect(c.contents()).toBe('previous clipboard');
  });
  it('waits for saving even if clipboard permission is denied immediately', async () => {
    clipboard();
    vi.stubGlobal('navigator', { clipboard: { write: () => Promise.reject(new Error('Denied')) } });
    const save = deferred<string | null>();
    let settled = false;
    const result = copyWhenReady(() => save.promise).catch(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    save.resolve('Saved request');
    await result;
    expect(settled).toBe(true);
  });
  it('uses writeText after preparation when ClipboardItem is unavailable', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    const writeText = vi.fn(async () => {}),
      save = deferred<string | null>();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const result = copyWhenReady(() => save.promise);
    expect(writeText).not.toHaveBeenCalled();
    save.resolve('Saved request');
    expect(await result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Saved request');
  });
});
