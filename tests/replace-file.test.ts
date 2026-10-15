import { beforeEach, expect, it, vi } from 'vitest';
import { rename } from 'node:fs/promises';
import { replaceFile } from '../scripts/local/replace-file';

vi.mock('node:fs/promises', () => ({ rename: vi.fn() }));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
const move = vi.mocked(rename);
beforeEach(() => {
  move.mockReset();
});

it('revalidates before retrying a transient replacement failure', async () => {
  const locked = Object.assign(new Error('locked'), { code: 'EPERM' });
  move.mockRejectedValueOnce(locked).mockResolvedValueOnce(undefined);
  const validate = vi.fn().mockResolvedValue(undefined);
  await replaceFile('candidate', 'document', validate);
  expect(move).toHaveBeenCalledTimes(2);
  expect(validate).toHaveBeenCalledTimes(2);
  expect(validate.mock.invocationCallOrder[1]).toBeLessThan(move.mock.invocationCallOrder[1]);
});

it('stops replacement if the document changed during the retry delay', async () => {
  move.mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EBUSY' }));
  const conflict = new Error('revision changed');
  const validate = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(conflict);
  await expect(replaceFile('candidate', 'document', validate)).rejects.toBe(conflict);
  expect(move).toHaveBeenCalledTimes(1);
});

it('bounds lock retries', async () => {
  const locked = Object.assign(new Error('locked'), { code: 'EACCES' });
  move.mockRejectedValue(locked);
  await expect(replaceFile('candidate', 'document', async () => {})).rejects.toBe(locked);
  expect(move).toHaveBeenCalledTimes(6);
});

it('immediately propagates unrelated failures', async () => {
  const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
  move.mockRejectedValue(missing);
  await expect(replaceFile('candidate', 'document', async () => {})).rejects.toBe(missing);
  expect(move).toHaveBeenCalledTimes(1);
});
