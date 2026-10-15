import { FILE_LIMIT } from './types';
export async function readRequestFile(file: File): Promise<string> {
  if (file.size > FILE_LIMIT) throw new Error('SIZE');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['txt', 'md', 'docx'].includes(extension)) throw new Error('TYPE');
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./input.worker.ts', import.meta.url), { type: 'module' });
    const finish = (text?: string, error?: string) => {
      clearTimeout(timer);
      worker.terminate();
      error ? reject(new Error(error)) : resolve(text!);
    };
    const timer = setTimeout(() => finish(undefined, 'TIMEOUT'), 10_000);
    worker.onmessage = (event) => finish(event.data.text, event.data.error);
    worker.onerror = () => finish(undefined, 'DOCX');
    worker.postMessage({ buffer, extension }, [buffer]);
  });
}
