import { extractText } from './extract';
self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; extension: string }>) => {
  try {
    self.postMessage({
      text: extractText(new Uint8Array(event.data.buffer), event.data.extension),
    });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'DOCX' });
  }
};
